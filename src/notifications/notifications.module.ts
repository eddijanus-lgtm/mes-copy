import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OpcUaModule } from '../opcua/opcua.module';
import { AlertRuleEntity, AlertHistoryEntity, NotificationChannelEntity } from './entities';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';

@Module({
  imports: [TypeOrmModule.forFeature([NotificationChannelEntity, AlertRuleEntity, AlertHistoryEntity]), OpcUaModule],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
