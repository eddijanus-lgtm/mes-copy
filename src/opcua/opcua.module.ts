import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { OpcUaService } from './opcua.service';
import { OpcUaMachineAdapter } from './opcua-machine.adapter';
import { MqttGatewayService } from './mqtt-gateway.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrdersModule } from '../orders/orders.module';
import { AlarmsModule } from '../alarms/alarms.module';
import { StMesHandshakeEntity } from './stmes-handshake.entity';
import { StMesHandshakeService } from './stmes-handshake.service';
import { WebshopOrdersService } from './webshop-orders.service';
import { ConnectionRecoveryService } from './connection-recovery.service';
import { OrderEntity } from '../orders/order.entity';
import { OrderRouteStepEntity } from '../orders/order-route-step.entity';
import { CarrierEntity } from '../carriers/carrier.entity';
import { MACHINE_ADAPTER } from '../machines/adapters/machine-adapter.token';

@Module({
  imports: [ConfigModule, OrdersModule, AlarmsModule, TypeOrmModule.forFeature([StMesHandshakeEntity, OrderEntity, OrderRouteStepEntity, CarrierEntity])],
  providers: [
    OpcUaService,
    { provide: MACHINE_ADAPTER, useClass: OpcUaMachineAdapter },
    MqttGatewayService,
    StMesHandshakeService,
    WebshopOrdersService,
    ConnectionRecoveryService,
  ],
  exports: [MACHINE_ADAPTER, MqttGatewayService, StMesHandshakeService, WebshopOrdersService, ConnectionRecoveryService],
})
export class OpcUaModule {}
