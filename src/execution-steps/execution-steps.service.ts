import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { MachineEntity } from '../machines/machine.entity';
import { OrderEntity } from '../orders/order.entity';
import {
  ExecutionStepEntity,
  ExecutionStepSource,
  ExecutionStepState,
} from './execution-step.entity';

export interface StartExecutionStep {
  orderId: string;
  carrierId: string;
  carrierNumber: number;
  resourceId: number;
  operationNo: number;
  operation: string;
  stepNo: number;
  source: ExecutionStepSource;
  startedAt: Date;
}

export interface CompleteExecutionStep extends StartExecutionStep {
  completedAt: Date;
  result?: Record<string, unknown>;
}

export interface FailExecutionStep {
  orderId: string;
  carrierId: string;
  stepNo: number;
  failedAt: Date;
  result: Record<string, unknown>;
}

export interface ExecutionStepView {
  id: string;
  order_id: string;
  order_name?: string;
  carrier_id?: string | null;
  carrier_number?: number | null;
  resource_id: number;
  resource_name?: string;
  parent_resource_id?: number | null;
  operation_no: number;
  operation: string;
  step_no: number;
  state: ExecutionStepState;
  source: ExecutionStepSource;
  started_at?: Date | null;
  ended_at?: Date | null;
  elapsed_ms?: number | null;
  result?: Record<string, unknown> | null;
}

@Injectable()
export class ExecutionStepsService {
  constructor(
    @InjectRepository(ExecutionStepEntity)
    private readonly steps: Repository<ExecutionStepEntity>,
    @InjectRepository(MachineEntity)
    private readonly machines: Repository<MachineEntity>,
    @InjectRepository(OrderEntity)
    private readonly orders: Repository<OrderEntity>,
  ) {}

  async start(
    input: StartExecutionStep,
    manager: EntityManager = this.steps.manager,
  ): Promise<ExecutionStepEntity> {
    const existing = await manager.findOne(ExecutionStepEntity, {
      where: {
        order_id: input.orderId,
        carrier_id: input.carrierId,
        step_no: input.stepNo,
      },
    });
    if (existing?.state === ExecutionStepState.COMPLETED) return existing;

    const step =
      existing ??
      manager.create(ExecutionStepEntity, {
        order_id: input.orderId,
        carrier_id: input.carrierId,
        carrier_number: input.carrierNumber,
        step_no: input.stepNo,
      });
    Object.assign(step, {
      resource_id: input.resourceId,
      operation_no: input.operationNo,
      operation: input.operation,
      state: ExecutionStepState.RUNNING,
      source: input.source,
      started_at: step.started_at ?? input.startedAt,
      ended_at: null,
      result: null,
    });
    return manager.save(ExecutionStepEntity, step);
  }

  async complete(
    input: CompleteExecutionStep,
    manager: EntityManager = this.steps.manager,
  ): Promise<ExecutionStepEntity> {
    const existing = await manager.findOne(ExecutionStepEntity, {
      where: {
        order_id: input.orderId,
        carrier_id: input.carrierId,
        step_no: input.stepNo,
      },
    });
    const step =
      existing ??
      manager.create(ExecutionStepEntity, {
        order_id: input.orderId,
        carrier_id: input.carrierId,
        carrier_number: input.carrierNumber,
        resource_id: input.resourceId,
        operation_no: input.operationNo,
        operation: input.operation,
        step_no: input.stepNo,
        started_at: input.startedAt,
      });
    Object.assign(step, {
      state: ExecutionStepState.COMPLETED,
      source: input.source,
      ended_at: input.completedAt,
      result: input.result ?? { outcome: 'completed' },
    });
    return manager.save(ExecutionStepEntity, step);
  }

  async fail(
    input: FailExecutionStep,
    manager: EntityManager = this.steps.manager,
  ): Promise<ExecutionStepEntity | null> {
    const step = await manager.findOne(ExecutionStepEntity, {
      where: {
        order_id: input.orderId,
        carrier_id: input.carrierId,
        step_no: input.stepNo,
        state: ExecutionStepState.RUNNING,
      },
    });
    if (!step) return null;
    step.state = ExecutionStepState.FAILED;
    step.ended_at = input.failedAt;
    step.result = input.result;
    return manager.save(ExecutionStepEntity, step);
  }

  async findCurrent(): Promise<ExecutionStepView[]> {
    const current = await this.steps.find({
      where: {
        state: In([
          ExecutionStepState.WAITING,
          ExecutionStepState.READY,
          ExecutionStepState.RUNNING,
          ExecutionStepState.PAUSED,
        ]),
      },
      order: { started_at: 'ASC', created_at: 'ASC' },
    });
    return this.enrich(current);
  }

  async findForOrder(orderId: string): Promise<ExecutionStepView[]> {
    const order = await this.orders.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    const history = await this.steps.find({
      where: { order_id: orderId },
      order: { step_no: 'ASC', started_at: 'ASC', created_at: 'ASC' },
    });
    return this.enrich(history, [order]);
  }

  private async enrich(
    steps: ExecutionStepEntity[],
    knownOrders?: OrderEntity[],
  ): Promise<ExecutionStepView[]> {
    if (!steps.length) return [];
    const resourceIds = [...new Set(steps.map((step) => step.resource_id))];
    const orderIds = [...new Set(steps.map((step) => step.order_id))];
    const [machines, orders] = await Promise.all([
      this.machines.find({ where: { resource_id: In(resourceIds) } }),
      knownOrders
        ? Promise.resolve(knownOrders)
        : this.orders.find({ where: { id: In(orderIds) } }),
    ]);
    const machinesByResource = new Map(
      machines.map((machine) => [machine.resource_id, machine]),
    );
    const ordersById = new Map(orders.map((order) => [order.id, order]));
    const now = Date.now();

    return steps.map((step) => {
      const machine = machinesByResource.get(step.resource_id);
      const started = step.started_at?.getTime();
      const ended = step.ended_at?.getTime();
      return {
        id: step.id,
        order_id: step.order_id,
        order_name: ordersById.get(step.order_id)?.name,
        carrier_id: step.carrier_id,
        carrier_number: step.carrier_number,
        resource_id: step.resource_id,
        resource_name: machine?.name,
        parent_resource_id: machine?.parent_resource_id,
        operation_no: step.operation_no,
        operation: step.operation,
        step_no: step.step_no,
        state: step.state,
        source: step.source,
        started_at: step.started_at,
        ended_at: step.ended_at,
        elapsed_ms:
          started === undefined ? null : Math.max(0, (ended ?? now) - started),
        result: step.result,
      };
    });
  }
}
