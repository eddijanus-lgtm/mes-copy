import { Test, TestingModule } from '@nestjs/testing';
import {
  MachineConnectionEvent,
  MachineEventUnsubscribe,
  MachineOperatingMode,
  MachineProcessCompletedEvent,
  MachineProcessOutcome,
  MachineSnapshot,
  MachineStationDescription,
  MachineWorkAcceptance,
  MachineWorkRequest,
  MachineWorkResponse,
  MachineId,
  MachineConnectionState,
} from './machine.types';
import { MACHINE_ADAPTER } from './machine-adapter.token';
import { MachineAdapter } from './machine-adapter.interface';

class FakeMachineAdapter implements MachineAdapter {
  readonly machineId: MachineId = 'SIMULATOR';
  readonly operatingMode: MachineOperatingMode = 'control';

  private currentConnectionState: MachineConnectionState = 'connected';

  private workRequestHandlers = new Set<
    (request: MachineWorkRequest) => void | Promise<void>
  >();

  private connectionChangeHandlers = new Set<
    (event: MachineConnectionEvent) => void
  >();

  private processCompletedHandlers = new Set<
    (event: MachineProcessCompletedEvent) => void | Promise<void>
  >();

  lastResponse: { requestId: string; response: MachineWorkResponse } | null = null;

  getConnectionState(): MachineConnectionState {
    return this.currentConnectionState;
  }

  async getStations(): Promise<readonly MachineStationDescription[]> {
    return [
      {
        stationId: 'S01',
        machineId: this.machineId,
        displayName: 'Station 1',
      },
    ];
  }

  async readSnapshot(): Promise<MachineSnapshot> {
    return {
      machineId: this.machineId,
      connectionState: this.currentConnectionState,
      timestamp: new Date(),
      stationStates: [],
    };
  }

  onConnectionChanged(
    handler: (event: MachineConnectionEvent) => void,
  ): MachineEventUnsubscribe {
    this.connectionChangeHandlers.add(handler);
    return () => {
      this.connectionChangeHandlers.delete(handler);
    };
  }

  onWorkRequested(
    handler: (request: MachineWorkRequest) => void | Promise<void>,
  ): MachineEventUnsubscribe {
    this.workRequestHandlers.add(handler);
    return () => {
      this.workRequestHandlers.delete(handler);
    };
  }

  onProcessCompleted(
    handler: (event: MachineProcessCompletedEvent) => void | Promise<void>,
  ): MachineEventUnsubscribe {
    this.processCompletedHandlers.add(handler);
    return () => {
      this.processCompletedHandlers.delete(handler);
    };
  }

  async respondToWorkRequest(
    requestId: string,
    response: MachineWorkResponse,
  ): Promise<void> {
    this.lastResponse = { requestId, response };
  }

  async emitWorkRequested(request: MachineWorkRequest): Promise<void> {
    await Promise.all(
      [...this.workRequestHandlers].map((handler) => Promise.resolve(handler(request))),
    );
  }

  emitConnectionChanged(event: MachineConnectionEvent): void {
    this.connectionChangeHandlers.forEach((handler) => handler(event));
  }

  async emitProcessCompleted(event: MachineProcessCompletedEvent): Promise<void> {
    await Promise.all(
      [...this.processCompletedHandlers].map((handler) => Promise.resolve(handler(event))),
    );
  }
}

describe('MachineAdapter Contract', () => {
  let fakeAdapter: FakeMachineAdapter;

  beforeEach(() => {
    fakeAdapter = new FakeMachineAdapter();
  });

  it('registers and resolves via dependency injection', async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: MACHINE_ADAPTER,
          useValue: fakeAdapter,
        },
      ],
    }).compile();

    const resolved = moduleRef.get<MachineAdapter>(MACHINE_ADAPTER);

    expect(resolved).toBe(fakeAdapter);
    expect(resolved.machineId).toBe('SIMULATOR');
    expect(resolved.operatingMode).toBe('control');
  });

  it('transmits a work request to registered handlers', async () => {
    const handler = jest.fn();

    fakeAdapter.onWorkRequested(handler);

    const workRequest: MachineWorkRequest = {
      requestId: 'REQUEST-001',
      machineId: 'SIMULATOR',
      stationId: 'S01',
      carrierId: 'CARRIER-001',
      timestamp: new Date('2026-07-25T08:00:00.000Z'),
      parameters: {
        color: 'red',
        quantity: 2,
        qualityCheckRequired: true,
      },
    };

    await fakeAdapter.emitWorkRequested(workRequest);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'REQUEST-001',
        machineId: 'SIMULATOR',
        stationId: 'S01',
        carrierId: 'CARRIER-001',
        parameters: {
          color: 'red',
          quantity: 2,
          qualityCheckRequired: true,
        },
      }),
    );
  });

  it('stores the last MES work response', async () => {
    const acceptance: MachineWorkAcceptance = 'accepted';

    const response: MachineWorkResponse = {
      requestId: 'REQUEST-001',
      machineId: 'SIMULATOR',
      stationId: 'S01',
      acceptance,
      resultCode: 'OK',
      nextStationId: 'S02',
      parameters: {
        processingTime: 120,
      },
    };

    await fakeAdapter.respondToWorkRequest('REQUEST-001', response);

    expect(fakeAdapter.lastResponse).not.toBeNull();
    expect(fakeAdapter.lastResponse!.requestId).toBe('REQUEST-001');
    expect(fakeAdapter.lastResponse!.response.acceptance).toBe('accepted');
    expect(fakeAdapter.lastResponse!.response.resultCode).toBe('OK');
    expect(fakeAdapter.lastResponse!.response.nextStationId).toBe('S02');
    expect(fakeAdapter.lastResponse!.response.parameters).toEqual({
      processingTime: 120,
    });
  });

  it('unsubscribes a handler so it no longer receives events', async () => {
    const handler = jest.fn();

    const unsubscribe: MachineEventUnsubscribe =
      fakeAdapter.onWorkRequested(handler);

    const firstRequest: MachineWorkRequest = {
      requestId: 'REQUEST-001',
      machineId: 'SIMULATOR',
      stationId: 'S01',
      carrierId: 'CARRIER-001',
      timestamp: new Date('2026-07-25T08:00:00.000Z'),
      parameters: {},
    };

    await fakeAdapter.emitWorkRequested(firstRequest);
    expect(handler).toHaveBeenCalledTimes(1);

    unsubscribe();

    const secondRequest: MachineWorkRequest = {
      requestId: 'REQUEST-002',
      machineId: 'SIMULATOR',
      stationId: 'S01',
      carrierId: 'CARRIER-001',
      timestamp: new Date('2026-07-25T08:01:00.000Z'),
      parameters: {},
    };

    await fakeAdapter.emitWorkRequested(secondRequest);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('notifies connection change handlers', async () => {
    const handler = jest.fn();

    fakeAdapter.onConnectionChanged(handler);

    const event: MachineConnectionEvent = {
      machineId: 'SIMULATOR',
      previousState: 'connected',
      newState: 'degraded',
      timestamp: new Date(),
      reason: 'Signal loss',
    };

    fakeAdapter.emitConnectionChanged(event);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        machineId: 'SIMULATOR',
        previousState: 'connected',
        newState: 'degraded',
        reason: 'Signal loss',
      }),
    );
  });

  it('notifies process completed handlers', async () => {
    const handler = jest.fn();

    fakeAdapter.onProcessCompleted(handler);

    const outcome: MachineProcessOutcome = 'success';

    const event: MachineProcessCompletedEvent = {
      machineId: 'SIMULATOR',
      stationId: 'S01',
      carrierId: 'CARRIER-001',
      timestamp: new Date('2026-07-25T08:05:00.000Z'),
      outcome,
      resultData: {
        producedCount: 10,
      },
    };

    await fakeAdapter.emitProcessCompleted(event);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        machineId: 'SIMULATOR',
        stationId: 'S01',
        carrierId: 'CARRIER-001',
        outcome: 'success',
        resultData: {
          producedCount: 10,
        },
      }),
    );
  });
});
