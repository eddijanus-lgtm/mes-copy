import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  MachineCarrierInventorySnapshot,
  MachineCarrierObservation,
} from '../machines/adapters/machine-adapter.types';
import { CarrierInventoryStateEntity } from './carrier-inventory-state.entity';
import {
  CarrierEntity,
  CarrierPhysicalStateEnum,
  CarrierStatusEnum,
} from './carrier.entity';

export interface CarrierInventorySyncResult {
  source: string;
  revision: string;
  applied: boolean;
  discovered: number;
  updated: number;
  staleMarked: number;
  unidentified: number;
  countMismatch: boolean;
}

export interface CarrierInventorySummary {
  configured: boolean;
  source: string | null;
  valid: boolean;
  stale: boolean;
  revision: string | null;
  capacity: number | null;
  availableCount: number;
  totalCount: number;
  observedCount: number;
  reconciledAvailableCount: number;
  countMismatch: boolean;
  updatedAt: Date | null;
}

@Injectable()
export class CarrierInventorySyncService {
  private synchronizationQueue: Promise<void> = Promise.resolve();

  constructor(
    @InjectRepository(CarrierEntity)
    private readonly carriers: Repository<CarrierEntity>,
    @InjectRepository(CarrierInventoryStateEntity)
    private readonly inventoryStates: Repository<CarrierInventoryStateEntity>,
  ) {}

  async synchronize(
    snapshot: MachineCarrierInventorySnapshot,
  ): Promise<CarrierInventorySyncResult> {
    const synchronization = this.synchronizationQueue.then(() =>
      this.synchronizeSerially(snapshot),
    );
    this.synchronizationQueue = synchronization.then(
      () => undefined,
      () => undefined,
    );
    return synchronization;
  }

  private async synchronizeSerially(
    snapshot: MachineCarrierInventorySnapshot,
  ): Promise<CarrierInventorySyncResult> {
    this.validateSnapshot(snapshot);
    const source = this.sourceFor(snapshot);
    const revision = this.normalizeRevision(snapshot.revision);
    const previous = await this.inventoryStates.findOne({ where: { source } });

    if (previous && this.compareRevisions(revision, previous.revision) <= 0) {
      return {
        source,
        revision,
        applied: false,
        discovered: 0,
        updated: 0,
        staleMarked: 0,
        unidentified: 0,
        countMismatch: previous.count_mismatch,
      };
    }

    const allCarriers = await this.carriers.find();
    const byNumber = new Map(
      allCarriers.map((carrier) => [carrier.carrier_number, carrier]),
    );
    const byRfid = new Map(
      allCarriers
        .filter((carrier) => carrier.rfid_uid)
        .map((carrier) => [carrier.rfid_uid as string, carrier]),
    );
    const observedCarrierIds = new Set<string>();
    let discovered = 0;
    let updated = 0;
    let unidentified = 0;

    if (snapshot.valid) {
      for (const observation of snapshot.observations) {
        if (!observation.present) continue;
        if (observation.carrierNumber === undefined) {
          unidentified += 1;
          continue;
        }

        const observedAt = this.lastSeenFor(observation);
        const rfidUid = this.normalizeOptionalText(observation.rfidUid);
        const byCarrierNumber = byNumber.get(observation.carrierNumber);
        const byRfidUid = rfidUid ? byRfid.get(rfidUid) : undefined;
        if (
          byCarrierNumber &&
          byRfidUid &&
          byCarrierNumber.id !== byRfidUid.id
        ) {
          throw new ConflictException(
            `Carrier ${observation.carrierNumber} and RFID ${rfidUid} refer to different records`,
          );
        }

        let carrier = byCarrierNumber ?? byRfidUid;
        if (carrier && carrier.carrier_number !== observation.carrierNumber) {
          throw new ConflictException(
            `RFID ${rfidUid} is already assigned to carrier ${carrier.carrier_number}`,
          );
        }
        if (carrier?.rfid_uid && rfidUid && carrier.rfid_uid !== rfidUid) {
          throw new ConflictException(
            `Carrier ${observation.carrierNumber} is already assigned to RFID ${carrier.rfid_uid}`,
          );
        }
        if (
          carrier?.inventory_managed &&
          carrier.inventory_source &&
          carrier.inventory_source !== source
        ) {
          const previousSeenAt = carrier.last_seen_at?.getTime() ?? 0;
          if (
            !carrier.inventory_stale &&
            observedAt.getTime() <= previousSeenAt
          ) {
            throw new ConflictException(
              `Carrier ${observation.carrierNumber} is still current in inventory source ${carrier.inventory_source}`,
            );
          }
        }

        const isNew = !carrier;
        carrier ??= this.carriers.create({
          carrier_number: observation.carrierNumber,
          status: CarrierStatusEnum.AVAILABLE,
          order_id: null,
          current_step_no: null,
          current_resource_id: null,
        });

        const inventoryValues = {
          inventory_managed: true,
          inventory_source: source,
          inventory_revision: revision,
          inventory_stale: false,
          physical_state: this.physicalStateFor(observation),
          rfid_uid: rfidUid ?? carrier.rfid_uid ?? null,
          storage_slot:
            this.normalizeOptionalText(observation.slotId) ?? null,
          rfid_read_valid: observation.rfidReadValid ?? null,
          last_reader_id:
            this.normalizeOptionalText(observation.readerId) ?? null,
          last_seen_at: observedAt,
        };
        Object.assign(carrier, inventoryValues);

        if (isNew) {
          carrier = await this.carriers.save(carrier);
        } else {
          // Inventory synchronization owns only the physical/RFID columns.
          // A partial update prevents a concurrent routing transaction from
          // losing order_id, current_step_no, current_resource_id or status.
          await this.carriers.update(carrier.id, inventoryValues);
        }
        observedCarrierIds.add(carrier.id);
        byNumber.set(carrier.carrier_number, carrier);
        if (carrier.rfid_uid) byRfid.set(carrier.rfid_uid, carrier);
        if (isNew) discovered += 1;
        else updated += 1;
      }
    }

    let staleMarked = 0;
    const staleCandidates = allCarriers.filter(
      (carrier) =>
        carrier.inventory_managed &&
        carrier.inventory_source === source &&
        !observedCarrierIds.has(carrier.id) &&
        !carrier.inventory_stale,
    );
    if (staleCandidates.length > 0) {
      await Promise.all(
        staleCandidates.map(async (carrier) => {
          carrier.inventory_stale = true;
          carrier.inventory_revision = revision;
          await this.carriers.update(carrier.id, {
            inventory_stale: true,
            inventory_revision: revision,
          });
        }),
      );
      staleMarked = staleCandidates.length;
    }

    const reconciledAvailableCount = snapshot.valid
      ? snapshot.observations.filter(
          (observation) =>
            observation.present &&
            observation.carrierNumber !== undefined &&
            observation.rfidReadValid === true &&
            this.physicalStateFor(observation) ===
              CarrierPhysicalStateEnum.STORED,
        ).length
      : 0;
    const countMismatch =
      snapshot.valid && reconciledAvailableCount !== snapshot.availableCount;

    const state =
      previous ??
      this.inventoryStates.create({
        source,
        revision,
      });
    state.valid = snapshot.valid;
    state.stale = false;
    state.revision = revision;
    state.capacity = snapshot.capacity ?? null;
    state.available_count = snapshot.availableCount;
    state.total_count = snapshot.totalCount;
    state.observed_count = snapshot.observations.filter(
      (observation) => observation.present,
    ).length;
    state.reconciled_available_count = reconciledAvailableCount;
    state.count_mismatch = countMismatch;
    await this.inventoryStates.save(state);

    return {
      source,
      revision,
      applied: true,
      discovered,
      updated,
      staleMarked,
      unidentified,
      countMismatch,
    };
  }

  async markStale(source?: string): Promise<number> {
    const states = source
      ? await this.inventoryStates.find({ where: { source } })
      : await this.inventoryStates.find();
    if (states.length === 0) return 0;

    for (const state of states) state.stale = true;
    await this.inventoryStates.save(states);

    const allCarriers = await this.carriers.find();
    const affected = allCarriers.filter(
      (carrier) =>
        carrier.inventory_managed &&
        (!source || carrier.inventory_source === source) &&
        !carrier.inventory_stale,
    );
    if (affected.length > 0) {
      await Promise.all(
        affected.map(async (carrier) => {
          carrier.inventory_stale = true;
          await this.carriers.update(carrier.id, {
            inventory_stale: true,
          });
        }),
      );
    }
    return affected.length;
  }

  async getLatestSummary(): Promise<CarrierInventorySummary> {
    const states = await this.inventoryStates.find({
      order: { updated_at: 'DESC' },
    });
    if (states.length === 0) {
      return {
        configured: false,
        source: null,
        valid: false,
        stale: true,
        revision: null,
        capacity: null,
        availableCount: 0,
        totalCount: 0,
        observedCount: 0,
        reconciledAvailableCount: 0,
        countMismatch: false,
        updatedAt: null,
      };
    }
    const capacityKnown = states.every((state) => state.capacity !== null);
    const updatedAt = states.reduce(
      (latest, state) =>
        !latest || state.updated_at > latest ? state.updated_at : latest,
      null as Date | null,
    );
    return {
      configured: true,
      source: states.map((state) => state.source).sort().join(', '),
      valid: states.every((state) => state.valid),
      stale: states.some((state) => state.stale),
      revision: states
        .map((state) => `${state.source}:${state.revision}`)
        .sort()
        .join('|'),
      capacity: capacityKnown
        ? states.reduce((total, state) => total + (state.capacity ?? 0), 0)
        : null,
      availableCount: states.reduce(
        (total, state) => total + state.available_count,
        0,
      ),
      totalCount: states.reduce(
        (total, state) => total + state.total_count,
        0,
      ),
      observedCount: states.reduce(
        (total, state) => total + state.observed_count,
        0,
      ),
      reconciledAvailableCount: states.reduce(
        (total, state) => total + state.reconciled_available_count,
        0,
      ),
      countMismatch: states.some((state) => state.count_mismatch),
      updatedAt,
    };
  }

  private validateSnapshot(snapshot: MachineCarrierInventorySnapshot): void {
    if (!snapshot.stationId?.trim()) {
      throw new BadRequestException('Inventory stationId is required');
    }
    if (!Number.isInteger(snapshot.resourceId) || snapshot.resourceId < 0) {
      throw new BadRequestException(
        'Inventory resourceId must be a non-negative integer',
      );
    }
    this.normalizeRevision(snapshot.revision);
    for (const [name, value] of [
      ['availableCount', snapshot.availableCount],
      ['totalCount', snapshot.totalCount],
    ] as const) {
      if (!Number.isInteger(value) || value < 0) {
        throw new BadRequestException(`${name} must be a non-negative integer`);
      }
    }
    if (
      snapshot.capacity !== undefined &&
      (!Number.isInteger(snapshot.capacity) || snapshot.capacity < 0)
    ) {
      throw new BadRequestException('capacity must be a non-negative integer');
    }
    if (snapshot.availableCount > snapshot.totalCount) {
      throw new BadRequestException('availableCount cannot exceed totalCount');
    }
    if (
      snapshot.capacity !== undefined &&
      snapshot.totalCount > snapshot.capacity
    ) {
      throw new BadRequestException('totalCount cannot exceed capacity');
    }

    const carrierNumbers = new Set<number>();
    const rfidUids = new Set<string>();
    const occupiedSlots = new Set<string>();
    for (const observation of snapshot.observations) {
      if (
        observation.carrierNumber !== undefined &&
        (!Number.isInteger(observation.carrierNumber) ||
          observation.carrierNumber < 1)
      ) {
        throw new BadRequestException(
          'Observed carrierNumber must be a positive integer',
        );
      }
      if (observation.present && observation.carrierNumber !== undefined) {
        if (carrierNumbers.has(observation.carrierNumber)) {
          throw new BadRequestException(
            `Duplicate carrier ${observation.carrierNumber} in inventory snapshot`,
          );
        }
        carrierNumbers.add(observation.carrierNumber);
      }
      const rfidUid = this.normalizeOptionalText(observation.rfidUid);
      if (observation.present && rfidUid) {
        if (rfidUids.has(rfidUid)) {
          throw new BadRequestException(
            `Duplicate RFID ${rfidUid} in inventory snapshot`,
          );
        }
        rfidUids.add(rfidUid);
      }
      const slotId = this.normalizeOptionalText(observation.slotId);
      if (observation.present && slotId) {
        if (occupiedSlots.has(slotId)) {
          throw new BadRequestException(
            `Duplicate occupied slot ${slotId} in inventory snapshot`,
          );
        }
        occupiedSlots.add(slotId);
      }
      this.lastSeenFor(observation);
      this.physicalStateFor(observation);
    }
  }

  private sourceFor(snapshot: MachineCarrierInventorySnapshot): string {
    return `${snapshot.stationId.trim()}:${snapshot.resourceId}`;
  }

  private normalizeRevision(revision: number | string): string {
    const raw =
      typeof revision === 'number' ? String(revision) : revision.trim();
    if (!/^\d+$/.test(raw)) {
      throw new BadRequestException(
        'Inventory revision must be a non-negative integer',
      );
    }
    const normalized = BigInt(raw).toString();
    return normalized;
  }

  private compareRevisions(left: string, right: string): number {
    const leftRevision = BigInt(left);
    const rightRevision = BigInt(right);
    if (leftRevision === rightRevision) return 0;
    return leftRevision > rightRevision ? 1 : -1;
  }

  private normalizeOptionalText(value?: string): string | undefined {
    const normalized = value?.trim();
    return normalized || undefined;
  }

  private lastSeenFor(observation: MachineCarrierObservation): Date {
    if (!observation.lastSeenAt) return new Date();
    const date =
      observation.lastSeenAt instanceof Date
        ? observation.lastSeenAt
        : new Date(observation.lastSeenAt);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('Invalid carrier lastSeenAt');
    }
    return date;
  }

  private physicalStateFor(
    observation: MachineCarrierObservation,
  ): CarrierPhysicalStateEnum {
    if (!observation.present) return CarrierPhysicalStateEnum.MISSING;
    const physicalState =
      observation.physicalState ?? CarrierPhysicalStateEnum.UNKNOWN;
    if (
      !Object.values(CarrierPhysicalStateEnum).includes(
        physicalState as CarrierPhysicalStateEnum,
      )
    ) {
      throw new BadRequestException(
        `Unsupported carrier physicalState ${physicalState}`,
      );
    }
    return physicalState as CarrierPhysicalStateEnum;
  }
}
