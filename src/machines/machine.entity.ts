import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum MachineStatusEnum {
  ONLINE = 'online',
  OFFLINE = 'offline',
  MAINTENANCE = 'maintenance',
  ERROR = 'error',
  IDLE = 'idle',
}

@Entity('machines')
export class MachineEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ type: 'enum', enum: MachineStatusEnum, default: MachineStatusEnum.OFFLINE })
  status: MachineStatusEnum;

  @Column({ nullable: true })
  type?: string;

  @Column()
  location: string;

  @Column({ nullable: true })
  model?: string;

  @Column({ nullable: true })
  serial_number?: string;

  /** True for a production machine; false for a station belonging to a machine. */
  @Column({ default: false })
  is_machine: boolean;

  @Column({ type: 'uuid', nullable: true })
  parent_machine_id?: string;

  @Column({ nullable: true })
  ip_address?: string;

  @Column({ type: 'int', nullable: true })
  connection_port?: number;

  @Column({ nullable: true })
  connection_protocol?: string;

  @Column({ type: 'int', nullable: true, unique: true })
  resource_id?: number;

  @Column({ nullable: true })
  opcua_endpoint_url?: string;

  @Column({ nullable: true })
  opcua_node_prefix?: string;

  @Column({ default: false })
  opcua_enabled: boolean;

  @Column({ type: 'jsonb', nullable: true })
  telemetry: Record<string, any>;

  @Column({ type: 'timestamp', nullable: true })
  last_heartbeat: Date;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
