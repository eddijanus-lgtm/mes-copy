import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn, VersionColumn } from 'typeorm';

export enum CarrierStatusEnum {
  AVAILABLE = 'available',
  ASSIGNED = 'assigned',
  IN_PROCESS = 'in_process',
  COMPLETED = 'completed',
  ERROR = 'error',
}

@Entity('carriers')
export class CarrierEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'int', unique: true })
  carrier_number: number;

  @Column({ type: 'uuid', nullable: true })
  order_id?: string;

  @Column({ type: 'int', default: 1 })
  current_step_no: number;

  @Column({ type: 'int', nullable: true })
  current_resource_id: number | null;

  @Column({ type: 'enum', enum: CarrierStatusEnum, default: CarrierStatusEnum.AVAILABLE })
  status: CarrierStatusEnum;

  @VersionColumn()
  version: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
