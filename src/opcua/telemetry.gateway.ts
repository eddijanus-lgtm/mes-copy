import { Logger, OnModuleDestroy, Inject } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { RawData, WebSocket, WebSocketServer as WsServer } from 'ws';
import { UserRoleEnum } from '../users/user.entity';
import { ShopfloorTelemetryEvent } from './shopfloor-telemetry';
import { MqttGatewayService } from './mqtt-gateway.service';
import { DashboardService } from '../dashboard/dashboard.service';
import { MACHINE_ADAPTER } from '../machines/adapters/machine-adapter.token';
import type { MachineAdapter } from '../machines/adapters/machine-adapter.types';

@WebSocketGateway({ path: '/api/v1/shopfloor/ws' })
export class TelemetryGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy {
  @WebSocketServer()
  server: WsServer;

  private readonly logger = new Logger(TelemetryGateway.name);
  private readonly authenticatedClients = new Map<WebSocket, { username: string; role: UserRoleEnum }>();
  private unsubscribeOpcUa?: () => void;
  private unsubscribeMqtt?: () => void;
  private kpiBroadcastInterval?: NodeJS.Timeout;

  constructor(
    private readonly jwtService: JwtService,
    @Inject(MACHINE_ADAPTER) private readonly machine: MachineAdapter,
    private readonly mqttGatewayService: MqttGatewayService,
    private readonly dashboardService: DashboardService,
  ) {}

  afterInit() {
    this.unsubscribeOpcUa = this.machine.onTelemetry((event) => this.broadcast(event));
    this.unsubscribeMqtt = this.mqttGatewayService.onTelemetry((event) => this.broadcast(event));
    this.startKpiBroadcast();
  }

  private async startKpiBroadcast() {
    this.kpiBroadcastInterval = setInterval(async () => {
      try {
        const kpis = await this.dashboardService.getKpis();
        const message = JSON.stringify({ type: 'kpis', timestamp: new Date().toISOString(), payload: kpis });
        for (const client of this.authenticatedClients.keys()) {
          if (client.readyState === WebSocket.OPEN) client.send(message);
        }
      } catch (error) {
        this.logger.error('KPI broadcast failed: ' + (error as Error).message);
      }
    }, 2000);
  }

  handleConnection(client: WebSocket) {
    const timeout = setTimeout(() => client.close(4401, 'Authentication timeout'), 5000);
    client.once('message', (data) => void this.authenticate(client, data, timeout));
  }

  handleDisconnect(client: WebSocket) {
    this.authenticatedClients.delete(client);
  }

  onModuleDestroy() {
    this.unsubscribeOpcUa?.();
    this.unsubscribeMqtt?.();
    clearInterval(this.kpiBroadcastInterval);
  }

  private async authenticate(client: WebSocket, data: RawData, timeout: NodeJS.Timeout) {
    clearTimeout(timeout);
    try {
      const message = JSON.parse(data.toString());
      if (message.type !== 'auth' || typeof message.token !== 'string') throw new Error('Authentication message required');
      const payload = await this.jwtService.verifyAsync(message.token);
      if (!Object.values(UserRoleEnum).includes(payload.role)) throw new Error('Invalid role');

      this.authenticatedClients.set(client, { username: payload.username, role: payload.role });
      client.send(JSON.stringify({
        type: 'auth.ok',
        timestamp: new Date().toISOString(),
        payload: { username: payload.username, role: payload.role },
      }));
    } catch (error) {
      this.logger.warn('WebSocket authentication rejected: ' + (error as Error).message);
      client.close(4401, 'Unauthorized');
    }
  }

  private broadcast(event: ShopfloorTelemetryEvent) {
    const message = JSON.stringify(event);
    for (const client of this.authenticatedClients.keys()) {
      if (client.readyState === WebSocket.OPEN) client.send(message);
    }
  }
}
