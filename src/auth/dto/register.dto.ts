import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { UserRoleEnum } from '../../users/user.entity';

export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  username: string;

  @IsString()
  password: string;

  @IsEnum(UserRoleEnum)
  role: UserRoleEnum;
}
