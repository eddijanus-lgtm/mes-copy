import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MachineEntity } from './machine.entity';
import { DowntimeLogEntity } from './downtime.entity';
import { MachinesService } from './machines.service';
import { MachinesController } from './machines.controller';
import { DowntimeService } from './downtime.service';
import { MachineProfilesModule } from './profiles/machine-profiles.module';
import { MachineProfileSyncService } from './profiles/machine-profile-sync.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([MachineEntity, DowntimeLogEntity]),
    MachineProfilesModule,
  ],
  controllers: [MachinesController],
  providers: [MachinesService, DowntimeService, MachineProfileSyncService],
  exports: [MachinesService, DowntimeService],
})
export class MachinesModule {}
