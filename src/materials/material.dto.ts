import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { PartialType } from '@nestjs/swagger';
import { MaterialTypeEnum } from './material.entity';

export class CreateMaterialDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(MaterialTypeEnum)
  type: MaterialTypeEnum;

  @IsNumber()
  @Min(0)
  @IsOptional()
  unit_price?: number;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  stock_quantity?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  minimum_stock?: number;

  @IsOptional()
  @IsString()
  supplier?: string;

  @IsOptional()
  @IsString()
  sku?: string;
}

export class UpdateMaterialDto extends PartialType(CreateMaterialDto) {}

export class RegisterConsumptionDto {
  @IsUUID()
  material_id: string;

  @IsUUID()
  order_id: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsNumber()
  @Min(0)
  unit_price: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
