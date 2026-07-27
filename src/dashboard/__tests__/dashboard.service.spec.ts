import { Test, TestingModule } from '@nestjs/testing';
import { DashboardService } from '../dashboard.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { OrderEntity } from '../../orders/order.entity';
import {
  MachineEntity,
  MachineStatusEnum,
} from '../../machines/machine.entity';
import { DowntimeLogEntity } from '../../machines/downtime.entity';
import { DataPointEntity } from '../../data-collection/data-point.entity';
import { TimescaleAggregateService } from '../timescale-aggregate.service';

// Mock repository factory
const createMockRepo = () => ({
  createQueryBuilder: jest.fn(),
  count: jest.fn().mockResolvedValue(0),
  query: jest.fn().mockResolvedValue([]),
});

describe('DashboardService', () => {
  let service: DashboardService;
  const mockOrderRepo = createMockRepo();
  const mockMachineRepo = createMockRepo();
  const mockDowntimeRepo = createMockRepo();
  const mockDataPointRepo = createMockRepo();
  const mockAggregateService = {
    getQualityCountsFromAggregate: jest.fn().mockResolvedValue(null),
    initializeContinuousAggregates: jest.fn().mockResolvedValue({ success: true, details: [] }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: getRepositoryToken(OrderEntity), useValue: mockOrderRepo },
        { provide: getRepositoryToken(MachineEntity), useValue: mockMachineRepo },
        { provide: getRepositoryToken(DowntimeLogEntity), useValue: mockDowntimeRepo },
        { provide: getRepositoryToken(DataPointEntity), useValue: mockDataPointRepo },
        { provide: TimescaleAggregateService, useValue: mockAggregateService },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getKpis', () => {
    beforeEach(() => {
      mockMachineRepo.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      });
      
      mockOrderRepo.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({
          target_quantity: 100,
          completed_quantity: 80,
          completed_orders: 2,
          active_orders: 3,
        }),
      });

      mockDowntimeRepo.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({
          total_minutes: 30,
          event_count: 5,
        }),
      });

      mockDataPointRepo.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({
          good_count: 90,
          bad_count: 10,
        }),
      });

      mockMachineRepo.count = jest.fn().mockResolvedValue(3);
    });

    it('should return KPIs with correct structure', async () => {
      const result = await service.getKpis();
      
      expect(result).toHaveProperty('oee');
      expect(result).toHaveProperty('throughput');
      expect(result).toHaveProperty('yield');
      expect(result).toHaveProperty('machines');
      expect(result).toHaveProperty('orders');
    });

    it('does not invent unavailable OEE components', async () => {
      const result = await service.getKpis();

      expect(result.oee.availability).toBeNull();
      expect(result.oee.performance).toBeNull();
      expect(result.oee.quality).toBeNull();
      expect(result.oee.total).toBeNull();
      expect(result.oee.available).toBe(false);
      expect(result.oee.missingInputs).toEqual([
        'idealCycleTime',
        'goodCount',
        'rejectCount',
      ]);
    });

    it('should return throughput data', async () => {
      const result = await service.getKpis();
      
      expect(result.throughput.completedQuantity).toBe(80);
      expect(result.throughput.completedOrders).toBe(2);
      expect(typeof result.throughput.unitsPerHour).toBe('number');
    });

    it('should return machines status', async () => {
      const result = await service.getKpis();
      
      expect(result.machines.total).toBeDefined();
      expect(Array.isArray(result.machines.status)).toBe(false); // It's an object
    });

    it('should handle range parameters', async () => {
      const from = new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString();
      const to = new Date().toISOString();
      const result = await service.getKpis(from, to);
      
      expect(result.range.from).toBeDefined();
      expect(result.range.to).toBeDefined();
    });

    it('reports OPC UA sample quality separately from product quality', async () => {
      mockAggregateService.getQualityCountsFromAggregate.mockResolvedValueOnce({ good_count: 45, bad_count: 5, uncertain_count: 0 });

      const result = await service.getKpis();

      expect(result.yield).toBeNull();
      expect(result.telemetrySignalQuality.percent).toBe(90);
      expect(result.oee.quality).toBeNull();
      expect(mockAggregateService.getQualityCountsFromAggregate).toHaveBeenCalled();
    });

    it('calculates OEE from machine counters received through telemetry', async () => {
      const from = '2026-07-27T00:00:00.000Z';
      const firstSample = '2026-07-27T08:00:00.000Z';
      const to = '2026-07-27T08:00:10.000Z';
      mockMachineRepo.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest
          .fn()
          .mockResolvedValue([
            { status: MachineStatusEnum.ONLINE, count: '1' },
          ]),
      });
      mockDowntimeRepo.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({
          total_minutes: 0,
          event_count: 0,
        }),
      });
      mockDataPointRepo.query.mockResolvedValueOnce([
        {
          machine_id: 'machine-1',
          node_id: 'production.idealCycleTimeMs',
          value: 1000,
          quality: 'good',
          timestamp: firstSample,
        },
        {
          machine_id: 'machine-1',
          node_id: 'production.goodCount',
          value: 20,
          quality: 'good',
          timestamp: firstSample,
        },
        {
          machine_id: 'machine-1',
          node_id: 'production.goodCount',
          value: 29,
          quality: 'good',
          timestamp: to,
        },
        {
          machine_id: 'machine-1',
          node_id: 'production.rejectCount',
          value: 2,
          quality: 'good',
          timestamp: firstSample,
        },
        {
          machine_id: 'machine-1',
          node_id: 'production.rejectCount',
          value: 3,
          quality: 'good',
          timestamp: to,
        },
      ]);

      const result = await service.getKpis(from, to);

      expect(result.oee).toMatchObject({
        availability: 100,
        performance: 100,
        quality: 90,
        total: 90,
        available: true,
        missingInputs: [],
        productionCounts: { good: 9, reject: 1 },
      });
      expect(result.yield).toBe(90);
    });

    it('uses a decreased cumulative counter as a new baseline after a reset', () => {
      const counterDelta = (
        service as unknown as {
          counterDelta: (
            samples: Array<{
              machine_id: string;
              node_id: string;
              value: number;
              timestamp: string;
            }>,
          ) => number;
        }
      ).counterDelta.bind(service);

      expect(
        counterDelta([
          {
            machine_id: 'machine-1',
            node_id: 'production.goodCount',
            value: 100,
            timestamp: '2026-07-27T08:00:00.000Z',
          },
          {
            machine_id: 'machine-1',
            node_id: 'production.goodCount',
            value: 104,
            timestamp: '2026-07-27T08:01:00.000Z',
          },
          {
            machine_id: 'machine-1',
            node_id: 'production.goodCount',
            value: 2,
            timestamp: '2026-07-27T08:02:00.000Z',
          },
          {
            machine_id: 'machine-1',
            node_id: 'production.goodCount',
            value: 5,
            timestamp: '2026-07-27T08:03:00.000Z',
          },
        ]),
      ).toBe(7);
    });
  });

  it('preserves a measured downtime availability of zero percent', async () => {
    jest
      .spyOn(service as any, 'downtimeParetoByMachine')
      .mockResolvedValue([
        {
          machine_id: 'machine-1',
          machine_name: 'Press',
          downtime_minutes: '60',
          event_count: '1',
          availability_pct: '0',
        },
      ]);

    const result = await service.getDowntimePareto(
      '2026-07-27T08:00:00.000Z',
      '2026-07-27T09:00:00.000Z',
    );

    expect(result.data[0].availability_pct).toBe(0);
  });
});
