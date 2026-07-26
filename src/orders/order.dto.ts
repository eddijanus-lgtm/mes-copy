import { Type } from 'class-transformer';
import { IsArray, IsDate, IsEnum, IsInt, IsNotEmpty, IsObject, IsOptional, IsString, IsUUID, Min, ValidateNested } from 'class-validator';

export class CreateOrderRouteStepDto {
  @IsInt()
  @Min(1)
  step_no: number;

  @IsInt()
  @Min(1)
  resource_id: number;

  @IsInt()
  @Min(1)
  operation_no: number;

  @IsString()
  operation: string;

  @IsOptional()
  @IsObject()
  parameters?: Record<string, number>;
}

export class CreateOrderDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @Min(1)
  @IsInt()
  priority: number;

  @IsUUID()
  machine_id: string;

  @IsOptional()
  @IsUUID()
  product_id?: string;

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

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderRouteStepDto)
  route_steps?: CreateOrderRouteStepDto[];

  @IsOptional()
  @IsObject()
  production_parameters?: Record<string, number>;
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
  @IsUUID()
  product_id?: string;

  @IsOptional()
  @IsNotEmpty()
  @IsString()
  operation?: string;

  @IsOptional()
  @Min(1)
  @IsInt()
  quantity?: number;

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
