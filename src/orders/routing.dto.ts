import { Type } from 'class-transformer';
import { IsArray, IsInt, IsObject, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

export class RouteStepDto {
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

export class ReplaceOrderRouteDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RouteStepDto)
  steps: RouteStepDto[];
}
