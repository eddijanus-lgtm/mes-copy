import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { CarrierEntity, CarrierStatusEnum } from './carrier.entity';
import { CarriersService } from './carriers.service';

describe('CarriersService', () => {
  let service: CarriersService;
  let mockSave: jest.Mock;
  let carriersRepo: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    const carrierA = { id: 'c1', carrier_number: 128, status: CarrierStatusEnum.AVAILABLE, order_id: undefined };
    mockSave = jest.fn(async (val: any) => ({ ...carrierA, ...val }));
    carriersRepo = {
      create: jest.fn((v: any) => v),
      save: mockSave,
      find: jest.fn(),
      findOne: jest.fn(),
      remove: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [CarriersService, { provide: getRepositoryToken(CarrierEntity), useValue: carriersRepo }],
    }).compile();
    service = module.get(CarriersService);
  });

  it('should be defined', () => { expect(service).toBeDefined(); });

  describe('create', () => {
    it('creates a carrier', async () => {
      const dto: any = { carrier_number: 130 };
      mockSave.mockResolvedValue({ id: 'c-new', carrier_number: 130, status: CarrierStatusEnum.AVAILABLE });
      const result = await service.create(dto);
      expect(result.carrier_number).toBe(130);
    });
    it('throws BadRequestException for duplicate carrier_number', async () => {
      carriersRepo.findOne.mockResolvedValue({ id: 'c1' } as any);
      await expect(service.create({ carrier_number: 128 } as any)).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('findAll', () => {
    it('returns carriers sorted by carrier_number', async () => {
      carriersRepo.find.mockResolvedValue([{ id: 'c1' }]);
      const result = await service.findAll();
      expect(result).toHaveLength(1);
    });
  });

  describe('findOne', () => {
    it('returns the carrier when found', async () => {
      carriersRepo.findOne.mockResolvedValue({ id: 'c1' } as any);
      const result = await service.findOne('c1');
      expect(result.id).toBe('c1');
    });
    it('throws NotFoundException when not found', async () => {
      carriersRepo.findOne.mockResolvedValue(null);
      await expect(service.findOne('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('assign', () => {
    it('assigns a carrier and updates status to ASSIGNED', async () => {
      carriersRepo.findOne.mockResolvedValue({
        id: 'c1',
        current_resource_id: 5,
        order_id: null,
        status: CarrierStatusEnum.AVAILABLE,
      } as any);
      const dto: any = { order_id: 'o1', current_step_no: 1 };
      const result = await service.assign('c1', dto);
      expect(result.status).toBe(CarrierStatusEnum.ASSIGNED);
      expect(result.current_step_no).toBe(1);
    });
    it('resets current_resource_id on assign', async () => {
      carriersRepo.findOne.mockResolvedValue({
        id: 'c1',
        order_id: null,
        status: CarrierStatusEnum.AVAILABLE,
      } as any);
      const dto: any = { order_id: 'o1' };
      await service.assign('c1', dto);
      const saved = mockSave.mock.calls[0][0];
      expect(saved.current_resource_id).toBe(null);
      expect(saved.order_id).toBe('o1');
    });
    it('rejects a machine-managed carrier that is not physically available', async () => {
      carriersRepo.findOne.mockResolvedValue({
        id: 'c1',
        status: CarrierStatusEnum.AVAILABLE,
        inventory_managed: true,
        physical_state: 'missing',
        rfid_read_valid: true,
        inventory_stale: false,
      } as any);

      await expect(
        service.assign('c1', { order_id: 'o1', current_step_no: 1 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('update', () => {
    it('updates carrier properties', async () => {
      carriersRepo.findOne.mockResolvedValue({ id: 'c1', status: CarrierStatusEnum.AVAILABLE, order_id: null } as any);
      const result = await service.update('c1', { status: CarrierStatusEnum.IN_PROCESS } as any);
      expect((result as CarrierEntity).status).toBe(CarrierStatusEnum.IN_PROCESS);
    });
  });

  describe('remove', () => {
    it('removes carrier when not assigned to an order', async () => {
      carriersRepo.findOne.mockResolvedValue({ id: 'c1', order_id: null } as any);
      await service.remove('c1');
      expect(carriersRepo.remove).toHaveBeenCalledWith(expect.any(Object));
    });
    it('throws when carrier is assigned to an order', async () => {
      carriersRepo.findOne.mockResolvedValue({ id: 'c1', order_id: 'o1' } as any);
      await expect(service.remove('c1')).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
