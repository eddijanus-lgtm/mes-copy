import { Module } from '@nestjs/common';
import { OpcUaModule } from './opcua.module';
import { EdgeController } from './edge.controller';
import { AuthModule } from '../auth/auth.module';
import { TelemetryGateway } from './telemetry.gateway';

@Module({
  imports: [OpcUaModule, AuthModule],
  controllers: [EdgeController],
  providers: [TelemetryGateway],
})
export class EdgeGatewayModule {}
