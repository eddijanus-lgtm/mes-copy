import { BadRequestException } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  const channelRepo = {};
  const ruleRepo = {
    create: jest.fn((value) => value),
    save: jest.fn((value) => Promise.resolve(value)),
    findOne: jest.fn(),
  };
  const historyRepo = {
    count: jest.fn(),
    create: jest.fn((value) => value),
    save: jest.fn((value) => Promise.resolve(value)),
  };
  const mqttGateway = {
    publish: jest.fn(),
  };

  let service: NotificationsService;
  const originalAlertMqttTopic = process.env.ALERT_MQTT_TOPIC;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.ALERT_MQTT_TOPIC;
    service = new NotificationsService(
      channelRepo as any,
      ruleRepo as any,
      historyRepo as any,
      mqttGateway as any,
    );
  });

  afterAll(() => {
    if (originalAlertMqttTopic === undefined) {
      delete process.env.ALERT_MQTT_TOPIC;
    } else {
      process.env.ALERT_MQTT_TOPIC = originalAlertMqttTopic;
    }
  });

  it('reports no delivery rate when no attempts exist', async () => {
    historyRepo.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0);

    await expect(service.getDeliveryRate()).resolves.toEqual({
      rate: null,
      total_sent: 0,
      total_failed: 0,
    });
  });

  it('calculates delivery rate from persisted history', async () => {
    historyRepo.count.mockResolvedValueOnce(8).mockResolvedValueOnce(2);

    await expect(service.getDeliveryRate()).resolves.toEqual({
      rate: 80,
      total_sent: 8,
      total_failed: 2,
    });
    expect(historyRepo.count).toHaveBeenNthCalledWith(1, {
      where: { delivered: true },
    });
    expect(historyRepo.count).toHaveBeenNthCalledWith(2, {
      where: { delivered: false },
    });
  });

  it('does not publish MQTT alerts to a hardcoded fallback topic', async () => {
    const rule = {
      id: 'rule-1',
      name: 'Machine fault',
      severity: 'critical',
      machine_id: 'machine-1',
      channels: ['mqtt'],
    } as any;

    await expect(
      service.sendToChannels(rule, 'Fault detected'),
    ).resolves.toMatchObject({
      delivered: false,
      channels_sent: [],
      error_message: 'ALERT_MQTT_TOPIC is not configured',
    });
    expect(mqttGateway.publish).not.toHaveBeenCalled();
  });

  it('publishes MQTT alerts only to the explicitly configured topic', async () => {
    process.env.ALERT_MQTT_TOPIC = 'factory/alerts';
    const rule = {
      id: 'rule-2',
      name: 'Machine fault',
      severity: 'warning',
      machine_id: 'machine-2',
      channels: ['mqtt'],
    } as any;

    await expect(
      service.sendToChannels(rule, 'Fault detected'),
    ).resolves.toMatchObject({
      delivered: true,
      channels_sent: ['mqtt'],
    });
    expect(mqttGateway.publish).toHaveBeenCalledWith(
      'factory/alerts',
      expect.objectContaining({
        rule_id: 'rule-2',
        machine_id: 'machine-2',
        message: 'Fault detected',
      }),
    );
  });

  it('uses the numeric threshold written in the alert condition', () => {
    const condition = (service as any).parseCondition(
      'temperature >= 80',
      {},
    );

    expect(condition({ temperature: 79 })).toBe(false);
    expect(condition({ temperature: 80 })).toBe(true);
  });

  it('does not substitute an unrelated value or zero for a missing metric', () => {
    const condition = (service as any).parseCondition(
      'temperature >= 80',
      {},
    );

    expect(condition({ value: 100 })).toBe(false);
    expect(condition({})).toBe(false);
  });

  it('rejects incomplete alert conditions instead of assuming defaults', async () => {
    await expect(
      service.createRule({
        name: 'Invalid rule',
        condition: 'temperature',
        message_template: 'Too hot',
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(ruleRepo.save).not.toHaveBeenCalled();
  });
});
