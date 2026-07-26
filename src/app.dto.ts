import { ApiProperty } from '@nestjs/swagger';

export class ApiInfoDto {
  @ApiProperty({ example: 'WARA MES – Shopfloor Gateway API' })
  name: string;

  @ApiProperty({ example: 'v1' })
  version: string;

  @ApiProperty({ example: 'ok' })
  status: string;

  @ApiProperty({ example: '/api/docs' })
  documentation: string;

  @ApiProperty({ example: '/api/docs/openapi.json' })
  openapi: string;
}
