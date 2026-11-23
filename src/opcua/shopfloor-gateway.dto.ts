import { IsDefined, IsIn, IsInt, IsNotEmpty, IsString, Max, Min } from 'class-validator';

export class WebshopCheckoutDto {
  @IsIn([1, 2, 4])
  bDeckelfarbe: number;

  @IsInt()
  @Min(0)
  @Max(99)
  uiKugelRot: number;

  @IsInt()
  @Min(0)
  @Max(99)
  uiKugelGruen: number;

  @IsInt()
  @Min(0)
  @Max(99)
  uiKugelBlau: number;
}

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
