import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { CarrierEntity } from '../carriers/carrier.entity';
import { OrderRouteStepEntity } from './order-route-step.entity';
import { OrderEntity } from './order.entity';
import { OrdersService } from './orders.service';

describe('OrdersService', () => {
  let service: OrdersService;
  const ordersRepo = {
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => ({ id: value.id || 'order-1', ...value })),
    find: jest.fn(),
    findOne: jest.fn(),
    delete: jest.fn(),
  };
  const carriersRepo = { count: jest.fn() };
  const routeStepsRepo = { delete: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: getRepositoryToken(OrderEntity), useValue: ordersRepo },
        { provide: getRepositoryToken(CarrierEntity), useValue: carriersRepo },
        { provide: getRepositoryToken(OrderRouteStepEntity), useValue: routeStepsRepo },
      ],
    }).compile();

    service = module.get(OrdersService);
  });

  it('creates an order', async () => {
    const dto: any = { name: 'Order 1', priority: 2, machine_id: 'm1', operation: 'assemble', quantity: 5 };

    await expect(service.create(dto)).resolves.toMatchObject(dto);
    expect(ordersRepo.create).toHaveBeenCalledWith(expect.objectContaining(dto));
  });

  it('returns all orders sorted by creation date', async () => {
    ordersRepo.find.mockResolvedValue([{ id: 'o1' }]);

    await expect(service.findAll()).resolves.toEqual([{ id: 'o1' }]);
    expect(ordersRepo.find).toHaveBeenCalledWith({ order: { created_at: 'DESC' } });
  });

  it('throws when an order is missing', async () => {
    ordersRepo.findOne.mockResolvedValue(null);

    await expect(service.findOne('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects invalid quantity updates', async () => {
    ordersRepo.findOne.mockResolvedValue({ id: 'o1', quantity: 10, completed_quantity: 8 });

    await expect(service.update('o1', { quantity: 7 } as any)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.update('o1', { completed_quantity: 11 } as any)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('marks completed orders with an end time', async () => {
    ordersRepo.findOne.mockResolvedValue({ id: 'o1', quantity: 10, completed_quantity: 2 });

    const result = await service.update('o1', { status: 'completed' } as any);

    expect(result.status).toBe('completed');
    expect(result.end_time).toBeInstanceOf(Date);
  });

  it('prevents deleting orders with assigned carriers', async () => {
    carriersRepo.count.mockResolvedValue(1);

    await expect(service.remove('o1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('deletes route steps before deleting the order', async () => {
    carriersRepo.count.mockResolvedValue(0);
    ordersRepo.delete.mockResolvedValue({ affected: 1 });

    await expect(service.remove('o1')).resolves.toBeUndefined();
    expect(routeStepsRepo.delete).toHaveBeenCalledWith({ order_id: 'o1' });
    expect(ordersRepo.delete).toHaveBeenCalledWith('o1');
  });

  it('updates progress and completes an order at target quantity', async () => {
    ordersRepo.findOne.mockResolvedValue({ id: 'o1', quantity: 10, completed_quantity: 2, status: 'in_progress' });

    const result = await service.updateProgress('o1', 99);

    expect(result.completed_quantity).toBe(10);
    expect(result.status).toBe('completed');
    expect(result.end_time).toBeInstanceOf(Date);
  });

  it('queries pending and active orders', async () => {
    ordersRepo.find.mockResolvedValue([]);

    await service.getPendingByLine('m1');
    expect(ordersRepo.find).toHaveBeenCalledWith({ where: { machine_id: 'm1', status: 'pending' }, order: { priority: 'DESC', created_at: 'ASC' } });

    await service.getActiveOrders();
    expect(ordersRepo.find).toHaveBeenCalledWith({ where: { status: 'in_progress' }, order: { priority: 'DESC', created_at: 'ASC' } });
  });
});
