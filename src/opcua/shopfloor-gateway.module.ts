import { Module } from '@nestjs/common';
import { OpcUaModule } from './opcua.module';
import { ShopfloorGatewayController } from './shopfloor-gateway.controller';
import { AuthModule } from '../auth/auth.module';
import { TelemetryGateway } from './telemetry.gateway';
import { DashboardModule } from '../dashboard/dashboard.module';

@Module({
  imports: [OpcUaModule, AuthModule, DashboardModule],
  controllers: [ShopfloorGatewayController],
  providers: [TelemetryGateway],
})
export class ShopfloorGatewayModule {}
