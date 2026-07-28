import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsInt, IsNotEmpty, IsObject, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

export class ProductRouteStepDto {
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
  @IsNotEmpty()
  operation: string;

  @IsOptional()
  @IsObject()
  parameters?: Record<string, number>;
}

export class ProductParameterDefinitionDto {
  @IsString()
  @IsNotEmpty()
  key: string;

  @IsString()
  @IsNotEmpty()
  label: string;

  @IsIn(['number', 'select'])
  type: 'number' | 'select';

  @IsOptional()
  @IsInt()
  default_value?: number;

  @IsOptional()
  @IsInt()
  min_value?: number;

  @IsOptional()
  @IsInt()
  max_value?: number;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsString()
  material_id?: string;

  @IsOptional()
  @IsArray()
  options?: Array<{ label: string; value: number; material_id?: string }>;
}

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  part_no: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  profile_machine_id: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductParameterDefinitionDto)
  parameter_definitions?: ProductParameterDefinitionDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductRouteStepDto)
  route_steps: ProductRouteStepDto[];
}

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  part_no?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  profile_machine_id?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductParameterDefinitionDto)
  parameter_definitions?: ProductParameterDefinitionDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductRouteStepDto)
  route_steps?: ProductRouteStepDto[];
}
