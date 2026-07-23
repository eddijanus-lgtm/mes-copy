import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';

jest.mock('../src/opcua/opcua.service', () => ({ OpcUaService: class OpcUaService {} }));
jest.mock('../src/opcua/mqtt-gateway.service', () => ({ MqttGatewayService: class MqttGatewayService {} }));
jest.mock('../src/opcua/stmes-handshake.service', () => ({ StMesHandshakeService: class StMesHandshakeService {} }));
jest.mock('../src/opcua/webshop-orders.service', () => ({ WebshopOrdersService: class WebshopOrdersService {} }));

import { MqttGatewayService } from '../src/opcua/mqtt-gateway.service';
import { OpcUaService } from '../src/opcua/opcua.service';
import { ShopfloorGatewayController } from '../src/opcua/shopfloor-gateway.controller';
import { StMesHandshakeService } from '../src/opcua/stmes-handshake.service';
import { WebshopOrdersService } from '../src/opcua/webshop-orders.service';

describe('ShopfloorGatewayController (e2e)', () => {
  let app: INestApplication<App>;
  const opcUaService = {
    getServerStatus: jest.fn(async () => ({ connected: true, endpoint: 'opc.tcp://mock:4840/UA/WaraMesTest' })),
    isConnected: jest.fn(() => true),
    readNode: jest.fn(async () => 128),
    writeNodes: jest.fn(async () => undefined),
  };
  const mqttGatewayService = {
    isConnected: jest.fn(() => true),
    getRecentTelemetry: jest.fn(() => [{ topic: 'mes/test', payload: { ok: true } }]),
    publish: jest.fn(async () => undefined),
  };
  const stMesHandshakeService = { findRecent: jest.fn(() => [{ id: 'h1', resource_id: 1 }]) };
  const webshopOrdersService = { getRecentOrders: jest.fn(() => [{ orderName: 'WEBSHOP-1' }]) };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [ShopfloorGatewayController],
      providers: [
        { provide: OpcUaService, useValue: opcUaService },
        { provide: MqttGatewayService, useValue: mqttGatewayService },
        { provide: StMesHandshakeService, useValue: stMesHandshakeService },
        { provide: WebshopOrdersService, useValue: webshopOrdersService },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('reports combined shopfloor health for OPC UA and MQTT', async () => {
    const response = await request(app.getHttpServer()).get('/api/shopfloor/health').expect(200);

    expect(response.body.ok).toBe(true);
    expect(response.body.protocols.opcua.connected).toBe(true);
    expect(response.body.protocols.mqtt.connected).toBe(true);
  });

  it('reads OPC UA nodes through the gateway contract', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/shopfloor/opcua/read')
      .send({ nodeId: 'ns=1;s=Station1.stMES.Query.uiCarrierId' })
      .expect(201);

    expect(response.status).toBe(201);
    expect(opcUaService.readNode).toHaveBeenCalledWith('ns=1;s=Station1.stMES.Query.uiCarrierId');
  });

  it('maps machine control commands to OPC UA control nodes', async () => {
    await request(app.getHttpServer())
      .post('/api/shopfloor/machine/control')
      .send({ resourceId: 2, command: 'pause' })
      .expect(201)
      .expect(({ body }) => expect(body).toMatchObject({ success: true, command: 'pause', resourceId: 2 }));

    expect(opcUaService.writeNodes).toHaveBeenCalledWith([
      { nodeId: 'ns=1;s=Station2.stMES.Control.xCmdPause', dataType: 'Boolean', value: true },
    ]);
  });

  it('publishes MQTT messages through the gateway contract', async () => {
    await request(app.getHttpServer())
      .post('/api/shopfloor/mqtt/publish')
      .send({ topic: 'mes/test', payload: { hello: 'world' } })
      .expect(201)
      .expect(({ body }) => expect(body).toEqual({ published: true, topic: 'mes/test' }));

    expect(mqttGatewayService.publish).toHaveBeenCalledWith('mes/test', { hello: 'world' });
  });
});
