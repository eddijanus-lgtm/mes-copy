import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/roles.decorator';
import { UserRoleEnum } from './user.entity';
import { UserFileEntry, UsersService } from './users.service';

class UpdateUserDto {
  username?: string;
  password?: string;
  role?: string;
}

@Controller('users')
@ApiTags('Users')
@ApiBearerAuth('JWT-auth')
@Roles(UserRoleEnum.ADMIN)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  findAll(): UserFileEntry[] {
    return this.usersService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string): UserFileEntry | undefined {
    return this.usersService.findOne(id);
  }

  @Put(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateUserDto,
  ): Promise<UserFileEntry> {
    return this.usersService.updateUser(id, body);
  }

  @Delete(':id')
  delete(@Param('id', ParseUUIDPipe) id: string): Promise<{ message: string }> {
    return this.usersService.deleteUser(id);
  }
}
