import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TraceEntity } from './trace.entity';
import { TracesService } from './traces.service';
import { TracesController } from './traces.controller';
import { DataPointEntity } from '../data-collection/data-point.entity';

@Module({
  imports: [TypeOrmModule.forFeature([TraceEntity, DataPointEntity])],
  controllers: [TracesController],
  providers: [TracesService],
  exports: [TracesService],
})
export class TracesModule {}
