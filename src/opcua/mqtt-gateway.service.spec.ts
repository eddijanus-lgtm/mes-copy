import { EventEmitter } from 'node:events';
import { ConfigService } from '@nestjs/config';
import { MqttGatewayService } from './mqtt-gateway.service';

const client = Object.assign(new EventEmitter(), {
  connected: false,
  subscribe: jest.fn((_topic: string, callback: (error: Error | null) => void) =>
    callback(null),
  ),
  unsubscribe: jest.fn(
    (_topic: string, callback: (error: Error | null) => void) => callback(null),
  ),
  publish: jest.fn(
    (
      _topic: string,
      _payload: string,
      _options: unknown,
      callback: (error: Error | null) => void,
    ) => callback(null),
  ),
  end: jest.fn(
    (_force: boolean, _options: unknown, callback: () => void) => callback(),
  ),
});

jest.mock('mqtt', () => ({
  connect: jest.fn(() => client),
}));

describe('MqttGatewayService', () => {
  let service: MqttGatewayService;

  beforeEach(() => {
    jest.clearAllMocks();
    client.removeAllListeners();
    client.connected = false;
    service = new MqttGatewayService(
      new ConfigService({
        MQTT_BROKER_URL: 'mqtt://broker:1883',
        MQTT_ALLOWED_TOPIC_PREFIXES: 'mes/,shop/',
      }),
    );
  });

  afterEach(async () => {
    await service.onModuleDestroy();
  });

  it('subscribes configured callback topics when the broker connects', async () => {
    const callback = jest.fn();
    service.onMessage('shop/orders', callback);

    await service.onModuleInit();
    client.connected = true;
    client.emit('connect');

    expect(client.subscribe).toHaveBeenCalledWith(
      'shop/orders',
      expect.any(Function),
    );

    client.emit(
      'message',
      'shop/orders',
      Buffer.from(JSON.stringify({ order: '42' })),
    );
    expect(callback).toHaveBeenCalledWith({ order: '42' });
  });

  it('subscribes a topic immediately when already connected', async () => {
    await service.onModuleInit();
    client.connected = true;

    service.onMessage('shop/priority-orders', jest.fn());

    expect(client.subscribe).toHaveBeenCalledWith(
      'shop/priority-orders',
      expect.any(Function),
    );
  });

  it('unsubscribes a dynamic topic after its final callback is removed', async () => {
    await service.onModuleInit();
    client.connected = true;
    const unsubscribe = service.onMessage('shop/orders', jest.fn());

    unsubscribe();

    expect(client.unsubscribe).toHaveBeenCalledWith(
      'shop/orders',
      expect.any(Function),
    );
  });

  it('dispatches messages registered through an MQTT wildcard', async () => {
    const callback = jest.fn();
    service.onMessage('shop/+/orders', callback);
    await service.onModuleInit();

    client.emit(
      'message',
      'shop/customer-a/orders',
      Buffer.from(JSON.stringify({ order: '43' })),
    );

    expect(callback).toHaveBeenCalledWith({ order: '43' });
  });
});
