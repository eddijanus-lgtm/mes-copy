import { NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { AlarmEntity } from './alarm.entity';
import type { FindAllFilters } from './alarms.service';
import { AlarmsService } from './alarms.service';

describe('AlarmsService', () => {
  let service: AlarmsService;
  let mockRepo: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    const alarmA = { id: 'a1', severity: 'warning' as AlarmEntity['severity'], machine_id: 'm1', message: 'Pressure high', acknowledged: false, source: 'sensor-1', created_at: new Date('2026-07-01') };
    const alarmB = { id: 'a2', severity: 'error' as AlarmEntity['severity'], machine_id: 'm2', message: 'Motor fault', acknowledged: true, acknowledged_at: new Date(), source: null, created_at: new Date('2026-07-02') };
    mockRepo = {
      create: jest.fn((v: any) => v),
      save: jest.fn(async (v: any) => ({ ...alarmA, ...v })),
      find: jest.fn().mockResolvedValue([alarmA]),
      findOne: jest.fn(),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
      count: jest.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [AlarmsService, { provide: getRepositoryToken(AlarmEntity), useValue: mockRepo }],
    }).compile();
    service = module.get(AlarmsService);
  });

  it('should be defined', () => { expect(service).toBeDefined(); });

  describe('create', () => {
    it.each([['info' as any], ['warning'], ['error'], ['critical']])('creates an alarm with severity %s', async (sev) => {
      await service.create({ severity: sev, machine_id: 'm1', message: 'test' });
      expect(mockRepo.create).toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it.each([['no filters'], ['acknowledged filter'], ['severity filter'], ['machine_id filter']])('returns all alarms (%s)', async (_label) => {
      mockRepo.find.mockResolvedValue([{ id: 'a1' }]);
      const labelToFilters: Record<string, any> = {
        'acknowledged filter': { acknowledged: false },
        'severity filter': { severity: 'error' as AlarmEntity['severity'] },
        'machine_id filter': { machine_id: 'm3' },
      };
      const filters = labelToFilters[_label];
      const result = filters ? await service.findAll(filters) : await service.findAll();
      expect(result).toHaveLength(1);
    });
  });

  describe('findOne', () => {
    it('returns found alarm', async () => {
      mockRepo.findOne.mockResolvedValue({ id: 'a1' });
      const result = await service.findOne('a1');
      expect(result.id).toBe('a1');
    });
    it('throws when not found', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      await expect(service.findOne('x')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('update', () => {
    it('updates message and saves', async () => {
      mockRepo.findOne.mockResolvedValue({ id: 'a1', message: 'old', created_at: new Date() } as any);
      await service.update('a1', { message: 'new' } as any);
      expect(mockRepo.save).toHaveBeenCalled();
    });
  });

  describe('acknowledge', () => {
    it('returns updated alarm', async () => {
      mockRepo.findOne.mockResolvedValue({ id: 'a1', message: 't', created_at: new Date() } as any);
      const result = await service.acknowledge('a1');
      expect((result as AlarmEntity).acknowledged).toBe(true);
    });
  });

  describe('remove', () => {
    it('deletes alarm when found', async () => {
      mockRepo.findOne.mockResolvedValue({ id: 'a1', created_at: new Date() } as any);
      await service.remove('a1');
      expect(mockRepo.delete).toHaveBeenCalledWith('a1');
    });
  });

  describe('exportCsv', () => {
    it('returns CSV with headers and rows', async () => {
      mockRepo.find.mockResolvedValue([{ id: 'a1', severity: 'warning' as AlarmEntity['severity'], machine_id: 'm1', message: 'test', acknowledged: false, created_at: new Date('2026-07-01') }]);
      const csv = await service.exportCsv();
      expect(csv.split('\n').length).toBeGreaterThan(1);
      expect(csv).toContain('Severity');
      expect(csv).toContain('test');
    });
  });

  describe('setActiveCount', () => {
    it('returns count of unacknowledged alarms', async () => {
      mockRepo.count.mockResolvedValue(7);
      const result = await service.setActiveCount();
      expect(result).toBe(7);
    });
  });
});
