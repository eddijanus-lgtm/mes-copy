import { Injectable, Inject } from '@nestjs/common';
import { OpcUaService } from './opcua.service';
import { MACHINE_ADAPTER } from '../machines/adapters/machine-adapter.token';
import type { MachineAdapter, MachineControlCommand, MachineConnectionStatus, MachineStationRequest, MachineRoutingResponse, MachineRecoverySnapshot, MachineAddressWrite } from '../machines/adapters/machine-adapter.types';
import { ShopfloorTelemetryEvent } from './shopfloor-telemetry';

@Injectable()
export class OpcUaMachineAdapter implements MachineAdapter {
  constructor(
    @Inject(OpcUaService) private readonly opcUa: OpcUaService,
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
    const prefix = this.queryPrefix(resourceId);
    const [carrierNumber, requestedResourceId] = await Promise.all([
      this.opcUa.readNode(prefix + 'uiCarrierId'),
      this.opcUa.readNode(prefix + 'uiResourceId'),
    ]);
    return { carrierNumber: Number(carrierNumber), requestedResourceId: Number(requestedResourceId) };
  }

  async markRequestBusy(resourceId: number): Promise<void> {
    const prefix = this.queryPrefix(resourceId);
    await this.opcUa.writeNodes([
      { nodeId: prefix + 'xQryBusy', dataType: 'Boolean', value: true },
      { nodeId: prefix + 'xDone', dataType: 'Boolean', value: false },
      { nodeId: prefix + 'xError', dataType: 'Boolean', value: false },
    ]);
  }

  async writeRoutingResponse(resourceId: number, response: MachineRoutingResponse): Promise<void> {
    const prefix = this.queryPrefix(resourceId);
    await this.opcUa.writeNodes([
      { nodeId: prefix + 'sOrderNo', dataType: 'String', value: response.orderNo },
      { nodeId: prefix + 'sPartNo', dataType: 'String', value: response.partNo },
      { nodeId: prefix + 'uiOperationNo', dataType: 'UInt16', value: response.operationNo },
      { nodeId: prefix + 'iStepNo', dataType: 'Int16', value: response.stepNo },
      { nodeId: prefix + 'uiNextResourceId', dataType: 'UInt16', value: response.nextResourceId },
      { nodeId: prefix + 'iPar1', dataType: 'Int16', value: response.iPar1 },
      { nodeId: prefix + 'iPar2', dataType: 'Int16', value: response.iPar2 },
      { nodeId: prefix + 'iPar3', dataType: 'Int16', value: response.iPar3 },
      { nodeId: prefix + 'iPar4', dataType: 'Int16', value: response.iPar4 },
      { nodeId: prefix + 'uiResultCode', dataType: 'UInt16', value: response.resultCode },
      { nodeId: prefix + 'xQryBusy', dataType: 'Boolean', value: false },
      { nodeId: prefix + 'xDone', dataType: 'Boolean', value: response.accepted },
      { nodeId: prefix + 'xError', dataType: 'Boolean', value: !response.accepted },
    ]);
  }

  async writeInternalError(resourceId: number, resultCode: number): Promise<void> {
    const prefix = this.queryPrefix(resourceId);
    await this.opcUa.writeNodes([
      { nodeId: prefix + 'uiResultCode', dataType: 'UInt16', value: resultCode },
      { nodeId: prefix + 'xQryBusy', dataType: 'Boolean', value: false },
      { nodeId: prefix + 'xDone', dataType: 'Boolean', value: false },
      { nodeId: prefix + 'xError', dataType: 'Boolean', value: true },
    ]);
  }

  async acknowledgeRequest(resourceId: number): Promise<void> {
    const prefix = this.queryPrefix(resourceId);
    await this.opcUa.writeNodes([
      { nodeId: prefix + 'xQryBusy', dataType: 'Boolean', value: false },
      { nodeId: prefix + 'xDone', dataType: 'Boolean', value: false },
      { nodeId: prefix + 'xError', dataType: 'Boolean', value: false },
    ]);
  }

  async readCompletedCarrierNumber(resourceId: number): Promise<number> {
    return Number(await this.opcUa.readNode(this.processPrefix(resourceId) + 'iCarrierID'));
  }

  async readRecoverySnapshot(resourceId: number): Promise<MachineRecoverySnapshot> {
    const queryPrefix = this.queryPrefix(resourceId);
    const statePrefix = this.statePrefix(resourceId);
    const [carrierNumber, requestActive, processBusy] = await Promise.all([
      this.opcUa.readNode(queryPrefix + 'uiCarrierId'),
      this.opcUa.readNode(queryPrefix + 'xStart'),
      this.opcUa.readNode(statePrefix + 'xBusy'),
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