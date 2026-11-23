import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MachineEntity } from './machine.entity';
import { DowntimeLogEntity } from './downtime.entity';
import { MachinesService } from './machines.service';
import { MachinesController } from './machines.controller';
import { DowntimeService } from './downtime.service';
import { OpcUaModule } from '../opcua/opcua.module';

@Module({
  imports: [TypeOrmModule.forFeature([MachineEntity, DowntimeLogEntity]), OpcUaModule],
  controllers: [MachinesController],
  providers: [MachinesService, DowntimeService],
  exports: [MachinesService, DowntimeService],
})
export class MachinesModule {}
