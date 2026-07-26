import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Roles } from '../auth/roles.decorator';
import { UserRoleEnum } from '../users/user.entity';
import { DowntimeService } from './downtime.service';
import { ResumeMachineBodyDto, StopMachineDto } from './downtime.dto';
import {
  CreateMachineDto,
  DowntimePeriodQueryDto,
  ImportMachinesCsvDto,
  UpdateMachineDto,
} from './machine.dto';
import { MachinesService } from './machines.service';

@Controller('machines')
@ApiTags('Machines')
@ApiBearerAuth('JWT-auth')
export class MachinesController {
  constructor(
    private readonly machinesService: MachinesService,
    private readonly downtimeService: DowntimeService,
  ) {}

  @Post()
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR)
  create(@Body() dto: CreateMachineDto) {
    return this.machinesService.create(dto);
  }

  @Get()
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR, UserRoleEnum.VIEWER)
  findAll() {
    return this.machinesService.findAll();
  }

  @Get('online')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR, UserRoleEnum.VIEWER)
  findOnline() {
    return this.machinesService.findOnline();
  }

  @Get('location/:location')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR, UserRoleEnum.VIEWER)
  findByLocation(@Param('location') location: string) {
    return this.machinesService.findByLocation(location);
  }

  @Get('template/csv')
  @ApiProduces('text/csv')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR, UserRoleEnum.VIEWER)
  downloadTemplateCsv(@Res() res: Response) {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="machines-template.csv"');
    res.send(this.machinesService.generateCsvTemplate());
  }

  @Post('import/csv')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR)
  @HttpCode(HttpStatus.OK)
  importCsv(@Body() dto: ImportMachinesCsvDto) {
    return this.machinesService.importFromCsv(dto.content);
  }

  @Post('downtime/stop')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR)
  stopDowntime(@Body() dto: StopMachineDto) {
    return this.downtimeService.stopMachine(dto);
  }

  @Post('downtime/resume/:machineId')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR)
  resumeDowntime(
    @Param('machineId', ParseUUIDPipe) machineId: string,
    @Body() dto: ResumeMachineBodyDto,
  ) {
    return this.downtimeService.resumeMachine({ ...dto, machine_id: machineId });
  }

  @Get('downtime')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR, UserRoleEnum.VIEWER)
  findAllDowntime(@Query('machine_id', new ParseUUIDPipe({ optional: true })) machineId?: string) {
    return this.downtimeService.findAll(machineId);
  }

  @Get('downtime/stats/period')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR, UserRoleEnum.VIEWER)
  getPeriodDowntime(@Query() query: DowntimePeriodQueryDto) {
    const startDate = new Date(query.start_date);
    const endDate = new Date(query.end_date);
    if (startDate > endDate) {
      throw new BadRequestException('start_date must be before or equal to end_date');
    }
    return this.downtimeService.getPeriodStats(startDate, endDate);
  }

  @Get('downtime/stats/:machineId')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR, UserRoleEnum.VIEWER)
  getDowntimeStats(@Param('machineId', ParseUUIDPipe) machineId: string) {
    return this.downtimeService.getMachineDowntimeStats(machineId);
  }

  @Delete('downtime/:id')
  @Roles(UserRoleEnum.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  removeDowntimeLog(@Param('id', ParseUUIDPipe) id: string) {
    return this.downtimeService.remove(id);
  }

  @Patch(':id/heartbeat')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR)
  updateHeartbeat(@Param('id', ParseUUIDPipe) id: string) {
    return this.machinesService.updateHeartbeat(id);
  }

  @Get(':id')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR, UserRoleEnum.VIEWER)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.machinesService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateMachineDto) {
    return this.machinesService.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRoleEnum.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.machinesService.remove(id);
  }
}
