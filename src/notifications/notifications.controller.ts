import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { Roles } from '../auth/roles.decorator';
import { UserRoleEnum } from '../users/user.entity';

@Controller('notifications')
@ApiTags('Notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  // --- Channels ---

  @Get('channels')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR, UserRoleEnum.VIEWER)
  getAllChannels() { return this.notificationsService.getAllChannels(); }

  @Post('channels')
  @Roles(UserRoleEnum.ADMIN)
  createChannel(@Body() dto: any) { return this.notificationsService.createChannel(dto); }

  // --- Alert Rules ---

  @Get('rules')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR)
  getAllRules() { return this.notificationsService.getAllRules(); }

  @Post('rules')
  @Roles(UserRoleEnum.ADMIN)
  createRule(@Body() dto: any) { return this.notificationsService.createRule(dto); }

  @Get('rules/:id')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR, UserRoleEnum.VIEWER)
  getRule(@Param('id') id: string) { return this.notificationsService.getRule(id); }

  @Patch('rules/:id')
  @Roles(UserRoleEnum.ADMIN)
  updateRule(@Param('id') id: string, @Body() dto: any) { return this.notificationsService.updateRule(id, dto); }

  @Post('rules/:id/toggle')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR)
  toggleRule(@Param('id') id: string) { return this.notificationsService.toggleRule(id); }

  @Delete('rules/:id')
  @Roles(UserRoleEnum.ADMIN)
  deleteRule(@Param('id') id: string) { return this.notificationsService.deleteRule(id); }

  // --- Alert History ---

  @Get('history')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR, UserRoleEnum.VIEWER)
  getHistory(
    @Query('rule_id') ruleId?: string,
    @Query('severity') severity?: string,
    @Query('machine_id') machineId?: string,
    @Query('limit') limit?: number,
  ) {
    return this.notificationsService.getHistory({ rule_id: ruleId, severity, machine_id: machineId, limit });
  }

  @Get('history/stats')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR, UserRoleEnum.VIEWER)
  getHistoryStats() { return this.notificationsService.getHistoryStats(); }

  // --- Stats ---

  @Get('stats')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR, UserRoleEnum.VIEWER)
  getStats() { return this.notificationsService.getRuleStats(); }

  @Get('delivery-rate')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR, UserRoleEnum.VIEWER)
  getDeliveryRate() { 
    return { rate: 0, total_sent: 0, total_failed: 0 }; 
  }

  // --- Manual Trigger (for testing/integration) ---

  @Post('rules/:id/trigger')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR)
  async triggerRule(@Param('id') id: string, @Body() payload?: any) {
    const rule = await this.notificationsService.getRule(id);
    return this.notificationsService.sendToChannels(rule, payload?.message || 'Manual trigger', payload?.machine_id);
  }
}
