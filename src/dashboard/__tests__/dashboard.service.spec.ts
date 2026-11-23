import { Test, TestingModule } from '@nestjs/testing';
import { DashboardService } from '../dashboard.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { OrderEntity } from '../../orders/order.entity';
import { MachineEntity } from '../../machines/machine.entity';
import { DowntimeLogEntity } from '../../machines/downtime.entity';
import { DataPointEntity } from '../../data-collection/data-point.entity';
import { TimescaleAggregateService } from '../timescale-aggregate.service';

// Mock repository factory
const createMockRepo = () => ({
  createQueryBuilder: jest.fn(),
  count: jest.fn().mockResolvedValue(0),
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

    it('should calculate OEE values between 0 and 100', async () => {
      const result = await service.getKpis();
      
      expect(result.oee.availability).toBeGreaterThanOrEqual(0);
      expect(result.oee.availability).toBeLessThanOrEqual(100);
      expect(result.oee.performance).toBeGreaterThanOrEqual(0);
      expect(result.oee.performance).toBeLessThanOrEqual(100);
      expect(result.oee.quality).toBeGreaterThanOrEqual(0);
      expect(result.oee.quality).toBeLessThanOrEqual(100);
      expect(result.oee.total).toBeGreaterThanOrEqual(0);
      expect(result.oee.total).toBeLessThanOrEqual(100);
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

    it('should use aggregate quality counts when available', async () => {
      mockAggregateService.getQualityCountsFromAggregate.mockResolvedValueOnce({ good_count: 45, bad_count: 5, uncertain_count: 0 });

      const result = await service.getKpis();

      expect(result.yield).toBe(90);
      expect(mockAggregateService.getQualityCountsFromAggregate).toHaveBeenCalled();
    });
  });
});
