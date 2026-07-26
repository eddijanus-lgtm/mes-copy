import {
  Column,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';

@Entity('carrier_inventory_states')
export class CarrierInventoryStateEntity {
  @PrimaryColumn({ type: 'varchar', length: 128 })
  source: string;

  @Column({ type: 'boolean', default: false })
  valid: boolean;

  @Column({ type: 'varchar', length: 64 })
  revision: string;

  @Column({ type: 'int', nullable: true })
  capacity: number | null;

  @Column({ type: 'int' })
  available_count: number;

  @Column({ type: 'int' })
  total_count: number;

  @Column({ type: 'int' })
  reconciled_available_count: number;

  @Column({ type: 'boolean', default: false })
  count_mismatch: boolean;

  @Column({ type: 'int', default: 0 })
  observed_count: number;

  @Column({ type: 'boolean', default: false })
  stale: boolean;

  @VersionColumn()
  version: number;

  @UpdateDateColumn()
  updated_at: Date;
}
