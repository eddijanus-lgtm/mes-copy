import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ShiftsService } from './shifts.service';
import { Roles } from '../auth/roles.decorator';
import { UserRoleEnum } from '../users/user.entity';

@Controller('shifts')
@ApiTags('Shifts')
export class ShiftsController {
  constructor(private readonly shiftsService: ShiftsService) {}

  @Get()
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR, UserRoleEnum.VIEWER)
  getAll(@Query('date') date?: string, @Query('type') type?: string) {
    return this.shiftsService.getAllShifts({ date, type });
  }

  @Post()
  @Roles(UserRoleEnum.ADMIN)
  create(@Body() dto: any) { return this.shiftsService.createShift(dto); }

  @Post(':id/close')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR)
  closeShift(@Param('id') id: string) { return this.shiftsService.closeShift(id); }

  @Get('reports')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR, UserRoleEnum.VIEWER)
  getReports(@Query('date') date?: string) {
    if (date) return this.shiftsService.getAllReports({ date });
    return this.shiftsService.getAllReports();
  }

  @Get('reports/:id')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR, UserRoleEnum.VIEWER)
  getReport(@Param('id') id: string) { return this.shiftsService.getReport(id); }

  @Post('reports/generate/:shiftId')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR)
  generateReport(@Param('shiftId') shiftId: string, @Query('date') date?: string) {
    return this.shiftsService.generateReport(shiftId, date);
  }

  @Post('reports/:id/finalize')
  @Roles(UserRoleEnum.ADMIN)
  finalizeReport(@Param('id') id: string, @Body() dto?: any) {
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
    if (shiftId) return this.shiftsService['batchRepo'].find({ where: { id: shiftId?.startsWith('/') ? undefined : shiftId } });
    return this.shiftsService['batchRepo'].find({ order: { created_at: 'DESC' } });
  }

  @Post('batches')
  @Roles(UserRoleEnum.ADMIN)
  createBatch(@Body() dto: any) { return this.shiftsService.createBatch(dto); }

  @Post('batches/:id/complete')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR)
  completeBatch(@Param('id') id: string, @Body() dto?: any) { 
    return this.shiftsService.completeBatch(id, dto?.completed_quantity); 
  }
}
