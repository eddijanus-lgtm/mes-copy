import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { MaterialEntity, MaterialTypeEnum } from './material.entity';
import { MaterialConsumptionEntity } from './material-consumption.entity';
import { MaterialsService } from './materials.service';

describe('MaterialsService', () => {
  let service: MaterialsService;
  let mockMaterials: any;
  let mockConsumption: any;

  function makeMockRepos() {
    const matA = { id: 'mat1', name: 'Steel Rod', type: MaterialTypeEnum.RAW, unit_price: 25, stock_quantity: 100, created_at: new Date(), updated_at: new Date() };
    return {
      materials: {
        create: jest.fn((v: any) => v),
        save: jest.fn(async (v: any) => ({ ...matA, ...v })),
        find: jest.fn(),
        findOne: jest.fn(),
        delete: jest.fn().mockResolvedValue({ affected: 1 }),
        count: jest.fn(),
      },
      consumption: {
        create: jest.fn((v: any) => v),
        save: jest.fn(async (v: any) => ({ ...v })),
        find: jest.fn(),
      },
    };
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    const repos = makeMockRepos();
    mockMaterials = repos.materials;
    mockConsumption = repos.consumption;
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MaterialsService,
        { provide: getRepositoryToken(MaterialEntity), useValue: repos.materials },
        { provide: getRepositoryToken(MaterialConsumptionEntity), useValue: repos.consumption },
      ],
    }).compile();
    service = module.get(MaterialsService);
  });

  it('should be defined', () => { expect(service).toBeDefined(); });

  describe('create', () => {
    it('creates a material entity and saves it', async () => {
      mockMaterials.create.mockReturnValue({});
      mockMaterials.save.mockResolvedValue({ id: 'mat-new' });
      await service.create({ name: 'Steel Pipe', type: MaterialTypeEnum.RAW } as any);
      expect(mockMaterials.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Steel Pipe', type: MaterialTypeEnum.RAW }));
    });
  });

  describe('findAll', () => {
    it('returns all materials sorted by id DESC', async () => {
      mockMaterials.find.mockResolvedValue([{ id: 'mat1' }]);
      const result = await service.findAll();
      expect(result).toHaveLength(1);
      expect(mockMaterials.find).toHaveBeenLastCalledWith({ order: { id: 'DESC' } });
    });
  });

  describe('findOne', () => {
    it('returns material when found', async () => {
      mockMaterials.findOne.mockResolvedValue({ id: 'mat1' });
      const result = await service.findOne('mat1');
      expect(result.id).toBe('mat1');
    });
    it('throws NotFoundException when not found', async () => {
      mockMaterials.findOne.mockResolvedValue(null);
      await expect(service.findOne('x')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('update', () => {
    it('updates material fields and saves', async () => {
      mockMaterials.findOne.mockResolvedValue({ id: 'mat1', name: 'Old' } as any);
      const result = await service.update('mat1', { name: 'New' } as any);
      expect((result as MaterialEntity).name).toBe('New');
    });
  });

  describe('remove', () => {
    it('deletes when found', async () => {
      mockMaterials.findOne.mockResolvedValue({ id: 'mat1', name: 't' } as any);
      await service.remove('mat1');
      expect(mockMaterials.delete).toHaveBeenCalledWith('mat1');
    });
    it('throws when not found', async () => {
      mockMaterials.findOne.mockResolvedValue(null);
      (service['materialsRepo'].delete as jest.Mock).mockResolvedValueOnce({ affected: 0 } as any);
      await expect(service.remove('x')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('searchByName', () => {
    it('filters by name only', async () => {
      mockMaterials.find.mockResolvedValue([{ id: 'mat1' }]);
      await service.searchByName('Steel');
      expect(mockMaterials.find).toHaveBeenLastCalledWith({ where: { name: 'Steel' } });
    });
  });

  describe('findLowStock', () => {
    it('returns all materials (empty where)', async () => {
      mockMaterials.find.mockResolvedValue([{ id: 'mat1' }, { id: 'mat2' }]);
      const result = await service.findLowStock();
      expect(result).toHaveLength(2);
      expect(mockMaterials.find).toHaveBeenLastCalledWith({ where: {} });
    });
  });

  describe('registerConsumption', () => {
    it('registers and deducts stock', async () => {
      mockMaterials.findOne.mockResolvedValue({ id: 'mat1', name: 'Steel Rod', unit_price: 25, stock_quantity: 100 } as any);
      await service.registerConsumption({ material_id: 'mat1', order_id: 'o1', quantity: 5, unit_price: 25, notes: 'test' });
      expect(mockMaterials.save).toHaveBeenCalledWith(expect.objectContaining({ stock_quantity: 95 }));
    });
    it('throws when material not found', async () => {
      mockMaterials.findOne.mockResolvedValue(null);
      await expect(service.registerConsumption({ material_id: 'x', order_id: 'o1', quantity: 5, unit_price: 25 } as any)).rejects.toBeInstanceOf(NotFoundException);
    });
    it('throws when insufficient stock', async () => {
      mockMaterials.findOne.mockResolvedValue({ id: 'mat1', name: 'Steel', unit_price: 25, stock_quantity: 2 } as any);
      await expect(service.registerConsumption({ material_id: 'mat1', order_id: 'o1', quantity: 5, unit_price: 25 } as any)).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('getConsumptionByOrder', () => {
    it('returns consumption lines for a given order', async () => {
      mockConsumption.find.mockResolvedValue([{ id: 'c1', quantity: 5 } as MaterialConsumptionEntity]);
      const result = await service.getConsumptionByOrder('o1');
      expect(result).toHaveLength(1);
    });
  });

  describe('getTotalConsumptionForOrder', () => {
    it('aggregates total cost and items', async () => {
      mockConsumption.find.mockResolvedValue([{ id: 'c1', material_id: 'mat1', quantity: 5, total_cost: 125 } as any]);
      mockMaterials.findOne.mockResolvedValue({ name: 'Steel Rod' });
      const result = await service.getTotalConsumptionForOrder('o1');
      expect(result.totalCost).toBe(125);
    });
  });
});
