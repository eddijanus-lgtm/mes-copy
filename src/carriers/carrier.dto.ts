import { IsEnum, IsInt, IsOptional, IsUUID, Min } from 'class-validator';
import { CarrierStatusEnum } from './carrier.entity';

export class CreateCarrierDto {
  @IsInt()
  @Min(1)
  carrier_number: number;
}

export class AssignCarrierDto {
  @IsUUID()
  order_id: string;

  @IsInt()
  @Min(1)
  current_step_no: number;
}

export class UpdateCarrierDto {
  @IsOptional()
  @IsEnum(CarrierStatusEnum)
  status?: CarrierStatusEnum;

  @IsOptional()
  @IsUUID()
  order_id?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  current_step_no?: number;

  @IsOptional()
  @IsInt()
  current_resource_id?: number | null;
}
