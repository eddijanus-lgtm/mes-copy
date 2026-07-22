import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsNotEmpty, IsString, IsEnum, IsOptional, Min } from 'class-validator';

export type MachineStatus = 'online' | 'offline' | 'maintenance' | 'error' | 'idle';

export class CreateMachineDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @Transform(({ value }) => (value || 'offline').toLowerCase())
  @IsEnum(['online', 'offline', 'maintenance', 'error', 'idle'])
  status: MachineStatus;

  @IsOptional()
  @IsString()
  type?: string;

  @IsNotEmpty()
  @IsString()
  location: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsString()
  serial_number?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  resource_id?: number;

  @IsOptional()
  @IsString()
  opcua_endpoint_url?: string;

  @IsOptional()
  @IsString()
  opcua_node_prefix?: string;

  @IsOptional()
  @IsBoolean()
  opcua_enabled?: boolean;
}

export class UpdateMachineDto {
  @IsOptional()
  @IsString()
  name?: string;

  @Transform(({ value }) => (value || 'idle').toLowerCase())
  @IsOptional()
  @IsEnum(['online', 'offline', 'maintenance', 'error', 'idle'])
  status?: MachineStatus;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsString()
  serial_number?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  resource_id?: number;

  @IsOptional()
  @IsString()
  opcua_endpoint_url?: string;

  @IsOptional()
  @IsString()
  opcua_node_prefix?: string;

  @IsOptional()
  @IsBoolean()
  opcua_enabled?: boolean;
}
