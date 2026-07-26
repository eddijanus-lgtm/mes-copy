import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ApiErrorDto {
  @ApiProperty({ example: 400 })
  statusCode: number;

  @ApiProperty({ example: 'Bad Request' })
  error: string;

  @ApiProperty({
    oneOf: [
      { type: 'string', example: 'Validation failed' },
      { type: 'array', items: { type: 'string' }, example: ['name must be a string'] },
    ],
  })
  message: string | string[];

  @ApiProperty({ example: '/api/v1/orders' })
  path: string;

  @ApiProperty({ format: 'date-time', example: '2026-07-26T14:00:00.000Z' })
  timestamp: string;

  @ApiPropertyOptional({ format: 'uuid' })
  requestId?: string;
}
