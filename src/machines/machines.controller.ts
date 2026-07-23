import { ApiTags, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Controller, Get, Post, Patch, Delete, Body, Param, Req, Res, UseInterceptors, HttpCode, HttpStatus } from '@nestjs/common';
import { MachinesService } from './machines.service';
import { CreateMachineDto, UpdateMachineDto } from './machine.dto';
import { Roles } from '../auth/roles.decorator';
import { UserRoleEnum } from '../users/user.entity';
import type { Request, Response } from 'express';

import { DowntimeService } from './downtime.service';
import { CreateDowntimeDto, StopMachineDto, ResumeMachineDto } from './downtime.dto';

@Controller('machines')
export class MachinesController {
  constructor(
    private readonly machinesService: MachinesService,
    private readonly downtimeService: DowntimeService,
  ) {}

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

  @Get('template/csv')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR, UserRoleEnum.VIEWER)
  downloadTemplateCsv(@Res() res: Response) {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="machines-template.csv"');
    res.send(this.machinesService.generateCsvTemplate());
  }

  @Post('import/csv')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR)
  @HttpCode(HttpStatus.OK)
  async importCsv(@Body('content') content: string) {
    if (!content || typeof content !== 'string') throw new Error('Invalid CSV content');
    return this.machinesService.importFromCsv(content);
  }

  @Post('downtime/stop')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR)
  stopDowntime(@Body() dto: StopMachineDto) { return this.downtimeService.stopMachine(dto); }

  @Post('downtime/resume/:machine_id')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR)
  resumeDowntime(
    @Param('machine_id') machineId: string,
    @Body() dto: ResumeMachineDto,
  ) { return this.downtimeService.resumeMachine({ ...dto, machine_id: machineId }); }

  @Get('downtime')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR, UserRoleEnum.VIEWER)
  findAllDowntime(
    @Param('machine_id') machineId?: string,
  ) { return this.downtimeService.findAll(machineId); }

  @Get('downtime/stats/:machine_id')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR, UserRoleEnum.VIEWER)
  getDowntimeStats(@Param('machine_id') machineId: string) {
    return this.downtimeService.getMachineDowntimeStats(machineId);
  }

  @Get('downtime/stats/period')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR, UserRoleEnum.VIEWER)
  getPeriodDowntime(
    @Param('start_date') startDate: string,
    @Param('end_date') endDate: string,
  ) { return this.downtimeService.getPeriodStats(new Date(startDate), new Date(endDate)); }

  @Delete('downtime/:id')
  @Roles(UserRoleEnum.ADMIN)
  removeDowntimeLog(@Param('id') id: string) { return this.downtimeService.remove(id); }
}
