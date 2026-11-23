import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as nodemailer from 'nodemailer';
import { MqttGatewayService } from '../opcua/mqtt-gateway.service';
import { AlertRuleEntity, AlertHistoryEntity, NotificationChannelEntity } from './entities';
import type { NotificationChannel } from './entities';
import { OrderEntity } from '../orders/order.entity';
import { OrderRouteStepEntity } from '../orders/order-route-step.entity';
import { NotificationGateway } from './notification.gateway';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(
    @InjectRepository(NotificationChannelEntity)
    private readonly channelRepo: Repository<NotificationChannelEntity>,
    @InjectRepository(AlertRuleEntity)
    private readonly ruleRepo: Repository<AlertRuleEntity>,
    @InjectRepository(AlertHistoryEntity)
    private readonly historyRepo: Repository<AlertHistoryEntity>,
    @InjectRepository(OrderEntity)
    private readonly ordersRepo: Repository<OrderEntity>,
    @InjectRepository(OrderRouteStepEntity)
    private readonly routeStepsRepo: Repository<OrderRouteStepEntity>,
    private readonly mqttGateway?: MqttGatewayService,
    private readonly notificationGateway?: NotificationGateway,
  ) {
    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT || '587', 10);
    const user = process.env.SMTP_USER || '';
    const pass = process.env.SMTP_PASS || '';
    const secure = parseInt(process.env.SMTP_SECURE || '0', 10) === 1;

    if (host && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: user ? { user, pass } : undefined,
      });
      this.logger.log(`SMTP configured for ${user || '(anonymous)'}@${host}`);
    } else {
      this.logger.warn('SMTP not configured (SMTP_HOST/SMTP_PASS missing). Email notifications disabled.');
    }

    if (this.mqttGateway && process.env.ALERT_MQTT_TOPIC) {
      this.logger.log(`MQTT alert broker will publish to ${process.env.ALERT_MQTT_TOPIC}`);
    }
  }

  async sendToChannels(rule: AlertRuleEntity, message: string, machineId?: string): Promise<AlertHistoryEntity> {
    let delivered = false;
    let error: string | undefined;
    const channels: NotificationChannel[] = [];

    const configuredChannels = await this.getEnabledChannelConfigurations();
    const requestedChannels = rule.channels || [];

    if (requestedChannels.includes('email')) {
      try {
        await this.sendEmail(rule, message, machineId, configuredChannels.get('email'));
        channels.push('email');
        delivered = true;
      } catch (e) {
        error = String(e.message || e);
        this.logger.error(`Email notification failed for ${rule.id}: ${error}`);
      }
    }

    if (requestedChannels.includes('push')) {
      try {
        await this.sendPush();
        channels.push('push');
        delivered = true;
      } catch (e) {
        error = error || String(e.message || e);
      }
    }

    if (requestedChannels.includes('mqtt')) {
      try {
        await this.sendMqtt(rule, message, configuredChannels.get('mqtt'));
        channels.push('mqtt');
        delivered = true;
      } catch (e) {
        if (!error) error = String(e.message || e);
      }
    }

    if (requestedChannels.includes('websocket')) {
      try {
        await this.sendWebSocket(rule, message, machineId, configuredChannels.get('websocket'));
        channels.push('websocket');
        delivered = true;
      } catch (e) {
        error = error || String((e as Error).message || e);
      }
    }

    if (!delivered && !this.mqttGateway) {
      this.logger.warn('At least one notification channel (mqtt/websocket) should be configured for delivery fallback');
    }

    const history = this.historyRepo.create({
      rule_id: rule.id,
      machine_id: machineId || rule.machine_id,
      message,
      severity: rule.severity,
      delivered: channels.length > 0,
      channels_sent: channels,
      sent_at: new Date(),
      error_message: error,
    });

    return this.historyRepo.save(history);
  }

  private async sendEmail(rule: AlertRuleEntity, message: string, machineId?: string, config?: Record<string, string>): Promise<void> {
    if (!config) throw new Error('Kein aktiver E-Mail-Kanal konfiguriert');
    if (!this.transporter) throw new Error('SMTP transport not configured');

    const to = config.recipient || process.env.ALERT_EMAIL_TARGETS;
    if (!to) throw new Error('Kein E-Mail-Empfänger konfiguriert');
    const subject = `[MES Alert ${rule.severity.toUpperCase()}] ${rule.name}`;

    await this.transporter.sendMail({
      from: `"wara-mes Alerts" <${process.env.SMTP_USER || 'noreply@mes.local'}>`,
      to,
      subject,
      html: `<h3>${rule.name}</h3><p>${message}</p><p>Maschine: ${machineId || 'Nicht zugeordnet'}</p><p>Zeit: ${new Date().toLocaleString('de-DE')}</p>`,
    });

    this.logger.log(`Email notification sent for alert rule ${rule.id} (severity: ${rule.severity})`);
  }

  private async sendPush(): Promise<void> {
    throw new Error('Push-Benachrichtigungen sind nicht konfiguriert');
  }

  private async sendMqtt(rule: AlertRuleEntity, messageText: string, config?: Record<string, string>): Promise<void> {
    if (!config) throw new Error('Kein aktiver MQTT-Kanal konfiguriert');
    if (!this.mqttGateway) throw new Error('MQTT gateway not available');
    const topic = config.topic || process.env.ALERT_MQTT_TOPIC;
    if (!topic) throw new Error('Kein MQTT-Topic konfiguriert');
    const payload = {
      rule_id: rule.id,
      rule_name: rule.name,
      severity: rule.severity,
      machine_id: rule.machine_id,
      message: messageText,
      timestamp: new Date().toISOString(),
    };

    await this.mqttGateway.publish(topic, payload);
    this.logger.log(`MQTT alert dispatched for ${rule.id} on topic ${topic}`);
  }

  private async sendWebSocket(rule: AlertRuleEntity, message: string, machineId?: string, config?: Record<string, string>): Promise<void> {
    if (!config) throw new Error('Kein aktiver WebSocket-Kanal konfiguriert');
    if (!this.notificationGateway) throw new Error('WebSocket gateway not available');
    this.notificationGateway.broadcastNotification({
      rule_id: rule.id,
      rule_name: rule.name,
      severity: rule.severity,
      machine_id: machineId || rule.machine_id,
      message,
    });
  }

  async evaluateRules(telemetryData: Record<string, any>): Promise<void> {
    const rules = await this.ruleRepo.find({ where: { is_active: true } });
    if (!rules?.length) return;

    for (const rule of rules) {
      try {
        const conditionFn = this.parseCondition(rule.condition, rule.params || {});
        if (conditionFn(telemetryData)) {
          rule.status = 'firing';
          await this.ruleRepo.save(rule);
          const message = rule.message_template
            .replace('{machine_id}', telemetryData.machine_id || rule.machine_id || '')
            .replace('{value}', String(telemetryData.value || ''))
            .replace('{threshold}', String(telemetryData.threshold || rule.params?.threshold || ''));

          let history: AlertHistoryEntity;
          try {
            history = await this.sendToChannels(rule, message, telemetryData.machine_id);
          } catch (e) {
            const msg2 = rule.message_template
              .replace('{machine_id}', telemetryData.machine_id || rule.machine_id || '')
              .replace('{value}', String(telemetryData.value || ''))
              .replace('{threshold}', String(telemetryData.threshold || rule.params?.threshold || ''));

            history = await this.sendToChannels(rule, msg2, telemetryData.machine_id);
          }

          rule.last_triggered_at = new Date();
          rule.status = history.delivered ? 'resolved' : 'firing';
          await this.ruleRepo.save(rule);
        }
      } catch (e) {
        this.logger.error(`Rule evaluation failed for ${rule.id}: ${e.message}`);
      }
    }
  }

  private parseCondition(condition: string, params: Record<string, any>): Function {
    const parts = condition.split(/\s+/);
    const metric = parts[0] || 'value';
    const op = parts[1] || '>=';
    const threshold = parseFloat(String(params.threshold ?? params[metric] ?? 0));

    const operators: Record<string, (a: number, b: number) => boolean> = {
      '>=': (a, b) => a >= b,
      '<=': (a, b) => a <= b,
      '>': (a, b) => a > b,
      '<': (a, b) => a < b,
      '==': (a, b) => a == b,
      '!=': (a, b) => a != b,
    };

    const fn = operators[op] || operators['>='];
    return (data: Record<string, any>) => {
      const currentValue = parseFloat(String(data[metric] ?? data.value ?? 0));
      if (isNaN(currentValue)) return false;
      return fn(currentValue, threshold);
    };
  }

  async getAllChannels(): Promise<NotificationChannelEntity[]> {
    return this.channelRepo.find({ order: { created_at: 'DESC' } });
  }

  async createChannel(dto: Partial<NotificationChannelEntity>): Promise<NotificationChannelEntity> {
    const existing = dto.channel
      ? await this.channelRepo.findOne({ where: { channel: dto.channel } })
      : null;
    const channel = existing ? Object.assign(existing, dto) : this.channelRepo.create(dto);
    this.logger.log(`Notification channel ${existing ? 'updated' : 'created'}: ${dto.channel} (${dto.enabled ? 'enabled' : 'disabled'})`);
    return this.channelRepo.save(channel);
  }

  async updateChannel(id: string, dto: Partial<NotificationChannelEntity>): Promise<NotificationChannelEntity> {
    const channel = await this.channelRepo.findOne({ where: { id } });
    if (!channel) throw new Error(`Notification channel ${id} not found`);
    Object.assign(channel, dto);
    return this.channelRepo.save(channel);
  }

  async deleteChannel(id: string): Promise<void> {
    const channel = await this.channelRepo.findOne({ where: { id } });
    if (!channel) throw new Error(`Notification channel ${id} not found`);
    await this.channelRepo.remove(channel);
  }

  async testChannel(id: string): Promise<{ message: string }> {
    const channel = await this.channelRepo.findOne({ where: { id } });
    if (!channel) throw new Error(`Notification channel ${id} not found`);
    if (!channel.enabled) throw new Error('Der Kanal ist deaktiviert');

    const rule = { id: 'channel-test', name: 'Kanaltest', severity: 'info', machine_id: undefined } as AlertRuleEntity;
    const message = 'Dies ist eine Testmeldung aus dem MES.';
    const config = this.parseChannelConfig(channel.config);
    if (channel.channel === 'email') await this.sendEmail(rule, message, undefined, config);
    else if (channel.channel === 'mqtt') await this.sendMqtt(rule, message, config);
    else if (channel.channel === 'websocket') await this.sendWebSocket(rule, message, undefined, config);
    else await this.sendPush();
    return { message: `Test über ${channel.channel} erfolgreich ausgelöst` };
  }

  private async getEnabledChannelConfigurations() {
    const channels = await this.channelRepo.find({
      where: { enabled: true },
      order: { updated_at: 'DESC' },
    });
    const result = new Map<NotificationChannel, Record<string, string>>();
    for (const channel of channels) {
      if (!result.has(channel.channel)) result.set(channel.channel, this.parseChannelConfig(channel.config));
    }
    return result;
  }

  private parseChannelConfig(config?: string): Record<string, string> {
    if (!config) return {};
    try {
      const parsed = JSON.parse(config);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  async getAllRules(): Promise<AlertRuleEntity[]> {
    return this.ruleRepo.find({ order: { created_at: 'DESC' } });
  }

  async getRule(id: string): Promise<AlertRuleEntity> {
    const rule = await this.ruleRepo.findOne({ where: { id } });
    if (!rule) throw new Error(`Alert rule ${id} not found`);
    return rule;
  }

  async createRule(dto: Partial<AlertRuleEntity>): Promise<AlertRuleEntity> {
    const rule = this.ruleRepo.create({ ...dto, is_active: false });
    this.logger.log(`Alert rule created: ${dto.name} (inactive by default)`);
    return this.ruleRepo.save(rule);
  }

  async updateRule(id: string, dto: Partial<AlertRuleEntity>): Promise<AlertRuleEntity> {
    const rule = await this.getRule(id);
    Object.assign(rule, dto);
    if (dto.is_active && !rule.last_triggered_at) rule.status = 'active';
    return this.ruleRepo.save(rule);
  }

  async toggleRule(id: string): Promise<AlertRuleEntity> {
    const rule = await this.getRule(id);
    rule.is_active = !rule.is_active;
    if (rule.is_active) {
      rule.status = 'active';
      this.logger.log(`Alert rule ${rule.name} activated`);
    } else {
      rule.status = 'inactive';
      this.logger.log(`Alert rule ${rule.name} deactivated`);
    }

    return this.ruleRepo.save(rule);
  }

  async getHistory(filters?: { rule_id?: string; severity?: string; machine_id?: string; limit?: number }): Promise<AlertHistoryEntity[]> {
    const where: Record<string, any> = {};
    if (filters?.rule_id) where.rule_id = filters.rule_id;
    if (filters?.severity) where.severity = filters.severity;
    if (filters?.machine_id) where.machine_id = filters.machine_id;

    const query = this.historyRepo.createQueryBuilder('h')
      .where(where)
      .orderBy('h.created_at', 'DESC');

    return query.take(filters?.limit || 100).getMany();
  }

  async getOrderNotifications() {
    const orders = await this.ordersRepo.find({
      order: { created_at: 'DESC' },
      take: 100,
    });
    if (!orders.length) return [];

    const routeSteps = await this.routeStepsRepo.find({
      where: orders.map((order) => ({ order_id: order.id, step_no: 1 })),
    });
    const firstStepByOrder = new Map(routeSteps.map((step) => [step.order_id, step]));

    return orders.map((order) => ({
      id: order.id,
      name: order.name,
      quantity: order.quantity,
      status: order.status,
      created_at: order.created_at,
      parameters: firstStepByOrder.get(order.id)?.parameters ?? {},
    }));
  }

  async getRuleStats(): Promise<{ total: number; active: number; firing: number; by_severity: Record<string, number> }> {
    const total = await this.ruleRepo.count();
    const active = await this.ruleRepo.count({ where: { is_active: true } });
    const firing = await this.ruleRepo.count({ where: { status: 'firing' as any } });

    const bySeverity: Record<string, number> = {};
    const rules = await this.ruleRepo.find();
    for (const r of rules) {
      bySeverity[r.severity] = (bySeverity[r.severity] || 0) + 1;
    }

    return { total, active, firing, by_severity: bySeverity };
  }

  async getHistoryStats(): Promise<{ total: number; delivered: number; not_delivered: number; by_severity: Record<string, number> }> {
    const total = await this.historyRepo.count();
    const delivered = await this.historyRepo.count({ where: { delivered: true } });
    const notDelivered = total - delivered;

    const bySeverity: Record<string, number> = {};
    const history = await this.historyRepo.find();
    for (const h of history) {
      bySeverity[h.severity] = (bySeverity[h.severity] || 0) + 1;
    }

    return { total, delivered, not_delivered: notDelivered, by_severity: bySeverity };
  }

  async getDeliveryRate() {
    const totalSent = await this.historyRepo.count();
    const delivered = await this.historyRepo.count({ where: { delivered: true } });
    return {
      rate: totalSent ? Math.round((delivered / totalSent) * 1000) / 10 : 0,
      total_sent: totalSent,
      total_failed: totalSent - delivered,
    };
  }

  async deleteRule(id: string): Promise<void> {
    const rule = await this.getRule(id);
    await this.ruleRepo.remove(rule);
  }
}
