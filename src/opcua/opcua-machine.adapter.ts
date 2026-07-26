import { Injectable, Inject, Logger } from '@nestjs/common';
import { OpcUaService } from './opcua.service';
import { MachineProfileService } from '../machines/profiles/machine-profile.service';
import type { MachineAdapter, MachineControlCommand, MachineConnectionStatus, MachineStationRequest, MachineRoutingResponse, MachineRecoverySnapshot, MachineAddressWrite, MachineStationDescriptor, MachineOrderParameterDefinition } from '../machines/adapters/machine-adapter.types';
import { ShopfloorTelemetryEvent } from './shopfloor-telemetry';

@Injectable()
export class OpcUaMachineAdapter implements MachineAdapter {
  private readonly logger = new Logger(OpcUaMachineAdapter.name);
  private profileLoaded = false;

  constructor(
    @Inject(OpcUaService) private readonly opcUa: OpcUaService,
    @Inject(MachineProfileService) private readonly machineProfileService: MachineProfileService,
  ) {}

  isConnected(): boolean {
    return this.opcUa.isConnected();
  }

  async getConnectionStatus(): Promise<MachineConnectionStatus> {
    const status = await this.opcUa.getServerStatus();
    return { connected: status.connected, endpoint: status.endpoint };
  }

  onTelemetry(callback: (event: ShopfloorTelemetryEvent) => void): () => void {
    return this.opcUa.onTelemetry(callback);
  }

  onWorkRequest(callback: (resourceId: number, active: boolean) => void): () => void {
    return this.opcUa.onStMesRequest(callback);
  }

  onProcessCompleted(callback: (resourceId: number, timestamp: Date) => void): () => void {
    return this.opcUa.onProcessCompleted(callback);
  }

  onConnected(callback: () => void): () => void {
    return this.opcUa.onConnected(callback);
  }

  onDisconnected(callback: (reason: string) => void): () => void {
    return this.opcUa.onDisconnected(callback);
  }

  async readStationRequest(resourceId: number): Promise<MachineStationRequest> {
    const [carrierNumber, requestedResourceId] = await Promise.all([
      this.opcUa.readNode(this.addressOrLegacy(resourceId, 'carrierId', this.queryPrefix(resourceId) + 'uiCarrierId')),
      this.opcUa.readNode(this.addressOrLegacy(resourceId, 'resourceId', this.queryPrefix(resourceId) + 'uiResourceId')),
    ]);
    return { carrierNumber: Number(carrierNumber), requestedResourceId: Number(requestedResourceId) };
  }

  async markRequestBusy(resourceId: number): Promise<void> {
    const prefix = this.queryPrefix(resourceId);
    await this.opcUa.writeNodes([
      { nodeId: this.addressOrLegacy(resourceId, 'requestBusy', prefix + 'xQryBusy'), dataType: 'Boolean', value: true },
      { nodeId: this.addressOrLegacy(resourceId, 'requestAccepted', prefix + 'xDone'), dataType: 'Boolean', value: false },
      { nodeId: this.addressOrLegacy(resourceId, 'requestRejected', prefix + 'xError'), dataType: 'Boolean', value: false },
    ]);
  }

  async writeRoutingResponse(resourceId: number, response: MachineRoutingResponse): Promise<void> {
    const prefix = this.queryPrefix(resourceId);
    await this.opcUa.writeNodes([
      { nodeId: this.addressOrLegacy(resourceId, 'orderId', prefix + 'sOrderNo'), dataType: 'String', value: response.orderNo },
      { nodeId: this.addressOrLegacy(resourceId, 'partNumber', prefix + 'sPartNo'), dataType: 'String', value: response.partNo },
      { nodeId: this.addressOrLegacy(resourceId, 'operationId', prefix + 'uiOperationNo'), dataType: 'UInt16', value: response.operationNo },
      { nodeId: this.addressOrLegacy(resourceId, 'stepNumber', prefix + 'iStepNo'), dataType: 'Int16', value: response.stepNo },
      { nodeId: this.addressOrLegacy(resourceId, 'nextStationId', prefix + 'uiNextResourceId'), dataType: 'UInt16', value: response.nextResourceId },
      { nodeId: this.addressOrLegacy(resourceId, 'custom', prefix + 'iPar1'), dataType: 'Int16', value: response.iPar1 },
      { nodeId: this.addressOrLegacy(resourceId, 'custom', prefix + 'iPar2'), dataType: 'Int16', value: response.iPar2 },
      { nodeId: this.addressOrLegacy(resourceId, 'custom', prefix + 'iPar3'), dataType: 'Int16', value: response.iPar3 },
      { nodeId: this.addressOrLegacy(resourceId, 'custom', prefix + 'iPar4'), dataType: 'Int16', value: response.iPar4 },
      { nodeId: this.addressOrLegacy(resourceId, 'processResult', prefix + 'uiResultCode'), dataType: 'UInt16', value: response.resultCode },
      { nodeId: this.addressOrLegacy(resourceId, 'requestBusy', prefix + 'xQryBusy'), dataType: 'Boolean', value: false },
      { nodeId: this.addressOrLegacy(resourceId, 'requestAccepted', prefix + 'xDone'), dataType: 'Boolean', value: response.accepted },
      { nodeId: this.addressOrLegacy(resourceId, 'requestRejected', prefix + 'xError'), dataType: 'Boolean', value: !response.accepted },
    ]);
  }

  async writeInternalError(resourceId: number, resultCode: number): Promise<void> {
    const prefix = this.queryPrefix(resourceId);
    await this.opcUa.writeNodes([
      { nodeId: this.addressOrLegacy(resourceId, 'processResult', prefix + 'uiResultCode'), dataType: 'UInt16', value: resultCode },
      { nodeId: this.addressOrLegacy(resourceId, 'requestBusy', prefix + 'xQryBusy'), dataType: 'Boolean', value: false },
      { nodeId: this.addressOrLegacy(resourceId, 'requestAccepted', prefix + 'xDone'), dataType: 'Boolean', value: false },
      { nodeId: this.addressOrLegacy(resourceId, 'requestRejected', prefix + 'xError'), dataType: 'Boolean', value: true },
    ]);
  }

  async acknowledgeRequest(resourceId: number): Promise<void> {
    const prefix = this.queryPrefix(resourceId);
    await this.opcUa.writeNodes([
      { nodeId: this.addressOrLegacy(resourceId, 'requestBusy', prefix + 'xQryBusy'), dataType: 'Boolean', value: false },
      { nodeId: this.addressOrLegacy(resourceId, 'requestAccepted', prefix + 'xDone'), dataType: 'Boolean', value: false },
      { nodeId: this.addressOrLegacy(resourceId, 'requestRejected', prefix + 'xError'), dataType: 'Boolean', value: false },
    ]);
  }

  async readCompletedCarrierNumber(resourceId: number): Promise<number> {
    return Number(await this.opcUa.readNode(this.addressOrLegacy(resourceId, 'carrierId', this.processPrefix(resourceId) + 'iCarrierID')));
  }

  async readRecoverySnapshot(resourceId: number): Promise<MachineRecoverySnapshot> {
    const [carrierNumber, requestActive, processBusy] = await Promise.all([
      this.opcUa.readNode(this.addressOrLegacy(resourceId, 'carrierId', this.queryPrefix(resourceId) + 'uiCarrierId')),
      this.opcUa.readNode(this.addressOrLegacy(resourceId, 'workRequest', this.queryPrefix(resourceId) + 'xStart')),
      this.opcUa.readNode(this.addressOrLegacy(resourceId, 'processActive', this.statePrefix(resourceId) + 'xBusy')),
    ]);
    return { carrierNumber: Number(carrierNumber), requestActive: Boolean(requestActive), processBusy: Boolean(processBusy) };
  }

  publishHandshakeEvent(payload: Readonly<Record<string, unknown>>): void {
    this.opcUa.publishStMesEvent(payload);
  }

  async executeControlCommand(resourceId: number, command: MachineControlCommand): Promise<void> {
    const prefix = this.controlPrefix(resourceId);
    const commandNode = {
      start: 'xCmdStart',
      stop: 'xCmdStop',
      reset: 'xCmdReset',
      pause: 'xCmdPause',
    }[command];
    await this.opcUa.writeNodes([{ nodeId: prefix + commandNode, dataType: 'Boolean', value: true }]);
  }

  async executeLegacyControlCommand(resourceId: number, command: MachineControlCommand): Promise<void> {
    const prefix = this.queryPrefix(resourceId);
    switch (command) {
      case 'start':
        await this.opcUa.writeNodes([{ nodeId: prefix + 'xStart', dataType: 'Boolean', value: true }]);
        break;
      case 'stop':
        await this.opcUa.writeNodes([
          { nodeId: prefix + 'xQryBusy', dataType: 'Boolean', value: false },
          { nodeId: prefix + 'xDone', dataType: 'Boolean', value: false },
          { nodeId: prefix + 'xError', dataType: 'Boolean', value: false },
        ]);
        break;
      case 'reset':
        await this.opcUa.writeNodes([
          { nodeId: prefix + 'xStart', dataType: 'Boolean', value: false },
          { nodeId: prefix + 'xQryBusy', dataType: 'Boolean', value: false },
          { nodeId: prefix + 'xDone', dataType: 'Boolean', value: false },
          { nodeId: prefix + 'xError', dataType: 'Boolean', value: false },
        ]);
        break;
      case 'pause':
        await this.opcUa.writeNodes([{ nodeId: prefix + 'xQryBusy', dataType: 'Boolean', value: true }]);
        break;
    }
  }

  async readDiagnosticAddress(address: string): Promise<unknown> {
    return this.opcUa.readNode(address);
  }

  async writeDiagnosticAddresses(writes: readonly MachineAddressWrite[]): Promise<void> {
    await this.opcUa.writeNodes(writes.map(w => ({ nodeId: w.address, dataType: w.dataType, value: w.value })));
  }

  getStations(): readonly MachineStationDescriptor[] {
    this.ensureProfileLoaded();
    if (!this.profileLoaded) return this.getLegacyStations();

    const profile = this.machineProfileService.getProfile();
    const stations: MachineStationDescriptor[] = [];

    for (const station of profile.stations) {
      if (!station.enabled) continue;

      let resourceId: number | null = null;
      if (station.metadata && station.metadata.resourceId) {
        const parsed = Number(station.metadata.resourceId);
        if (!Number.isNaN(parsed) && parsed > 0) {
          resourceId = parsed;
        } else {
          this.logger.warn(`Station ${station.stationId} has invalid resourceId metadata: ${station.metadata.resourceId}, falling back to legacy`);
        }
      } else {
        this.logger.warn(`Station ${station.stationId} missing resourceId metadata, falling back to legacy`);
      }

      if (resourceId !== null) {
        stations.push({ resourceId, stationId: station.stationId, displayName: station.displayName, enabled: station.enabled });
      }
    }

    if (stations.length === 0) {
      this.logger.warn('No profile stations with valid resourceId, using legacy stations');
      return this.getLegacyStations();
    }

    return stations;
  }

  getOrderParameterDefinitions(): readonly MachineOrderParameterDefinition[] {
    try {
      const profile = this.machineProfileService.getProfile();
      return profile.orderParameterDefinitions || [];
    } catch (error) {
      this.logger.warn(`Machine profile unavailable for order parameters: ${(error as Error).message}`);
      return [];
    }
  }

  private ensureProfileLoaded(): void {
    if (this.profileLoaded) return;

    try {
      const profile = this.machineProfileService.getProfile();
      this.logger.log(`Machine profile loaded: ${profile.machineId} with ${profile.stations.length} stations`);
      this.profileLoaded = true;
    } catch (error) {
      this.logger.warn(`Machine profile unavailable; using legacy OPC-UA mapping: ${(error as Error).message}`);
      this.profileLoaded = false;
    }
  }

  private addressOrLegacy(resourceId: number, signalKey: string, legacyAddress: string): string {
    this.ensureProfileLoaded();
    if (!this.profileLoaded) return legacyAddress;

    const profileAddress = this.resolveSignalAddress(resourceId, signalKey);
    if (profileAddress) return profileAddress;
    return legacyAddress;
  }

  private resolveSignalAddress(resourceId: number, signalKey: string): string | undefined {
    const station = this.resolveProfileStation(resourceId);
    if (!station) return undefined;

    const signal = station.signals.find(s => s.key === signalKey);
    if (!signal) return undefined;

    const identifier = signal.identifier;
    if (!identifier.startsWith('ns=')) return undefined;

    return identifier;
  }

  private resolveProfileStation(resourceId: number): { signals: readonly { key: string; identifier: string }[] } | undefined {
    const profile = this.machineProfileService.getProfile();
    const station = profile.stations.find(s => s.enabled && s.metadata && Number(s.metadata.resourceId) === resourceId);
    if (!station) return undefined;
    return { signals: station.signals };
  }

  private getLegacyStations(): readonly MachineStationDescriptor[] {
    return [
      { resourceId: 1, stationId: 'legacy-station-1', displayName: 'Station 1', enabled: true },
      { resourceId: 2, stationId: 'legacy-station-2', displayName: 'Station 2', enabled: true },
      { resourceId: 3, stationId: 'legacy-station-3', displayName: 'Station 3', enabled: true },
    ];
  }

  private queryPrefix(resourceId: number): string {
    return `ns=1;s=Station${resourceId}.stMES.Query.`;
  }

  private processPrefix(resourceId: number): string {
    return `ns=1;s=Station${resourceId}.dbProcessData.`;
  }

  private statePrefix(resourceId: number): string {
    return `ns=1;s=Station${resourceId}.stMES.State.`;
  }

  private controlPrefix(resourceId: number): string {
    return `ns=1;s=Station${resourceId}.stMES.Control.`;
  }
}
