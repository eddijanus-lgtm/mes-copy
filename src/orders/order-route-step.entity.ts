import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';

@Entity('order_route_steps')
@Unique(['order_id', 'step_no'])
@Index(['resource_id'])
export class OrderRouteStepEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  order_id: string;

  @Column({ type: 'int' })
  step_no: number;

  @Column({ type: 'int' })
  resource_id: number;

  @Column({ type: 'int' })
  operation_no: number;

  @Column()
  operation: string;

  @Column({ type: 'jsonb', default: {} })
  parameters: Record<string, number>;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
