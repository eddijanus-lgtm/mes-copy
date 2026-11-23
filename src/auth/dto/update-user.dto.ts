import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { UserRoleEnum } from '../../users/user.entity';

export class UpdateUserDto {
  @IsString()
  @IsOptional()
  username?: string;

  @IsString()
  @MinLength(8)
  @IsOptional()
  password?: string;

  @IsEnum(UserRoleEnum)
  @IsOptional()
  role?: UserRoleEnum;
}
