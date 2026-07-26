import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  RoutingService,
  WebshopProductionPayload,
} from '../orders/routing.service';
import { MqttGatewayService } from './mqtt-gateway.service';
import { translateWebshopOrder } from './webshop-order-translator';

@Injectable()
export class WebshopOrdersService implements OnModuleInit {
  private readonly logger = new Logger(WebshopOrdersService.name);
  private recentOrders: Array<{
    orderName: string;
    payload: WebshopProductionPayload;
    timestamp: string;
  }> = [];

  constructor(
    private readonly configService: ConfigService,
    private readonly mqtt: MqttGatewayService,
    private readonly routing: RoutingService,
  ) {}

  onModuleInit() {
    const topic = this.configService.get<string>(
      'WEBSHOP_MQTT_TOPIC',
      'i4.0/production/orders',
    );
    this.mqtt.onMessage(
      topic,
      (payload: unknown) => void this.handleWebshopOrder(payload),
    );
    this.logger.log(`Listening for webshop orders on MQTT topic ${topic}`);
  }

  getRecentOrders() {
    return [...this.recentOrders];
  }

  private async handleWebshopOrder(rawPayload: unknown) {
    try {
      const payload = translateWebshopOrder(rawPayload);
      const result = await this.routing.createWebshopProductionOrder(payload);
      this.recentOrders.unshift({
        orderName: result.order.name,
        payload,
        timestamp: new Date().toISOString(),
      });
      this.recentOrders.splice(20);
      this.logger.log(
        `Created MES order ${result.order.name} from webshop MQTT payload`,
      );
    } catch (error) {
      this.logger.error(`Webshop order rejected: ${(error as Error).message}`);
    }
  }
}
