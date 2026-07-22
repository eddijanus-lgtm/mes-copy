import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CarrierEntity, CarrierStatusEnum } from '../carriers/carrier.entity';
import { OrderEntity } from './order.entity';
import { OrderRouteStepEntity } from './order-route-step.entity';
import { ReplaceOrderRouteDto } from './routing.dto';

export enum DemoRoutingResultCode {
  OK = 0,
  CARRIER_UNKNOWN = 1,
  ORDER_MISSING = 2,
  WRONG_RESOURCE = 3,
  STEP_ALREADY_COMPLETED = 4,
  INTERNAL_ERROR = 9,
}

@Injectable()
export class RoutingService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(OrderRouteStepEntity) private readonly routeSteps: Repository<OrderRouteStepEntity>,
  ) {}

  getRoute(orderId: string) {
    return this.routeSteps.find({ where: { order_id: orderId }, order: { step_no: 'ASC' } });
  }

  async replaceRoute(orderId: string, dto: ReplaceOrderRouteDto) {
    if (!dto.steps.length) throw new BadRequestException('Route requires at least one step');
    const uniqueSteps = new Set(dto.steps.map((step) => step.step_no));
    if (uniqueSteps.size !== dto.steps.length) throw new BadRequestException('Route step numbers must be unique');

    return this.dataSource.transaction(async (manager) => {
      if (!await manager.findOne(OrderEntity, { where: { id: orderId } })) throw new NotFoundException('Order not found');
      await manager.delete(OrderRouteStepEntity, { order_id: orderId });
      return manager.save(OrderRouteStepEntity, dto.steps.map((step) => manager.create(OrderRouteStepEntity, {
        ...step,
        order_id: orderId,
        parameters: step.parameters || {},
      })));
    });
  }

  async resolveStationRequest(resourceId: number, carrierNumber: number) {
    return this.dataSource.transaction(async (manager) => {
      const carrier = await manager.findOne(CarrierEntity, {
        where: { carrier_number: carrierNumber },
        lock: { mode: 'pessimistic_write' },
      });
      if (!carrier) return { resultCode: DemoRoutingResultCode.CARRIER_UNKNOWN };
      if (!carrier.order_id) return { resultCode: DemoRoutingResultCode.ORDER_MISSING };

      const order = await manager.findOne(OrderEntity, { where: { id: carrier.order_id } });
      const step = await manager.findOne(OrderRouteStepEntity, {
        where: { order_id: carrier.order_id, step_no: carrier.current_step_no },
      });
      if (!order || !step) return { resultCode: DemoRoutingResultCode.ORDER_MISSING };
      if (step.resource_id !== resourceId) return { resultCode: DemoRoutingResultCode.WRONG_RESOURCE };
      if (carrier.status === CarrierStatusEnum.COMPLETED) {
        return { resultCode: DemoRoutingResultCode.STEP_ALREADY_COMPLETED };
      }

      carrier.current_resource_id = resourceId;
      carrier.status = CarrierStatusEnum.IN_PROCESS;
      await manager.save(carrier);

      const nextStep = await manager.findOne(OrderRouteStepEntity, {
        where: { order_id: carrier.order_id, step_no: carrier.current_step_no + 1 },
      });
      return {
        resultCode: DemoRoutingResultCode.OK,
        orderNo: order.name,
        partNo: order.name,
        operationNo: step.operation_no,
        stepNo: step.step_no,
        nextResourceId: nextStep?.resource_id || 0,
        parameters: step.parameters || {},
        carrierId: carrier.id,
        orderId: order.id,
      };
    });
  }

  async completeStationStep(resourceId: number, carrierNumber: number, completedAt: Date) {
    return this.dataSource.transaction(async (manager) => {
      const carrier = await manager.findOne(CarrierEntity, {
        where: { carrier_number: carrierNumber },
        lock: { mode: 'pessimistic_write' },
      });
      if (!carrier?.order_id || carrier.current_resource_id !== resourceId) return false;

      const step = await manager.findOne(OrderRouteStepEntity, {
        where: { order_id: carrier.order_id, step_no: carrier.current_step_no },
      });
      if (!step) return false;
      const nextStep = await manager.findOne(OrderRouteStepEntity, {
        where: { order_id: carrier.order_id, step_no: carrier.current_step_no + 1 },
      });

      if (nextStep) {
        carrier.current_step_no = nextStep.step_no;
        carrier.current_resource_id = null;
        carrier.status = CarrierStatusEnum.ASSIGNED;
      } else {
        carrier.current_resource_id = null;
        carrier.status = CarrierStatusEnum.COMPLETED;
        const order = await manager.findOne(OrderEntity, { where: { id: carrier.order_id } });
        if (order) {
          order.completed_quantity = Math.min(order.quantity, order.completed_quantity + 1);
          if (order.completed_quantity >= order.quantity) {
            order.status = 'completed';
            order.end_time = completedAt;
          }
          await manager.save(order);
        }
      }
      await manager.save(carrier);
      return true;
    });
  }
}
