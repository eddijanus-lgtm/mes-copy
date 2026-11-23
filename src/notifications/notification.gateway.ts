import { Logger } from '@nestjs/common';
import { OnGatewayConnection, OnGatewayDisconnect, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { RawData, WebSocket, WebSocketServer as WsServer } from 'ws';
import { UserRoleEnum } from '../users/user.entity';

@WebSocketGateway({ path: '/api/notifications/ws' })
export class NotificationGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: WsServer;

  private readonly logger = new Logger(NotificationGateway.name);
  private readonly authenticatedClients = new Set<WebSocket>();

  constructor(private readonly jwtService: JwtService) {}

  handleConnection(client: WebSocket) {
    const timeout = setTimeout(() => client.close(4401, 'Authentication timeout'), 5000);
    client.once('message', (data) => void this.authenticate(client, data, timeout));
  }

  handleDisconnect(client: WebSocket) {
    this.authenticatedClients.delete(client);
  }

  broadcastNotification(payload: Record<string, unknown>) {
    if (!this.authenticatedClients.size) {
      throw new Error('Keine authentifizierten WebSocket-Clients verbunden');
    }
    const message = JSON.stringify({
      type: 'notification',
      timestamp: new Date().toISOString(),
      payload,
    });
    for (const client of this.authenticatedClients) {
      if (client.readyState === WebSocket.OPEN) client.send(message);
    }
  }

  private async authenticate(client: WebSocket, data: RawData, timeout: NodeJS.Timeout) {
    clearTimeout(timeout);
    try {
      const message = JSON.parse(data.toString());
      if (message.type !== 'auth' || typeof message.token !== 'string') throw new Error('Authentication message required');
      const payload = await this.jwtService.verifyAsync(message.token);
      if (!Object.values(UserRoleEnum).includes(payload.role)) throw new Error('Invalid role');
      this.authenticatedClients.add(client);
      client.send(JSON.stringify({ type: 'auth.ok', timestamp: new Date().toISOString() }));
    } catch (error) {
      this.logger.warn(`WebSocket authentication rejected: ${(error as Error).message}`);
      client.close(4401, 'Unauthorized');
    }
  }
}
