import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RoutingService, WebshopProductionPayload } from '../orders/routing.service';
import { MqttGatewayService } from './mqtt-gateway.service';

const REQUIRED_FIELDS = ['bDeckelfarbe', 'uiKugelRot', 'uiKugelGruen', 'uiKugelBlau'] as const;

@Injectable()
export class WebshopOrdersService implements OnModuleInit {
  private readonly logger = new Logger(WebshopOrdersService.name);
  private recentOrders: Array<{ orderName: string; payload: WebshopProductionPayload; timestamp: string }> = [];

  constructor(
    private readonly configService: ConfigService,
    private readonly mqtt: MqttGatewayService,
    private readonly routing: RoutingService,
  ) {}

  onModuleInit() {
    const topic = this.configService.get('WEBSHOP_MQTT_TOPIC', 'i4.0/production/orders');
    this.mqtt.onMessage(topic, (payload) => void this.handleWebshopOrder(payload));
    this.logger.log(`Listening for webshop orders on MQTT topic ${topic}`);
  }

  getRecentOrders() {
    return [...this.recentOrders];
  }

  private async handleWebshopOrder(rawPayload: Record<string, unknown>) {
    try {
      const payload = this.validatePayload(rawPayload);
      const result = await this.routing.createWebshopProductionOrder(payload);
      this.recentOrders.unshift({ orderName: result.order.name, payload, timestamp: new Date().toISOString() });
      this.recentOrders.splice(20);
      this.logger.log(`Created MES order ${result.order.name} from webshop MQTT payload`);
    } catch (error) {
      this.logger.error(`Webshop order rejected: ${(error as Error).message}`);
    }
  }

  private validatePayload(payload: Record<string, unknown>): WebshopProductionPayload {
    const missing = REQUIRED_FIELDS.filter((field) => payload[field] === undefined || payload[field] === null || payload[field] === '');
    if (missing.length) throw new Error(`Missing required fields: ${missing.join(', ')}`);

    return {
      bDeckelfarbe: this.toInt(payload.bDeckelfarbe, 'bDeckelfarbe'),
      uiKugelRot: this.toInt(payload.uiKugelRot, 'uiKugelRot'),
      uiKugelGruen: this.toInt(payload.uiKugelGruen, 'uiKugelGruen'),
      uiKugelBlau: this.toInt(payload.uiKugelBlau, 'uiKugelBlau'),
      xAuftragAusstehend: Boolean(payload.xAuftragAusstehend),
      uiAnzahlAustehenderAuftraege: payload.uiAnzahlAustehenderAuftraege === undefined ? 0 : this.toInt(payload.uiAnzahlAustehenderAuftraege, 'uiAnzahlAustehenderAuftraege'),
    };
  }

  private toInt(value: unknown, field: string) {
    const numberValue = Number(value);
    if (!Number.isInteger(numberValue) || numberValue < 0) throw new Error(`${field} must be a non-negative integer`);
    return numberValue;
  }
}
