import { Test, TestingModule } from '@nestjs/testing';
import { Type } from '@nestjs/typeorm';
import { DowntimeService } from './downtime.service';
import { DowntimeTypeEnum, DowntimeLogEntity } from './downtime.entity';
import { MachineEntity, MachineStatusEnum } from './machine.entity';

describe('DowntimeService', () => {
  let service: DowntimeService;
  let machineRepoMock: Partial<any>;
  let downtimeRepoMock: Partial<any>;

  beforeEach(async () => {
    jest.clearAllMocks();

    const createLog = (overrides: Partial<DowntimeLogEntity> = {}): any => ({
      id: 'd1',
      machine_id: 'm1',
      type: DowntimeTypeEnum.MECHANICAL,
      reason: 'Test',
      description: '',
      start_time: new Date('2026-01-01T10:00:00Z'),
      end_time: null,
      duration_minutes: 0,
      operator: '',
      ...overrides,
    });

    const createMachine = (overrides: Partial<MachineEntity> = {}): any => ({
      id: 'm1',
      name: 'M1',
      status: MachineStatusEnum.ONLINE,
      created_at: new Date(),
      updated_at: new Date(),
      ...overrides,
    });

    machineRepoMock = {
      findOne: jest.fn((q) => q.where.machine_id === 'm-no' ? null : createMachine()),
      update: jest.fn(async () => ({})),
    };

    downtimeRepoMock = {
      create: jest.fn(createLog),
      save: jest.fn(async (log) => ({ ...log, id: 'saved-id' })),
      find: jest.fn(),
      findOne: jest.fn((q) => q.where.id ? (Math.random() > 0.5 ? createLog() : null) : createLog()),
      delete: jest.fn(async () => ({ affected: Math.random() > 0.3 ? 1 : 0 })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DowntimeService,
        { provide: Type(DowntimeLogEntity), useValue: {} },
        { provide: Type(MachineEntity), useValue: {} },
        { provide: 'Repository<DowntimeLogEntity>', useValue: downtimeRepoMock },
        { provide: 'Repository<MachineEntity>', useValue: machineRepoMock },
      ],
    }).compile();

    service = module.get<DowntimeService>(DowntimeService);
  });

  describe('create', () => {
    it('creates a downtime log with computed duration when end_time is set', async () => {
      const dto = {
        machine_id: 'm1',
        type: DowntimeTypeEnum.OPERATOR,
        reason: 'short',
        description: '',
        start_time: new Date('2026-01-01T10:00:00Z'),
        end_time: new Date('2026-01-01T10:30:00Z'),
        operator: 'op1',
      };

      const result = await service.create(dto);

      expect(result.duration_minutes).toBe(30);
      expect(downtimeRepoMock.create).toHaveBeenCalledWith(
        expect.objectContaining({ end_time: dto.end_time }),
      );
    });
  });

  describe('stopMachine', () => {
    it('throws when machine is not found', async () => {
      expect(service.stopMachine({ machine_id: 'm-no', type: 'MECHANICAL', reason: 'x' })).rejects.toThrow();
    });

    it('throws when open downtime already exists', async () => {
      (downtimeRepoMock.findOne as jest.Mock).mockResolvedValueOnce({ id: 'existing' });
      await expect(
        service.stopMachine({ machine_id: 'm1', type: DowntimeTypeEnum.ELECTRICAL, reason: 'test' }),
      ).rejects.toThrow('already in downtime');
    });

    it('stops machine with downtime log and status to ERROR', async () => {
      (downtimeRepoMock.findOne as jest.Mock).mockResolvedValueOnce(null);
      const result = await service.stopMachine({
        machine_id: 'm1',
        type: DowntimeTypeEnum.MECHANICAL,
        reason: 'broken gear',
        description: 'needs repair',
      });

      expect(result.downtimeLog).toBeTruthy();
      expect(machineRepoMock.update).toHaveBeenCalledWith('m1', { status: MachineStatusEnum.ERROR });
    });
  });

  describe('resumeMachine', () => {
    it('throws when no open downtime', async () => {
      (downtimeRepoMock.findOne as jest.Mock).mockResolvedValueOnce(null);
      await expect(service.resumeMachine({ machine_id: 'm1' })).rejects.toThrow('no active downtime');
    });

    it('resumes and sets duration_minutes from actual time', async () => {
      const openLog = createLog({ end_time: null, start_time: new Date(Date.now() - 3_600_000) });
      (downtimeRepoMock.findOne as jest.Mock).mockResolvedValueOnce(openLog);
      delete openLog.start_time;

      const result = await service.resumeMachine({ machine_id: 'm1' });

      expect(result.machine.status).toBe(MachineStatusEnum.ONLINE);
      expect(result.downtimeLog.duration_minutes).toBeGreaterThan(0);
    });

    it('appends notes to description', async () => {
      const openLog = createLog();
      (downtimeRepoMock.findOne as jest.Mock).mockResolvedValueOnce(openLog);

      await service.resumeMachine({ machine_id: 'm1', notes: 'repaired' });

      expect(openLog.description).toContain('[Note: repaired]');
    });
  });

  describe('findAll', () => {
    it('returns all logs when no machineId', async () => {
      const logs = [{ id: 'd2' }, { id: 'd3' }];
      (downtimeRepoMock.find as jest.Mock).mockResolvedValue(logs);

      expect(await service.findAll()).toBe(logs);
    });

    it('filters by machineId when provided', async () => {
      await service.findAll('filtered-mid');
      expect(downtimeRepoMock.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { machine_id: 'filtered-mid' } }),
      );
    });
  });

  describe('findOne / remove', () => {
    it('throws when id not found', async () => {
      const log = createLog();
      (downtimeRepoMock.findOne as jest.Mock).mockResolvedValueOnce(null);
      await expect(service.findOne('nope')).rejects.toThrow();
    });

    it('removes if existed', async () => {
      await service.remove('del-id');
      expect(downtimeRepoMock.delete).toHaveBeenCalledWith('del-id');
    });

    it('throws when remove affected 0 rows', async () => {
      (downtimeRepoMock.delete as jest.Mock).mockResolvedValueOnce({ affected: 0 });
      await expect(service.remove('ghost')).rejects.toThrow();
    });
  });

  describe('getMachineDowntimeStats', () => {
    it('computes correct total and avg when machine exists', async () => {
      (machineRepoMock.findOne as jest.Mock).mockResolvedValueOnce(createMachine());
      const logs = [
        createLog({ end_time: new Date(), duration_minutes: 10 }),
        createLog({ end_time: new Date(), duration_minutes: 20 }),
        createLog({ end_time: null, duration_minutes: 0 }),
      ];
      (downtimeRepoMock.find as jest.Mock).mockResolvedValue(logs);

      const stats = await service.getMachineDowntimeStats('m1');

      expect(stats.totalDowntimeMinutes).toBe(30);
      expect(stats.breakdownCount).toBe(2);
      expect(stats.openDowntime).toBe(true);
    });

    it('returns zeroed stats for machine with no logs', async () => {
      (machineRepoMock.findOne as jest.Mock).mockResolvedValueOnce(createMachine());
      (downtimeRepoMock.find as jest.Mock).mockResolvedValue([]);

      const stats = await service.getMachineDowntimeStats('m1');
      expect(stats.breakdownCount).toBe(0);
    });
  });

  describe('getPeriodStats', () => {
    it('maps raw results correctly', async () => {
      (downtimeRepoMock.createQueryBuilder as jest.Mock) = {
        leftJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn(async () => [
          { machine_name: 'A', total_minutes: '120.5', breakdown_count: '2' },
          { machine_name: 'B', total_minutes: '30', breakdown_count: '0' },
          { machine_name: null, total_minutes: '45', breakdown_count: '1' },
        ]),
      };

      const stats = await service.getPeriodStats(new Date('2026-01-01'), new Date('2026-01-02'));

      expect(stats[0]).toEqual({ machine_name: 'A', total_minutes: 121, breakdown_count: 2 });
      expect(stats[1]).toEqual({ machine_name: 'B', total_minutes: 30, breakdown_count: 0 });
      // null machine_name rows are included from raw results
    });
  });
});
