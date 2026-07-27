import { Controller, Get, Post, Body, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ShiftsService } from './shifts.service';
import { Roles } from '../auth/roles.decorator';
import { UserRoleEnum } from '../users/user.entity';
import {
  CompleteProductionBatchDto,
  CreateProductionBatchDto,
  CreateShiftDto,
  FinalizeShiftReportDto,
} from './shifts.dto';

@Controller('shifts')
@ApiTags('Shifts')
@ApiBearerAuth('JWT-auth')
export class ShiftsController {
  constructor(private readonly shiftsService: ShiftsService) {}

  @Get()
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR, UserRoleEnum.VIEWER)
  getAll(@Query('date') date?: string, @Query('type') type?: string) {
    return this.shiftsService.getAllShifts({ date, type });
  }

  @Post()
  @Roles(UserRoleEnum.ADMIN)
  create(@Body() dto: CreateShiftDto) { return this.shiftsService.createShift(dto); }

  @Post(':id/close')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR)
  closeShift(@Param('id', ParseUUIDPipe) id: string) { return this.shiftsService.closeShift(id); }

  @Get('reports')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR, UserRoleEnum.VIEWER)
  getReports(@Query('date') date?: string) {
    if (date) return this.shiftsService.getAllReports({ date });
    return this.shiftsService.getAllReports();
  }

  @Get('reports/:id')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR, UserRoleEnum.VIEWER)
  getReport(@Param('id', ParseUUIDPipe) id: string) { return this.shiftsService.getReport(id); }

  @Post('reports/generate/:shiftId')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR)
  generateReport(@Param('shiftId', ParseUUIDPipe) shiftId: string, @Query('date') date?: string) {
    return this.shiftsService.generateReport(shiftId, date);
  }

  @Post('reports/:id/finalize')
  @Roles(UserRoleEnum.ADMIN)
  finalizeReport(@Param('id', ParseUUIDPipe) id: string, @Body() dto: FinalizeShiftReportDto) {
    return this.shiftsService.finalizeReport(id, dto?.notes);
  }

  @Get('summary/:date')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR, UserRoleEnum.VIEWER)
  getSummary(@Param('date') date: string, @Query('shift_type') shiftType?: 'day' | 'night' | 'swing') {
    return this.shiftsService.getShiftSummary(date, shiftType);
  }

  // --- Production Batches ---

  @Get('batches')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR, UserRoleEnum.VIEWER)
  getBatches(@Query('shift_id') shiftId?: string) {
    return this.shiftsService.getBatches(shiftId);
  }

  @Post('batches')
  @Roles(UserRoleEnum.ADMIN)
  createBatch(@Body() dto: CreateProductionBatchDto) { return this.shiftsService.createBatch(dto); }

  @Post('batches/:id/complete')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR)
  completeBatch(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CompleteProductionBatchDto,
  ) {
    return this.shiftsService.completeBatch(id, dto.completed_quantity);
  }
}
