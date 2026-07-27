import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  CarrierEntity,
  CarrierPhysicalStateEnum,
  CarrierStatusEnum,
  isCarrierPhysicallyAvailable,
} from '../carriers/carrier.entity';
import { MachineEntity } from '../machines/machine.entity';
import { OrderEntity } from './order.entity';
import { OrderRouteStepEntity } from './order-route-step.entity';
import { ReplaceOrderRouteDto } from './routing.dto';
import { OrderProductionLogService } from './order-production-log.service';
import { ProductEntity } from '../products/product.entity';
import { ProductRouteStepEntity } from '../products/product-route-step.entity';
import { MachineProfileService } from '../machines/profiles/machine-profile.service';
import type { RoutingOutcome } from './routing-outcome';
import {
  ExecutionStepSource,
} from '../execution-steps/execution-step.entity';
import { ExecutionStepsService } from '../execution-steps/execution-steps.service';

export type ExternalProductionOrderPayload = {
  orderName?: string;
  productId?: string;
  partNo?: string;
  parameters: Record<string, number>;
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
    private readonly profiles: MachineProfileService,
    private readonly executionSteps: ExecutionStepsService,
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

  async createExternalProductionOrder(payload: ExternalProductionOrderPayload) {
    return this.dataSource.transaction(async (manager) => {
      const profile = this.profiles.getProfile();
      const defaultRoute = profile.stations
        .filter(
          (station) =>
            station.enabled &&
            station.routing &&
            station.routing.enabled !== false,
        )
        .sort(
          (left, right) =>
            left.routing!.sequence - right.routing!.sequence,
        );
      if (!defaultRoute.length) {
        throw new NotFoundException(
          'Machine profile contains no routable stations',
        );
      }

      const product = payload.productId
        ? await manager.findOne(ProductEntity, {
            where: { id: payload.productId, is_active: true },
          })
        : payload.partNo
          ? await manager.findOne(ProductEntity, {
              where: { part_no: payload.partNo, is_active: true },
            })
          : null;
      if ((payload.productId || payload.partNo) && !product) {
        throw new NotFoundException(
          'Configured external-order product was not found',
        );
      }
      const productRoute = product
        ? await manager.find(ProductRouteStepEntity, {
            where: { product_id: product.id },
            order: { step_no: 'ASC' },
          })
        : [];
      const routeDefinition = productRoute.length
        ? productRoute.map((step) => ({
            resourceId: step.resource_id,
            operationNo: step.operation_no,
            operation: step.operation,
            parameters: step.parameters || {},
          }))
        : defaultRoute.map((station) => ({
            resourceId: station.resourceId,
            operationNo: station.routing!.operationNo,
            operation: station.routing!.operation,
            parameters: {},
          }));

      const startStation = await manager.findOne(MachineEntity, {
        where: { resource_id: routeDefinition[0].resourceId },
      });
      if (!startStation) {
        throw new NotFoundException(
          `Profile station ${routeDefinition[0].resourceId} is not synchronized`,
        );
      }

      const order = await manager.save(
        OrderEntity,
        manager.create(OrderEntity, {
          name:
            payload.orderName ??
            `EXTERNAL-${new Date()
              .toISOString()
              .replace(/[-:.TZ]/g, '')
              .slice(0, 14)}`,
          priority: 1,
          machine_id: startStation.id,
          product_id: product?.id || null,
          operation: product?.name || routeDefinition[0].operation,
          quantity: 1,
          completed_quantity: 0,
          status: 'pending',
        }),
      );

      const parameters = payload.parameters;
      const route = await manager.save(
        OrderRouteStepEntity,
        routeDefinition.map((step, index) =>
          manager.create(OrderRouteStepEntity, {
            step_no: index + 1,
            resource_id: step.resourceId,
            operation_no: step.operationNo,
            operation: step.operation,
            order_id: order.id,
            parameters: { ...step.parameters, ...parameters },
          }),
        ),
      );

      const candidateCarriers = await manager.find(CarrierEntity, {
        where: { status: CarrierStatusEnum.AVAILABLE },
        order: { carrier_number: 'ASC' },
      });
      let carrier = candidateCarriers.find(isCarrierPhysicallyAvailable);
      if (!carrier)
        throw new BadRequestException(
          'No available carrier found for external order',
        );
      carrier.order_id = order.id;
      carrier.current_step_no = route[0].step_no;
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
        return { outcome: 'carrier_unknown' as RoutingOutcome };
      if (!carrier.order_id || carrier.current_step_no == null)
        return { outcome: 'order_missing' as RoutingOutcome };

      const order = await manager.findOne(OrderEntity, {
        where: { id: carrier.order_id },
      });
      const product = order?.product_id
        ? await manager.findOne(ProductEntity, {
            where: { id: order.product_id },
          })
        : null;
      const step = await manager.findOne(OrderRouteStepEntity, {
        where: { order_id: carrier.order_id, step_no: carrier.current_step_no },
      });
      if (!order || !step)
        return { outcome: 'order_missing' as RoutingOutcome };
      if (order.status === 'completed') {
        carrier.status = CarrierStatusEnum.AVAILABLE;
        carrier.order_id = null;
        carrier.current_step_no = null;
        carrier.current_resource_id = null;
        await manager.save(carrier);
        return { outcome: 'already_completed' as RoutingOutcome };
      }
      if (step.resource_id !== resourceId)
        return { outcome: 'wrong_resource' as RoutingOutcome };
      if (carrier.status === CarrierStatusEnum.COMPLETED) {
        return { outcome: 'already_completed' as RoutingOutcome };
      }

      carrier.current_resource_id = resourceId;
      carrier.status = CarrierStatusEnum.IN_PROCESS;
      if (carrier.inventory_managed) {
        carrier.physical_state = CarrierPhysicalStateEnum.AT_STATION;
        carrier.last_seen_at = new Date();
        carrier.inventory_stale = false;
      }
      await manager.save(carrier);
      const startedAt = new Date();
      if (this.transitionOrderToInProgress(order, startedAt)) {
        await manager.save(order);
      }

      const route = await manager.find(OrderRouteStepEntity, {
        where: { order_id: carrier.order_id },
        order: { step_no: 'ASC' },
      });
      const currentIndex = route.findIndex(
        (candidate) => candidate.id === step.id,
      );
      const nextStep =
        currentIndex >= 0 ? route[currentIndex + 1] : undefined;
      await this.executionSteps.start(
        {
          orderId: order.id,
          carrierId: carrier.id,
          carrierNumber: carrier.carrier_number,
          resourceId,
          operationNo: step.operation_no,
          operation: step.operation,
          stepNo: step.step_no,
          source: ExecutionStepSource.MACHINE,
          startedAt,
        },
        manager,
      );
      return {
        outcome: 'accepted' as RoutingOutcome,
        orderNo: order.name,
        partNo: product?.part_no || order.name,
        operationNo: step.operation_no,
        stepNo: step.step_no,
        nextResourceId:
          nextStep?.resource_id ?? this.terminalResourceId(),
        parameters: step.parameters || {},
        carrierId: carrier.id,
        orderId: order.id,
      };
    });
  }

  private terminalResourceId(): number {
    const terminalResourceId =
      this.profiles.getProfile().routing?.terminalResourceId;
    if (
      !Number.isInteger(terminalResourceId) ||
      Number(terminalResourceId) < 0
    ) {
      throw new ServiceUnavailableException(
        'Machine profile requires routing.terminalResourceId for the final route step',
      );
    }
    return Number(terminalResourceId);
  }

  private transitionOrderToInProgress(
    order: OrderEntity,
    startedAt = new Date(),
  ): boolean {
    if (order.status !== 'pending') return false;
    order.status = 'in_progress';
    order.start_time = startedAt;
    return true;
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
      if (!carrier?.order_id || carrier.current_step_no == null) return false;

      const order = await manager.findOne(OrderEntity, {
        where: { id: carrier.order_id },
      });
      if (order?.status === 'completed') {
        carrier.status = CarrierStatusEnum.AVAILABLE;
        carrier.order_id = null;
        carrier.current_step_no = null;
        carrier.current_resource_id = null;
        await manager.save(carrier);
        return false;
      }
      if (carrier.current_resource_id !== resourceId) return false;

      const step = await manager.findOne(OrderRouteStepEntity, {
        where: { order_id: carrier.order_id, step_no: carrier.current_step_no },
      });
      if (!step) return false;
      const route = await manager.find(OrderRouteStepEntity, {
        where: { order_id: carrier.order_id },
        order: { step_no: 'ASC' },
      });
      const currentIndex = route.findIndex(
        (candidate) => candidate.id === step.id,
      );
      const nextStep =
        currentIndex >= 0 ? route[currentIndex + 1] : undefined;

      await this.executionSteps.complete(
        {
          orderId: carrier.order_id,
          carrierId: carrier.id,
          carrierNumber: carrier.carrier_number,
          resourceId,
          operationNo: step.operation_no,
          operation: step.operation,
          stepNo: step.step_no,
          source: ExecutionStepSource.MACHINE,
          startedAt: order?.start_time ?? completedAt,
          completedAt,
          result: { outcome: 'completed' },
        },
        manager,
      );

      if (nextStep) {
        carrier.current_step_no = nextStep.step_no;
        carrier.current_resource_id = null;
        carrier.status = CarrierStatusEnum.ASSIGNED;
        if (carrier.inventory_managed) {
          carrier.physical_state = CarrierPhysicalStateEnum.IN_TRANSIT;
          carrier.last_seen_at = completedAt;
          carrier.inventory_stale = false;
        }
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
              oc.current_step_no = null;
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

  async failStationStep(
    resourceId: number,
    carrierNumber: number,
    failedAt: Date,
  ): Promise<boolean> {
    return this.dataSource.transaction(async (manager) => {
      const carrier = await manager.findOne(CarrierEntity, {
        where: { carrier_number: carrierNumber },
      });
      if (
        !carrier?.order_id ||
        carrier.current_step_no == null ||
        carrier.current_resource_id !== resourceId
      ) {
        return false;
      }
      const failed = await this.executionSteps.fail(
        {
          orderId: carrier.order_id,
          carrierId: carrier.id,
          stepNo: carrier.current_step_no,
          failedAt,
          result: {
            outcome: 'failed',
            reason: 'job_dispatch_failed',
          },
        },
        manager,
      );
      return failed !== null;
    });
  }
}
