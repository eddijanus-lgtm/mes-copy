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
  current_step_no = 1;
}

export class UpdateCarrierDto {
  @IsOptional()
  @IsEnum(CarrierStatusEnum)
  status?: CarrierStatusEnum;
}
