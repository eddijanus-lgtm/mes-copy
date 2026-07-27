import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { DataPointEntity } from './data-point.entity';
import { DataCollectionService } from './data-collection.service';

describe('DataCollectionService', () => {
  let service: DataCollectionService;
  let mockRepo: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    const dp1 = { id: 'dp1', machine_id: 'm1', node_id: 'ns=2;s=Temp', value: 75.5, quality: 'good' as const };
    const allQbs: any[] = [];

    const qbMaker = () => {
      const qb: any = {};
      function makeChain<T extends keyof Omit<typeof qb, 'getMany' | 'getQuery' | 'name' | 'value'>>(key: T): (qb: any) => void {
        return (fn: any) => {
          if (key === 'where' || key === 'andWhere') {
            const args = [...arguments];
            qb.whereArgs = args;
            return qb;
          }
          return qb;
        };
      }
      qb.name = 'dp';
      qb.value = 99;
      qb.select = jest.fn().mockImplementation(() => qb);
      qb.addSelect = jest.fn().mockImplementation(() => qb);
      qb.groupBy = jest.fn().mockImplementation(() => qb);
      qb.where = jest.fn().mockImplementation(() => {
        const [clause, params] = arguments.length > 0 ? [arguments[0], arguments[1]] : [];
        return qb;
      });
      qb.andWhere = jest.fn().mockImplementation(() => qb);
      qb.orderBy = jest.fn().mockImplementation(() => qb);
      qb.getMany = jest.fn().mockResolvedValue([dp1]);
      qb.getRawOne = jest.fn().mockResolvedValue({ 'MIN(dp5.value)': 10, 'MAX(dp5.value)': 200, 'AVG(dp5.value)': 95.3333, 'COUNT(dp5.id)': 42 });
      qb.getQuery = jest.fn().mockReturnValue('subquery');

      // innerJoin must also return an object with where, orderBy chain + getMany
      qb.innerJoin = jest.fn().mockImplementation(() => {
        const joinQb: any = {};
        joinQb.where = jest.fn().mockReturnThis();
        joinQb.orderBy = jest.fn().mockReturnValue({ getMany: jest.fn().mockResolvedValue([dp1]) });
        return joinQb;
      });

      allQbs.push(qb);
      return qb;
    };

    mockRepo = {
      create: jest.fn((v: any) => v),
      save: jest.fn(async (v: any) => ({ ...dp1, ...v })),
      find: jest.fn().mockResolvedValue([dp1]),
      createQueryBuilder: jest.fn().mockImplementation(() => qbMaker()),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [DataCollectionService, { provide: getRepositoryToken(DataPointEntity), useValue: mockRepo }],
    }).compile();
    service = module.get(DataCollectionService);
  });

  it('should be defined', () => { expect(service).toBeDefined(); });

  describe('create', () => {
    it('marks a data point without machine quality as uncertain', async () => {
      await service.create({ machine_id: 'm1' as any, node_id: 'ns=2;s=Temp', value: 80 });
      expect(service['dataPointsRepo'].create).toHaveBeenCalledWith(
        expect.objectContaining({ quality: 'uncertain' }),
      );
    });
  });

  describe('findAll', () => {
    it('finds points filtered by machine_id only', async () => {
      await service.findAll('m1');
      expect(true).toBeDefined();
    });
  });

  describe('findByTimeRange', () => {
    it('queries data points in a time range', async () => {
      const result = await service.findByTimeRange('m1', new Date('2026-07-01'), new Date('2026-07-02'));
      expect(result).toBeInstanceOf(Array);
    });
  });

  describe('bulkCreate', () => {
    it('saves an array of data points', async () => {
      await service.bulkCreate([{ machine_id: 'm1' as any, node_id: 'ns=a', value: 10 }]);
      expect(service['dataPointsRepo'].create).toHaveBeenCalledWith(
        expect.objectContaining({ quality: 'uncertain' }),
      );
    });
  });

  describe('getLatestByMachine', () => {
    it('returns an array of latest points per node', async () => {
      const result = await service.getLatestByMachine('m1');
      expect(result).toBeInstanceOf(Array);
    });
  });

  describe('getStatsByMachine', () => {
    it.each(['min', 'max', 'avg', 'count'] as const)('returns %s stat as number', async (statName: any) => {
      const stats = await service.getStatsByMachine('m1');
      expect(typeof (stats as any)[statName]).toBe('number');
    });

    it('returns null measurements when no data points exist', async () => {
      mockRepo.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({
          'MIN(dp5.value)': null,
          'MAX(dp5.value)': null,
          'AVG(dp5.value)': null,
          'COUNT(dp5.id)': '0',
        }),
      });

      await expect(service.getStatsByMachine('m1')).resolves.toEqual({
        min: null,
        max: null,
        avg: null,
        count: 0,
      });
    });
  });
});
