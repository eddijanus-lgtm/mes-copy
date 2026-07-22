import { Controller, Get, Post, Patch, Delete, Body, Param } from '@nestjs/common';
import { MachinesService } from './machines.service';
import { CreateMachineDto, UpdateMachineDto } from './machine.dto';
import { Roles } from '../auth/roles.decorator';
import { UserRoleEnum } from '../users/user.entity';

@Controller('machines')
export class MachinesController {
  constructor(private readonly machinesService: MachinesService) {}

  @Post()
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR)
  create(@Body() dto: CreateMachineDto) { return this.machinesService.create(dto); }

  @Get()
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR, UserRoleEnum.VIEWER)
  findAll() { return this.machinesService.findAll(); }

  @Get('online')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR, UserRoleEnum.VIEWER)
  findOnline() { return this.machinesService.findOnline(); }

  @Get(':id')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR, UserRoleEnum.VIEWER)
  findOne(@Param('id') id: string) { return this.machinesService.findOne(id); }

  @Patch(':id')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR)
  update(@Param('id') id: string, @Body() dto: UpdateMachineDto) { return this.machinesService.update(id, dto); }

  @Delete(':id')
  @Roles(UserRoleEnum.ADMIN)
  remove(@Param('id') id: string) { return this.machinesService.remove(id); }

  @Patch(':id/heartbeat')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR)
  updateHeartbeat(@Param('id') id: string) { return this.machinesService.updateHeartbeat(id); }

  @Get('location/:location')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR, UserRoleEnum.VIEWER)
  findByLocation(@Param('location') location: string) { return this.machinesService.findByLocation(location); }
}
