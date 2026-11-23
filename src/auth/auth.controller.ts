import { ApiTags, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Body, Controller, Post, Get, Patch, Delete, Param, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { Public } from './public.decorator';
import { RegisterDto } from './dto/register.dto';
import { UpdateUserDto } from './dto/update-user.dto';
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

  @Get('users')
  @Roles(UserRoleEnum.ADMIN)
  async listUsers() {
    return this.authService.findAll();
  }

  @Patch('users/:id')
  @Roles(UserRoleEnum.ADMIN)
  async updateUser(@Param('id') id: string, @Body() body: UpdateUserDto) {
    return this.authService.updateUser(id, body);
  }

  @Delete('users/:id')
  @Roles(UserRoleEnum.ADMIN)
  async deleteUser(@Param('id') id: string) {
    await this.authService.deleteUser(id);
    return { message: 'User deleted' };
  }

}
