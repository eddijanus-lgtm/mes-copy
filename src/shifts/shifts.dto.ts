import { IsDateString, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, Min } from 'class-validator';
import type { ShiftType } from './entities';

export class CreateShiftDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEnum(['day', 'night', 'swing'])
  type: ShiftType;

  @Matches(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, {
    message: 'start_time must use HH:mm or HH:mm:ss',
  })
  start_time: string;

  @Matches(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, {
    message: 'end_time must use HH:mm or HH:mm:ss',
  })
  end_time: string;

  @IsOptional()
  @IsString()
  manager_name?: string;

  @IsDateString()
  date: string;
}

export class FinalizeShiftReportDto {
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateProductionBatchDto {
  @IsString()
  @IsNotEmpty()
  shift_name: string;

  @IsUUID()
  order_id: string;

  @IsUUID()
  machine_id: string;

  @IsInt()
  @Min(1)
  target_quantity: number;
}

export class CompleteProductionBatchDto {
  @IsInt()
  @Min(0)
  completed_quantity: number;
}
