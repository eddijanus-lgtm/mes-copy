import { Controller, Get, Post, Patch, Delete, Body, Param, HttpCode, HttpStatus, ParseUUIDPipe } from '@nestjs/common';
import { AlarmsService } from './alarms.service';
import { CreateAlarmDto, UpdateAlarmDto } from './alarm.dto';
import { Roles } from '../auth/roles.decorator';
import { UserRoleEnum } from '../users/user.entity';

@Controller('alarms')
export class AlarmsController {
  constructor(private readonly alarmsService: AlarmsService) {}

  @Post()
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR)
  create(@Body() dto: CreateAlarmDto) { return this.alarmsService.create(dto); }

  @Get()
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR, UserRoleEnum.VIEWER)
  findAll() { return this.alarmsService.findAll(); }

  @Get('stats/active-count')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR, UserRoleEnum.VIEWER)
  getActiveAlarmCount() { return this.alarmsService.setActiveCount(); }

  @Get(':id')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR, UserRoleEnum.VIEWER)
  findOne(@Param('id', ParseUUIDPipe) id: string) { return this.alarmsService.findOne(id); }

  @Patch(':id')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAlarmDto) { return this.alarmsService.update(id, dto); }

  @Post(':id/acknowledge')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR)
  @HttpCode(HttpStatus.OK)
  acknowledge(@Param('id', ParseUUIDPipe) id: string) { return this.alarmsService.acknowledge(id); }

  @Delete(':id')
  @Roles(UserRoleEnum.ADMIN)
  remove(@Param('id', ParseUUIDPipe) id: string) { return this.alarmsService.remove(id); }
}
