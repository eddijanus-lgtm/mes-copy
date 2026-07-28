import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';

@Entity('products')
@Unique(['part_no'])
export class ProductEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  part_no: string;

  @Column()
  name: string;

  @Column({ type: 'varchar', nullable: true })
  profile_machine_id?: string | null;

  @Column({ nullable: true })
  description?: string;

  @Column({ default: true })
  is_active: boolean;

  @Column({ type: 'jsonb', default: [] })
  parameter_definitions: Array<Record<string, any>>;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
