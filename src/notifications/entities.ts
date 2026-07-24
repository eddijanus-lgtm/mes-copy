import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export type NotificationChannel = 'email' | 'push' | 'mqtt' | 'websocket';
export type AlertRuleStatus = 'active' | 'inactive' | 'firing' | 'resolved';

@Entity('notification_channels')
export class NotificationChannelEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: ['email', 'push', 'mqtt', 'websocket'] })
  channel: NotificationChannel;

  @Column()
  enabled: boolean;

  @Column({ nullable: true })
  config?: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}

@Entity('alert_rules')
export class AlertRuleEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ type: 'enum', enum: ['info', 'warning', 'error', 'critical'], default: 'warning' })
  severity: 'info' | 'warning' | 'error' | 'critical';

  @Column({ nullable: true })
  machine_id?: string;

  @Column({ type: 'text' })
  condition: string;

  @Column({ type: 'text' })
  message_template: string;

  @Column({ type: 'simple-array', nullable: true })
  channels?: NotificationChannel[];

  @Column({ type: 'enum', enum: ['active', 'inactive', 'firing', 'resolved'], default: 'inactive' })
  status: AlertRuleStatus;

  @Column({ type: 'jsonb', nullable: true })
  params?: Record<string, any>;

  @Column({ nullable: true })
  last_triggered_at?: Date;

  @Column({ default: false })
  is_active: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}

@Entity('alert_history')
export class AlertHistoryEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  rule_id: string;

  @Column({ nullable: true })
  machine_id?: string;

  @Column({ nullable: true })
  machine_name?: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'enum', enum: ['info', 'warning', 'error', 'critical'] })
  severity: 'info' | 'warning' | 'error' | 'critical';

  @Column({ type: 'simple-array' })
  channels_sent: NotificationChannel[];

  @Column({ nullable: true })
  sent_at?: Date;

  @Column({ default: false })
  delivered: boolean;

  @Column({ nullable: true })
  error_message?: string;

  @CreateDateColumn()
  created_at: Date;
}
