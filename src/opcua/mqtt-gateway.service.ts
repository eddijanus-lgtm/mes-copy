import { ForbiddenException, Injectable, Logger, OnModuleDestroy, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ShopfloorTelemetryEvent } from './shopfloor-telemetry';
const mqtt = require('mqtt');

const SUBSCRIPTION_TOPICS = [
  'mes/production/+/#',
  'mes/machines/+/telemetry',
  'mes/alarms/+/+',
  'mes/orders/+/+',
  'i4.0/production/orders',
];

@Injectable()
export class MqttGatewayService implements OnModuleInit, OnModuleDestroy {
  private client: any;
  private subscriptionCallbacks = new Map<string, Array<(data: any) => void>>();
  private reconnectAttempts = 0;
  private readonly logger = new Logger(MqttGatewayService.name);
  private startupTimer?: NodeJS.Timeout;
  private readonly telemetryCallbacks = new Set<(event: ShopfloorTelemetryEvent) => void>();
  private readonly recentTelemetry: Array<{ topic: string; payload: Record<string, unknown>; timestamp: string }> = [];

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    const brokerUrl = this.configService.get('MQTT_BROKER_URL', 'mqtt://localhost:1883');
    try {
      this.client = mqtt.connect(brokerUrl, {
        clientId: 'mes-shopfloor-' + Date.now(),
        clean: true,
        reconnectPeriod: 30000,
      });

      this.startupTimer = setTimeout(() => {
        if (!this.client?.connected) {
          this.logger.warn('MQTT broker not reachable at: ' + brokerUrl);
        }
      }, 8000);

      this.client.on('connect', () => {
        this.reconnectAttempts = 0;
        this.logger.log('Connected to MQTT broker at ' + brokerUrl);
        for (const topic of SUBSCRIPTION_TOPICS) {
          this.client.subscribe(topic, (error: Error | null) => {
            if (error) this.logger.error(`MQTT subscription failed for ${topic}: ${error.message}`);
          });
        }
      });
      this.client.on('error', (error: Error) => this.logger.error('MQTT client error: ' + error.message));
      this.client.on('offline', () => this.logger.warn('MQTT client is offline'));
      this.client.on('reconnect', () => {
        this.reconnectAttempts += 1;
        this.logger.log(`MQTT reconnect attempt ${this.reconnectAttempts}`);
      });
      this.client.on('close', () => this.logger.warn('MQTT connection closed'));

      this.client.on('message', (topic: string, payload: Buffer) => {
        try {
          const data = JSON.parse(payload.toString());
          const callbacks = this.subscriptionCallbacks.get(topic) || [];
          if (callbacks.length) {
            for (const callback of callbacks) {
              try { callback(data); } catch (error) { this.logger.error('MQTT subscriber failed', error); }
            }
          }
          const timestamp = new Date().toISOString();
          this.recentTelemetry.unshift({ topic, payload: data, timestamp });
          this.recentTelemetry.splice(50);
          this.emitTelemetry(topic, data, timestamp);
        } catch (error) {
          this.logger.warn(`Invalid MQTT JSON on ${topic}: ${(error as Error).message}`);
        }
      });

    } catch (e: any) {
      this.logger.warn('Could not initialize MQTT connection: ' + e.message);
      this.client = null;
    }
  }

  async onModuleDestroy() {
    if (this.startupTimer) clearTimeout(this.startupTimer);
    if (!this.client) return;
    await new Promise<void>((resolve) => this.client.end(false, {}, () => resolve()));
  }

  onMessage(topic: string, callback: (data: any) => void): () => void {
    if (!this.subscriptionCallbacks.has(topic)) {
      this.subscriptionCallbacks.set(topic, []);
    }
    const cbs = this.subscriptionCallbacks.get(topic)!;
    cbs.push(callback);
    return () => {
      const found = this.subscriptionCallbacks.get(topic);
      if (found) this.subscriptionCallbacks.set(topic, found.filter((cb) => cb !== callback));
    };
  }

  async publish(topic: string, data: any): Promise<void> {
    const allowedPrefixes = this.configService.get('MQTT_ALLOWED_TOPIC_PREFIXES', 'mes/').split(',');
    if (!allowedPrefixes.some((prefix) => topic.startsWith(prefix))) {
      throw new ForbiddenException('MQTT topic is not allowed');
    }
    if (!this.client?.connected) throw new ServiceUnavailableException('MQTT broker is not connected');
    return new Promise<void>((resolve, reject) => {
      this.client.publish(topic, JSON.stringify(data), { qos: 1 }, (error: Error | null) => error ? reject(error) : resolve());
    });
  }

  isConnected(): boolean {
    return !!this.client && this.client.connected;
  }

  onTelemetry(callback: (event: ShopfloorTelemetryEvent) => void): () => void {
    this.telemetryCallbacks.add(callback);
    return () => this.telemetryCallbacks.delete(callback);
  }

  getRecentTelemetry() {
    return [...this.recentTelemetry];
  }

  private emitTelemetry(topic: string, payload: Record<string, unknown>, timestamp = new Date().toISOString()) {
    const event: ShopfloorTelemetryEvent = {
      type: 'shopfloor.telemetry',
      timestamp,
      source: 'mqtt',
      topic,
      payload,
    };
    for (const callback of this.telemetryCallbacks) {
      try { callback(event); } catch (error) { this.logger.error('MQTT telemetry callback failed', error); }
    }
  }
}
