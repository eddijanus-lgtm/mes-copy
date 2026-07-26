import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ShiftEntity, ShiftReportEntity, ProductionBatchEntity } from './entities';
import { ShiftsService } from './shifts.service';
import { ShiftsController } from './shifts.controller';
import { OrderEntity } from '../orders/order.entity';
import { MachineEntity } from '../machines/machine.entity';
import { DashboardModule } from '../dashboard/dashboard.module';

@Module({
  imports: [
    DashboardModule,
    TypeOrmModule.forFeature([
      ShiftEntity,
      ShiftReportEntity,
      ProductionBatchEntity,
      OrderEntity,
      MachineEntity,
    ]),
  ],
  controllers: [ShiftsController],
  providers: [ShiftsService],
  exports: [ShiftsService],
})
export class ShiftsModule {}
