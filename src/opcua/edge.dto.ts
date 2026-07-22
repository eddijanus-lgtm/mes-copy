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
