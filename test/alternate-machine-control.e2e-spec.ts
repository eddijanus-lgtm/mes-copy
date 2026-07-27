import { ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WsAdapter } from '@nestjs/platform-ws';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';

import { configureApiVersioning } from '../src/api-versioning';
import { AppModule } from '../src/app.module';
import {
  CarrierEntity,
  CarrierStatusEnum,
} from '../src/carriers/carrier.entity';
import { ApiExceptionFilter } from '../src/common/api-exception.filter';
import {
  MachineEntity,
  MachineStatusEnum,
} from '../src/machines/machine.entity';
import { OrderEntity } from '../src/orders/order.entity';
import {
  StMesHandshakeEntity,
  StMesHandshakeStatusEnum,
} from '../src/opcua/stmes-handshake.entity';
import { UserEntity, UserRoleEnum } from '../src/users/user.entity';

jest.setTimeout(120_000);

describe('MES production control with the NovaPress machine (e2e)', () => {
  let app: INestApplication<App>;
  let backendPort: number;
  let opcUaPort: number;
  let accessToken = '';
  let machines: MachineEntity[];
  let rootMachine: MachineEntity;
  let infeed: MachineEntity;
  let press: MachineEntity;
  let quality: MachineEntity;
  let externalMachine: ChildProcessWithoutNullStreams | undefined;
  let externalMachineOutput = '';
  const adminUsername = 'nova-control-admin';
  const adminPassword = 'nova-control-password';

  beforeAll(async () => {
    backendPort = await findFreePort();
    opcUaPort = Number(process.env.OPC_UA_TEST_SERVER_PORT);
    if (!Number.isInteger(opcUaPort) || opcUaPort < 1) {
      throw new Error('OPC_UA_TEST_SERVER_PORT is missing');
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
    await dataSource.getRepository(UserEntity).save(
      dataSource.getRepository(UserEntity).create({
        username: adminUsername,
        password: await bcrypt.hash(adminPassword, 10),
        role: UserRoleEnum.ADMIN,
      }),
    );
    machines = await dataSource.getRepository(MachineEntity).find({
      where: { profile_managed: true },
      order: { resource_id: 'ASC' },
    });
    [rootMachine, infeed, press, quality] = [70, 71, 72, 73].map(
      (resourceId) => {
        const machine = machines.find(
          (candidate) => candidate.resource_id === resourceId,
        );
        if (!machine) throw new Error(`Missing resource ${resourceId}`);
        return machine;
      },
    );

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: adminUsername, password: adminPassword })
      .expect(201);
    accessToken = body<{ access_token: string }>(login).access_token;
  });

  afterAll(async () => {
    await stopExternalMachine();
    if (app) await app.close();
  });

  it('loads the control profile safely while the machine is offline', async () => {
    const status = await authenticatedGet(
      '/api/v1/shopfloor/opcua/status',
    ).expect(200);
    expect(body(status)).toMatchObject({
      connected: false,
      machineId: 'nova-nx9000',
      displayName: 'NovaPress NX-9000',
      operatingMode: 'control',
    });
    expect(machines).toHaveLength(4);
    expect(machines).toEqual([
      expect.objectContaining({
        resource_id: 70,
        status: MachineStatusEnum.OFFLINE,
        routing_enabled: false,
        parent_resource_id: null,
        equipment_level: 'machine',
      }),
      expect.objectContaining({
        resource_id: 71,
        status: MachineStatusEnum.OFFLINE,
        routing_enabled: true,
        route_sequence: 1,
        operation_no: 710,
        parent_resource_id: 70,
        equipment_level: 'work_unit',
      }),
      expect.objectContaining({
        resource_id: 72,
        status: MachineStatusEnum.OFFLINE,
        routing_enabled: true,
        route_sequence: 2,
        operation_no: 720,
      }),
      expect.objectContaining({
        resource_id: 73,
        status: MachineStatusEnum.OFFLINE,
        routing_enabled: true,
        route_sequence: 3,
        operation_no: 730,
      }),
    ]);
  });

  it('connects and executes all four profile-enabled UI control commands', async () => {
    await startExternalMachine();
    await waitForConnection(true);

    for (const command of ['stop', 'start', 'pause', 'reset'] as const) {
      await authenticatedPost('/api/v1/shopfloor/machine/control')
        .send({ resourceId: 70, command })
        .expect(201);
    }

    await poll(
      () =>
        app
          .get(DataSource)
          .getRepository(MachineEntity)
          .findOneByOrFail({ id: rootMachine.id }),
      (entry) =>
        entry.status === MachineStatusEnum.ONLINE &&
        entry.telemetry?.machineRunning === true &&
        entry.telemetry?.faultActive === false,
      'Control state did not return to running after reset',
      10_000,
    );
  });

  it('runs a real pending-to-completed order and carrier lifecycle through OPC UA', async () => {
    const carrierResponse = await authenticatedPost('/api/v1/carriers')
      .send({ carrier_number: 9001 })
      .expect(201);
    const carrier = body<CarrierEntity>(carrierResponse);

    const orderResponse = await authenticatedPost('/api/v1/orders')
      .send({
        name: 'NOVA-CONTROL-E2E',
        priority: 1,
        machine_id: infeed.id,
        operation: 'NovaPress Produktionsablauf',
        quantity: 1,
        production_parameters: {
          pressForceKn: 88,
          dwellTimeMs: 300,
        },
      })
      .expect(201);
    const created = body<{
      id: string;
      status: string;
      carriers: CarrierEntity[];
      route: Array<{ resource_id: number; operation_no: number }>;
    }>(orderResponse);
    expect(created).toMatchObject({
      status: 'pending',
      carriers: [
        {
          carrier_number: 9001,
          status: CarrierStatusEnum.ASSIGNED,
        },
      ],
      route: [
        { resource_id: 71, operation_no: 710 },
        { resource_id: 72, operation_no: 720 },
        { resource_id: 73, operation_no: 730 },
      ],
    });

    const completedOrder = await poll(
      () =>
        app
          .get(DataSource)
          .getRepository(OrderEntity)
          .findOneByOrFail({ id: created.id }),
      (order) =>
        order.status === 'completed' &&
        order.completed_quantity === 1 &&
        order.start_time instanceof Date &&
        order.end_time instanceof Date,
      'NovaPress did not complete the MES order',
      20_000,
    );
    expect(completedOrder.start_time!.getTime()).toBeLessThanOrEqual(
      completedOrder.end_time!.getTime(),
    );

    const releasedCarrier = await app
      .get(DataSource)
      .getRepository(CarrierEntity)
      .findOneByOrFail({ id: carrier.id });
    expect(releasedCarrier).toMatchObject({
      status: CarrierStatusEnum.AVAILABLE,
      order_id: null,
      current_step_no: null,
      current_resource_id: null,
    });

    const handshakes = await app
      .get(DataSource)
      .getRepository(StMesHandshakeEntity)
      .find({
        where: { carrier_number: 9001, order_id: created.id },
        order: { resource_id: 'ASC' },
      });
    expect(handshakes).toHaveLength(3);
    expect(handshakes).toEqual([
      expect.objectContaining({
        resource_id: 71,
        status: StMesHandshakeStatusEnum.ACKNOWLEDGED,
        result_code: 100,
        response_payload: expect.objectContaining({
          operationNo: 710,
          stepNo: 1,
          nextResourceId: 72,
        }),
      }),
      expect.objectContaining({
        resource_id: 72,
        status: StMesHandshakeStatusEnum.ACKNOWLEDGED,
        result_code: 100,
        response_payload: expect.objectContaining({
          operationNo: 720,
          stepNo: 2,
          nextResourceId: 73,
          parameters: {
            pressForceKn: 88,
            dwellTimeMs: 300,
          },
        }),
      }),
      expect.objectContaining({
        resource_id: 73,
        status: StMesHandshakeStatusEnum.ACKNOWLEDGED,
        result_code: 100,
        response_payload: expect.objectContaining({
          operationNo: 730,
          stepNo: 3,
          nextResourceId: 0,
        }),
      }),
    ]);
    for (const handshake of handshakes) {
      expect(handshake).toMatchObject({
        order_id: created.id,
        response_payload: {
          accepted: true,
          orderNo: 'NOVA-CONTROL-E2E',
        },
      });
      expect(
        Math.abs(
          handshake.created_at.getTime() - completedOrder.start_time!.getTime(),
        ),
      ).toBeLessThan(15_000);
    }

    const executionResponse = await authenticatedGet(
      `/api/v1/orders/${created.id}/execution-steps`,
    ).expect(200);
    expect(
      body<{
        order_id: string;
        items: Array<{
          resource_id: number;
          operation_no: number;
          step_no: number;
          state: string;
          source: string;
        }>;
      }>(executionResponse),
    ).toEqual({
      order_id: created.id,
      items: [
        expect.objectContaining({
          resource_id: 71,
          operation_no: 710,
          step_no: 1,
          state: 'completed',
          source: 'machine',
        }),
        expect.objectContaining({
          resource_id: 72,
          operation_no: 720,
          step_no: 2,
          state: 'completed',
          source: 'machine',
        }),
        expect.objectContaining({
          resource_id: 73,
          operation_no: 730,
          step_no: 3,
          state: 'completed',
          source: 'machine',
        }),
      ],
    });
  });

  it('marks a cable loss offline and reconnects without restarting the MES', async () => {
    await stopExternalMachine();
    await waitForConnection(false);
    await waitForAllMachineStates(MachineStatusEnum.OFFLINE);

    await startExternalMachine();
    await waitForConnection(true);
    await waitForAllMachineStates(MachineStatusEnum.ONLINE);
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

  async function waitForConnection(expected: boolean) {
    await poll(
      async () => {
        const response = await authenticatedGet(
          '/api/v1/shopfloor/opcua/status',
        );
        return body<{ connected: boolean }>(response).connected;
      },
      (connected) => connected === expected,
      `Expected OPC UA connected=${expected}`,
      expected ? 20_000 : 15_000,
    );
  }

  async function waitForAllMachineStates(expected: MachineStatusEnum) {
    await poll(
      () =>
        app
          .get(DataSource)
          .getRepository(MachineEntity)
          .find({
            where: { profile_managed: true },
            order: { resource_id: 'ASC' },
          }),
      (entries) =>
        entries.length === 4 &&
        entries.every((entry) => entry.status === expected),
      `NovaPress work units did not reach state ${expected}`,
      10_000,
    );
  }

  async function startExternalMachine(): Promise<void> {
    externalMachineOutput = '';
    externalMachine = spawn(
      process.execPath,
      [
        resolve(
          process.cwd(),
          'test-machines/alternate-opcua-machine/server-multistation.js',
        ),
      ],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          OPC_UA_TEST_SERVER_PORT: String(opcUaPort),
          ALTERNATE_MACHINE_CYCLE_MS: '400',
          ALTERNATE_MACHINE_REJECT_EVERY: '100',
          ALTERNATE_MACHINE_AUTONOMOUS_TELEMETRY: 'false',
          ALTERNATE_MACHINE_CARRIER_REFRESH_MS: '250',
          MES_API_URL: `http://127.0.0.1:${backendPort}/api/v1`,
          MES_API_USER: adminUsername,
          MES_API_PASS: adminPassword,
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    );
    externalMachine.stdout.on('data', (chunk: Buffer) => {
      externalMachineOutput += chunk.toString();
    });
    externalMachine.stderr.on('data', (chunk: Buffer) => {
      externalMachineOutput += chunk.toString();
    });
    await poll(
      () =>
        Promise.resolve({
          output: externalMachineOutput,
          exitCode: externalMachine?.exitCode,
        }),
      (state) =>
        state.output.includes(
          'NovaPress NX-9000 multi-station OPC UA machine:',
        ) || state.exitCode !== null,
      'NovaPress control simulator did not start',
      15_000,
    );
    if (externalMachine.exitCode !== null) {
      throw new Error(`NovaPress exited early:\n${externalMachineOutput}`);
    }
  }

  async function stopExternalMachine(): Promise<void> {
    if (!externalMachine || externalMachine.exitCode !== null) return;
    const child = externalMachine;
    child.kill();
    await waitForExit(child);
    externalMachine = undefined;
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
        reject(new Error('Could not allocate a free port'));
        return;
      }
      server.close((error) =>
        error ? reject(error) : resolvePort(address.port),
      );
    });
  });
}

async function poll<T>(
  producer: () => Promise<T>,
  predicate: (value: T) => boolean,
  message: string,
  timeoutMs: number,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let latest: T;
  do {
    latest = await producer();
    if (predicate(latest)) return latest;
    await new Promise((resolveWait) => setTimeout(resolveWait, 200));
  } while (Date.now() < deadline);
  throw new Error(`${message}. Last value: ${JSON.stringify(latest!)}`);
}

function body<T>(response: request.Response): T {
  return response.body as T;
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
