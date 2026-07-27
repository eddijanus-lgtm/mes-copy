import {
  IsArray,
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class SaveMachineProfileDto {
  @IsObject()
  document: Record<string, unknown>;

  @IsOptional()
  @IsString()
  changeSummary?: string;
}

export class ActivateMachineProfileDto {
  @IsString()
  confirmation: string;

  @IsOptional()
  @IsBoolean()
  confirmControl?: boolean;
}

export class BrowseMachineProfileDto {
  @IsOptional()
  @IsString()
  nodeId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  maxNodes?: number;
}

export class AddStationDto {
  @IsObject()
  station: Record<string, unknown>;
}

export class ReplaceSignalsDto {
  @IsArray()
  signals: Record<string, unknown>[];
}
