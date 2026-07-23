import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { OrdersController } from '../src/orders/orders.controller';
import { OrdersService } from '../src/orders/orders.service';
import { RoutingService } from '../src/orders/routing.service';

describe('Orders production flow (e2e)', () => {
  let app: INestApplication<App>;
  const orderId = '11111111-1111-4111-8111-111111111111';
  const machineId = '22222222-2222-4222-8222-222222222222';
  const order = { id: orderId, name: 'E2E Order', machine_id: machineId, priority: 1, operation: 'assemble', quantity: 2, completed_quantity: 0, status: 'pending' };
  const ordersService = {
    create: jest.fn(async () => order),
    findAll: jest.fn(async () => [order]),
    findOne: jest.fn(async () => order),
    update: jest.fn(async (_id, dto) => ({ ...order, ...dto })),
    remove: jest.fn(async () => undefined),
    updateProgress: jest.fn(async (_id, completedQty) => ({ ...order, completed_quantity: completedQty, status: completedQty >= order.quantity ? 'completed' : 'in_progress' })),
    getPendingByLine: jest.fn(async () => [order]),
    getActiveOrders: jest.fn(async () => [{ ...order, status: 'in_progress' }]),
  };
  const routingService = {
    releaseDemoProductionOrder: jest.fn(async () => ({ order: { ...order, status: 'in_progress' }, route: [{ step_no: 1, resource_id: 1 }], carriers: [{ carrier_number: 128 }] })),
    getRoute: jest.fn(async () => [{ step_no: 1, resource_id: 1 }, { step_no: 2, resource_id: 2 }, { step_no: 3, resource_id: 3 }]),
    replaceRoute: jest.fn(async () => [{ step_no: 1, resource_id: 1 }]),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [OrdersController],
      providers: [
        { provide: OrdersService, useValue: ordersService },
        { provide: RoutingService, useValue: routingService },
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

  it('creates a demo production order and releases routing/carriers', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/orders/demo-production')
      .send({ name: 'E2E Order', machine_id: machineId, priority: 1, operation: 'assemble', quantity: 2 })
      .expect(201);

    expect(response.body.order.status).toBe('in_progress');
    expect(response.body.route).toHaveLength(1);
    expect(response.body.carriers[0].carrier_number).toBe(128);
  });

  it('returns route steps and completes order progress', async () => {
    await request(app.getHttpServer()).get(`/api/orders/${orderId}/route`).expect(200).expect(({ body }) => expect(body).toHaveLength(3));

    await request(app.getHttpServer())
      .patch(`/api/orders/${orderId}/progress/2`)
      .expect(200)
      .expect(({ body }) => expect(body).toMatchObject({ completed_quantity: 2, status: 'completed' }));
  });
});
