import { IsEnum, IsNotEmpty, IsString, MinLength } from 'class-validator';
import { UserRoleEnum } from '../../users/user.entity';

export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  username: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsEnum(UserRoleEnum)
  role: UserRoleEnum;
}
