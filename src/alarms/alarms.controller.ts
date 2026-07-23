import { ApiTags, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Controller, Get, Post, Patch, Delete, Body, Param, HttpCode, HttpStatus, Query, Req, Res, ParseUUIDPipe } from '@nestjs/common';
import { AlarmsService } from './alarms.service';
import { CreateAlarmDto, UpdateAlarmDto } from './alarm.dto';
import { Roles } from '../auth/roles.decorator';
import { UserRoleEnum } from '../users/user.entity';
import type { Request, Response } from 'express';

@Controller('alarms')
export class AlarmsController {
  constructor(private readonly alarmsService: AlarmsService) {}

  @Post()
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR)
  create(@Body() dto: CreateAlarmDto) { return this.alarmsService.create(dto); }

  @Get()
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR, UserRoleEnum.VIEWER)
  findAll(
    @Query('acknowledged') acknowledged?: string,
    @Query('severity') severity?: string,
    @Query('machine_id') machineId?: string,
  ) {
    return this.alarmsService.findAll({
      acknowledged: acknowledged ? acknowledged === 'true' : undefined,
      severity: severity || undefined,
      machine_id: machineId || undefined,
    });
  }

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

  @Post('bulk/acknowledge')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR)
  @HttpCode(HttpStatus.OK)
  bulkAcknowledge(@Body() ids: string[]) { return this.alarmsService.bulkAcknowledge(ids); }

  @Delete('bulk')
  @Roles(UserRoleEnum.ADMIN)
  bulkRemove(@Body() ids: string[]) { return this.alarmsService.bulkRemove(ids); }

  @Get('export/csv')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR, UserRoleEnum.VIEWER)
  exportCsv(@Query('acknowledged') acknowledged?: string, @Query('severity') severity?: string, @Query('machine_id') machineId?: string) {
    return this.alarmsService.exportCsv({
      acknowledged: acknowledged ? acknowledged === 'true' : undefined,
      severity: severity || undefined,
      machine_id: machineId || undefined,
    });
  }
}
