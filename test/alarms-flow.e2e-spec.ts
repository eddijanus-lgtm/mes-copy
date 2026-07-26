import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { configureApiVersioning } from '../src/api-versioning';
import request from 'supertest';
import { App } from 'supertest/types';
import { AlarmsController } from '../src/alarms/alarms.controller';
import { AlarmsService } from '../src/alarms/alarms.service';

describe('Alarms lifecycle (e2e)', () => {
  let app: INestApplication<App>;
  const alarmId = '33333333-3333-4333-8333-333333333333';
  const machineId = '44444444-4444-4444-8444-444444444444';
  const alarm = { id: alarmId, machine_id: machineId, severity: 'warning', message: 'Pressure high', acknowledged: false };
  const alarmsService = {
    create: jest.fn(async () => alarm),
    findAll: jest.fn(async () => [alarm]),
    setActiveCount: jest.fn(async () => 1),
    findOne: jest.fn(async () => alarm),
    update: jest.fn(async (_id, dto) => ({ ...alarm, ...dto })),
    acknowledge: jest.fn(async () => ({ ...alarm, acknowledged: true, acknowledged_at: new Date().toISOString() })),
    remove: jest.fn(async () => undefined),
    bulkAcknowledge: jest.fn(async () => ({ acknowledged: 1, skipped: 0 })),
    bulkRemove: jest.fn(async () => ({ removed: 1, notFound: 0 })),
    exportCsv: jest.fn(async () => 'ID,Severity,Machine ID,Message\n33333333-3333-4333-8333-333333333333,warning,44444444-4444-4444-8444-444444444444,Pressure high'),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AlarmsController],
      providers: [{ provide: AlarmsService, useValue: alarmsService }],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApiVersioning(app);
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('creates, filters and acknowledges an alarm', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/alarms')
      .send({ severity: 'warning', machine_id: machineId, message: 'Pressure high' })
      .expect(201)
      .expect(({ body }) => expect(body).toMatchObject({ id: alarmId, acknowledged: false }));

    await request(app.getHttpServer()).get('/api/v1/alarms?acknowledged=false&severity=warning').expect(200).expect(({ body }) => expect(body).toHaveLength(1));
    await request(app.getHttpServer()).post(`/api/v1/alarms/${alarmId}/acknowledge`).expect(200).expect(({ body }) => expect(body.acknowledged).toBe(true));
  });

  it('exports CSV and executes bulk lifecycle endpoints', async () => {
    await request(app.getHttpServer()).get('/api/v1/alarms/export/csv').expect(200).expect(({ text }) => expect(text).toContain('Pressure high'));
    await request(app.getHttpServer()).post('/api/v1/alarms/bulk/acknowledge').send([alarmId]).expect(200).expect(({ body }) => expect(body.acknowledged).toBe(1));
    await request(app.getHttpServer()).delete('/api/v1/alarms/bulk').send([alarmId]).expect(200).expect(({ body }) => expect(body.removed).toBe(1));
  });
});
