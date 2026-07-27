import { DataPointEntity } from '../data-collection/data-point.entity';
import type { MachineAdapter } from '../machines/adapters/machine-adapter.types';
import {
  MachineEntity,
  MachineStatusEnum,
} from '../machines/machine.entity';
import { MachineTelemetryIngestionService } from './machine-telemetry-ingestion.service';
import type { ShopfloorTelemetryEvent } from './shopfloor-telemetry';

const flushPromises = () =>
  new Promise<void>((resolve) => setImmediate(resolve));

describe('MachineTelemetryIngestionService', () => {
  let telemetryCallback: (event: ShopfloorTelemetryEvent) => void;
  let disconnectedCallback: (reason: string) => void;
  let machineAdapter: jest.Mocked<MachineAdapter>;
  let machineRepo: {
    findOne: jest.Mock;
    update: jest.Mock;
  };
  let dataPointRepo: {
    create: jest.Mock;
    save: jest.Mock;
  };
  let service: MachineTelemetryIngestionService;

  const snapshot = (
    roles: Record<string, unknown>,
  ): ShopfloorTelemetryEvent => ({
    type: 'shopfloor.telemetry',
    source: 'opcua',
    timestamp: '2026-07-27T08:00:00.000Z',
    payload: {
      kind: 'station.snapshot',
      resourceId: 1,
      signals: {
        cycleTimeMs: roles.idealCycleTimeMs,
        producedCount: roles.goodCount,
        failedCount: roles.rejectCount,
      },
      roles,
      roleQualities: Object.fromEntries(
        Object.keys(roles).map((role) => [role, 'good']),
      ),
    },
  });

  beforeEach(() => {
    machineAdapter = {
      onTelemetry: jest.fn((callback) => {
        telemetryCallback = callback;
        return jest.fn();
      }),
      onDisconnected: jest.fn((callback) => {
        disconnectedCallback = callback;
        return jest.fn();
      }),
      getStations: jest.fn().mockReturnValue([
        {
          resourceId: 1,
          stationId: 'station-1',
          displayName: 'Station 1',
          enabled: true,
          availableCommands: [],
        },
      ]),
    } as unknown as jest.Mocked<MachineAdapter>;
    machineRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'machine-1',
        resource_id: 1,
      } as MachineEntity),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    dataPointRepo = {
      create: jest.fn((value) => value as DataPointEntity),
      save: jest.fn().mockImplementation(async (value) => value),
    };
    service = new MachineTelemetryIngestionService(
      machineAdapter,
      machineRepo as never,
      dataPointRepo as never,
    );
    service.onModuleInit();
  });

  afterEach(() => service.onModuleDestroy());

  it('persists semantic production metrics and updates the real machine record', async () => {
    telemetryCallback(
      snapshot({
        idealCycleTimeMs: 5000,
        goodCount: 12,
        rejectCount: 2,
      }),
    );
    await flushPromises();

    expect(machineRepo.findOne).toHaveBeenCalledWith({
      where: { resource_id: 1 },
    });
    expect(machineRepo.update).toHaveBeenCalledWith(
      'machine-1',
      expect.objectContaining({
        status: MachineStatusEnum.ONLINE,
        last_heartbeat: new Date('2026-07-27T08:00:00.000Z'),
        telemetry: {
          cycleTimeMs: 5000,
          producedCount: 12,
          failedCount: 2,
        },
      }),
    );
    expect(dataPointRepo.save).toHaveBeenCalledWith([
      expect.objectContaining({
        machine_id: 'machine-1',
        node_id: 'production.idealCycleTimeMs',
        value: 5000,
      }),
      expect.objectContaining({
        machine_id: 'machine-1',
        node_id: 'production.goodCount',
        value: 12,
      }),
      expect.objectContaining({
        machine_id: 'machine-1',
        node_id: 'production.rejectCount',
        value: 2,
      }),
    ]);
  });

  it('stores counters only when the machine value changes', async () => {
    const first = snapshot({
      idealCycleTimeMs: 5000,
      goodCount: 12,
      rejectCount: 2,
    });
    telemetryCallback(first);
    await flushPromises();
    telemetryCallback(first);
    await flushPromises();

    expect(dataPointRepo.save).toHaveBeenCalledTimes(1);

    telemetryCallback(
      snapshot({
        idealCycleTimeMs: 5000,
        goodCount: 13,
        rejectCount: 2,
      }),
    );
    await flushPromises();

    expect(dataPointRepo.save).toHaveBeenCalledTimes(2);
    expect(dataPointRepo.save.mock.calls[1][0]).toEqual([
      expect.objectContaining({
        node_id: 'production.goodCount',
        value: 13,
      }),
    ]);
  });

  it('persists a quality change even when the machine value is unchanged', async () => {
    const event = snapshot({
      idealCycleTimeMs: 5000,
      goodCount: 12,
      rejectCount: 2,
    });
    event.payload.roleQualities = {
      idealCycleTimeMs: 'uncertain',
      goodCount: 'uncertain',
      rejectCount: 'uncertain',
    };
    telemetryCallback(event);
    await flushPromises();

    event.payload.roleQualities = {
      idealCycleTimeMs: 'good',
      goodCount: 'good',
      rejectCount: 'good',
    };
    telemetryCallback(event);
    await flushPromises();

    expect(dataPointRepo.save).toHaveBeenCalledTimes(2);
    expect(dataPointRepo.save.mock.calls[0][0]).toEqual([
      expect.objectContaining({ quality: 'uncertain' }),
      expect.objectContaining({ quality: 'uncertain' }),
      expect.objectContaining({ quality: 'uncertain' }),
    ]);
    expect(dataPointRepo.save.mock.calls[1][0]).toEqual([
      expect.objectContaining({ quality: 'good' }),
      expect.objectContaining({ quality: 'good' }),
      expect.objectContaining({ quality: 'good' }),
    ]);
  });

  it('marks adapter stations offline after a connection loss', async () => {
    disconnectedCallback('connection lost');
    await flushPromises();

    expect(machineRepo.update).toHaveBeenCalledWith(
      { resource_id: 1 },
      { status: MachineStatusEnum.OFFLINE },
    );
  });
});
