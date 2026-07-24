import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export type ShiftType = 'day' | 'night' | 'swing';

@Entity('shifts')
export class ShiftEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ type: 'enum', enum: ['day', 'night', 'swing'], default: 'day' })
  type: ShiftType;

  @Column({ type: 'time' })
  start_time: string;

  @Column({ type: 'time' })
  end_time: string;

  @Column({ nullable: true })
  manager_name?: string;

  @Column('date')
  date: string;

  @Column({ default: false })
  closed: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}

@Entity('shift_reports')
export class ShiftReportEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  shift_id: string;

  @Column({ nullable: true })
  shift_name?: string;

  @Column({ nullable: true })
  manager_name?: string;

  @Column({ type: 'time' })
  shift_start: string;

  @Column({ type: 'time' })
  shift_end: string;

  @Column()
  date: string;

  @Column({ default: 0 })
  total_orders: number;

  @Column({ default: 0 })
  completed_orders: number;

  @Column({ default: 0 })
  cancelled_orders: number;

  @Column({ default: 0.0 })
  oee_availability: number;

  @Column({ default: 0.0 })
  oee_performance: number;

  @Column({ default: 0.0 })
  oee_quality: number;

  @Column({ default: 0.0 })
  oee_total: number;

  @Column({ default: 0 })
  throughput_units: number;

  @Column({ type: 'simple-array', nullable: true })
  active_machines?: string[];

  @Column({ type: 'simple-array', nullable: true })
  offline_machines?: string[];

  @Column({ default: 0 })
  total_downtime_minutes: number;

  @Column({ type: 'simple-array', nullable: true })
  critical_alarms?: string[];

  @Column({ type: 'simple-array', nullable: true })
  warnings?: string[];

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({ default: false })
  finalized: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}

@Entity('production_batches')
export class ProductionBatchEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  shift_name: string;

  @Column()
  order_id: string;

  @Column()
  machine_id: string;

  @Column({ default: 0 })
  target_quantity: number;

  @Column({ default: 0 })
  completed_quantity: number;

  @Column({ default: 0 })
  rejected_quantity: number;

  @Column()
  started_at: Date;

  @Column({ nullable: true })
  finished_at?: Date;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
