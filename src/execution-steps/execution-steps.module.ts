import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MachineEntity } from '../machines/machine.entity';
import { OrderEntity } from '../orders/order.entity';
import { ExecutionStepEntity } from './execution-step.entity';
import { ExecutionStepsController } from './execution-steps.controller';
import { ExecutionStepsService } from './execution-steps.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ExecutionStepEntity,
      MachineEntity,
      OrderEntity,
    ]),
  ],
  controllers: [ExecutionStepsController],
  providers: [ExecutionStepsService],
  exports: [ExecutionStepsService],
})
export class ExecutionStepsModule {}
