import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';

export type OrderProductionLogSnapshot = {
  schema_version: 1;
  generated_at: string;
  order: {
    id: string;
    name: string;
    operation: string;
    status: string;
    quantity: number;
    completed_quantity: number;
    started_at?: string;
    completed_at?: string;
    duration_ms?: number;
  };
  carriers: number[];
  route: Array<{
    step_no: number;
    resource_id: number;
    operation_no: number;
    operation: string;
    parameters: Record<string, number>;
  }>;
  station_executions: Array<{
    resource_id: number;
    carrier_number: number;
    status: string;
    result_code?: number;
    requested_at: string;
    responded_at?: string;
    acknowledged_at?: string;
    request: Record<string, unknown>;
    response?: Record<string, unknown>;
    error_message?: string;
  }>;
  quality: {
    status: 'not_evaluated';
    note: string;
  };
};

@Entity('order_production_logs')
@Unique(['order_id'])
export class OrderProductionLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  order_id: string;

  @Column({ type: 'jsonb' })
  snapshot: OrderProductionLogSnapshot;

  @Column({ type: 'timestamp' })
  completed_at: Date;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
