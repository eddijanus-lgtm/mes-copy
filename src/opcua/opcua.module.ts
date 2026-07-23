import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { OpcUaService } from './opcua.service';
import { MqttGatewayService } from './mqtt-gateway.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrdersModule } from '../orders/orders.module';
import { StMesHandshakeEntity } from './stmes-handshake.entity';
import { StMesHandshakeService } from './stmes-handshake.service';
import { WebshopOrdersService } from './webshop-orders.service';

@Module({
  imports: [ConfigModule, OrdersModule, TypeOrmModule.forFeature([StMesHandshakeEntity])],
  providers: [OpcUaService, MqttGatewayService, StMesHandshakeService, WebshopOrdersService],
  exports: [OpcUaService, MqttGatewayService, StMesHandshakeService, WebshopOrdersService],
})
export class OpcUaModule {}
