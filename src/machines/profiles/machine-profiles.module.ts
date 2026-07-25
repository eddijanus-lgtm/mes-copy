import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MachineProfileService } from './machine-profile.service';

@Module({
  imports: [ConfigModule],
  providers: [MachineProfileService],
  exports: [MachineProfileService],
})
export class MachineProfilesModule {}