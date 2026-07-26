import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';

@Entity('product_route_steps')
@Unique(['product_id', 'step_no'])
@Index(['resource_id'])
export class ProductRouteStepEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  product_id: string;

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
