import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CarrierEntity, CarrierStatusEnum } from '../carriers/carrier.entity';
import { MachineEntity } from '../machines/machine.entity';
import { OrderEntity } from './order.entity';
import { OrderRouteStepEntity } from './order-route-step.entity';
import { ReplaceOrderRouteDto } from './routing.dto';
import { OrderProductionLogService } from './order-production-log.service';

export enum DemoRoutingResultCode {
  OK = 0,
  CARRIER_UNKNOWN = 1,
  ORDER_MISSING = 2,
  WRONG_RESOURCE = 3,
  STEP_ALREADY_COMPLETED = 4,
  INTERNAL_ERROR = 9,
}

export type WebshopProductionPayload = {
  orderName?: string;
  bDeckelfarbe: number;
  uiKugelRot: number;
  uiKugelGruen: number;
  uiKugelBlau: number;
  xAuftragAusstehend?: boolean;
  uiAnzahlAustehenderAuftraege?: number;
};

@Injectable()
export class RoutingService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(OrderRouteStepEntity)
    private readonly routeSteps: Repository<OrderRouteStepEntity>,
    private readonly productionLogs: OrderProductionLogService,
  ) {}

  getRoute(orderId: string) {
    return this.routeSteps.find({
      where: { order_id: orderId },
      order: { step_no: 'ASC' },
    });
  }

  async replaceRoute(orderId: string, dto: ReplaceOrderRouteDto) {
    if (!dto.steps.length)
      throw new BadRequestException('Route requires at least one step');
    const uniqueSteps = new Set(dto.steps.map((step) => step.step_no));
    if (uniqueSteps.size !== dto.steps.length)
      throw new BadRequestException('Route step numbers must be unique');

    return this.dataSource.transaction(async (manager) => {
      if (!(await manager.findOne(OrderEntity, { where: { id: orderId } })))
        throw new NotFoundException('Order not found');
      await manager.delete(OrderRouteStepEntity, { order_id: orderId });
      return manager.save(
        OrderRouteStepEntity,
        dto.steps.map((step) =>
          manager.create(OrderRouteStepEntity, {
            ...step,
            order_id: orderId,
            parameters: step.parameters || {},
          }),
        ),
      );
    });
  }

  async releaseDemoProductionOrder(orderId: string, quantity: number) {
    return this.dataSource.transaction(async (manager) => {
      const order = await manager.findOne(OrderEntity, {
        where: { id: orderId },
      });
      if (!order) throw new NotFoundException('Order not found');
      const route = await manager.find(OrderRouteStepEntity, {
        where: { order_id: orderId },
        order: { step_no: 'ASC' },
      });
      if (!route.length)
        throw new BadRequestException('Order requires a route before release');

      order.status = 'in_progress';
      order.completed_quantity = 0;
      order.start_time = new Date();
      await manager.save(order);

      const availableCarriers = await manager.find(CarrierEntity, {
        where: { status: CarrierStatusEnum.AVAILABLE },
        order: { carrier_number: 'ASC' },
      });
      if (availableCarriers.length < quantity)
        throw new BadRequestException(
          `Not enough available carriers: ${quantity} required, ${availableCarriers.length} available`,
        );
      const carriers: CarrierEntity[] = [];
      for (const carrier of availableCarriers.slice(0, quantity)) {
        carrier.order_id = orderId;
        carrier.current_step_no = 1;
        carrier.current_resource_id = null;
        carrier.status = CarrierStatusEnum.ASSIGNED;
        carriers.push(await manager.save(carrier));
      }

      return { order, route, carriers };
    });
  }

  async createWebshopProductionOrder(payload: WebshopProductionPayload) {
    return this.dataSource.transaction(async (manager) => {
      const routeMachines = await manager.find(MachineEntity, {
        where: { opcua_enabled: true },
        order: { resource_id: 'ASC' },
      });
      const routableMachines = routeMachines.filter(
        (machine) => machine.resource_id,
      );
      if (!routableMachines.length)
        throw new NotFoundException(
          'No OPC UA enabled machines with resource_id found',
        );
      const startStation = routableMachines[0];

      const order = await manager.save(
        OrderEntity,
        manager.create(OrderEntity, {
          name:
            payload.orderName ??
            `WEBSHOP-${new Date()
              .toISOString()
              .replace(/[-:.TZ]/g, '')
              .slice(0, 14)}`,
          priority: 1,
          machine_id: startStation.id,
          operation: 'Webshop-Produkt konfigurieren',
          quantity: 1,
          completed_quantity: 0,
          status: 'in_progress',
          start_time: new Date(),
        }),
      );

      const parameters = {
        iPar1: payload.bDeckelfarbe,
        iPar2: payload.uiKugelRot,
        iPar3: payload.uiKugelGruen,
        iPar4: payload.uiKugelBlau,
      };
      const route = await manager.save(
        OrderRouteStepEntity,
        routableMachines.map((machine, index) =>
          manager.create(OrderRouteStepEntity, {
            step_no: index + 1,
            resource_id: machine.resource_id!,
            operation_no: (index + 1) * 10,
            operation: machine.type || machine.name,
            order_id: order.id,
            parameters,
          }),
        ),
      );

      let carrier = await manager.findOne(CarrierEntity, {
        where: { status: CarrierStatusEnum.AVAILABLE },
        order: { carrier_number: 'ASC' },
      });
      if (!carrier)
        throw new BadRequestException(
          'No available carrier found for webshop order',
        );
      carrier.order_id = order.id;
      carrier.current_step_no = 1;
      carrier.current_resource_id = null;
      carrier.status = CarrierStatusEnum.ASSIGNED;
      carrier = await manager.save(carrier);

      return { order, route, carriers: [carrier], parameters };
    });
  }

  async resolveStationRequest(resourceId: number, carrierNumber: number) {
    return this.dataSource.transaction(async (manager) => {
      const carrier = await manager.findOne(CarrierEntity, {
        where: { carrier_number: carrierNumber },
        lock: { mode: 'pessimistic_write' },
      });
      if (!carrier)
        return { resultCode: DemoRoutingResultCode.CARRIER_UNKNOWN };
      if (!carrier.order_id)
        return { resultCode: DemoRoutingResultCode.ORDER_MISSING };

      const order = await manager.findOne(OrderEntity, {
        where: { id: carrier.order_id },
      });
      const step = await manager.findOne(OrderRouteStepEntity, {
        where: { order_id: carrier.order_id, step_no: carrier.current_step_no },
      });
      if (!order || !step)
        return { resultCode: DemoRoutingResultCode.ORDER_MISSING };
      if (order.status === 'completed') {
        carrier.status = CarrierStatusEnum.AVAILABLE;
        carrier.order_id = null;
        carrier.current_step_no = 1;
        carrier.current_resource_id = null;
        await manager.save(carrier);
        return { resultCode: DemoRoutingResultCode.STEP_ALREADY_COMPLETED };
      }
      if (step.resource_id !== resourceId)
        return { resultCode: DemoRoutingResultCode.WRONG_RESOURCE };
      if (carrier.status === CarrierStatusEnum.COMPLETED) {
        return { resultCode: DemoRoutingResultCode.STEP_ALREADY_COMPLETED };
      }

      carrier.current_resource_id = resourceId;
      carrier.status = CarrierStatusEnum.IN_PROCESS;
      await manager.save(carrier);

      const nextStep = await manager.findOne(OrderRouteStepEntity, {
        where: {
          order_id: carrier.order_id,
          step_no: carrier.current_step_no + 1,
        },
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

  async completeStationStep(
    resourceId: number,
    carrierNumber: number,
    completedAt: Date,
  ) {
    let finalizedOrderId: string | undefined;
    const completed = await this.dataSource.transaction(async (manager) => {
      const carrier = await manager.findOne(CarrierEntity, {
        where: { carrier_number: carrierNumber },
        lock: { mode: 'pessimistic_write' },
      });
      if (!carrier?.order_id) return false;

      const order = await manager.findOne(OrderEntity, {
        where: { id: carrier.order_id },
      });
      if (order?.status === 'completed') {
        carrier.status = CarrierStatusEnum.AVAILABLE;
        carrier.order_id = null;
        carrier.current_step_no = 1;
        carrier.current_resource_id = null;
        await manager.save(carrier);
        return false;
      }
      if (carrier.current_resource_id !== resourceId) return false;

      const step = await manager.findOne(OrderRouteStepEntity, {
        where: { order_id: carrier.order_id, step_no: carrier.current_step_no },
      });
      if (!step) return false;
      const nextStep = await manager.findOne(OrderRouteStepEntity, {
        where: {
          order_id: carrier.order_id,
          step_no: carrier.current_step_no + 1,
        },
      });

      if (nextStep) {
        carrier.current_step_no = nextStep.step_no;
        carrier.current_resource_id = null;
        carrier.status = CarrierStatusEnum.ASSIGNED;
        await manager.save(carrier);
      } else {
        carrier.current_resource_id = null;
        carrier.status = CarrierStatusEnum.COMPLETED;
        if (order) {
          order.completed_quantity = Math.min(
            order.quantity,
            order.completed_quantity + 1,
          );
          if (order.completed_quantity >= order.quantity) {
            order.status = 'completed';
            order.end_time = completedAt;
            finalizedOrderId = order.id;
            const orderCarriers = await manager.find(CarrierEntity, {
              where: { order_id: order.id },
            });
            for (const oc of orderCarriers) {
              oc.status = CarrierStatusEnum.AVAILABLE;
              oc.order_id = null;
              oc.current_step_no = 1;
              oc.current_resource_id = null;
            }
            await manager.save(orderCarriers);
          } else {
            await manager.save(carrier);
          }
          await manager.save(order);
        } else {
          await manager.save(carrier);
        }
      }
      return true;
    });
    if (finalizedOrderId) await this.productionLogs.finalize(finalizedOrderId);
    return completed;
  }
}
