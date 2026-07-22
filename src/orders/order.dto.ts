import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateOrderDto {
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
  @IsEnum(['pending', 'in_progress', 'completed', 'cancelled', 'on_hold'])
  status?: 'pending' | 'in_progress' | 'completed' | 'cancelled' | 'on_hold';

  @IsOptional()
  @Min(0)
  @IsInt()
  completed_quantity?: number;

  @IsOptional()
  @IsString()
  error_message?: string;
}
