import { NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { Repository } from 'typeorm';
import { TraceEntity } from './trace.entity';
import { TracesService } from './traces.service';

describe('TracesService', () => {
  let service: TracesService;
  const trace1: Partial<TraceEntity> = { id: 't1', machine_id: 'm1', order_id: 'o1', category: 'process_data' as any, key_data_point: 'temperature', value: 75.5 };
  const tracesRepo = {
    create: jest.fn((val) => val),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TracesService,
        { provide: getRepositoryToken(TraceEntity), useValue: tracesRepo },
      ],
    }).compile();
    service = module.get(TracesService);
  });

  it('should be defined', () => { expect(service).toBeDefined(); });

  describe('create', () => {
    it('creates a trace', async () => {
      tracesRepo.create.mockReturnValue(trace1);
      tracesRepo.save.mockResolvedValue(trace1);
      const dto: any = { machine_id: 'm1', order_id: 'o1', category: 'quality' as any, key_data_point: 'dimension', value: 99.2 };
      await service.create(dto);
      expect(tracesRepo.create).toHaveBeenCalledWith(expect.objectContaining({ category: 'quality' }));
    });
  });

  describe('findAll', () => {
    it('returns traces sorted by collected_at DESC', async () => {
      tracesRepo.find.mockResolvedValue([trace1]);
      const result = await service.findAll();
      expect(result).toHaveLength(1);
      expect(tracesRepo.find).toHaveBeenCalledWith({ order: { collected_at: 'DESC' }, take: 500 });
    });
  });

  describe('findAllWithFilters', () => {
    it('filters by all criteria', async () => {
      const mockQb: any = { where: jest.fn().mockReturnThis(), andWhere: jest.fn().mockReturnThis() };
      let chainCallCount = 0;
      mockQb.orderBy = jest.fn().mockImplementation(() => ({
        limit: jest.fn().mockImplementation(() => ({ getMany: jest.fn().mockResolvedValue([]) })),
      }));
      tracesRepo.createQueryBuilder.mockReturnValue(mockQb);
      await service.findAllWithFilters({ machine_id: 'm1' as any, category: 'process_data' as any, key_data_point: 'temp', min_value: 0, max_value: 100 } as any);
      expect(mockQb.where).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('returns trace when found', async () => {
      tracesRepo.findOne.mockResolvedValue(trace1);
      await expect(service.findOne('t1')).resolves.toBe(trace1);
    });
    it('throws NotFoundException when missing', async () => {
      tracesRepo.findOne.mockResolvedValue(null);
      await expect(service.findOne('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('getTracesByMachine', () => {
    it('returns traces for a machine ordered by collected_at DESC', async () => {
      tracesRepo.find.mockResolvedValue([trace1]);
      const result = await service.getTracesByMachine('m1');
      expect(result).toHaveLength(1);
      expect(tracesRepo.find).toHaveBeenCalledWith({ where: { machine_id: 'm1' }, order: { collected_at: 'DESC' }, take: 100 });
    });
    it('respects custom take parameter', async () => {
      tracesRepo.find.mockResolvedValue([]);
      await service.getTracesByMachine('m2', 50);
      expect(tracesRepo.find).toHaveBeenCalledWith(expect.objectContaining({ take: 50 }));
    });
  });

  describe('getTracesByOrder', () => {
    it('returns traces for an order ascending', async () => {
      tracesRepo.find.mockResolvedValue([trace1]);
      const result = await service.getTracesByOrder('o1');
      expect(result).toHaveLength(1);
      expect(tracesRepo.find).toHaveBeenCalledWith({ where: { order_id: 'o1' }, order: { collected_at: 'ASC' }, take: 100 });
    });
  });

  describe('getTracesByCategory', () => {
    it.each([
      ['process_data', 'process_data'],
      ['quality', 'quality'],
      ['material', 'material'],
      ['energy', 'energy'],
      ['op_input', 'op_input'],
    ])('returns traces for category: %s', async (_cat) => {
      const cat = _cat as 'process_data' | 'quality' | 'material' | 'energy' | 'op_input';
      tracesRepo.find.mockResolvedValue([trace1]);
      await service.getTracesByCategory(cat);
      expect(tracesRepo.find).toHaveBeenCalledWith(expect.objectContaining({ where: { category: cat } }));
    });
  });

  describe('bulkCreate', () => {
    it('saves an array of traces', async () => {
      tracesRepo.create.mockReturnValue(trace1);
      const dtos = [
        { machine_id: 'm1' as any, category: 'process_data' as any, key_data_point: 'a', value: 1 },
        { machine_id: 'm2' as any, category: 'quality' as any, key_data_point: 'b', value: 2 },
      ];
      tracesRepo.save.mockResolvedValue([trace1]);
      const result = await service.bulkCreate(dtos as any[]);
      expect(tracesRepo.save).toHaveBeenCalledWith(expect.any(Array));
    });
  });
});
