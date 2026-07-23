import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MachineEntity } from './machine.entity';
import { DowntimeLogEntity } from './downtime.entity';
import { MachinesService } from './machines.service';
import { MachinesController } from './machines.controller';
import { DowntimeService } from './downtime.service';

@Module({
  imports: [TypeOrmModule.forFeature([MachineEntity, DowntimeLogEntity])],
  controllers: [MachinesController],
  providers: [MachinesService, DowntimeService],
  exports: [MachinesService, DowntimeService],
})
export class MachinesModule {}
