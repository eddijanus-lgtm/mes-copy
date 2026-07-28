import { Transform } from 'class-transformer';
import { IsBoolean, IsDateString, IsInt, IsNotEmpty, IsString, IsEnum, IsOptional, Min } from 'class-validator';
import {
  EquipmentLevelEnum,
  ExecutionModelEnum,
  JobInterfaceEnum,
  MachineStatusEnum,
} from './machine.entity';

export type MachineStatus = 'online' | 'offline' | 'maintenance' | 'error' | 'idle';

export const MACHINE_CSV_HEADERS = ['name', 'type', 'status', 'location', 'model', 'serial_number', 'resource_id', 'parent_resource_id', 'equipment_level', 'execution_model', 'job_interface', 'opcua_endpoint_url', 'opcua_node_prefix', 'opcua_enabled'];

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
  @IsInt()
  @Min(1)
  resource_id?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  parent_resource_id?: number;

  @IsOptional()
  @IsEnum(EquipmentLevelEnum)
  equipment_level?: EquipmentLevelEnum;

  @IsOptional()
  @IsEnum(ExecutionModelEnum)
  execution_model?: ExecutionModelEnum;

  @IsOptional()
  @IsEnum(JobInterfaceEnum)
  job_interface?: JobInterfaceEnum;

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
  @IsInt()
  @Min(1)
  resource_id?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  parent_resource_id?: number;

  @IsOptional()
  @IsEnum(EquipmentLevelEnum)
  equipment_level?: EquipmentLevelEnum;

  @IsOptional()
  @IsEnum(ExecutionModelEnum)
  execution_model?: ExecutionModelEnum;

  @IsOptional()
  @IsEnum(JobInterfaceEnum)
  job_interface?: JobInterfaceEnum;

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

export class ImportMachinesCsvDto {
  @IsString()
  @IsNotEmpty()
  content: string;
}

export class DowntimePeriodQueryDto {
  @IsDateString()
  start_date: string;

  @IsDateString()
  end_date: string;
}
