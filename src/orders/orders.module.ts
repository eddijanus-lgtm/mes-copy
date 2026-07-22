import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderEntity } from './order.entity';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { OrderRouteStepEntity } from './order-route-step.entity';
import { CarrierEntity } from '../carriers/carrier.entity';
import { RoutingService } from './routing.service';

@Module({
  imports: [TypeOrmModule.forFeature([OrderEntity, OrderRouteStepEntity, CarrierEntity])],
  controllers: [OrdersController],
  providers: [OrdersService, RoutingService],
  exports: [OrdersService, RoutingService],
})
export class OrdersModule {}
