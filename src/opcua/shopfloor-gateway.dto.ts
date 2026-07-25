import { ArrayMinSize, IsArray, IsDefined, IsNotEmpty, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class OpcUaReadDto {
  @IsString()
  @IsNotEmpty()
  nodeId: string;
}

export class MqttPublishDto {
  @IsString()
  @IsNotEmpty()
  topic: string;

  @IsDefined()
  payload: unknown;
}

export class OpCUaControlCommandDto {
  @IsString()
  @IsNotEmpty()
  nodeId: string;

  @IsString()
  @IsNotEmpty()
  dataType: string;

  @IsDefined()
  value: unknown;
}

export class MachineControlDto {
  @IsNotEmpty()
  resourceId: number;

  @IsNotEmpty()
  command: 'start' | 'stop' | 'reset' | 'pause';
}

export class OpcUaWriteItemDto {
  @IsString()
  @IsNotEmpty()
  address: string;

  @IsString()
  @IsNotEmpty()
  dataType: string;

  @IsDefined()
  value: unknown;
}

export class OpcUaWriteDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OpcUaWriteItemDto)
  @ArrayMinSize(1)
  writes: OpcUaWriteItemDto[];
}
