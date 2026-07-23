import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrderEntity } from './order.entity';
import type { CreateOrderDto, UpdateOrderDto } from './order.dto';
import { CarrierEntity } from '../carriers/carrier.entity';
import { OrderRouteStepEntity } from './order-route-step.entity';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(OrderEntity)
    private readonly ordersRepo: Repository<OrderEntity>,
    @InjectRepository(CarrierEntity)
    private readonly carriersRepo: Repository<CarrierEntity>,
    @InjectRepository(OrderRouteStepEntity)
    private readonly routeStepsRepo: Repository<OrderRouteStepEntity>,
  ) {}

  async create(dto: CreateOrderDto): Promise<OrderEntity> {
    const order = this.ordersRepo.create({
      name: dto.name,
      priority: dto.priority,
      machine_id: dto.machine_id,
      operation: dto.operation,
      quantity: dto.quantity,
      start_time: dto.start_time,
      target_complete_time: dto.target_complete_time,
    });
    return this.ordersRepo.save(order);
  }

  async findAll(): Promise<OrderEntity[]> {
    return this.ordersRepo.find({ order: { created_at: 'DESC' } });
  }

  async findOne(id: string): Promise<OrderEntity> {
    const order = await this.ordersRepo.findOne({ where: { id } });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  async update(id: string, dto: UpdateOrderDto): Promise<OrderEntity> {
    const order = await this.findOne(id);
    if (dto.quantity !== undefined && dto.quantity < (dto.completed_quantity ?? order.completed_quantity)) {
      throw new BadRequestException('Quantity cannot be lower than completed quantity');
    }
    if (dto.completed_quantity !== undefined && dto.completed_quantity > (dto.quantity ?? order.quantity)) {
      throw new BadRequestException('Completed quantity cannot exceed quantity');
    }
    if (dto.status === 'completed' || dto.status === 'cancelled') order.end_time = new Date();
    Object.assign(order, dto);
    return this.ordersRepo.save(order);
  }

  async remove(id: string): Promise<void> {
    if (await this.carriersRepo.count({ where: { order_id: id } })) {
      throw new BadRequestException('Order with assigned carriers cannot be deleted');
    }
    await this.routeStepsRepo.delete({ order_id: id });
    const result = await this.ordersRepo.delete(id);
    if (result.affected === 0) throw new NotFoundException('Order not found');
  }

  async updateProgress(id: string, completedQty: number): Promise<OrderEntity> {
    const order = await this.findOne(id);
    order.completed_quantity = Math.min(completedQty, order.quantity);
    if (order.completed_quantity >= order.quantity) {
      order.status = 'completed' as const;
      order.end_time = new Date();
    }
    return this.ordersRepo.save(order);
  }

  async getPendingByLine(machineId: string): Promise<OrderEntity[]> {
    return this.ordersRepo.find({ where: { machine_id: machineId, status: 'pending' }, order: { priority: 'DESC', created_at: 'ASC' } });
  }

  async getActiveOrders(): Promise<OrderEntity[]> {
    return this.ordersRepo.find({ where: { status: 'in_progress' }, order: { priority: 'DESC', created_at: 'ASC' } });
  }
}
