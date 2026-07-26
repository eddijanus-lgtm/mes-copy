import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { DowntimeTypeEnum } from './downtime.entity';

export class CreateDowntimeDto {
  @IsNotEmpty()
  @IsUUID()
  machine_id: string;
  type: DowntimeTypeEnum;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsDate()
  @Type(() => Date)
  start_time: Date;

  @IsOptional()
  @IsDate()
  @Type(() => Date)
  end_time?: Date;

  @IsOptional()
  @IsString()
  operator?: string;
}

export class StopMachineDto {
  @IsNotEmpty()
  @IsUUID()
  machine_id: string;

  @IsEnum(DowntimeTypeEnum)
  type: DowntimeTypeEnum;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class ResumeMachineDto {
  @IsNotEmpty()
  @IsUUID()
  machine_id: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class ResumeMachineBodyDto {
  @IsOptional()
  @IsString()
  notes?: string;
}
