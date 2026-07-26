import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { HealthCheckService, TypeOrmHealthIndicator } from '@nestjs/terminus';
import request from 'supertest';
import { App } from 'supertest/types';
import { HealthController } from '../src/health/health.controller';
import { configureApiVersioning } from '../src/api-versioning';

describe('HealthController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: HealthCheckService,
          useValue: { check: jest.fn(async () => ({ status: 'ok', info: { database: { status: 'up' } } })) },
        },
        {
          provide: TypeOrmHealthIndicator,
          useValue: { pingCheck: jest.fn(async () => ({ database: { status: 'up' } })) },
        },
      ],
    })
      .compile();

    app = moduleFixture.createNestApplication();
    configureApiVersioning(app);
    await app.init();
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  it('/api/v1/health/combined (GET) returns operational metadata', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health/combined').expect(200);

    expect(response.body).toHaveProperty('timestamp');
    expect(response.body).toHaveProperty('database');
    expect(response.body).toHaveProperty('shopfloor');
    expect(response.body.node_version).toBe(process.version);
  });
});
