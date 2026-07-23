import { ApiTags, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { UserRoleEnum } from '../users/user.entity';
import { AssignCarrierDto, CreateCarrierDto, UpdateCarrierDto } from './carrier.dto';
import { CarriersService } from './carriers.service';

@Controller('carriers')
export class CarriersController {
  constructor(private readonly carriers: CarriersService) {}

  @Get()
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR, UserRoleEnum.VIEWER)
  findAll() { return this.carriers.findAll(); }

  @Get(':id')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR, UserRoleEnum.VIEWER)
  findOne(@Param('id', ParseUUIDPipe) id: string) { return this.carriers.findOne(id); }

  @Post()
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR)
  create(@Body() dto: CreateCarrierDto) { return this.carriers.create(dto); }

  @Post(':id/assignment')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR)
  assign(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignCarrierDto) { return this.carriers.assign(id, dto); }

  @Patch(':id')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCarrierDto) { return this.carriers.update(id, dto); }

  @Delete(':id')
  @Roles(UserRoleEnum.ADMIN)
  remove(@Param('id', ParseUUIDPipe) id: string) { return this.carriers.remove(id); }
}
