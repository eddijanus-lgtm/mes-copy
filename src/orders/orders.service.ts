import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrderEntity } from './order.entity';
import type { CreateOrderDto, UpdateOrderDto } from './order.dto';
import { CarrierEntity, CarrierStatusEnum } from '../carriers/carrier.entity';
import { OrderRouteStepEntity } from './order-route-step.entity';
import { MachineEntity } from '../machines/machine.entity';
import { ProductEntity } from '../products/product.entity';
import { ProductRouteStepEntity } from '../products/product-route-step.entity';
import { OrderProductionLogService } from './order-production-log.service';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(OrderEntity)
    private readonly ordersRepo: Repository<OrderEntity>,
    @InjectRepository(CarrierEntity)
    private readonly carriersRepo: Repository<CarrierEntity>,
    @InjectRepository(OrderRouteStepEntity)
    private readonly routeStepsRepo: Repository<OrderRouteStepEntity>,
    @InjectRepository(MachineEntity)
    private readonly machinesRepo: Repository<MachineEntity>,
    @InjectRepository(ProductEntity)
    private readonly productsRepo: Repository<ProductEntity>,
    @InjectRepository(ProductRouteStepEntity)
    private readonly productRouteStepsRepo: Repository<ProductRouteStepEntity>,
    private readonly productionLogs: OrderProductionLogService,
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
      product_id: dto.product_id || null,
      operation: dto.operation,
      quantity: dto.quantity,
      status: 'in_progress',
      start_time: dto.start_time ?? new Date(),
      target_complete_time: dto.target_complete_time,
      completed_quantity: 0,
    });
    const savedOrder = await this.ordersRepo.save(order);

    const routeStepsData = dto.route_steps?.length ? dto.route_steps : await this.defaultRouteSteps(dto.machine_id, dto.product_id, dto.production_parameters);
    const routeEntities = this.routeStepsRepo.create(routeStepsData.map(step => ({
      ...step,
      order_id: savedOrder.id,
      parameters: { ...(step.parameters || {}), ...(dto.production_parameters || {}) },
    })));
    const route = await this.routeStepsRepo.save(routeEntities);

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
    const savedOrder = await this.ordersRepo.save(order);
    if (savedOrder.status === 'completed') await this.productionLogs.finalize(savedOrder.id);
    return savedOrder;
  }

  async remove(id: string): Promise<void> {
    if (await this.carriersRepo.count({ where: { order_id: id } })) {
      throw new BadRequestException('Order with assigned carriers cannot be deleted');
    }
    await this.productionLogs.remove(id);
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
      const carriers = await this.carriersRepo.find({ where: { order_id: id } });
      for (const c of carriers) {
        c.status = CarrierStatusEnum.AVAILABLE;
        c.order_id = null;
        c.current_step_no = 1;
        c.current_resource_id = null;
      }
      await this.carriersRepo.save(carriers);
    }
    const savedOrder = await this.ordersRepo.save(order);
    if (savedOrder.status === 'completed') await this.productionLogs.finalize(savedOrder.id);
    return savedOrder;
  }

  async getPendingByLine(machineId: string): Promise<OrderEntity[]> {
    return this.ordersRepo.find({ where: { machine_id: machineId, status: 'pending' }, order: { priority: 'DESC', created_at: 'ASC' } });
  }

  async getActiveOrders(): Promise<OrderEntity[]> {
    return this.ordersRepo.find({ where: { status: 'in_progress' }, order: { priority: 'DESC', created_at: 'ASC' } });
  }

  private async defaultRouteSteps(machineId: string, productId?: string, productionParameters: Record<string, number> = {}) {
    const startMachine = await this.machinesRepo.findOne({ where: { id: machineId } });
    if (!startMachine?.resource_id) throw new BadRequestException('Selected machine requires a resource_id for routing');

    if (productId) return this.productRouteSteps(productId, startMachine.resource_id, productionParameters);

    const lineMachines = await this.machinesRepo.find({
      where: { location: startMachine.location, opcua_enabled: true },
      order: { resource_id: 'ASC' },
    });
    const routeMachines = lineMachines.filter((machine) =>
      machine.resource_id && machine.resource_id >= startMachine.resource_id!,
    );
    if (!routeMachines.length) throw new BadRequestException('Selected start station is not part of a routable line');

    return routeMachines.map((machine, index) => ({
      step_no: index + 1,
      resource_id: machine.resource_id!,
      operation_no: (index + 1) * 10,
      operation: machine.name,
      parameters: productionParameters,
    }));
  }

  private async productRouteSteps(productId: string, startResourceId: number, productionParameters: Record<string, number>) {
    const product = await this.productsRepo.findOne({ where: { id: productId, is_active: true } });
    if (!product) throw new BadRequestException('Selected product is not active or does not exist');

    const productRoute = await this.productRouteStepsRepo.find({
      where: { product_id: productId },
      order: { step_no: 'ASC' },
    });
    if (!productRoute.length) throw new BadRequestException('Selected product has no route');

    const startIndex = productRoute.findIndex((step) => step.resource_id === startResourceId);
    if (startIndex === -1) throw new BadRequestException('Selected start station is not part of the product route');

    return productRoute.slice(startIndex).map((step, index) => ({
      step_no: index + 1,
      resource_id: step.resource_id,
      operation_no: step.operation_no,
      operation: step.operation,
      parameters: { ...(step.parameters || {}), ...productionParameters },
    }));
  }

}
