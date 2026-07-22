import { Transform } from 'class-transformer';
import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import type { AlarmSeverity } from './alarm.entity';

export class CreateAlarmDto {
  @Transform(({ value }) => (value || 'info').toLowerCase())
  @IsEnum(['info', 'warning', 'error', 'critical'])
  severity: AlarmSeverity;

  @IsNotEmpty()
  @IsUUID()
  machine_id: string;

  @IsNotEmpty()
  @IsString()
  message: string;

  @IsOptional()
  @IsString()
  source?: string;
}

export class UpdateAlarmDto {
  @IsOptional()
  @IsEnum(['info', 'warning', 'error', 'critical'])
  severity?: AlarmSeverity;

  @IsOptional()
  @IsString()
  message?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  acknowledged_at?: Date;
}
