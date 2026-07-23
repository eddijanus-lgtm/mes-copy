import { IsDefined, IsNotEmpty, IsString } from 'class-validator';

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
