import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('orders')
export class OrderEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ type: 'int', default: 5 })
  priority: number;

  @Column()
  machine_id: string;

  @Column({ type: 'uuid', nullable: true })
  product_id?: string | null;

  @Column()
  operation: string;

  @Column({ default: 'pending' })
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled' | 'on_hold';

  @Column({ type: 'int', default: 0 })
  quantity: number;

  @Column({ type: 'int', default: 0 })
  completed_quantity: number;

  @Column({ type: 'timestamp', nullable: true })
  start_time?: Date;

  @Column({ type: 'timestamp', nullable: true })
  end_time?: Date;

  @Column({ type: 'timestamp', nullable: true })
  target_complete_time?: Date;

  @Column({ nullable: true })
  error_message?: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
