import { BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { MachineCarrierInventorySnapshot } from '../machines/adapters/machine-adapter.types';
import { CarrierInventoryStateEntity } from './carrier-inventory-state.entity';
import { CarrierInventorySyncService } from './carrier-inventory-sync.service';
import {
  CarrierEntity,
  CarrierPhysicalStateEnum,
  CarrierStatusEnum,
  isCarrierPhysicallyAvailable,
} from './carrier.entity';

describe('CarrierInventorySyncService', () => {
  let service: CarrierInventorySyncService;
  let carrierRows: CarrierEntity[];
  let stateRows: CarrierInventoryStateEntity[];
  let carriersRepo: any;
  let statesRepo: any;

  const snapshot = (
    overrides: Partial<MachineCarrierInventorySnapshot> = {},
  ): MachineCarrierInventorySnapshot => ({
    resourceId: 10,
    stationId: 'pallet-store',
    valid: true,
    revision: 1,
    capacity: 4,
    availableCount: 1,
    totalCount: 1,
    observations: [
      {
        resourceId: 10,
        stationId: 'pallet-store',
        slotId: 'A1',
        present: true,
        carrierNumber: 128,
        rfidUid: 'RFID-128',
        rfidReadValid: true,
        physicalState: 'stored',
        readerId: 'reader-1',
        lastSeenAt: new Date('2026-07-26T10:00:00.000Z'),
      },
    ],
    ...overrides,
  });

  beforeEach(async () => {
    carrierRows = [];
    stateRows = [];
    let nextCarrierId = 1;

    carriersRepo = {
      create: jest.fn((value: Partial<CarrierEntity>) => ({ ...value })),
      find: jest.fn(async () => carrierRows),
      update: jest.fn(
        async (
          criteria: string | { id: string },
          values: Partial<CarrierEntity>,
        ) => {
          const id = typeof criteria === 'string' ? criteria : criteria.id;
          const carrier = carrierRows.find((row) => row.id === id);
          if (carrier) Object.assign(carrier, values);
          return { affected: carrier ? 1 : 0 };
        },
      ),
      save: jest.fn(async (value: CarrierEntity | CarrierEntity[]) => {
        const values = Array.isArray(value) ? value : [value];
        for (const carrier of values) {
          if (!carrier.id) carrier.id = `carrier-${nextCarrierId++}`;
          const index = carrierRows.findIndex((row) => row.id === carrier.id);
          if (index >= 0) carrierRows[index] = carrier;
          else carrierRows.push(carrier);
        }
        return value;
      }),
    };
    statesRepo = {
      create: jest.fn((value: Partial<CarrierInventoryStateEntity>) => ({
        ...value,
      })),
      find: jest.fn(async (options?: any) =>
        options?.where?.source
          ? stateRows.filter((state) => state.source === options.where.source)
          : stateRows,
      ),
      findOne: jest.fn(async (options: any) => {
        if (options?.where?.source) {
          return (
            stateRows.find((state) => state.source === options.where.source) ??
            null
          );
        }
        return (
          [...stateRows].sort(
            (left, right) =>
              (right.updated_at?.getTime() ?? 0) -
              (left.updated_at?.getTime() ?? 0),
          )[0] ?? null
        );
      }),
      save: jest.fn(
        async (
          value: CarrierInventoryStateEntity | CarrierInventoryStateEntity[],
        ) => {
          const values = Array.isArray(value) ? value : [value];
          for (const state of values) {
            state.updated_at ??= new Date('2026-07-26T10:01:00.000Z');
            const index = stateRows.findIndex(
              (row) => row.source === state.source,
            );
            if (index >= 0) stateRows[index] = state;
            else stateRows.push(state);
          }
          return value;
        },
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CarrierInventorySyncService,
        {
          provide: getRepositoryToken(CarrierEntity),
          useValue: carriersRepo,
        },
        {
          provide: getRepositoryToken(CarrierInventoryStateEntity),
          useValue: statesRepo,
        },
      ],
    }).compile();
    service = module.get(CarrierInventorySyncService);
  });

  it('discovers a machine-managed RFID carrier without changing the logical lifecycle', async () => {
    const result = await service.synchronize(snapshot());

    expect(result).toMatchObject({
      source: 'pallet-store:10',
      revision: '1',
      applied: true,
      discovered: 1,
      countMismatch: false,
    });
    expect(carrierRows[0]).toMatchObject({
      carrier_number: 128,
      status: CarrierStatusEnum.AVAILABLE,
      inventory_managed: true,
      physical_state: CarrierPhysicalStateEnum.STORED,
      rfid_uid: 'RFID-128',
      storage_slot: 'A1',
      rfid_read_valid: true,
      inventory_stale: false,
      inventory_revision: '1',
    });
    expect(isCarrierPhysicallyAvailable(carrierRows[0])).toBe(true);
  });

  it('adopts a matching manual carrier but preserves its assignment', async () => {
    carrierRows.push({
      id: 'legacy-128',
      carrier_number: 128,
      order_id: 'order-1',
      current_step_no: 2,
      current_resource_id: null,
      status: CarrierStatusEnum.ASSIGNED,
      inventory_managed: false,
      physical_state: CarrierPhysicalStateEnum.UNKNOWN,
      rfid_uid: null,
      storage_slot: null,
      rfid_read_valid: null,
      last_reader_id: null,
      last_seen_at: null,
      inventory_source: null,
      inventory_revision: null,
      inventory_stale: false,
      version: 1,
      created_at: new Date(),
      updated_at: new Date(),
    });

    const result = await service.synchronize(snapshot());

    expect(result).toMatchObject({ discovered: 0, updated: 1 });
    expect(carrierRows[0]).toMatchObject({
      id: 'legacy-128',
      order_id: 'order-1',
      status: CarrierStatusEnum.ASSIGNED,
      inventory_managed: true,
      rfid_uid: 'RFID-128',
    });
    expect(carriersRepo.update).toHaveBeenCalledWith(
      'legacy-128',
      expect.not.objectContaining({
        order_id: expect.anything(),
        current_step_no: expect.anything(),
        current_resource_id: expect.anything(),
        status: expect.anything(),
      }),
    );
  });

  it('ignores an identical or older revision idempotently', async () => {
    await service.synchronize(snapshot({ revision: '0007' }));
    carriersRepo.save.mockClear();

    const same = await service.synchronize(snapshot({ revision: 7 }));
    const older = await service.synchronize(snapshot({ revision: 6 }));

    expect(same.applied).toBe(false);
    expect(older.applied).toBe(false);
    expect(carriersRepo.save).not.toHaveBeenCalled();
  });

  it('serializes concurrent identical snapshots and discovers each RFID carrier once', async () => {
    const [first, second] = await Promise.all([
      service.synchronize(snapshot()),
      service.synchronize(snapshot()),
    ]);

    expect([first.applied, second.applied].sort()).toEqual([false, true]);
    expect(carrierRows).toHaveLength(1);
    expect(carrierRows[0].rfid_uid).toBe('RFID-128');
  });

  it('marks a previously observed carrier stale when a complete newer snapshot omits it', async () => {
    await service.synchronize(snapshot());

    const result = await service.synchronize(
      snapshot({
        revision: 2,
        availableCount: 0,
        totalCount: 0,
        observations: [],
      }),
    );

    expect(result.staleMarked).toBe(1);
    expect(carrierRows[0].inventory_stale).toBe(true);
    expect(isCarrierPhysicallyAvailable(carrierRows[0])).toBe(false);
  });

  it('moves a carrier to another inventory resource when that observation is newer', async () => {
    await service.synchronize(snapshot());

    await service.synchronize(
      snapshot({
        resourceId: 11,
        stationId: 'second-pallet-store',
        revision: 1,
        observations: [
          {
            ...snapshot().observations[0],
            resourceId: 11,
            stationId: 'second-pallet-store',
            slotId: 'B1',
            lastSeenAt: new Date('2026-07-26T10:05:00.000Z'),
          },
        ],
      }),
    );

    expect(carrierRows[0]).toMatchObject({
      inventory_source: 'second-pallet-store:11',
      storage_slot: 'B1',
      inventory_stale: false,
    });
  });

  it('records unidentified occupied slots and reports a count mismatch', async () => {
    const result = await service.synchronize(
      snapshot({
        availableCount: 1,
        totalCount: 1,
        observations: [
          {
            resourceId: 10,
            stationId: 'pallet-store',
            slotId: 'A1',
            present: true,
            rfidReadValid: false,
            physicalState: 'rfid_error',
          },
        ],
      }),
    );

    expect(result).toMatchObject({
      unidentified: 1,
      countMismatch: true,
    });
    expect(carrierRows).toHaveLength(0);
    expect(stateRows[0]).toMatchObject({
      observed_count: 1,
      reconciled_available_count: 0,
      count_mismatch: true,
    });
  });

  it('marks inventory state and carriers stale on disconnect', async () => {
    await service.synchronize(snapshot());

    await expect(service.markStale('pallet-store:10')).resolves.toBe(1);
    expect(stateRows[0].stale).toBe(true);
    expect(carrierRows[0].inventory_stale).toBe(true);
  });

  it('returns an unconfigured read-only summary before the first snapshot', async () => {
    await expect(service.getLatestSummary()).resolves.toMatchObject({
      configured: false,
      valid: false,
      stale: true,
      revision: null,
      availableCount: 0,
      totalCount: 0,
    });
  });

  it('aggregates counts from multiple configured inventory resources', async () => {
    stateRows.push(
      {
        source: 'store-a:10',
        valid: true,
        revision: '2',
        capacity: 4,
        available_count: 2,
        total_count: 3,
        reconciled_available_count: 2,
        count_mismatch: false,
        observed_count: 3,
        stale: false,
        version: 1,
        updated_at: new Date('2026-07-26T10:00:00.000Z'),
      },
      {
        source: 'store-b:11',
        valid: true,
        revision: '8',
        capacity: 2,
        available_count: 1,
        total_count: 1,
        reconciled_available_count: 1,
        count_mismatch: false,
        observed_count: 1,
        stale: false,
        version: 1,
        updated_at: new Date('2026-07-26T10:05:00.000Z'),
      },
    );

    await expect(service.getLatestSummary()).resolves.toMatchObject({
      configured: true,
      source: 'store-a:10, store-b:11',
      valid: true,
      stale: false,
      capacity: 6,
      availableCount: 3,
      totalCount: 4,
      reconciledAvailableCount: 3,
      observedCount: 4,
      updatedAt: new Date('2026-07-26T10:05:00.000Z'),
    });
  });

  it('rejects duplicate carrier identities in one snapshot', async () => {
    const duplicate = snapshot().observations[0];
    await expect(
      service.synchronize(
        snapshot({
          totalCount: 2,
          availableCount: 2,
          observations: [
            duplicate,
            { ...duplicate, slotId: 'A2', rfidUid: 'RFID-other' },
          ],
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
