import { Transform } from 'class-transformer';
import { IsDefined, IsEnum, IsInt, IsNotEmpty, IsObject, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export type TraceCategoryType = 'process_data' | 'quality' | 'material' | 'energy' | 'op_input';

export class CreateTraceDto {
  @IsNotEmpty()
  @IsUUID()
  machine_id: string;

  @IsOptional()
  @IsUUID()
  order_id?: string;

  @IsNotEmpty()
  @IsEnum(['process_data', 'quality', 'material', 'energy', 'op_input'])
  category: TraceCategoryType;

  @IsNotEmpty()
  @IsString()
  key_data_point: string;

  @IsDefined()
  value: any;

  @IsOptional()
  @IsObject()
  tags?: Record<string, string>;
}

export class TraceQueryDto {
  @IsOptional()
  @IsUUID()
  machine_id?: string;

  @IsOptional()
  @IsEnum(['process_data', 'quality', 'material', 'energy', 'op_input'])
  category?: TraceCategoryType;
}

export class TraceTakeQueryDto {
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(500)
  take?: number;
}
