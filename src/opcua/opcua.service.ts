import { BadGatewayException, ForbiddenException, Injectable, Logger, OnModuleDestroy, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ShopfloorTelemetryEvent } from './shopfloor-telemetry';

const nodeOpcua = require('node-opcua');

@Injectable()
export class OpcUaService implements OnModuleInit, OnModuleDestroy {
  private client: any;
  private session: any;
  private readonly stationConnections = new Map<number, { client: any; session: any; subscription?: any }>();
  private readonly logger = new Logger(OpcUaService.name);
  private connected = false;
  private connecting = false;
  private shuttingDown = false;
  private reconnectTimer?: NodeJS.Timeout;
  private pollingTimer?: NodeJS.Timeout;
  private polling = false;
  private subscription: any;
  private monitoredItems: any[] = [];
  private address = '';
  private readonly telemetryCallbacks = new Set<(event: ShopfloorTelemetryEvent) => void>();
  private readonly stMesCallbacks = new Set<(resourceId: number, active: boolean) => void>();
  private readonly processCompletedCallbacks = new Set<(resourceId: number, timestamp: Date) => void>();
  private readonly connectedCallbacks = new Set<() => void>();
  private readonly disconnectedCallbacks = new Set<(reason: string) => void>();
  private readonly lastStMesStartState = new Map<number, boolean>();

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    this.address = this.configService.get('OPC_UA_SERVER_ADDRESS', 'opc.tcp://localhost:4840/UA/WaraMesTest');
    await this.connect();
  }

  private async connect() {
    if (this.connecting || this.connected || this.shuttingDown) return;
    this.connecting = true;

    try {
      for (const resourceId of this.resourceIds()) {
        const client = nodeOpcua.OPCUAClient.create({
          endpointMustExist: false,
          connectionStrategy: { initialDelay: 500, maxDelay: 5000, maxRetry: 0 },
        });
        client.on('connection_lost', () => this.handleDisconnect(`station ${resourceId} connection lost`));
        const address = this.configService.get(`OPC_UA_STATION_${resourceId}_ADDRESS`,
          this.address.replace(/:(\d+)(\/|$)/, (_, port, suffix) => `:${Number(port) + resourceId - 1}${suffix}`));
        await client.connect(address);
        const session = await client.createSession();
        this.stationConnections.set(resourceId, { client, session });
      }
      this.client = this.stationConnections.get(1)?.client;
      this.session = this.stationConnections.get(1)?.session;
      this.connected = true;
      this.logger.log('Connected to OPC UA server at ' + this.address);
      await this.startStMesSubscriptions();
      this.startPolling();
      for (const cb of this.connectedCallbacks) try { cb(); } catch (e) { this.logger.error('connected callback failed', e); }
    } catch (error) {
      this.connected = false;
      this.logger.warn('OPC UA connection failed: ' + (error as Error).message);
      await this.closeConnection();
      this.scheduleReconnect();
    } finally {
      this.connecting = false;
    }
  }

  async onModuleDestroy() {
    this.shuttingDown = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.pollingTimer) clearInterval(this.pollingTimer);
    await this.closeConnection();
  }

  async readNode(nodeId: string): Promise<any> {
    const allowedPrefixes = this.configService.get('OPC_UA_ALLOWED_NODE_PREFIXES', 'ns=1;s=Station').split(',');
    if (!allowedPrefixes.some((prefix) => nodeId.startsWith(prefix))) {
      throw new ForbiddenException('OPC UA node is not allowed');
    }
    if (!this.session || !this.connected) throw new ServiceUnavailableException('OPC UA server is not connected');
    try {
      const dataValue = await this.sessionFor(nodeId).readVariableValue(nodeOpcua.resolveNodeId(nodeId));
      return dataValue?.value?.value;
    } catch (error) {
      throw new BadGatewayException('OPC UA read failed: ' + (error as Error).message);
    }
  }

  async writeNodes(nodes: Array<{ nodeId: string; dataType: string; value: unknown }>): Promise<void> {
    if (!this.session || !this.connected) throw new ServiceUnavailableException('OPC UA server is not connected');
    const allowedPrefixes = this.configService.get('OPC_UA_ALLOWED_NODE_PREFIXES', 'ns=1;s=Station').split(',');
    if (nodes.some((node) => !allowedPrefixes.some((prefix) => node.nodeId.startsWith(prefix)))) {
      throw new ForbiddenException('OPC UA node is not allowed');
    }
    nodes.forEach((node) => this.sessionFor(node.nodeId));
    const writes = nodes.map((node) => ({
      nodeId: node.nodeId,
      attributeId: nodeOpcua.AttributeIds.Value,
      value: { value: new nodeOpcua.Variant({ dataType: nodeOpcua.DataType[node.dataType], value: node.value }) },
    }));
    for (const [resourceId, connection] of this.stationConnections) {
      const stationWrites = writes.filter((write) => write.nodeId.startsWith(`ns=1;s=Station${resourceId}.`));
      if (!stationWrites.length) continue;
      const results = await connection.session.write(stationWrites);
      const failed = results.find((statusCode) => !statusCode.isGood());
      if (failed) throw new BadGatewayException('OPC UA write failed: ' + failed.toString());
    }
  }

  private sessionFor(nodeId: string): any {
    const match = /^ns=1;s=Station(\d+)\./.exec(nodeId);
    if (!match) throw new ForbiddenException('Unknown station node');
    const session = this.stationConnections.get(Number(match[1]))?.session;
    if (!session) throw new ServiceUnavailableException(`Station ${match[1]} is not connected`);
    return session;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async getServerStatus(): Promise<any> {
    return { connected: this.connected, endpoint: this.address };
  }

  onTelemetry(callback: (event: ShopfloorTelemetryEvent) => void): () => void {
    this.telemetryCallbacks.add(callback);
    return () => this.telemetryCallbacks.delete(callback);
  }

  onStMesRequest(callback: (resourceId: number, active: boolean) => void): () => void {
    this.stMesCallbacks.add(callback);
    return () => this.stMesCallbacks.delete(callback);
  }

  onProcessCompleted(callback: (resourceId: number, timestamp: Date) => void): () => void {
    this.processCompletedCallbacks.add(callback);
    return () => this.processCompletedCallbacks.delete(callback);
  }

  onConnected(callback: () => void): () => void {
    this.connectedCallbacks.add(callback);
    return () => this.connectedCallbacks.delete(callback);
  }

  onDisconnected(callback: (reason: string) => void): () => void {
    this.disconnectedCallbacks.add(callback);
    return () => this.disconnectedCallbacks.delete(callback);
  }

  publishStMesEvent(payload: Record<string, unknown>) {
    this.emitTelemetry({ kind: 'stmes.handshake', ...payload });
  }

  private startPolling() {
    if (this.pollingTimer) clearInterval(this.pollingTimer);
    void this.pollTelemetry();
    this.pollingTimer = setInterval(() => void this.pollTelemetry(), 1000);
  }

  private async pollTelemetry() {
    if (this.polling || !this.connected || !this.session) return;
    this.polling = true;
    try {
      for (const resourceId of this.resourceIds()) {
        const prefix = `ns=1;s=Station${resourceId}.dbProcessData.`;
        const queryPrefix = `ns=1;s=Station${resourceId}.stMES.Query.`;
        const statePrefix = `ns=1;s=Station${resourceId}.stMES.State.`;
        const qualityCounters = resourceId === 3
          ? Promise.all([
            this.readNode(`ns=1;s=Station${resourceId}.LineInfo.uiProducedCount`),
            this.readNode(`ns=1;s=Station${resourceId}.LineInfo.uiFailedCount`),
          ]).catch(() => [])
          : Promise.resolve([]);
        const [
          iCarrierID, iStepNo, iResourceID, iPar1, iPar2, iPar3, iPar4, ldtTimeStamp,
          xStart, xQryBusy, xDone, xError, uiCarrierId, uiResultCode, sOrderNo, uiOperationNo,
          xAuto, xManual, xBusy, xReset, xErrL0, xErrL1, xErrL2,
        ] = await Promise.all([
          this.readNode(prefix + 'iCarrierID'), this.readNode(prefix + 'iStepNo'),
          this.readNode(prefix + 'iResourceID'), this.readNode(prefix + 'iPar1'),
          this.readNode(prefix + 'iPar2'), this.readNode(prefix + 'iPar3'),
          this.readNode(prefix + 'iPar4'), this.readNode(prefix + 'ldtTimeStamp'),
          this.readNode(queryPrefix + 'xStart'), this.readNode(queryPrefix + 'xQryBusy'),
          this.readNode(queryPrefix + 'xDone'), this.readNode(queryPrefix + 'xError'),
          this.readNode(queryPrefix + 'uiCarrierId'), this.readNode(queryPrefix + 'uiResultCode'),
          this.readNode(queryPrefix + 'sOrderNo'), this.readNode(queryPrefix + 'uiOperationNo'),
          this.readNode(statePrefix + 'xAuto'), this.readNode(statePrefix + 'xManual'),
          this.readNode(statePrefix + 'xBusy'), this.readNode(statePrefix + 'xReset'),
          this.readNode(statePrefix + 'xErrL0'), this.readNode(statePrefix + 'xErrL1'),
          this.readNode(statePrefix + 'xErrL2'),
        ]);
        const [good, bad] = await qualityCounters;
        this.emitTelemetry({
          kind: 'station.snapshot', resourceId, dbNumber: 151,
          iCarrierID, iStepNo, iResourceID, iPar1, iPar2, iPar3, iPar4, ldtTimeStamp,
          ...(Number.isSafeInteger(good) && Number.isSafeInteger(bad) ? { qualityCounts: { good, bad } } : {}),
          state: { xAuto, xManual, xBusy, xReset, xErrL0, xErrL1, xErrL2 },
          handshake: { xStart, xQryBusy, xDone, xError, uiCarrierId, uiResultCode, sOrderNo, uiOperationNo },
        });

        const active = Boolean(xStart);
        const wasActive = this.lastStMesStartState.get(resourceId);
        if (active && !wasActive) {
          for (const callback of this.stMesCallbacks) callback(resourceId, true);
        } else if (!active && wasActive) {
          for (const callback of this.stMesCallbacks) callback(resourceId, false);
        }
        this.lastStMesStartState.set(resourceId, active);
      }
    } catch (error) {
      this.logger.warn('OPC UA telemetry read failed: ' + (error as Error).message);
      this.handleDisconnect('telemetry read failed');
    } finally {
      this.polling = false;
    }
  }

  private emitTelemetry(payload: Record<string, unknown>) {
    const event: ShopfloorTelemetryEvent = {
      type: 'shopfloor.telemetry',
      timestamp: new Date().toISOString(),
      source: 'opcua',
      payload,
    };
    for (const callback of this.telemetryCallbacks) {
      try { callback(event); } catch (error) { this.logger.error('OPC UA telemetry callback failed', error); }
    }
  }

  private handleDisconnect(reason: string) {
    if (!this.connected && !this.session) return;
    this.logger.warn('OPC UA disconnected: ' + reason);
    for (const cb of this.disconnectedCallbacks) try { cb(reason); } catch (e) { this.logger.error('disconnected callback failed', e); }
    this.connected = false;
    if (this.pollingTimer) clearInterval(this.pollingTimer);
    this.pollingTimer = undefined;
    void this.closeConnection().finally(() => this.scheduleReconnect());
  }

  private scheduleReconnect() {
    if (this.shuttingDown || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.connect();
    }, 5000);
  }

  private async closeConnection() {
    const connections = [...this.stationConnections.values()];
    this.stationConnections.clear();
    this.session = null;
    this.client = null;
    this.monitoredItems = [];
    for (const connection of connections) {
      try { if (connection.subscription) await connection.subscription.terminate(); } catch (error) { this.logger.warn('OPC UA subscription close failed', error); }
      try { await connection.session.close(); } catch (error) { this.logger.warn('OPC UA session close failed', error); }
      try { await connection.client.disconnect(); } catch (error) { this.logger.warn('OPC UA disconnect failed', error); }
    }
    this.subscription = null;
  }

  private async startStMesSubscriptions() {
    for (const resourceId of this.resourceIds()) {
      const subscription = await this.stationConnections.get(resourceId)!.session.createSubscription2({
        requestedPublishingInterval: 250,
        requestedLifetimeCount: 120,
        requestedMaxKeepAliveCount: 10,
        maxNotificationsPerPublish: 20,
        publishingEnabled: true,
        priority: 10,
      });
      this.stationConnections.get(resourceId)!.subscription = subscription;
      const item = nodeOpcua.ClientMonitoredItem.create(
        subscription,
        { nodeId: `ns=1;s=Station${resourceId}.stMES.Query.xStart`, attributeId: nodeOpcua.AttributeIds.Value },
        { samplingInterval: 100, discardOldest: true, queueSize: 10 },
        nodeOpcua.TimestampsToReturn.Both,
      );
      item.on('changed', (dataValue) => {
        const active = Boolean(dataValue?.value?.value);
        this.lastStMesStartState.set(resourceId, active);
        for (const callback of this.stMesCallbacks) callback(resourceId, active);
      });
      item.on('err', (error) => this.logger.error(`stMES monitor error for resource ${resourceId}: ${error.message}`));
      this.monitoredItems.push(item);

      const completionItem = nodeOpcua.ClientMonitoredItem.create(
        subscription,
        { nodeId: `ns=1;s=Station${resourceId}.dbProcessData.ldtTimeStamp`, attributeId: nodeOpcua.AttributeIds.Value },
        { samplingInterval: 100, discardOldest: true, queueSize: 10 },
        nodeOpcua.TimestampsToReturn.Both,
      );
      completionItem.on('changed', (dataValue) => {
        const timestamp = new Date(dataValue?.value?.value);
        if (timestamp.getUTCFullYear() <= 1970) return;
        for (const callback of this.processCompletedCallbacks) callback(resourceId, timestamp);
      });
      completionItem.on('err', (error) => this.logger.error(`DB151 completion monitor error for resource ${resourceId}: ${error.message}`));
      this.monitoredItems.push(completionItem);
    }
  }

  private resourceIds(): number[] {
    return this.configService.get('OPC_UA_DEMO_RESOURCE_IDS', '1,2,3').split(',').map(Number).filter(Number.isInteger);
  }
}
