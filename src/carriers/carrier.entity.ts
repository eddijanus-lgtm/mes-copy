import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';

export enum CarrierStatusEnum {
  AVAILABLE = 'available',
  ASSIGNED = 'assigned',
  IN_PROCESS = 'in_process',
  COMPLETED = 'completed',
  ERROR = 'error',
}

/**
 * Physical state reported by the machine inventory. This is deliberately
 * separate from CarrierStatusEnum, which describes the MES/order lifecycle.
 */
export enum CarrierPhysicalStateEnum {
  UNKNOWN = 'unknown',
  STORED = 'stored',
  DISPENSED = 'dispensed',
  IN_TRANSIT = 'in_transit',
  AT_STATION = 'at_station',
  RETURNED = 'returned',
  MISSING = 'missing',
  RFID_ERROR = 'rfid_error',
}

@Entity('carriers')
export class CarrierEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'int', unique: true })
  carrier_number: number;

  @Column({ type: 'uuid', nullable: true })
  order_id?: string | null;

  @Column({ type: 'int', nullable: true })
  current_step_no: number | null;

  @Column({ type: 'int', nullable: true })
  current_resource_id: number | null;

  @Column({
    type: 'enum',
    enum: CarrierStatusEnum,
    default: CarrierStatusEnum.AVAILABLE,
  })
  status: CarrierStatusEnum;

  /**
   * False for legacy/manually maintained carriers. Once a carrier is observed
   * in a machine inventory, its physical availability is machine-managed.
   */
  @Column({ type: 'boolean', default: false })
  inventory_managed: boolean;

  @Column({
    type: 'enum',
    enum: CarrierPhysicalStateEnum,
    default: CarrierPhysicalStateEnum.UNKNOWN,
  })
  physical_state: CarrierPhysicalStateEnum;

  @Column({ type: 'varchar', length: 128, nullable: true, unique: true })
  rfid_uid: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  storage_slot: string | null;

  @Column({ type: 'boolean', nullable: true })
  rfid_read_valid: boolean | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  last_reader_id: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  last_seen_at: Date | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  inventory_source: string | null;

  @Column({
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  inventory_revision: string | null;

  @Column({ type: 'boolean', default: false })
  inventory_stale: boolean;

  @VersionColumn()
  version: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}

export function isCarrierPhysicallyAvailable(
  carrier: Pick<
    CarrierEntity,
    | 'inventory_managed'
    | 'physical_state'
    | 'rfid_read_valid'
    | 'inventory_stale'
  >,
): boolean {
  if (!carrier.inventory_managed) return true;
  return (
    carrier.physical_state === CarrierPhysicalStateEnum.STORED &&
    carrier.rfid_read_valid === true &&
    carrier.inventory_stale === false
  );
}
