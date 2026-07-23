import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export enum MaterialTypeEnum {
  RAW = 'raw',
  COMPONENT = 'component',
  PACKAGING = 'packaging',
}

@Entity('materials')
export class MaterialEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  description?: string;

  @Column({ type: 'enum', enum: MaterialTypeEnum, default: MaterialTypeEnum.RAW })
  type: MaterialTypeEnum;

  @Column({ type: 'float', default: 0 })
  unit_price: number;

  @Column({ type: 'varchar', length: 10, default: 'pcs' })
  unit: string;

  @Column({ type: 'int', default: 0 })
  stock_quantity: number;

  @Column({ type: 'float', nullable: true })
  minimum_stock?: number;

  @Column({ nullable: true })
  supplier?: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  sku?: string;
}
