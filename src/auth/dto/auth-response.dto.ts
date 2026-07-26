import { ApiProperty } from '@nestjs/swagger';

export class AccessTokenDto {
  @ApiProperty({
    description: 'Kurzlebiges JWT für den Authorization-Header',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  access_token: string;
}

export class UserCreatedDto {
  @ApiProperty({ example: 'User created successfully' })
  message: string;
}
