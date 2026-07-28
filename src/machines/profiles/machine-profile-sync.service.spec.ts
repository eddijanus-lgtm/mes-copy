import {
  EquipmentLevelEnum,
  ExecutionModelEnum,
  JobInterfaceEnum,
  MachineEntity,
  MachineStatusEnum,
} from '../machine.entity';
import { MachineProfileSyncService } from './machine-profile-sync.service';
import { MachineProfileService } from './machine-profile.service';

describe('MachineProfileSyncService', () => {
  it('takes stations from the previous profile offline during a profile switch', async () => {
    const previousStation = {
      resource_id: 1,
      profile_managed: true,
      status: MachineStatusEnum.ONLINE,
      opcua_enabled: true,
      routing_enabled: true,
      telemetry: { acceptedParts: 42 },
    } as MachineEntity;
    const currentStation = {
      resource_id: 71,
      profile_managed: true,
      status: MachineStatusEnum.OFFLINE,
    } as MachineEntity;
    const profiles = {
      getProfile: jest.fn(() => ({
        machineId: 'nova-nx9000',
        stations: [
          {
            resourceId: 71,
            displayName: 'NX-9000 Press Cell',
            enabled: true,
            metadata: {
              machineType: 'servo_press',
              location: 'Press Hall',
            },
          },
        ],
      })),
    };
    const machines = {
      find: jest.fn().mockResolvedValue([previousStation, currentStation]),
      findOne: jest.fn().mockResolvedValue(currentStation),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
    };
    const service = new MachineProfileSyncService(
      profiles as unknown as MachineProfileService,
      machines as never,
    );

    await service.onApplicationBootstrap();

    expect(previousStation).toMatchObject({
      status: MachineStatusEnum.OFFLINE,
      opcua_enabled: false,
      routing_enabled: false,
      telemetry: {},
    });
    expect(machines.save).toHaveBeenCalledWith(previousStation);
    expect(currentStation).toMatchObject({
      name: 'NX-9000 Press Cell',
      status: MachineStatusEnum.OFFLINE,
      opcua_enabled: true,
      profile_managed: true,
      routing_enabled: false,
      equipment_level: EquipmentLevelEnum.WORK_UNIT,
      execution_model: ExecutionModelEnum.WORK_UNIT_JOBS,
      job_interface: JobInterfaceEnum.TELEMETRY_ONLY,
      parent_resource_id: null,
      capabilities: [],
    });
  });

  it('maps neutral equipment hierarchy and job metadata from the profile', async () => {
    const root = {
      resource_id: 70,
      profile_managed: true,
      status: MachineStatusEnum.OFFLINE,
    } as MachineEntity;
    const workUnit = {
      resource_id: 71,
      profile_managed: true,
      status: MachineStatusEnum.OFFLINE,
    } as MachineEntity;
    const profiles = {
      getProfile: jest.fn(() => ({
        machineId: 'profile-machine',
        stations: [
          {
            resourceId: 70,
            displayName: 'Machine',
            enabled: true,
            equipmentLevel: 'machine',
            executionModel: 'work_unit_jobs',
            jobInterface: 'telemetry_only',
            capabilities: ['control', 'telemetry'],
          },
          {
            resourceId: 71,
            parentResourceId: 70,
            displayName: 'Work unit',
            enabled: true,
            equipmentLevel: 'work_unit',
            executionModel: 'work_unit_jobs',
            jobInterface: 'signal_handshake',
            capabilities: ['production', 'routing'],
            routing: {
              sequence: 1,
              operationNo: 710,
              operation: 'Process material',
            },
          },
        ],
      })),
    };
    const machines = {
      find: jest.fn().mockResolvedValue([root, workUnit]),
      findOne: jest
        .fn()
        .mockImplementation(({ where: { resource_id } }) =>
          Promise.resolve(resource_id === 70 ? root : workUnit),
        ),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
    };
    const service = new MachineProfileSyncService(
      profiles as unknown as MachineProfileService,
      machines as never,
    );

    await service.onApplicationBootstrap();

    expect(root).toMatchObject({
      resource_id: 70,
      parent_resource_id: null,
      equipment_level: EquipmentLevelEnum.MACHINE,
      routing_enabled: false,
      job_interface: JobInterfaceEnum.TELEMETRY_ONLY,
      capabilities: ['control', 'telemetry'],
    });
    expect(workUnit).toMatchObject({
      resource_id: 71,
      parent_resource_id: 70,
      equipment_level: EquipmentLevelEnum.WORK_UNIT,
      routing_enabled: true,
      job_interface: JobInterfaceEnum.SIGNAL_HANDSHAKE,
      capabilities: ['production', 'routing'],
    });
  });

  it('marks a handshake station routable without a legacy route sequence', async () => {
    const station = {
      resource_id: 30,
      profile_managed: true,
      status: MachineStatusEnum.OFFLINE,
    } as MachineEntity;
    const profiles = {
      getProfile: jest.fn(() => ({
        machineId: 'learning-factory',
        stations: [
          {
            resourceId: 30,
            displayName: 'Press 01',
            enabled: true,
            jobInterface: 'signal_handshake',
            capabilities: ['production', 'routing', 'telemetry'],
          },
        ],
      })),
    };
    const machines = {
      find: jest.fn().mockResolvedValue([station]),
      findOne: jest.fn().mockResolvedValue(station),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
    };
    const service = new MachineProfileSyncService(
      profiles as unknown as MachineProfileService,
      machines as never,
    );

    await service.onApplicationBootstrap();

    expect(station).toMatchObject({
      resource_id: 30,
      routing_enabled: true,
      route_sequence: null,
      operation_no: null,
      job_interface: JobInterfaceEnum.SIGNAL_HANDSHAKE,
    });
  });
});
