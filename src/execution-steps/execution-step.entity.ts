import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum ExecutionStepState {
  WAITING = 'waiting',
  READY = 'ready',
  RUNNING = 'running',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export enum ExecutionStepSource {
  MES_ROUTING = 'mes_routing',
  MACHINE = 'machine',
}

@Entity('execution_steps')
@Index(['order_id', 'carrier_id', 'step_no'], { unique: true })
@Index(['resource_id', 'state'])
export class ExecutionStepEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  order_id: string;

  @Column({ type: 'uuid', nullable: true })
  carrier_id?: string | null;

  @Column({ type: 'int', nullable: true })
  carrier_number?: number | null;

  @Column({ type: 'int' })
  resource_id: number;

  @Column({ type: 'int' })
  operation_no: number;

  @Column()
  operation: string;

  @Column({ type: 'int' })
  step_no: number;

  @Column({ type: 'varchar' })
  state: ExecutionStepState;

  @Column({ type: 'varchar' })
  source: ExecutionStepSource;

  @Column({ type: 'timestamp', nullable: true })
  started_at?: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  ended_at?: Date | null;

  @Column({ type: 'jsonb', nullable: true })
  result?: Record<string, unknown> | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
