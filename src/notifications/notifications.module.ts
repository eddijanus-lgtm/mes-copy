import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OpcUaModule } from '../opcua/opcua.module';
import { AuthModule } from '../auth/auth.module';
import { OrderEntity } from '../orders/order.entity';
import { OrderRouteStepEntity } from '../orders/order-route-step.entity';
import { AlertRuleEntity, AlertHistoryEntity, NotificationChannelEntity } from './entities';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { NotificationGateway } from './notification.gateway';

@Module({
  imports: [TypeOrmModule.forFeature([NotificationChannelEntity, AlertRuleEntity, AlertHistoryEntity, OrderEntity, OrderRouteStepEntity]), OpcUaModule, AuthModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationGateway],
  exports: [NotificationsService],
})
export class NotificationsModule {}
