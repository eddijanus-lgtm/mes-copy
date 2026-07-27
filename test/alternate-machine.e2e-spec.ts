import {
  ChildProcessWithoutNullStreams,
  spawn,
  spawnSync,
} from 'node:child_process';
import { createServer } from 'node:net';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WsAdapter } from '@nestjs/platform-ws';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';

import { configureApiVersioning } from '../src/api-versioning';
import { AppModule } from '../src/app.module';
import { ApiExceptionFilter } from '../src/common/api-exception.filter';
import { DataPointEntity } from '../src/data-collection/data-point.entity';
import {
  MachineEntity,
  MachineStatusEnum,
} from '../src/machines/machine.entity';
import { UserEntity, UserRoleEnum } from '../src/users/user.entity';

jest.setTimeout(120_000);

describe('MES commissioning with a different OPC UA machine (e2e)', () => {
  let app: INestApplication<App>;
  let backendPort: number;
  let opcUaPort: number;
  let accessToken = '';
  let machine: MachineEntity;
  let externalMachine: ChildProcessWithoutNullStreams | undefined;
  let externalMachineOutput = '';
  const temporaryReports = mkdtempSync(
    resolve(tmpdir(), 'wara-mes-alternate-machine-'),
  );
  const adminUsername = 'alternate-machine-admin';
  const adminPassword = 'alternate-machine-password';

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
    const userRepository = dataSource.getRepository(UserEntity);
    await userRepository.save(
      userRepository.create({
        username: adminUsername,
        password: await bcrypt.hash(adminPassword, 10),
        role: UserRoleEnum.ADMIN,
      }),
    );
    const machineRepository = dataSource.getRepository(MachineEntity);
    machine = await machineRepository.findOneOrFail({
      where: { resource_id: 71, profile_managed: true },
    });

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: adminUsername, password: adminPassword })
      .expect(201);
    accessToken = jsonBody<{ access_token: string }>(login).access_token;
  });

  afterAll(async () => {
    await stopExternalMachine();
    if (app) await app.close();
    rmSync(temporaryReports, { recursive: true, force: true });
  });

  it('starts safely offline while the commissioned machine is unavailable', async () => {
    const status = await authenticatedGet(
      '/api/v1/shopfloor/opcua/status',
    ).expect(200);
    expect(jsonBody(status)).toMatchObject({
      connected: false,
      machineId: 'nova-nx9000',
      displayName: 'NovaPress NX-9000',
      operatingMode: 'observe',
    });

    const storedMachine = await app
      .get(DataSource)
      .getRepository(MachineEntity)
      .findOneByOrFail({ id: machine.id });
    expect(storedMachine.status).toBe(MachineStatusEnum.OFFLINE);
    expect(storedMachine.last_heartbeat).toBeNull();
  });

  it('passes the same read-only scan and profile check used for a real machine', async () => {
    await startExternalMachine();

    const profilePath = process.env.MACHINE_PROFILE_PATH!;
    const endpoint = `opc.tcp://127.0.0.1:${opcUaPort}/UA/NovaPress`;
    const scanPath = resolve(temporaryReports, 'scan.json');
    const scan = spawnSync(
      process.execPath,
      [
        resolve(process.cwd(), 'tools/opcua-commissioning.js'),
        'scan',
        '--endpoint',
        endpoint,
        '--output',
        scanPath,
      ],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          OPCUA_SCAN_MAX_DEPTH: '4',
          OPCUA_SCAN_MAX_NODES: '500',
        },
        encoding: 'utf8',
      },
    );
    expect(scan.status).toBe(0);
    const scanReport = JSON.parse(readFileSync(scanPath, 'utf8')) as {
      readOnly: boolean;
      namespaceArray: string[];
      nodes: Array<{ browseName: string; displayName: string }>;
    };
    expect(scanReport.readOnly).toBe(true);
    expect(scanReport.namespaceArray).toContain(
      'urn:nova-automation:machines:nx9000:v2',
    );
    expect(
      scanReport.nodes.some((node) => node.displayName === 'AcceptedParts'),
    ).toBe(true);

    const checkPath = resolve(temporaryReports, 'profile-check.json');
    const check = spawnSync(
      process.execPath,
      [
        resolve(process.cwd(), 'tools/opcua-commissioning.js'),
        'check',
        profilePath,
        '--output',
        checkPath,
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );
    expect(check.status).toBe(0);
    const checkReport = JSON.parse(readFileSync(checkPath, 'utf8')) as {
      readOnly: boolean;
      operatingMode: string;
      summary: {
        total: number;
        ok: number;
        mismatch: number;
        error: number;
      };
    };
    expect(checkReport).toMatchObject({
      readOnly: true,
      operatingMode: 'observe',
      summary: { total: 6, ok: 6, mismatch: 0, error: 0 },
    });
  });

  it('reconnects without a restart and persists vendor telemetry through the adapter', async () => {
    await poll(
      async () => {
        const response = await authenticatedGet(
          '/api/v1/shopfloor/opcua/status',
        );
        return jsonBody<{ connected: boolean }>(response);
      },
      (status) => status.connected,
      'MES did not connect to the NovaPress',
      20_000,
    );

    const storedMachine = await poll(
      () =>
        app
          .get(DataSource)
          .getRepository(MachineEntity)
          .findOneByOrFail({ id: machine.id }),
      (entry) =>
        entry.status === MachineStatusEnum.ONLINE &&
        Number(entry.telemetry?.acceptedParts) >= 40 &&
        Number(entry.telemetry?.hydraulicPressure) > 100,
      'Vendor telemetry did not reach the machine record',
      10_000,
    );
    expect(storedMachine).toMatchObject({
      status: MachineStatusEnum.ONLINE,
      telemetry: {
        machineRunning: true,
        faultActive: false,
        idealCycleTime: 250,
      },
    });
    expect(storedMachine.last_heartbeat).toBeInstanceOf(Date);

    const metricPoints = await poll(
      () =>
        app
          .get(DataSource)
          .getRepository(DataPointEntity)
          .find({ where: { machine_id: machine.id } }),
      (points) =>
        new Set(points.map((point) => point.node_id)).size === 3 &&
        points.filter((point) => point.node_id === 'production.goodCount')
          .length >= 2,
      'Production counters were not persisted through the adapter',
      10_000,
    );
    expect(new Set(metricPoints.map((point) => point.node_id))).toEqual(
      new Set([
        'production.idealCycleTimeMs',
        'production.goodCount',
        'production.rejectCount',
      ]),
    );
  });

  it('keeps commissioning read-only and derives OEE from the foreign counters', async () => {
    await authenticatedPost('/api/v1/shopfloor/opcua/write')
      .send({
        writes: [
          {
            address: 'ns=2;s=NX9000.Status.Run',
            dataType: 'Boolean',
            value: false,
          },
        ],
      })
      .expect(403);

    const kpis = await poll(
      async () => {
        const response = await authenticatedGet('/api/v1/dashboard/kpis');
        return jsonBody<{
          oee: {
            available: boolean;
            performance: number | null;
            quality: number | null;
            total: number | null;
            productionCounts: { good: number; reject: number };
          };
        }>(response);
      },
      (result) =>
        result.oee.available &&
        result.oee.productionCounts.good > 0 &&
        result.oee.productionCounts.reject > 0,
      'OEE did not become available from the NovaPress counters',
      15_000,
    );
    expect(kpis.oee.available).toBe(true);
    expect(kpis.oee.performance).not.toBeNull();
    expect(kpis.oee.quality).toBeGreaterThan(0);
    expect(kpis.oee.quality).toBeLessThan(100);
    expect(kpis.oee.total).not.toBeNull();
  });

  it('detects a cable loss, marks the machine offline and reconnects automatically', async () => {
    await stopExternalMachine();
    await poll(
      async () => {
        const response = await authenticatedGet(
          '/api/v1/shopfloor/opcua/status',
        );
        return jsonBody<{ connected: boolean }>(response);
      },
      (status) => !status.connected,
      'MES did not detect the disconnected machine',
      15_000,
    );
    await poll(
      () =>
        app
          .get(DataSource)
          .getRepository(MachineEntity)
          .findOneByOrFail({ id: machine.id }),
      (entry) => entry.status === MachineStatusEnum.OFFLINE,
      'Disconnected machine was not marked offline',
      10_000,
    );

    await startExternalMachine();
    await poll(
      async () => {
        const response = await authenticatedGet(
          '/api/v1/shopfloor/opcua/status',
        );
        return jsonBody<{ connected: boolean }>(response);
      },
      (status) => status.connected,
      'MES did not reconnect after the machine returned',
      20_000,
    );
    const onlineAgain = await poll(
      () =>
        app
          .get(DataSource)
          .getRepository(MachineEntity)
          .findOneByOrFail({ id: machine.id }),
      (entry) => entry.status === MachineStatusEnum.ONLINE,
      'Reconnected machine did not become online',
      10_000,
    );
    expect(onlineAgain.last_heartbeat).toBeInstanceOf(Date);
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

  async function startExternalMachine(): Promise<void> {
    externalMachineOutput = '';
    externalMachine = spawn(
      process.execPath,
      [
        resolve(
          process.cwd(),
          'test-machines/alternate-opcua-machine/server.js',
        ),
      ],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          OPC_UA_TEST_SERVER_PORT: String(opcUaPort),
          ALTERNATE_MACHINE_CYCLE_MS: '250',
          ALTERNATE_MACHINE_REJECT_EVERY: '4',
          ALTERNATE_MACHINE_AUTONOMOUS_TELEMETRY: 'true',
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
        state.output.includes('NovaPress NX-9000 OPC UA machine:') ||
        state.exitCode !== null,
      'Alternate OPC UA machine did not start',
      15_000,
    );
    if (externalMachine.exitCode !== null) {
      throw new Error(
        `Alternate machine exited early:\n${externalMachineOutput}`,
      );
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

function jsonBody<T>(response: request.Response): T {
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
