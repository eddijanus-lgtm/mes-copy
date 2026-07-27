import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderEntity } from './order.entity';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { OrderRouteStepEntity } from './order-route-step.entity';
import { CarrierEntity } from '../carriers/carrier.entity';
import { RoutingService } from './routing.service';
import { MachineEntity } from '../machines/machine.entity';
import { ProductEntity } from '../products/product.entity';
import { ProductRouteStepEntity } from '../products/product-route-step.entity';
import { StMesHandshakeEntity } from '../opcua/stmes-handshake.entity';
import { OrderProductionLogEntity } from './order-production-log.entity';
import { OrderProductionLogService } from './order-production-log.service';
import { MachineProfilesModule } from '../machines/profiles/machine-profiles.module';
import { ExecutionStepsModule } from '../execution-steps/execution-steps.module';

@Module({
  imports: [MachineProfilesModule, ExecutionStepsModule, TypeOrmModule.forFeature([
    OrderEntity,
    OrderRouteStepEntity,
    CarrierEntity,
    MachineEntity,
    ProductEntity,
    ProductRouteStepEntity,
    StMesHandshakeEntity,
    OrderProductionLogEntity,
  ])],
  controllers: [OrdersController],
  providers: [OrdersService, RoutingService, OrderProductionLogService],
  exports: [OrdersService, RoutingService, OrderProductionLogService],
})
export class OrdersModule {}
