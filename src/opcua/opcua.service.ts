import { BadGatewayException, ForbiddenException, Injectable, Logger, OnModuleDestroy, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EdgeTelemetryEvent } from './edge-telemetry';

const nodeOpcua = require('node-opcua');

@Injectable()
export class OpcUaService implements OnModuleInit, OnModuleDestroy {
  private client: any;
  private session: any;
  private readonly logger = new Logger(OpcUaService.name);
  private connected = false;
  private connecting = false;
  private shuttingDown = false;
  private reconnectTimer?: NodeJS.Timeout;
  private pollingTimer?: NodeJS.Timeout;
  private polling = false;
  private address = '';
  private readonly telemetryCallbacks = new Set<(event: EdgeTelemetryEvent) => void>();

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    this.address = this.configService.get('OPC_UA_SERVER_ADDRESS', 'opc.tcp://localhost:4840/UA/WaraMesTest');
    await this.connect();
  }

  private async connect() {
    if (this.connecting || this.connected || this.shuttingDown) return;
    this.connecting = true;

    try {
      this.client = nodeOpcua.OPCUAClient.create({
        endpointMustExist: false,
        connectionStrategy: { initialDelay: 500, maxDelay: 5000, maxRetry: 0 },
      });
      this.client.on('connection_lost', () => this.handleDisconnect('connection lost'));

      await this.client.connect(this.address);
      this.session = await this.client.createSession();
      this.connected = true;
      this.logger.log('Connected to OPC UA server at ' + this.address);
      this.startPolling();
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
    const allowedPrefixes = this.configService.get('OPC_UA_ALLOWED_NODE_PREFIXES', 'ns=1;s=Machine1.').split(',');
    if (!allowedPrefixes.some((prefix) => nodeId.startsWith(prefix))) {
      throw new ForbiddenException('OPC UA node is not allowed');
    }
    if (!this.session || !this.connected) throw new ServiceUnavailableException('OPC UA server is not connected');
    try {
      const dataValue = await this.session.readVariableValue(nodeOpcua.resolveNodeId(nodeId));
      return dataValue?.value?.value;
    } catch (error) {
      throw new BadGatewayException('OPC UA read failed: ' + (error as Error).message);
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  async getServerStatus(): Promise<any> {
    return { connected: this.connected, endpoint: this.address };
  }

  onTelemetry(callback: (event: EdgeTelemetryEvent) => void): () => void {
    this.telemetryCallbacks.add(callback);
    return () => this.telemetryCallbacks.delete(callback);
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
      const [temperature, pressure, running, producedCount] = await Promise.all([
        this.readNode('ns=1;s=Machine1.Temperature'),
        this.readNode('ns=1;s=Machine1.Pressure'),
        this.readNode('ns=1;s=Machine1.Running'),
        this.readNode('ns=1;s=Machine1.ProducedCount'),
      ]);
      this.emitTelemetry({ machineId: 'Machine1', temperature, pressure, running, producedCount });
    } catch (error) {
      this.logger.warn('OPC UA telemetry read failed: ' + (error as Error).message);
      this.handleDisconnect('telemetry read failed');
    } finally {
      this.polling = false;
    }
  }

  private emitTelemetry(payload: Record<string, unknown>) {
    const event: EdgeTelemetryEvent = {
      type: 'edge.telemetry',
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
    const session = this.session;
    const client = this.client;
    this.session = null;
    this.client = null;
    try { if (session) await session.close(); } catch (error) { this.logger.warn('OPC UA session close failed: ' + (error as Error).message); }
    try { if (client) await client.disconnect(); } catch (error) { this.logger.warn('OPC UA disconnect failed: ' + (error as Error).message); }
  }
}
