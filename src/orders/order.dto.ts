import { Type } from 'class-transformer';
import { ArrayUnique, IsArray, IsBoolean, IsDate, IsEnum, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateOrderDto {
  @IsOptional()
  @IsBoolean()
  skip_first_station?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  @IsIn([1, 2, 3], { each: true })
  skipped_station_ids?: number[];
  @IsNotEmpty()
  @IsString()
  name: string;

  @Min(1)
  @IsInt()
  priority: number;

  @IsUUID()
  machine_id: string;

  @IsNotEmpty()
  @IsString()
  operation: string;

  @Min(1)
  @IsInt()
  quantity: number;

  @IsOptional()
  @Min(0)
  @IsInt()
  red_balls?: number;

  @IsOptional()
  @Min(0)
  @IsInt()
  green_balls?: number;

  @IsOptional()
  @Min(0)
  @IsInt()
  blue_balls?: number;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  start_time?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  target_complete_time?: Date;
}

export class UpdateOrderDto {
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  name?: string;

  @IsOptional()
  @Min(1)
  @IsInt()
  priority?: number;

  @IsOptional()
  @IsUUID()
  machine_id?: string;

  @IsOptional()
  @IsNotEmpty()
  @IsString()
  operation?: string;

  @IsOptional()
  @Min(1)
  @IsInt()
  quantity?: number;

  @IsOptional()
  @Min(0)
  @IsInt()
  red_balls?: number;

  @IsOptional()
  @Min(0)
  @IsInt()
  green_balls?: number;

  @IsOptional()
  @Min(0)
  @IsInt()
  blue_balls?: number;

  @IsOptional()
  @IsEnum(['pending', 'in_progress', 'completed', 'cancelled', 'on_hold'])
  status?: 'pending' | 'in_progress' | 'completed' | 'cancelled' | 'on_hold';

  @IsOptional()
  @Min(0)
  @IsInt()
  completed_quantity?: number;

  @IsOptional()
  @IsString()
  error_message?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  start_time?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  target_complete_time?: Date;
}
