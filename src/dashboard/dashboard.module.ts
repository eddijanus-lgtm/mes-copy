import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { OrderEntity } from '../orders/order.entity';
import { MachineEntity } from '../machines/machine.entity';
import { DowntimeLogEntity } from '../machines/downtime.entity';
import { DataPointEntity } from '../data-collection/data-point.entity';

@Module({
  imports: [TypeOrmModule.forFeature([OrderEntity, MachineEntity, DowntimeLogEntity, DataPointEntity])],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
