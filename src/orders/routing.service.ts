import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CarrierEntity, CarrierStatusEnum } from '../carriers/carrier.entity';
import { MachineEntity } from '../machines/machine.entity';
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

const DEMO_PRODUCTION_ROUTE = [
  { step_no: 1, resource_id: 1, operation_no: 10, operation: 'Deckelfarbe bereitstellen', parameters: { iPar1: 1, iPar2: 3, iPar3: 5, iPar4: 7 } },
  { step_no: 2, resource_id: 2, operation_no: 20, operation: 'Kugeln dosieren', parameters: { iPar1: 1, iPar2: 3, iPar3: 5, iPar4: 7 } },
  { step_no: 3, resource_id: 3, operation_no: 30, operation: 'Deckel und Kugeln pruefen', parameters: { iPar1: 1, iPar2: 3, iPar3: 5, iPar4: 7 } },
];
const DEMO_CARRIER_NUMBERS = [128, 129];

export type WebshopProductionPayload = {
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

  async releaseDemoProductionOrder(orderId: string, quantity: number) {
    return this.dataSource.transaction(async (manager) => {
      const order = await manager.findOne(OrderEntity, { where: { id: orderId } });
      if (!order) throw new NotFoundException('Order not found');

      await manager.delete(OrderRouteStepEntity, { order_id: orderId });
      const route = await manager.save(OrderRouteStepEntity, DEMO_PRODUCTION_ROUTE.map((step) => manager.create(OrderRouteStepEntity, {
        ...step,
        order_id: orderId,
      })));

      order.status = 'in_progress';
      order.completed_quantity = 0;
      order.start_time = new Date();
      await manager.save(order);

      const carrierNumbers = DEMO_CARRIER_NUMBERS.slice(0, Math.max(1, Math.min(quantity, DEMO_CARRIER_NUMBERS.length)));
      const carriers: CarrierEntity[] = [];
      for (const carrierNumber of carrierNumbers) {
        let carrier = await manager.findOne(CarrierEntity, { where: { carrier_number: carrierNumber } });
        if (!carrier) carrier = manager.create(CarrierEntity, { carrier_number: carrierNumber });
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
      const startStation = await manager.findOne(MachineEntity, { where: { resource_id: 1 } });
      if (!startStation) throw new NotFoundException('Start station resource 1 not found');

      const order = await manager.save(OrderEntity, manager.create(OrderEntity, {
        name: `WEBSHOP-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`,
        priority: 1,
        machine_id: startStation.id,
        operation: 'Webshop-Produkt konfigurieren',
        quantity: 1,
        completed_quantity: 0,
        status: 'in_progress',
        start_time: new Date(),
      }));

      const parameters = {
        iPar1: payload.bDeckelfarbe,
        iPar2: payload.uiKugelRot,
        iPar3: payload.uiKugelGruen,
        iPar4: payload.uiKugelBlau,
      };
      const route = await manager.save(OrderRouteStepEntity, DEMO_PRODUCTION_ROUTE.map((step) => manager.create(OrderRouteStepEntity, {
        ...step,
        order_id: order.id,
        parameters,
      })));

      let carrier = await manager.findOne(CarrierEntity, { where: { carrier_number: DEMO_CARRIER_NUMBERS[0] } });
      if (!carrier) carrier = manager.create(CarrierEntity, { carrier_number: DEMO_CARRIER_NUMBERS[0] });
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
