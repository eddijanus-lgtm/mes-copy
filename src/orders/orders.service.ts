import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrderEntity } from './order.entity';
import type { CreateOrderDto, UpdateOrderDto } from './order.dto';
import { CarrierEntity, CarrierStatusEnum } from '../carriers/carrier.entity';
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

  async create(dto: CreateOrderDto) {
    const availableCarriers = await this.carriersRepo.find({
      where: { status: CarrierStatusEnum.AVAILABLE },
      order: { carrier_number: 'ASC' },
    });

    if (availableCarriers.length < dto.quantity) {
      throw new BadRequestException(
        `Nicht genügend Carrier verfügbar: ${dto.quantity} benötigt, ${availableCarriers.length} verfügbar`,
      );
    }

    const order = this.ordersRepo.create({
      name: dto.name,
      priority: dto.priority,
      machine_id: dto.machine_id,
      operation: dto.operation,
      quantity: dto.quantity,
      status: 'in_progress',
      start_time: dto.start_time ?? new Date(),
      target_complete_time: dto.target_complete_time,
      completed_quantity: 0,
      red_balls: dto.red_balls ?? 0,
      green_balls: dto.green_balls ?? 0,
      blue_balls: dto.blue_balls ?? 0,
    });
    const savedOrder = await this.ordersRepo.save(order);

    const routeStepsData = [
      { step_no: 1, resource_id: 1, operation_no: 10, operation: 'Deckelfarbe bereitstellen', parameters: { iPar1: 1, iPar2: dto.red_balls ?? 0, iPar3: dto.green_balls ?? 0, iPar4: dto.blue_balls ?? 0 } },
      { step_no: 2, resource_id: 2, operation_no: 20, operation: 'Kugeln dosieren', parameters: { iPar1: 1, iPar2: dto.red_balls ?? 0, iPar3: dto.green_balls ?? 0, iPar4: dto.blue_balls ?? 0 } },
      { step_no: 3, resource_id: 3, operation_no: 30, operation: 'Deckel und Kugeln pruefen', parameters: { iPar1: 1, iPar2: dto.red_balls ?? 0, iPar3: dto.green_balls ?? 0, iPar4: dto.blue_balls ?? 0 } },
    ];
    const route = await this.routeStepsRepo.save(
      routeStepsData.map(step => this.routeStepsRepo.create({ ...step, order_id: savedOrder.id })),
    );

    const carriersToAssign = availableCarriers.slice(0, dto.quantity);
    for (const carrier of carriersToAssign) {
      carrier.order_id = savedOrder.id;
      carrier.current_step_no = 1;
      carrier.current_resource_id = null;
      carrier.status = CarrierStatusEnum.ASSIGNED;
    }
    const assignedCarriers = await this.carriersRepo.save(carriersToAssign);

    return { ...savedOrder, carriers: assignedCarriers, route };
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
    const saved = await this.ordersRepo.save(order);
    if (dto.red_balls !== undefined || dto.green_balls !== undefined || dto.blue_balls !== undefined) {
      const steps = await this.routeStepsRepo.find({ where: { order_id: id } });
      await this.routeStepsRepo.save(steps.map((step) => ({ ...step, parameters: {
        ...(step.parameters || {}), iPar2: saved.red_balls, iPar3: saved.green_balls, iPar4: saved.blue_balls,
      } })));
    }
    return saved;
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
