import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { UserRoleEnum } from '../users/user.entity';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('kpis')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR, UserRoleEnum.VIEWER)
  getKpis(@Query('from') from?: string, @Query('to') to?: string) {
    return this.dashboardService.getKpis(from, to);
  }

  @Get('trends/all')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR, UserRoleEnum.VIEWER)
  getAllTrends(@Query('from') from?: string, @Query('to') to?: string) {
    return this.dashboardService.getDashboardTrends(from, to);
  }

  @Get('trends/pareto')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR, UserRoleEnum.VIEWER)
  getDowntimePareto(@Query('from') from?: string, @Query('to') to?: string) {
    return this.dashboardService.getDowntimePareto(from, to);
  }
}
