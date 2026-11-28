import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
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

  async create(dto: CreateOrderDto, demo = false) {
    const skippedStationIds = new Set(dto.skipped_station_ids || []);
    if (dto.skip_first_station) skippedStationIds.add(1);
    if ([...skippedStationIds].some((id) => ![1, 2, 3].includes(id)) || skippedStationIds.size === 3) {
      throw new BadRequestException('At least one valid station must remain in the route');
    }
    return this.ordersRepo.manager.transaction(async (manager) => {
      const orders = manager.getRepository(OrderEntity);
      const steps = manager.getRepository(OrderRouteStepEntity);
      const carriers = manager.getRepository(CarrierEntity);
      const numbers = [128, 129].slice(0, dto.quantity);
      if (demo) {
        if (dto.quantity > numbers.length) throw new BadRequestException('Demo supports at most two carriers');
        await carriers.createQueryBuilder().insert().values(numbers.map(carrier_number => ({ carrier_number }))).orIgnore().execute();
      }
      const availableCarriers = await carriers.find({
        where: { status: CarrierStatusEnum.AVAILABLE, order_id: IsNull(), ...(demo ? { carrier_number: In(numbers) } : {}) },
        take: dto.quantity,
        lock: { mode: 'pessimistic_write' },
        order: { carrier_number: 'ASC' },
      });

      if (availableCarriers.length < dto.quantity) {
        throw new BadRequestException(
          `Nicht genügend Carrier verfügbar: ${dto.quantity} benötigt, ${availableCarriers.length} verfügbar`,
        );
      }

      const order = orders.create({
        name: dto.name,
        priority: dto.priority,
        machine_id: dto.machine_id,
        operation: dto.operation,
        quantity: dto.quantity,
        status: 'in_progress',
        start_time: dto.start_time ?? new Date(),
        target_complete_time: dto.target_complete_time,
        completed_quantity: 0,
        red_balls: dto.red_balls ?? (demo ? 3 : 0),
        green_balls: dto.green_balls ?? (demo ? 5 : 0),
        blue_balls: dto.blue_balls ?? (demo ? 7 : 0),
      });
      const savedOrder = await orders.save(order);

      const parameters = { iPar1: 1, iPar2: savedOrder.red_balls, iPar3: savedOrder.green_balls, iPar4: savedOrder.blue_balls };
      const routeStepsData = [
        { step_no: 1, resource_id: 1, operation_no: 10, operation: 'Kugeln dosieren', parameters },
        { step_no: 2, resource_id: 2, operation_no: 20, operation: 'Deckelfarbe bereitstellen', parameters },
        { step_no: 3, resource_id: 3, operation_no: 30, operation: 'Deckel und Kugeln pruefen', parameters },
      ];
      const selectedSteps = routeStepsData.filter((step) => !skippedStationIds.has(step.resource_id))
        .map((step, index) => ({ ...step, step_no: index + 1 }));
      const route = await steps.save(
        selectedSteps.map(step => steps.create({ ...step, order_id: savedOrder.id })),
      );

      for (const carrier of availableCarriers) {
        carrier.order_id = savedOrder.id;
        carrier.current_step_no = 1;
        carrier.current_resource_id = null;
        carrier.status = CarrierStatusEnum.ASSIGNED;
      }
      const assignedCarriers = await carriers.save(availableCarriers);

      return { ...savedOrder, carriers: assignedCarriers, route };
    });
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
