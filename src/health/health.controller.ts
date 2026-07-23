import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService, TypeOrmHealthIndicator } from '@nestjs/terminus';
import { Public } from '../auth/public.decorator';
import { ShopfloorGatewayController } from '../opcua/shopfloor-gateway.controller';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly database: TypeOrmHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  @Public()
  check() {
    return this.health.check([() => this.database.pingCheck('database')]);
  }

  @Get('combined')
  @Public()
  async combinedCheck() {
    const dbStatus = await this.database.pingCheck('database').catch(() => ({ database: 'down' }));

    let shopfloorStatus: Record<string, any> = {};
    try {
      shopfloorStatus = {
        opcua: ShopfloorGatewayController.__opcuaStatus || 'unknown',
        mqtt: ShopfloorGatewayController.__mqttStatus || 'unknown',
        websocketClients: ShopfloorGatewayController.__websocketClients || 0,
      };
    } catch {
      shopfloorStatus = { opcua: 'unknown', mqtt: 'unknown', websocketClients: 0 };
    }

    return {
      timestamp: new Date().toISOString(),
      database: dbStatus,
      shopfloor: shopfloorStatus,
      uptime_seconds: process.uptime(),
      memory_usage: process.memoryUsage(),
      node_version: process.version,
    };
  }
}
