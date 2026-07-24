import { IsOptional, IsEnum, IsNotEmpty, IsString, IsBoolean, IsArray } from 'class-validator';
import type { NotificationChannel, AlertRuleStatus } from './entities';

export class CreateNotificationChannelDto {
  @IsEnum(['email', 'push', 'mqtt', 'websocket'])
  channel: NotificationChannel;

  @IsBoolean()
  enabled: boolean;

  @IsOptional()
  @IsString()
  config?: string;
}

export class CreateAlertRuleDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsOptional()
  @IsEnum(['info', 'warning', 'error', 'critical'])
  severity?: 'info' | 'warning' | 'error' | 'critical';

  @IsOptional()
  @IsString()
  machine_id?: string;

  @IsNotEmpty()
  @IsString()
  condition: string;

  @IsNotEmpty()
  @IsString()
  message_template: string;

  @IsOptional()
  @IsArray()
  @IsEnum(['email', 'push', 'mqtt', 'websocket'], { each: true })
  channels?: NotificationChannel[];

  @IsOptional()
  config?: Record<string, any>;
}

export class UpdateAlertRuleDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(['info', 'warning', 'error', 'critical'])
  severity?: 'info' | 'warning' | 'error' | 'critical';

  @IsOptional()
  @IsString()
  machine_id?: string;

  @IsOptional()
  @IsString()
  condition?: string;

  @IsOptional()
  @IsString()
  message_template?: string;

  @IsOptional()
  @IsArray()
  @IsEnum(['email', 'push', 'mqtt', 'websocket'], { each: true })
  channels?: NotificationChannel[];

  @IsOptional()
  is_active?: boolean;

  @IsOptional()
  config?: Record<string, any>;
}
