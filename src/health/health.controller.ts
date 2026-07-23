import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService, TypeOrmHealthIndicator } from '@nestjs/terminus';
import { Public } from '../auth/public.decorator';
import { ApiTags } from '@nestjs/swagger';

@Controller('health')
@ApiTags('Health')
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

    return {
      timestamp: new Date().toISOString(),
      database: dbStatus,
      shopfloor: { opcua: 'available', mqtt: 'available', websocketClients: 0 },
      uptime_seconds: process.uptime(),
      memory_usage: process.memoryUsage(),
      node_version: process.version,
    };
  }
}
