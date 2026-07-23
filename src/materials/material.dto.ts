import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsUUID } from 'class-validator';
import { MaterialTypeEnum } from './material.entity';

export class CreateMaterialDto {
  @IsNotEmpty()
  name: string;

  @IsOptional()
  description?: string;

  @IsEnum(MaterialTypeEnum)
  type: MaterialTypeEnum;

  @IsNumber()
  @IsOptional()
  unit_price?: number;

  @IsOptional()
  unit?: string;

  @IsInt()
  @IsOptional()
  stock_quantity?: number;

  @IsNumber()
  @IsOptional()
  minimum_stock?: number;

  @IsOptional()
  supplier?: string;

  @IsOptional()
  sku?: string;
}

export class RegisterConsumptionDto {
  @IsUUID()
  material_id: string;

  @IsUUID()
  order_id: string;

  @IsInt()
  quantity: number;

  @IsNumber()
  unit_price: number;

  @IsOptional()
  notes?: string;
}
