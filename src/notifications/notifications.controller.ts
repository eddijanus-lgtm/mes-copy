import { Controller, Get, Post, Patch, Delete, Body, HttpCode, HttpStatus, Param, ParseIntPipe, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { Roles } from '../auth/roles.decorator';
import { UserRoleEnum } from '../users/user.entity';
import {
  CreateAlertRuleDto,
  CreateNotificationChannelDto,
  TriggerAlertRuleDto,
  UpdateAlertRuleDto,
} from './notifications.dto';

@Controller('notifications')
@ApiTags('Notifications')
@ApiBearerAuth('JWT-auth')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  // --- Channels ---

  @Get('channels')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR, UserRoleEnum.VIEWER)
  getAllChannels() { return this.notificationsService.getAllChannels(); }

  @Post('channels')
  @Roles(UserRoleEnum.ADMIN)
  createChannel(@Body() dto: CreateNotificationChannelDto) { return this.notificationsService.createChannel(dto); }

  // --- Alert Rules ---

  @Get('rules')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR)
  getAllRules() { return this.notificationsService.getAllRules(); }

  @Post('rules')
  @Roles(UserRoleEnum.ADMIN)
  createRule(@Body() dto: CreateAlertRuleDto) { return this.notificationsService.createRule(dto); }

  @Get('rules/:id')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR, UserRoleEnum.VIEWER)
  getRule(@Param('id', ParseUUIDPipe) id: string) { return this.notificationsService.getRule(id); }

  @Patch('rules/:id')
  @Roles(UserRoleEnum.ADMIN)
  updateRule(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAlertRuleDto) { return this.notificationsService.updateRule(id, dto); }

  @Post('rules/:id/toggle')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR)
  toggleRule(@Param('id', ParseUUIDPipe) id: string) { return this.notificationsService.toggleRule(id); }

  @Delete('rules/:id')
  @Roles(UserRoleEnum.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteRule(@Param('id', ParseUUIDPipe) id: string) { return this.notificationsService.deleteRule(id); }

  // --- Alert History ---

  @Get('history')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR, UserRoleEnum.VIEWER)
  getHistory(
    @Query('rule_id') ruleId?: string,
    @Query('severity') severity?: string,
    @Query('machine_id') machineId?: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
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
    return this.notificationsService.getDeliveryRate();
  }

  // --- Manual Trigger (for testing/integration) ---

  @Post('rules/:id/trigger')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR)
  async triggerRule(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() payload: TriggerAlertRuleDto,
  ) {
    const rule = await this.notificationsService.getRule(id);
    return this.notificationsService.sendToChannels(rule, payload?.message || 'Manual trigger', payload?.machine_id);
  }
}
