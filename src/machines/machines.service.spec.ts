import { ConflictException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { MachineEntity, MachineStatusEnum } from './machine.entity';
import { MachinesService } from './machines.service';

describe('MachinesService', () => {
  let service: MachinesService;
  const machinesRepo = {
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => ({ id: value.id || 'machine-1', ...value })),
    find: jest.fn(),
    findOne: jest.fn(),
    delete: jest.fn(),
    update: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MachinesService,
        { provide: getRepositoryToken(MachineEntity), useValue: machinesRepo },
      ],
    }).compile();

    service = module.get(MachinesService);
  });

  it('creates a machine with default telemetry and opcua_enabled false', async () => {
    const result = await service.create({ name: 'Station 1', location: 'Hall A', status: MachineStatusEnum.ONLINE } as any);

    expect(result).toMatchObject({ name: 'Station 1', telemetry: {}, opcua_enabled: false });
  });

  it('finds machines sorted by name', async () => {
    machinesRepo.find.mockResolvedValue([]);

    await service.findAll();
    expect(machinesRepo.find).toHaveBeenCalledWith({ order: { name: 'ASC' } });
  });

  it('throws when machine is missing', async () => {
    machinesRepo.findOne.mockResolvedValue(null);

    await expect(service.findOne('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updates a machine and saves it', async () => {
    machinesRepo.findOne.mockResolvedValue({ id: 'm1', name: 'Old', location: 'A' });

    await expect(service.update('m1', { name: 'New', type: 'PLC' } as any)).resolves.toMatchObject({ name: 'New', type: 'PLC' });
  });

  it('keeps profile-managed stations read-only in the database API', async () => {
    machinesRepo.findOne.mockResolvedValue({
      id: 'profile-station',
      profile_managed: true,
    });

    await expect(
      service.update('profile-station', { name: 'Changed' } as any),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(service.remove('profile-station')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('throws when deleting a missing machine', async () => {
    machinesRepo.findOne.mockResolvedValue(null);
    machinesRepo.delete.mockResolvedValue({ affected: 0 });

    await expect(service.remove('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updates heartbeat and reloads the machine', async () => {
    machinesRepo.findOne.mockResolvedValue({ id: 'm1' });

    await service.updateHeartbeat('m1');

    expect(machinesRepo.update).toHaveBeenCalledWith('m1', { last_heartbeat: expect.any(Date) });
  });

  it('queries online, location and OPC UA stations', async () => {
    machinesRepo.find.mockResolvedValue([]);

    await service.findOnline();
    expect(machinesRepo.find).toHaveBeenCalledWith({ where: { status: MachineStatusEnum.ONLINE }, order: { name: 'ASC' } });

    await service.findByLocation('Hall A');
    expect(machinesRepo.find).toHaveBeenCalledWith({ where: { location: 'Hall A' }, order: { name: 'ASC' } });

    await service.findOpcUaStations();
    expect(machinesRepo.find).toHaveBeenCalledWith({ where: { opcua_enabled: true }, order: { resource_id: 'ASC' } });
  });

  it('generates a CSV template', () => {
    expect(service.generateCsvTemplate()).toContain('name,type,status,location');
  });

  it('imports CSV rows and reports validation errors', async () => {
    const csv = [
      'name,type,status,location,model,serial_number,resource_id,opcua_endpoint_url,opcua_node_prefix,opcua_enabled',
      'Station-1,CNC,online,Halle A,M800,SN001,1,opc.tcp://localhost:26598,,true',
      'Broken,CNC,online,,,,,,,,',
    ].join('\n');

    const result = await service.importFromCsv(csv);

    expect(result.imported).toBe(1);
    expect(result.errors).toHaveLength(1);
  });
});
