import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import type {
  MachineAdapter,
  MachineAddressWrite,
  MachineCarrierInventorySnapshot,
  MachineCarrierObservation,
  MachineConnectionStatus,
  MachineControlCommand,
  MachineOrderParameterDefinition,
  MachineRecoverySnapshot,
  MachineRoutingResponse,
  MachineStationDescriptor,
  MachineStationRequest,
} from '../machines/adapters/machine-adapter.types';
import { MachineProfileService } from '../machines/profiles/machine-profile.service';
import { ShopfloorTelemetryEvent } from './shopfloor-telemetry';
import { OpcUaConfiguredSignal, OpcUaService } from './opcua.service';
import type { RoutingOutcome } from '../orders/routing-outcome';

@Injectable()
export class OpcUaMachineAdapter implements MachineAdapter {
  private readonly logger = new Logger(OpcUaMachineAdapter.name);

  constructor(
    @Inject(OpcUaService) private readonly opcUa: OpcUaService,
    @Inject(MachineProfileService)
    private readonly machineProfileService: MachineProfileService,
  ) {}

  isConnected(): boolean {
    return this.opcUa.isConnected();
  }

  async getConnectionStatus(): Promise<MachineConnectionStatus> {
    const status = await this.opcUa.getServerStatus();
    return status;
  }

  routingResultCode(outcome: RoutingOutcome): number {
    const resultCode =
      this.machineProfileService.getProfile().routingResultCodes?.[outcome];
    if (!Number.isInteger(resultCode) || resultCode! < 0) {
      throw new Error(
        `Machine profile does not define routingResultCodes.${outcome}`,
      );
    }
    return resultCode!;
  }

  onTelemetry(callback: (event: ShopfloorTelemetryEvent) => void): () => void {
    return this.opcUa.onTelemetry(callback);
  }

  onWorkRequest(
    callback: (resourceId: number, active: boolean) => void,
  ): () => void {
    return this.opcUa.onStMesRequest(callback);
  }

  onProcessCompleted(
    callback: (resourceId: number, timestamp: Date) => void,
  ): () => void {
    return this.opcUa.onProcessCompleted(callback);
  }

  onConnected(callback: () => void): () => void {
    return this.opcUa.onConnected(callback);
  }

  onDisconnected(callback: (reason: string) => void): () => void {
    return this.opcUa.onDisconnected(callback);
  }

  onCarrierInventoryChanged(
    callback: (snapshot: MachineCarrierInventorySnapshot) => void,
  ): () => void {
    let active = true;
    const publishSnapshot = (resourceId: number) => {
      void this.readCarrierInventory(resourceId)
        .then((snapshot) => {
          if (active) callback(snapshot);
        })
        .catch((error) =>
          this.logger.warn(
            `Carrier inventory ${resourceId} could not be read: ${
              (error as Error).message
            }`,
          ),
        );
    };
    const unsubscribe = this.opcUa.onCarrierInventoryChanged(publishSnapshot);

    if (this.isConnected()) {
      for (const station of this.machineProfileService
        .getProfile()
        .stations.filter(
          (candidate) => candidate.enabled && candidate.inventory,
        )) {
        publishSnapshot(station.resourceId);
      }
    }

    return () => {
      active = false;
      unsubscribe();
    };
  }

  async readStationRequest(resourceId: number): Promise<MachineStationRequest> {
    const [carrierNumber, requestedResourceId] = await Promise.all([
      this.readRole(resourceId, 'carrierId'),
      this.readRole(resourceId, 'resourceId'),
    ]);
    return {
      carrierNumber: Number(carrierNumber),
      requestedResourceId: Number(requestedResourceId),
    };
  }

  async markRequestBusy(resourceId: number): Promise<void> {
    await this.write(resourceId, [
      [this.role(resourceId, 'requestBusy'), true],
      [this.role(resourceId, 'requestAccepted'), false],
      [this.role(resourceId, 'requestRejected'), false],
    ]);
  }

  async writeRoutingResponse(
    resourceId: number,
    response: MachineRoutingResponse,
  ): Promise<void> {
    const acceptedWrites = response.accepted
      ? this.acceptedRoutingWrites(resourceId, response)
      : [];
    await this.writeSignals([
      ...acceptedWrites,
      [this.role(resourceId, 'processResult'), response.resultCode],
      [this.role(resourceId, 'requestBusy'), false],
      [this.role(resourceId, 'requestAccepted'), response.accepted],
      [this.role(resourceId, 'requestRejected'), !response.accepted],
    ]);
  }

  private acceptedRoutingWrites(
    resourceId: number,
    response: Extract<MachineRoutingResponse, { accepted: true }>,
  ) {
    const parameterDefinitions =
      this.machineProfileService.getProfile().orderParameterDefinitions || [];
    const parameterWrites = parameterDefinitions
      .filter(
        (definition) =>
          !definition.targetResourceIds ||
          definition.targetResourceIds.includes(resourceId),
      )
      .map((definition) => {
        const value =
          response.parameters[definition.key] ?? definition.default_value;
        if (value === undefined) {
          throw new ServiceUnavailableException(
            `Routing parameter ${definition.key} has neither an order value nor a configured default_value`,
          );
        }
        return [
          this.signal(resourceId, definition.signalKey || definition.key),
          value,
        ] as const;
      });
    return [
      [this.role(resourceId, 'orderId'), response.orderNo],
      [this.role(resourceId, 'partNumber'), response.partNo],
      [this.role(resourceId, 'operationId'), response.operationNo],
      [this.role(resourceId, 'stepNumber'), response.stepNo],
      [this.role(resourceId, 'nextStationId'), response.nextResourceId],
      ...parameterWrites,
    ] as const;
  }

  async writeInternalError(
    resourceId: number,
    resultCode: number,
  ): Promise<void> {
    await this.write(resourceId, [
      [this.role(resourceId, 'processResult'), resultCode],
      [this.role(resourceId, 'requestBusy'), false],
      [this.role(resourceId, 'requestAccepted'), false],
      [this.role(resourceId, 'requestRejected'), true],
    ]);
  }

  async acknowledgeRequest(resourceId: number): Promise<void> {
    await this.write(resourceId, [
      [this.role(resourceId, 'requestBusy'), false],
      [this.role(resourceId, 'requestAccepted'), false],
      [this.role(resourceId, 'requestRejected'), false],
    ]);
  }

  async readCompletedCarrierNumber(resourceId: number): Promise<number> {
    return Number(await this.readRole(resourceId, 'completedCarrierId'));
  }

  async readRecoverySnapshot(
    resourceId: number,
  ): Promise<MachineRecoverySnapshot> {
    const [carrierNumber, requestActive, processBusy] = await Promise.all([
      this.readRole(resourceId, 'carrierId'),
      this.readRole(resourceId, 'workRequest'),
      this.readRole(resourceId, 'processActive'),
    ]);
    return {
      carrierNumber: Number(carrierNumber),
      requestActive: Boolean(requestActive),
      processBusy: Boolean(processBusy),
    };
  }

  async readCarrierInventory(
    resourceId: number,
  ): Promise<MachineCarrierInventorySnapshot> {
    const station = this.machineProfileService
      .getProfile()
      .stations.find(
        (candidate) => candidate.enabled && candidate.resourceId === resourceId,
      );
    if (!station?.inventory) {
      throw new Error(
        `Carrier inventory is not configured for resource ${resourceId}`,
      );
    }

    const inventory = station.inventory;
    const readSignal = async (signalKey: string) => {
      const signal = this.signal(resourceId, signalKey);
      try {
        this.assertReadable(resourceId, signal);
        const value: unknown = await this.opcUa.readNode(
          signal.resourceId,
          signal.nodeId,
        );
        return this.fromMachineValue(signal, value);
      } catch (error) {
        if (signal.required) throw error;
        return undefined;
      }
    };
    const [
      valid,
      revision,
      capacity,
      availableCount,
      totalCount,
      observations,
    ] = await Promise.all([
      readSignal(inventory.validSignalKey),
      readSignal(inventory.revisionSignalKey),
      inventory.capacitySignalKey
        ? readSignal(inventory.capacitySignalKey)
        : Promise.resolve(undefined),
      readSignal(inventory.availableCountSignalKey),
      readSignal(inventory.totalCountSignalKey),
      Promise.all(
        inventory.slots.map(
          async (slot): Promise<MachineCarrierObservation> => {
            const [
              present,
              carrierNumber,
              rfidUid,
              rfidReadValid,
              physicalState,
              readerId,
              lastSeenAt,
            ] = await Promise.all([
              readSignal(slot.presentSignalKey),
              slot.carrierIdSignalKey
                ? readSignal(slot.carrierIdSignalKey)
                : Promise.resolve(undefined),
              slot.rfidUidSignalKey
                ? readSignal(slot.rfidUidSignalKey)
                : Promise.resolve(undefined),
              slot.rfidReadValidSignalKey
                ? readSignal(slot.rfidReadValidSignalKey)
                : Promise.resolve(undefined),
              slot.physicalStateSignalKey
                ? readSignal(slot.physicalStateSignalKey)
                : Promise.resolve(undefined),
              slot.readerIdSignalKey
                ? readSignal(slot.readerIdSignalKey)
                : Promise.resolve(undefined),
              slot.lastSeenSignalKey
                ? readSignal(slot.lastSeenSignalKey)
                : Promise.resolve(undefined),
            ]);
            const isPresent = Boolean(present);
            if (!isPresent) {
              return {
                resourceId,
                stationId: station.stationId,
                slotId: slot.slotId,
                present: false,
              };
            }
            const parsedCarrierNumber =
              this.optionalPositiveInteger(carrierNumber);
            const parsedLastSeenAt = this.optionalDate(lastSeenAt);
            return {
              resourceId,
              stationId: station.stationId,
              slotId: slot.slotId,
              present: true,
              ...(parsedCarrierNumber !== undefined
                ? { carrierNumber: parsedCarrierNumber }
                : {}),
              ...(this.optionalString(rfidUid) !== undefined
                ? { rfidUid: this.optionalString(rfidUid) }
                : {}),
              ...(rfidReadValid !== undefined
                ? { rfidReadValid: Boolean(rfidReadValid) }
                : {}),
              ...(this.optionalString(physicalState) !== undefined
                ? { physicalState: this.optionalString(physicalState) }
                : {}),
              ...(this.optionalString(readerId) !== undefined
                ? { readerId: this.optionalString(readerId) }
                : {}),
              ...(parsedLastSeenAt ? { lastSeenAt: parsedLastSeenAt } : {}),
            };
          },
        ),
      ),
    ]);

    return {
      resourceId,
      stationId: station.stationId,
      valid: Boolean(valid),
      revision: this.inventoryRevision(revision),
      ...(capacity !== undefined
        ? { capacity: this.requiredNonNegativeInteger(capacity, 'capacity') }
        : {}),
      availableCount: this.requiredNonNegativeInteger(
        availableCount,
        'availableCount',
      ),
      totalCount: this.requiredNonNegativeInteger(totalCount, 'totalCount'),
      observations,
    };
  }

  publishHandshakeEvent(payload: Readonly<Record<string, unknown>>): void {
    this.opcUa.publishStMesEvent(payload);
  }

  async executeControlCommand(
    resourceId: number,
    command: MachineControlCommand,
  ): Promise<void> {
    const signalRole: Record<
      MachineControlCommand,
      'controlStart' | 'controlStop' | 'controlReset' | 'controlPause'
    > = {
      start: 'controlStart',
      stop: 'controlStop',
      reset: 'controlReset',
      pause: 'controlPause',
    };
    await this.writeSignals([
      [this.role(resourceId, signalRole[command]), true],
    ]);
  }

  async readDiagnosticAddress(address: string): Promise<unknown> {
    return this.opcUa.readNode(address);
  }

  async writeDiagnosticAddresses(
    writes: readonly MachineAddressWrite[],
  ): Promise<void> {
    await this.opcUa.writeNodes(
      writes.map((write) => ({
        nodeId: write.address,
        dataType: write.dataType,
        value: write.value,
      })),
    );
  }

  getStations(): readonly MachineStationDescriptor[] {
    const profile = this.machineProfileService.getProfile();
    return profile.stations
      .filter((station) => station.enabled)
      .map((station) => {
        const resourceId = station.resourceId;
        if (!Number.isInteger(resourceId) || resourceId <= 0) {
          throw new Error(
            `Station ${station.stationId} requires a positive integer resourceId`,
          );
        }
        const roleToCommand = {
          controlStart: 'start',
          controlStop: 'stop',
          controlReset: 'reset',
          controlPause: 'pause',
        } as const;
        const availableCommands = station.signals
          .map(
            (signal) =>
              roleToCommand[signal.role as keyof typeof roleToCommand],
          )
          .filter(
            (command): command is MachineControlCommand =>
              command !== undefined,
          );
        return {
          resourceId,
          stationId: station.stationId,
          displayName: station.displayName,
          enabled: true,
          routeSequence: station.routing?.sequence,
          operationNo: station.routing?.operationNo,
          operation: station.routing?.operation,
          resourceType: station.resourceType,
          ...(station.capabilities
            ? { capabilities: station.capabilities }
            : {}),
          availableCommands,
        };
      });
  }

  getOrderParameterDefinitions(): readonly MachineOrderParameterDefinition[] {
    return (
      this.machineProfileService.getProfile().orderParameterDefinitions || []
    );
  }

  private async read(resourceId: number, signalKey: string): Promise<unknown> {
    const signal = this.signal(resourceId, signalKey);
    this.assertReadable(resourceId, signal);
    const value = await this.opcUa.readNode(signal.resourceId, signal.nodeId);
    return this.fromMachineValue(signal, value);
  }

  private readRole(
    resourceId: number,
    role: OpcUaConfiguredSignal['role'],
  ): Promise<unknown> {
    const signal = this.role(resourceId, role);
    this.assertReadable(resourceId, signal);
    return this.opcUa
      .readNode(signal.resourceId, signal.nodeId)
      .then((value) => this.fromMachineValue(signal, value));
  }

  private async write(
    resourceId: number,
    values: readonly (readonly [
      signal: OpcUaConfiguredSignal,
      value: unknown,
    ])[],
  ): Promise<void> {
    await this.writeSignals(values, resourceId);
  }

  private async writeSignals(
    values: readonly (readonly [
      signal: OpcUaConfiguredSignal,
      value: unknown,
    ])[],
    resourceId?: number,
  ): Promise<void> {
    const nodes = values.map(([signal, value]) => {
      this.assertWritable(resourceId, signal);
      return {
        resourceId: signal.resourceId,
        nodeId: signal.nodeId,
        dataType: signal.dataType,
        value: this.toMachineValue(signal, value),
      };
    });
    await this.opcUa.writeNodes(nodes);
  }

  private signal(resourceId: number, signalKey: string): OpcUaConfiguredSignal {
    return this.opcUa.getConfiguredSignal(resourceId, signalKey);
  }

  private role(
    resourceId: number,
    role: OpcUaConfiguredSignal['role'],
  ): OpcUaConfiguredSignal {
    return this.opcUa.getConfiguredSignalByRole(resourceId, role);
  }

  private assertReadable(
    resourceId: number | undefined,
    signal: OpcUaConfiguredSignal,
  ): void {
    if (signal.access !== 'read' && signal.access !== 'readWrite') {
      throw new Error(
        `Signal ${signal.key} for resource ${resourceId} is not readable`,
      );
    }
  }

  private assertWritable(
    resourceId: number | undefined,
    signal: OpcUaConfiguredSignal,
  ): void {
    if (signal.access !== 'write' && signal.access !== 'readWrite') {
      throw new Error(
        `Signal ${signal.key} for resource ${resourceId} is not writable`,
      );
    }
  }

  private fromMachineValue(
    signal: OpcUaConfiguredSignal,
    value: unknown,
  ): unknown {
    if (!signal.scaling || typeof value !== 'number') return value;
    return value * signal.scaling.factor + signal.scaling.offset;
  }

  private toMachineValue(
    signal: OpcUaConfiguredSignal,
    value: unknown,
  ): unknown {
    if (!signal.scaling || typeof value !== 'number') return value;
    if (signal.scaling.factor === 0) {
      throw new Error(
        `Signal ${signal.key} has an invalid scaling factor of 0`,
      );
    }
    return (value - signal.scaling.offset) / signal.scaling.factor;
  }

  private optionalPositiveInteger(value: unknown): number | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    const number = Number(value);
    return Number.isInteger(number) && number > 0 ? number : undefined;
  }

  private optionalString(value: unknown): string | undefined {
    if (value === undefined || value === null) return undefined;
    if (
      typeof value !== 'string' &&
      typeof value !== 'number' &&
      typeof value !== 'bigint' &&
      typeof value !== 'boolean'
    ) {
      return undefined;
    }
    const string = String(value).trim();
    return string.length > 0 ? string : undefined;
  }

  private optionalDate(value: unknown): Date | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    if (
      !(value instanceof Date) &&
      typeof value !== 'string' &&
      typeof value !== 'number'
    ) {
      return undefined;
    }
    const date = value instanceof Date ? value : new Date(value);
    return Number.isFinite(date.getTime()) ? date : undefined;
  }

  private inventoryRevision(value: unknown): number | string {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const string = this.optionalString(value);
    if (string !== undefined) return string;
    throw new Error('Inventory revision must be a finite number or string');
  }

  private requiredNonNegativeInteger(value: unknown, field: string): number {
    const number = Number(value);
    if (!Number.isInteger(number) || number < 0) {
      throw new Error(`Inventory ${field} must be a non-negative integer`);
    }
    return number;
  }
}
