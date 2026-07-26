import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService, TypeOrmHealthIndicator } from '@nestjs/terminus';
import { Public } from '../auth/public.decorator';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

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
  @ApiOperation({ summary: 'Datenbankzustand prüfen' })
  @ApiOkResponse({ description: 'Health Check wurde ausgeführt.' })
  check() {
    return this.health.check([() => this.database.pingCheck('database')]);
  }

  @Get('combined')
  @Public()
  @ApiOperation({ summary: 'Kombinierten Systemzustand abrufen' })
  @ApiOkResponse({ description: 'Aktueller Zustand und Laufzeitinformationen.' })
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
