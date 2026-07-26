import { ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WsAdapter } from '@nestjs/platform-ws';
import * as bcrypt from 'bcryptjs';
import { connect, MqttClient } from 'mqtt';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';

import { configureApiVersioning } from '../src/api-versioning';
import { AppModule } from '../src/app.module';
import { ApiExceptionFilter } from '../src/common/api-exception.filter';
import {
  MachineEntity,
  MachineStatusEnum,
} from '../src/machines/machine.entity';
import { UserEntity, UserRoleEnum } from '../src/users/user.entity';

jest.setTimeout(120_000);

describe('WARA MES real system (e2e)', () => {
  let app: INestApplication<App>;
  let testMachine: ChildProcessWithoutNullStreams | undefined;
  let testMachineOutput = '';
  let mqttClient: MqttClient;
  let accessToken = '';
  let firstMachine: MachineEntity;
  let backendPort: number;
  let opcUaPort: number;
  const adminUsername = process.env.E2E_ADMIN_USERNAME || 'e2e-admin';
  const adminPassword = process.env.E2E_ADMIN_PASSWORD || 'e2e-admin-password';
  const runId = `${process.pid}-${Date.now()}`;
  const carrierNumber = 128;

  beforeAll(async () => {
    backendPort = await findFreePort();
    opcUaPort = Number(process.env.OPC_UA_TEST_SERVER_PORT);
    if (!Number.isInteger(opcUaPort) || opcUaPort < 1) {
      throw new Error('OPC_UA_TEST_SERVER_PORT must be configured by the E2E runner');
    }
    app = await NestFactory.create<AppModule>(AppModule, {
      logger: ['error', 'warn'],
    });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new ApiExceptionFilter());
    app.useWebSocketAdapter(new WsAdapter(app));
    configureApiVersioning(app);
    await app.listen(backendPort, '127.0.0.1');

    const dataSource = app.get(DataSource);
    const machines = await seedDatabase(dataSource);
    firstMachine = machines[0];

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: adminUsername, password: adminPassword })
      .expect(201);
    accessToken = jsonBody<{ access_token: string }>(login).access_token;

    testMachine = spawn(
      process.execPath,
      [resolve(process.cwd(), 'test-machines/opcua-simulator/server.js')],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          OPC_UA_TEST_SERVER_PORT: String(opcUaPort),
          MES_API_URL: `http://127.0.0.1:${backendPort}/api/v1`,
          MES_API_USER: adminUsername,
          MES_API_PASS: adminPassword,
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    );
    testMachine.stdout.on('data', (chunk: Buffer) => {
      testMachineOutput += chunk.toString();
    });
    testMachine.stderr.on('data', (chunk: Buffer) => {
      testMachineOutput += chunk.toString();
    });
    await waitForTestMachine(testMachine, () => testMachineOutput);

    mqttClient = await connectMqtt(process.env.MQTT_BROKER_URL!);
    await waitForShopfloorReady();
    await waitForCarrierInventory();
  });

  afterAll(async () => {
    if (mqttClient) await closeMqtt(mqttClient);
    if (app) await app.close();
    if (testMachine && testMachine.exitCode === null) {
      testMachine.kill();
      await waitForExit(testMachine);
    }
  });

  it('uses the real database, authentication and dependency health checks', async () => {
    const databaseHealth = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200);
    expect(jsonBody(databaseHealth)).toMatchObject({
      status: 'ok',
      info: { database: { status: 'up' } },
    });

    await request(app.getHttpServer()).get('/api/v1/orders').expect(401);

    const shopfloorHealth = await authenticatedGet(
      '/api/v1/shopfloor/health',
    ).expect(200);
    const shopfloorBody = jsonBody<{
      ok: boolean;
      protocols: {
        opcua: { connected: boolean };
        mqtt: { connected: boolean };
      };
    }>(shopfloorHealth);
    expect(shopfloorBody.ok).toBe(true);
    expect(shopfloorBody.protocols.opcua.connected).toBe(true);
    expect(shopfloorBody.protocols.mqtt.connected).toBe(true);
  });

  it('discovers the physical RFID carrier inventory through the real adapter', async () => {
    const inventory = await authenticatedGet(
      '/api/v1/carriers/inventory',
    ).expect(200);
    expect(jsonBody(inventory)).toMatchObject({
      configured: true,
      valid: true,
      stale: false,
      availableCount: 4,
      reconciledAvailableCount: 4,
      countMismatch: false,
    });

    const carriers = await authenticatedGet('/api/v1/carriers').expect(200);
    expect(
      jsonBody<
        Array<{
          carrier_number: number;
          inventory_managed: boolean;
          physical_state: string;
          rfid_uid: string | null;
          rfid_read_valid: boolean | null;
        }>
      >(carriers).find((carrier) => carrier.carrier_number === carrierNumber),
    ).toMatchObject({
      inventory_managed: true,
      physical_state: 'stored',
      rfid_uid: 'DEMO-RFID-00000128',
      rfid_read_valid: true,
    });
  });

  it('persists the complete alarm lifecycle in PostgreSQL', async () => {
    const message = `E2E pressure warning ${runId}`;
    const created = await authenticatedPost('/api/v1/alarms')
      .send({
        severity: 'warning',
        machine_id: firstMachine.id,
        message,
        source: 'e2e',
      })
      .expect(201);

    const createdAlarm = jsonBody<{
      id: string;
      machine_id: string;
      severity: string;
      acknowledged: boolean;
    }>(created);
    const alarmId = createdAlarm.id;
    expect(createdAlarm).toMatchObject({
      machine_id: firstMachine.id,
      severity: 'warning',
      acknowledged: false,
    });

    const filtered = await authenticatedGet(
      `/api/v1/alarms?acknowledged=false&severity=warning&machine_id=${firstMachine.id}`,
    ).expect(200);
    expect(
      jsonBody<Array<{ id: string }>>(filtered).some(
        (alarm) => alarm.id === alarmId,
      ),
    ).toBe(true);

    const acknowledged = await authenticatedPost(
      `/api/v1/alarms/${alarmId}/acknowledge`,
    ).expect(200);
    expect(jsonBody<{ acknowledged: boolean }>(acknowledged).acknowledged).toBe(
      true,
    );

    const csv = await authenticatedGet(
      `/api/v1/alarms/export/csv?machine_id=${firstMachine.id}`,
    ).expect(200);
    expect(csv.text).toContain(message);

    await authenticatedDelete('/api/v1/alarms/bulk')
      .send([alarmId])
      .expect(200);
    await authenticatedGet(`/api/v1/alarms/${alarmId}`).expect(404);
  });

  it('reads, writes and controls the real OPC UA demo machine', async () => {
    const cycleTime = await authenticatedPost('/api/v1/shopfloor/opcua/read')
      .send({ nodeId: 'ns=1;s=Station1.LineInfo.uiCycleTimeMs' })
      .expect(201);
    expect(parseResponseValue(cycleTime.text)).toBe(5000);

    const parameterNode = 'ns=1;s=Station1.stMES.Query.iPar1';
    await authenticatedPost('/api/v1/shopfloor/opcua/write')
      .send({
        writes: [{ address: parameterNode, dataType: 'Int16', value: 42 }],
      })
      .expect(201);
    const writtenValue = await authenticatedPost('/api/v1/shopfloor/opcua/read')
      .send({ nodeId: parameterNode })
      .expect(201);
    expect(parseResponseValue(writtenValue.text)).toBe(42);

    const autoNode = 'ns=1;s=Station1.stMES.State.xAuto';
    await authenticatedPost('/api/v1/shopfloor/machine/control')
      .send({ resourceId: 1, command: 'pause' })
      .expect(201);
    await waitForOpcUaValue(autoNode, false);

    await authenticatedPost('/api/v1/shopfloor/machine/control')
      .send({ resourceId: 1, command: 'start' })
      .expect(201);
    await waitForOpcUaValue(autoNode, true);
  });

  it('exchanges real MQTT messages in both directions', async () => {
    const ingressTopic = 'mes/machines/e2e/telemetry';
    const ingressPayload = { runId, temperature: 21.5 };
    await publishMqtt(mqttClient, ingressTopic, ingressPayload);

    const receivedIngress = await poll(
      async () => {
        const response = await authenticatedGet(
          '/api/v1/shopfloor/mqtt/messages',
        );
        return jsonBody<
          Array<{
            topic: string;
            payload: Record<string, unknown>;
          }>
        >(response);
      },
      (messages) =>
        messages.some(
          (message) =>
            message.topic === ingressTopic && message.payload.runId === runId,
        ),
      'MQTT ingress message was not visible through the backend',
      10_000,
    );
    expect(
      receivedIngress.some(
        (message) =>
          message.topic === ingressTopic && message.payload.runId === runId,
      ),
    ).toBe(true);

    const egressTopic = `mes/e2e/${runId}`;
    await subscribeMqtt(mqttClient, egressTopic);
    const receivedEgress = waitForMqttMessage(mqttClient, egressTopic);
    await authenticatedPost('/api/v1/shopfloor/mqtt/publish')
      .send({ topic: egressTopic, payload: { runId, command: 'ping' } })
      .expect(201);
    await expect(receivedEgress).resolves.toEqual({ runId, command: 'ping' });

    await authenticatedPost('/api/v1/shopfloor/mqtt/publish')
      .send({ topic: 'forbidden/e2e', payload: { runId } })
      .expect(403);
  });

  it('runs a complete MQTT to PostgreSQL to OPC UA production order', async () => {
    const documentedOrderName = `#WEB-E2E-${runId}`;
    const webshopPayload = {
      order_name: documentedOrderName,
      params: {
        bDeckelfarbe: true,
        uiKugelRot: 1,
        uiKugelGruen: 2,
        uiKugelBlau: 4,
      },
    };
    await publishMqtt(
      mqttClient,
      process.env.WEBSHOP_MQTT_TOPIC!,
      webshopPayload,
    );

    const webshopOrders = await poll(
      async () => {
        const response = await authenticatedGet(
          '/api/v1/shopfloor/webshop/orders',
        );
        return jsonBody<
          Array<{
            orderName: string;
            payload: Record<string, unknown>;
          }>
        >(response);
      },
      (orders) => orders.length > 0,
      'Webshop MQTT message did not create a recent webshop order',
      15_000,
    );
    const orderName = webshopOrders[0].orderName;
    expect(orderName).toBe(documentedOrderName);
    expect(webshopOrders[0].payload).toMatchObject({
      orderName: documentedOrderName,
      parameters: {
        iPar1: 1,
        iPar2: 1,
        iPar3: 2,
        iPar4: 4,
      },
    });

    const order = await poll(
      async () => {
        const response = await authenticatedGet('/api/v1/orders');
        return jsonBody<
          Array<{
            id: string;
            name: string;
            status: string;
          }>
        >(response).find((entry) => entry.name === orderName);
      },
      (entry) => Boolean(entry),
      'MQTT webshop order was not persisted in PostgreSQL',
      15_000,
    );
    expect(order.status).toBe('in_progress');

    const route = await authenticatedGet(
      `/api/v1/orders/${order.id}/route`,
    ).expect(200);
    const routeBody = jsonBody<
      Array<{
        resource_id: number;
        parameters: Record<string, number>;
      }>
    >(route);
    expect(routeBody.map((step) => step.resource_id)).toEqual([1, 2, 3]);
    expect(routeBody[0].parameters).toMatchObject({
      iPar1: 1,
      iPar2: 1,
      iPar3: 2,
      iPar4: 4,
    });

    const assignedCarrier = await poll(
      async () => {
        const response = await authenticatedGet('/api/v1/carriers');
        return jsonBody<
          Array<{
            carrier_number: number;
            status: string;
            order_id: string | null;
            current_step_no: number | null;
            physical_state: string;
            inventory_stale: boolean;
          }>
        >(response).find((carrier) => carrier.order_id === order.id);
      },
      (carrier) => carrier?.status === 'assigned',
      'Webshop order did not receive an assigned machine carrier',
      15_000,
    );
    expect(assignedCarrier).toMatchObject({
      carrier_number: carrierNumber,
      current_step_no: 1,
      physical_state: 'stored',
      inventory_stale: false,
    });

    let completedOrder: {
      status: string;
      completed_quantity: number;
    };
    try {
      completedOrder = await poll(
        async () => {
          const response = await authenticatedGet(`/api/v1/orders/${order.id}`);
          return jsonBody<{
            status: string;
            completed_quantity: number;
          }>(response);
        },
        (entry) => entry.status === 'completed',
        'Production order did not complete',
        90_000,
      );
    } catch (error) {
      throw new Error(
        `${error instanceof Error ? error.message : String(error)}\n` +
          `Test machine output:\n${testMachineOutput}`,
      );
    }
    expect(completedOrder.completed_quantity).toBe(1);

    const carriers = await authenticatedGet('/api/v1/carriers').expect(200);
    expect(
      jsonBody<
        Array<{
          carrier_number: number;
          status: string;
          order_id: string | null;
          current_step_no: number;
        }>
      >(carriers).find((carrier) => carrier.carrier_number === carrierNumber),
    ).toMatchObject({
      status: 'available',
      order_id: null,
      current_step_no: null,
    });

    const handshakes = await authenticatedGet(
      '/api/v1/shopfloor/stmes/handshakes',
    ).expect(200);
    const handshakeBody =
      jsonBody<Array<{ resource_id: number; result_code: number }>>(handshakes);
    for (const resourceId of [1, 2, 3]) {
      expect(
        handshakeBody.some(
          (handshake) =>
            handshake.resource_id === resourceId && handshake.result_code === 0,
        ),
      ).toBe(true);
    }

    const productionLog = await authenticatedGet(
      `/api/v1/orders/${order.id}/production-log`,
    ).expect(200);
    const productionLogBody = jsonBody<{
      order_id: string;
      snapshot: { route: unknown[] };
    }>(productionLog);
    expect(productionLogBody.order_id).toBe(order.id);
    expect(productionLogBody.snapshot.route).toHaveLength(3);

    const csv = await authenticatedGet(
      `/api/v1/orders/${order.id}/production-log.csv`,
    ).expect(200);
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    expect(csv.text).toContain('WARA_MES_PRODUCTION_RUN,1.0,RUN_SUMMARY');
    expect(csv.text).toContain(String(carrierNumber));
  });

  function authenticatedGet(path: string) {
    return request(app.getHttpServer())
      .get(path)
      .set('Authorization', `Bearer ${accessToken}`);
  }

  function authenticatedPost(path: string) {
    return request(app.getHttpServer())
      .post(path)
      .set('Authorization', `Bearer ${accessToken}`);
  }

  function authenticatedDelete(path: string) {
    return request(app.getHttpServer())
      .delete(path)
      .set('Authorization', `Bearer ${accessToken}`);
  }

  async function waitForShopfloorReady(): Promise<void> {
    await poll(
      async () => {
        const response = await authenticatedGet('/api/v1/shopfloor/health');
        return jsonBody<{
          protocols?: {
            opcua?: { connected: boolean };
            mqtt?: { connected: boolean };
          };
        }>(response);
      },
      (health) =>
        health.protocols?.opcua?.connected === true &&
        health.protocols?.mqtt?.connected === true,
      `Shopfloor dependencies did not become ready.\nTest machine output:\n${testMachineOutput}`,
      20_000,
    );
  }

  async function waitForCarrierInventory(): Promise<void> {
    await poll(
      async () => {
        const response = await authenticatedGet('/api/v1/carriers/inventory');
        return jsonBody<{
          configured: boolean;
          valid: boolean;
          stale: boolean;
          availableCount: number;
        }>(response);
      },
      (inventory) =>
        inventory.configured &&
        inventory.valid &&
        !inventory.stale &&
        inventory.availableCount > 0,
      'Physical carrier inventory was not synchronized through OPC UA',
      20_000,
    );
  }

  async function waitForOpcUaValue(
    nodeId: string,
    expected: unknown,
  ): Promise<void> {
    await poll(
      async () => {
        const response = await authenticatedPost('/api/v1/shopfloor/opcua/read')
          .send({ nodeId })
          .expect(201);
        return parseResponseValue(response.text);
      },
      (value) => value === expected,
      `OPC UA node ${nodeId} did not become ${String(expected)}`,
      5_000,
    );
  }

  async function seedDatabase(
    dataSource: DataSource,
  ): Promise<MachineEntity[]> {
    const userRepository = dataSource.getRepository(UserEntity);
    await userRepository.save(
      userRepository.create({
        username: adminUsername,
        password: await bcrypt.hash(adminPassword, 10),
        role: UserRoleEnum.ADMIN,
      }),
    );

    const machineRepository = dataSource.getRepository(MachineEntity);
    const profileManagedMachines = await machineRepository.find({
      where: { profile_managed: true },
      order: { route_sequence: 'ASC' },
    });
    if (profileManagedMachines.length === 0) {
      throw new Error('Machine profile synchronization did not create stations');
    }
    const machines = await machineRepository.save(
      profileManagedMachines.map((machine) => ({
        ...machine,
        status: MachineStatusEnum.ONLINE,
        telemetry: {},
      })),
    );

    return machines;
  }
});

async function findFreePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Could not allocate a free TCP port'));
        return;
      }
      server.close((error) =>
        error ? reject(error) : resolvePort(address.port),
      );
    });
  });
}

async function waitForTestMachine(
  child: ChildProcessWithoutNullStreams,
  output: () => string,
): Promise<void> {
  await poll(
    () => Promise.resolve({ exitCode: child.exitCode, output: output() }),
    (state) =>
      state.output.includes('WARA MES OPC UA demo production line:') ||
      state.exitCode !== null,
    'OPC UA demo machine did not start',
    20_000,
  );
  if (child.exitCode !== null) {
    throw new Error(
      `OPC UA demo machine exited with code ${child.exitCode}\n${output()}`,
    );
  }
}

async function connectMqtt(brokerUrl: string): Promise<MqttClient> {
  const client = connect(brokerUrl, {
    clientId: `wara-mes-e2e-${process.pid}-${Date.now()}`,
    clean: true,
    reconnectPeriod: 0,
  });
  await new Promise<void>((resolveConnection, reject) => {
    client.once('connect', resolveConnection);
    client.once('error', reject);
  });
  return client;
}

async function closeMqtt(client: MqttClient): Promise<void> {
  await new Promise<void>((resolveClose) =>
    client.end(false, {}, resolveClose),
  );
}

async function subscribeMqtt(client: MqttClient, topic: string): Promise<void> {
  await new Promise<void>((resolveSubscription, reject) => {
    client.subscribe(topic, { qos: 1 }, (error: Error | null) =>
      error ? reject(error) : resolveSubscription(),
    );
  });
}

async function publishMqtt(
  client: MqttClient,
  topic: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await new Promise<void>((resolvePublish, reject) => {
    client.publish(
      topic,
      JSON.stringify(payload),
      { qos: 1, retain: false },
      (error: Error | null) => (error ? reject(error) : resolvePublish()),
    );
  });
}

async function waitForMqttMessage(
  client: MqttClient,
  topic: string,
): Promise<Record<string, unknown>> {
  return new Promise((resolveMessage, reject) => {
    const timeout = setTimeout(() => {
      client.off('message', onMessage);
      reject(new Error(`MQTT message on ${topic} was not received`));
    }, 10_000);
    const onMessage = (receivedTopic: string, payload: Buffer) => {
      if (receivedTopic !== topic) return;
      clearTimeout(timeout);
      client.off('message', onMessage);
      resolveMessage(JSON.parse(payload.toString()) as Record<string, unknown>);
    };
    client.on('message', onMessage);
  });
}

async function poll<T>(
  read: () => Promise<T>,
  accept: (value: T) => boolean,
  failureMessage: string,
  timeoutMs: number,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let lastValue: T | undefined;
  while (Date.now() < deadline) {
    lastValue = await read();
    if (accept(lastValue)) return lastValue;
    await delay(200);
  }
  throw new Error(
    `${failureMessage}\nLast value: ${JSON.stringify(lastValue, null, 2)}`,
  );
}

async function waitForExit(
  child: ChildProcessWithoutNullStreams,
): Promise<void> {
  if (child.exitCode !== null) return;
  await new Promise<void>((resolveExit) => {
    const timeout = setTimeout(resolveExit, 5_000);
    child.once('exit', () => {
      clearTimeout(timeout);
      resolveExit();
    });
  });
}

function parseResponseValue(text: string): unknown {
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function jsonBody<T = Record<string, unknown>>(response: { text: string }): T {
  return JSON.parse(response.text) as T;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}
