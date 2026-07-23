import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

export enum DowntimeTypeEnum {
  BREAKDOWN = 'breakdown',
  SETUP = 'setup',
  MAINTENANCE = 'maintenance',
  MATERIAL_WAITING = 'material_waiting',
  QUALITY_ISSUE = 'quality_issue',
  OTHER = 'other',
}

@Entity('downtime_logs')
export class DowntimeLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  machine_id: string;

  @Column({ type: 'enum', enum: DowntimeTypeEnum, default: DowntimeTypeEnum.BREAKDOWN })
  type: DowntimeTypeEnum;

  @Column({ nullable: true })
  reason?: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'timestamp' })
  start_time: Date;

  @Column({ type: 'timestamp', nullable: true })
  end_time?: Date;

  @Column({ type: 'float', nullable: true })
  duration_minutes?: number;

  @Column({ nullable: true })
  operator?: string;

  @CreateDateColumn()
  created_at: Date;
}
