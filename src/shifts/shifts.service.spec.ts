import { BadRequestException } from '@nestjs/common';
import { ShiftsService } from './shifts.service';

describe('ShiftsService', () => {
  const batchRepo = {
    findOne: jest.fn(),
    save: jest.fn(async (value) => value),
  };

  let service: ShiftsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ShiftsService(
      {} as any,
      {} as any,
      batchRepo as any,
      {} as any,
      {} as any,
      {} as any,
    );
  });

  it('requires an actual quantity instead of assuming the target was produced', async () => {
    await expect(
      service.completeBatch('batch-1', undefined as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(batchRepo.findOne).not.toHaveBeenCalled();
    expect(batchRepo.save).not.toHaveBeenCalled();
  });

  it('persists the explicitly reported completed quantity', async () => {
    batchRepo.findOne.mockResolvedValue({
      id: 'batch-1',
      target_quantity: 100,
      completed_quantity: 0,
    });

    await expect(service.completeBatch('batch-1', 83)).resolves.toMatchObject({
      completed_quantity: 83,
      finished_at: expect.any(Date),
    });
    expect(batchRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        completed_quantity: 83,
      }),
    );
  });
});
