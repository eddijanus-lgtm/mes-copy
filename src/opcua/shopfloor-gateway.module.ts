import { Module } from '@nestjs/common';
import { OpcUaModule } from './opcua.module';
import { ShopfloorGatewayController } from './shopfloor-gateway.controller';
import { AuthModule } from '../auth/auth.module';
import { TelemetryGateway } from './telemetry.gateway';

@Module({
  imports: [OpcUaModule, AuthModule],
  controllers: [ShopfloorGatewayController],
  providers: [TelemetryGateway],
})
export class ShopfloorGatewayModule {}
