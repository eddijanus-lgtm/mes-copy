import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Controller, Get, Post, Query } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { UserRoleEnum } from '../users/user.entity';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
@ApiTags('Dashboard')
@ApiBearerAuth('JWT-auth')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('kpis')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR, UserRoleEnum.VIEWER)
  getKpis(@Query('from') from?: string, @Query('to') to?: string) {
    return this.dashboardService.getKpis(from, to);
  }

  @Get('trends/all')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR, UserRoleEnum.VIEWER)
  getAllTrends(@Query('from') from?: string, @Query('to') to?: string, @Query('interval') interval?: string) {
    return this.dashboardService.getDashboardTrends(from, to, interval);
  }

  @Get('trends/pareto')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR, UserRoleEnum.VIEWER)
  getDowntimePareto(@Query('from') from?: string, @Query('to') to?: string) {
    return this.dashboardService.getDowntimePareto(from, to);
  }

  @Post('aggregates/initialize')
  @Roles(UserRoleEnum.ADMIN)
  initializeAggregates() {
    return this.dashboardService.initializeContinuousAggregates();
  }
}
