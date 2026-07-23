import { ApiTags, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Body, Controller, Post, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { Public } from './public.decorator';
import { RegisterDto } from './dto/register.dto';
import { Roles } from './roles.decorator';
import { UserRoleEnum } from '../users/user.entity';
import { Throttle } from '@nestjs/throttler';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async login(@Body() body: LoginDto) {
    const user = await this.authService.validateUser(body.username, body.password);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return this.authService.login(user);
  }

  @Post('register')
  @Roles(UserRoleEnum.ADMIN)
  async register(@Body() body: RegisterDto) {
    return this.authService.register(body);
  }

}
