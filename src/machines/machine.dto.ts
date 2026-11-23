import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsNotEmpty, IsString, IsEnum, IsOptional, IsUUID, Min, Max } from 'class-validator';
import { MachineStatusEnum } from './machine.entity';

export type MachineStatus = 'online' | 'offline' | 'maintenance' | 'error' | 'idle';

export const MACHINE_CSV_HEADERS = ['name', 'type', 'status', 'location', 'model', 'serial_number', 'resource_id', 'opcua_endpoint_url', 'opcua_node_prefix', 'opcua_enabled'];

export class CreateMachineDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @Transform(({ value }) => (value || 'offline').toLowerCase())
  @IsEnum(MachineStatusEnum)
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
  @IsBoolean()
  is_machine?: boolean;

  @IsOptional()
  @IsUUID()
  parent_machine_id?: string;

  @IsOptional()
  @IsString()
  ip_address?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  connection_port?: number;

  @IsOptional()
  @IsString()
  connection_protocol?: string;

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
  @IsEnum(MachineStatusEnum)
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
  @IsBoolean()
  is_machine?: boolean;

  @IsOptional()
  @IsUUID()
  parent_machine_id?: string;

  @IsOptional()
  @IsString()
  ip_address?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  connection_port?: number;

  @IsOptional()
  @IsString()
  connection_protocol?: string;

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
