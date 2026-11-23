import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ShiftEntity, ShiftReportEntity, ProductionBatchEntity } from './entities';
import { ShiftsService } from './shifts.service';
import { ShiftsController } from './shifts.controller';
import { OrderEntity } from '../orders/order.entity';
import { MachineEntity } from '../machines/machine.entity';
import { DowntimeLogEntity } from '../machines/downtime.entity';
import { DataPointEntity } from '../data-collection/data-point.entity';
import { AlarmEntity } from '../alarms/alarm.entity';

@Module({
  imports: [TypeOrmModule.forFeature([
    ShiftEntity,
    ShiftReportEntity,
    ProductionBatchEntity,
    OrderEntity,
    MachineEntity,
    DowntimeLogEntity,
    DataPointEntity,
    AlarmEntity,
  ])],
  controllers: [ShiftsController],
  providers: [ShiftsService],
  exports: [ShiftsService],
})
export class ShiftsModule {}
