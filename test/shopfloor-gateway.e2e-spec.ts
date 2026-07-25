import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';

import { MACHINE_ADAPTER } from '../src/machines/adapters/machine-adapter.token';
import { MachineAdapter, MachineConnectionStatus } from '../src/machines/adapters/machine-adapter.types';
import { MqttGatewayService } from '../src/opcua/mqtt-gateway.service';
import { StMesHandshakeService } from '../src/opcua/stmes-handshake.service';
import { WebshopOrdersService } from '../src/opcua/webshop-orders.service';
import { ShopfloorGatewayController } from '../src/opcua/shopfloor-gateway.controller';

describe('ShopfloorGatewayController (e2e)', () => {
  let app: INestApplication<App>;
  const machineAdapter: jest.Mocked<MachineAdapter> = {
    getConnectionStatus: jest.fn().mockResolvedValue({ connected: true, endpoint: 'opc.tcp://mock:4840/UA/WaraMesTest' }),
    isConnected: jest.fn().mockReturnValue(true),
    readDiagnosticAddress: jest.fn().mockResolvedValue(128),
    writeDiagnosticAddresses: jest.fn().mockResolvedValue(undefined),
    executeControlCommand: jest.fn().mockResolvedValue(undefined),
    executeLegacyControlCommand: jest.fn().mockResolvedValue(undefined),
    onTelemetry: jest.fn().mockReturnValue(() => {}),
    onWorkRequest: jest.fn().mockReturnValue(() => {}),
    onProcessCompleted: jest.fn().mockReturnValue(() => {}),
    onConnected: jest.fn().mockReturnValue(() => {}),
    onDisconnected: jest.fn().mockReturnValue(() => {}),
    readStationRequest: jest.fn().mockResolvedValue({ carrierNumber: 1, requestedResourceId: 1 }),
    markRequestBusy: jest.fn().mockResolvedValue(undefined),
    writeRoutingResponse: jest.fn().mockResolvedValue(undefined),
    writeInternalError: jest.fn().mockResolvedValue(undefined),
    acknowledgeRequest: jest.fn().mockResolvedValue(undefined),
    readCompletedCarrierNumber: jest.fn().mockResolvedValue(1),
    readRecoverySnapshot: jest.fn().mockResolvedValue({ carrierNumber: 1, requestActive: false, processBusy: false }),
    publishHandshakeEvent: jest.fn(),
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
        { provide: MACHINE_ADAPTER, useValue: machineAdapter },
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
    expect(machineAdapter.readDiagnosticAddress).toHaveBeenCalledWith('ns=1;s=Station1.stMES.Query.uiCarrierId');
  });

  it('maps machine control commands to OPC UA control nodes', async () => {
    await request(app.getHttpServer())
      .post('/api/shopfloor/machine/control')
      .send({ resourceId: 2, command: 'pause' })
      .expect(201)
      .expect(({ body }) => expect(body).toMatchObject({ success: true, command: 'pause', resourceId: 2 }));

    expect(machineAdapter.executeControlCommand).toHaveBeenCalledWith(2, 'pause');
  });

  it('publishes MQTT messages through the gateway contract', async () => {
    await request(app.getHttpServer())
      .post('/api/shopfloor/mqtt/publish')
      .send({ topic: 'mes/test', payload: { hello: 'world' } })
      .expect(201)
      .expect(({ body }) => expect(body).toEqual({ published: true, topic: 'mes/test' }));

    expect(mqttGatewayService.publish).toHaveBeenCalledWith('mes/test', { hello: 'world' });
  });

  it('writes multiple OPC UA nodes through the gateway contract', async () => {
    await request(app.getHttpServer())
      .post('/api/shopfloor/opcua/write')
      .send({
        writes: [
          { address: 'ns=1;s=Station1.stMES.Control.xCmdStart', dataType: 'Boolean', value: true },
          { address: 'ns=1;s=Station1.stMES.Query.uiResultCode', dataType: 'UInt16', value: 0 },
        ],
      })
      .expect(201);

    expect(machineAdapter.writeDiagnosticAddresses).toHaveBeenCalledWith([
      { address: 'ns=1;s=Station1.stMES.Control.xCmdStart', dataType: 'Boolean', value: true },
      { address: 'ns=1;s=Station1.stMES.Query.uiResultCode', dataType: 'UInt16', value: 0 },
    ]);
  });

  it('rejects OPC UA write with invalid payload', async () => {
    await request(app.getHttpServer())
      .post('/api/shopfloor/opcua/write')
      .send({ writes: [] })
      .expect(400);
  });

  it('rejects OPC UA write with missing address', async () => {
    await request(app.getHttpServer())
      .post('/api/shopfloor/opcua/write')
      .send({ writes: [{ dataType: 'Boolean', value: true }] })
      .expect(400);
  });
});
