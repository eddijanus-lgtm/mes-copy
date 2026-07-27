import { NotFoundException } from '@nestjs/common';
import {
  ExecutionStepSource,
  ExecutionStepState,
} from './execution-step.entity';
import { ExecutionStepsService } from './execution-steps.service';

describe('ExecutionStepsService', () => {
  const startedAt = new Date('2026-07-27T08:00:00.000Z');
  const completedAt = new Date('2026-07-27T08:00:02.000Z');
  const input = {
    orderId: 'e3754578-32bd-4fab-9273-4fc07532f821',
    carrierId: '3b4e4d61-d4c7-4e39-b3af-d1d5d29a7ef0',
    carrierNumber: 17,
    resourceId: 72,
    operationNo: 720,
    operation: 'Process material',
    stepNo: 2,
    source: ExecutionStepSource.MACHINE,
    startedAt,
  };

  function createService(overrides: Record<string, unknown> = {}) {
    const steps = {
      manager: {},
      find: jest.fn().mockResolvedValue([]),
      ...((overrides.steps as object) ?? {}),
    };
    const machines = {
      find: jest.fn().mockResolvedValue([]),
      ...((overrides.machines as object) ?? {}),
    };
    const orders = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue({ id: input.orderId }),
      ...((overrides.orders as object) ?? {}),
    };
    return {
      service: new ExecutionStepsService(
        steps as never,
        machines as never,
        orders as never,
      ),
      steps,
      machines,
      orders,
    };
  }

  it('starts a neutral execution step from an accepted equipment request', async () => {
    const saved: any[] = [];
    const manager = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((_entity, value) => ({ id: 'step-1', ...value })),
      save: jest.fn(async (_entity, value) => {
        saved.push(value);
        return value;
      }),
    };
    const { service } = createService();

    const result = await service.start(input, manager as never);

    expect(result).toMatchObject({
      order_id: input.orderId,
      carrier_id: input.carrierId,
      resource_id: 72,
      operation_no: 720,
      operation: 'Process material',
      step_no: 2,
      state: ExecutionStepState.RUNNING,
      source: ExecutionStepSource.MACHINE,
      started_at: startedAt,
    });
    expect(saved).toHaveLength(1);
  });

  it('completes the same step with a semantic result and equipment timestamp', async () => {
    const existing = {
      id: 'step-1',
      order_id: input.orderId,
      carrier_id: input.carrierId,
      step_no: input.stepNo,
      state: ExecutionStepState.RUNNING,
      started_at: startedAt,
    };
    const manager = {
      findOne: jest.fn().mockResolvedValue(existing),
      create: jest.fn(),
      save: jest.fn(async (_entity, value) => value),
    };
    const { service } = createService();

    const result = await service.complete(
      {
        ...input,
        completedAt,
        result: { outcome: 'completed' },
      },
      manager as never,
    );

    expect(result).toMatchObject({
      id: 'step-1',
      state: ExecutionStepState.COMPLETED,
      ended_at: completedAt,
      result: { outcome: 'completed' },
    });
  });

  it('marks a running step failed when job dispatch cannot finish', async () => {
    const existing = {
      id: 'step-1',
      order_id: input.orderId,
      carrier_id: input.carrierId,
      step_no: input.stepNo,
      state: ExecutionStepState.RUNNING,
      started_at: startedAt,
    };
    const manager = {
      findOne: jest.fn().mockResolvedValue(existing),
      save: jest.fn(async (_entity, value) => value),
    };
    const { service } = createService();

    const result = await service.fail(
      {
        orderId: input.orderId,
        carrierId: input.carrierId,
        stepNo: input.stepNo,
        failedAt: completedAt,
        result: {
          outcome: 'failed',
          reason: 'job_dispatch_failed',
        },
      },
      manager as never,
    );

    expect(result).toMatchObject({
      state: ExecutionStepState.FAILED,
      ended_at: completedAt,
      result: {
        outcome: 'failed',
        reason: 'job_dispatch_failed',
      },
    });
  });

  it('returns enriched current shopfloor steps', async () => {
    const running = {
      id: 'step-1',
      order_id: input.orderId,
      carrier_id: input.carrierId,
      carrier_number: 17,
      resource_id: 72,
      operation_no: 720,
      operation: 'Process material',
      step_no: 2,
      state: ExecutionStepState.RUNNING,
      source: ExecutionStepSource.MACHINE,
      started_at: startedAt,
      ended_at: null,
      result: null,
      created_at: startedAt,
    };
    const { service } = createService({
      steps: { find: jest.fn().mockResolvedValue([running]) },
      machines: {
        find: jest.fn().mockResolvedValue([
          {
            resource_id: 72,
            name: 'Work unit 72',
            parent_resource_id: 70,
          },
        ]),
      },
      orders: {
        find: jest.fn().mockResolvedValue([
          { id: input.orderId, name: 'ORDER-020' },
        ]),
      },
    });

    const result = await service.findCurrent();

    expect(result).toEqual([
      expect.objectContaining({
        order_name: 'ORDER-020',
        resource_name: 'Work unit 72',
        parent_resource_id: 70,
        state: ExecutionStepState.RUNNING,
      }),
    ]);
    expect(result[0].elapsed_ms).toBeGreaterThanOrEqual(0);
  });

  it('rejects history requests for unknown orders', async () => {
    const { service } = createService({
      orders: { findOne: jest.fn().mockResolvedValue(null) },
    });

    await expect(service.findForOrder(input.orderId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
