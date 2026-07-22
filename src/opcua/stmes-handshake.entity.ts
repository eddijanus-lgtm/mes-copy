import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export enum StMesHandshakeStatusEnum {
  RECEIVED = 'received',
  RESPONDED = 'responded',
  ERROR = 'error',
  ACKNOWLEDGED = 'acknowledged',
}

@Entity('stmes_handshakes')
export class StMesHandshakeEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'int' })
  resource_id: number;

  @Column({ type: 'int' })
  carrier_number: number;

  @Column({ type: 'uuid', nullable: true })
  carrier_id?: string;

  @Column({ type: 'uuid', nullable: true })
  order_id?: string;

  @Column({ type: 'enum', enum: StMesHandshakeStatusEnum, default: StMesHandshakeStatusEnum.RECEIVED })
  status: StMesHandshakeStatusEnum;

  @Column({ type: 'int', nullable: true })
  result_code?: number;

  @Column({ type: 'jsonb', default: {} })
  request_payload: Record<string, unknown>;

  @Column({ type: 'jsonb', nullable: true })
  response_payload?: Record<string, unknown>;

  @Column({ type: 'timestamp', nullable: true })
  responded_at?: Date;

  @Column({ type: 'timestamp', nullable: true })
  acknowledged_at?: Date;

  @Column({ type: 'text', nullable: true })
  error_message?: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
