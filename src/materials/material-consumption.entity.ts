import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { MaterialEntity } from './material.entity';

@Entity('material_consumption')
export class MaterialConsumptionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  material_id: string;

  @Column({ type: 'uuid' })
  order_id: string;

  @Column({ type: 'int', default: 1 })
  quantity: number;

  @Column({ type: 'float' })
  total_cost: number;

  @Column({ nullable: true })
  notes?: string;

  @CreateDateColumn()
  consumed_at: Date;

  // Relation to material
  material: MaterialEntity;
}
