import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MachineProfileService } from './machine-profile.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MachineProfileEntity } from './machine-profile.entity';
import { MachineEntity } from '../machine.entity';
import { MachineProfileManagementService } from './machine-profile-management.service';
import { MachineProfilesController } from './machine-profiles.controller';
import { OpcUaCommissioningService } from './opcua-commissioning.service';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([MachineProfileEntity, MachineEntity]),
  ],
  controllers: [MachineProfilesController],
  providers: [
    MachineProfileService,
    MachineProfileManagementService,
    OpcUaCommissioningService,
  ],
  exports: [MachineProfileService, MachineProfileManagementService],
})
export class MachineProfilesModule {}
