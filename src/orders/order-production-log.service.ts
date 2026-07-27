import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StMesHandshakeEntity } from '../opcua/stmes-handshake.entity';
import { OrderEntity } from './order.entity';
import { OrderProductionLogEntity, OrderProductionLogSnapshot } from './order-production-log.entity';
import { OrderRouteStepEntity } from './order-route-step.entity';

@Injectable()
export class OrderProductionLogService {
  constructor(
    @InjectRepository(OrderEntity) private readonly orders: Repository<OrderEntity>,
    @InjectRepository(OrderRouteStepEntity) private readonly routeSteps: Repository<OrderRouteStepEntity>,
    @InjectRepository(StMesHandshakeEntity) private readonly handshakes: Repository<StMesHandshakeEntity>,
    @InjectRepository(OrderProductionLogEntity) private readonly productionLogs: Repository<OrderProductionLogEntity>,
  ) {}

  async findOrCreate(orderId: string): Promise<OrderProductionLogEntity | null> {
    const existing = await this.productionLogs.findOne({ where: { order_id: orderId } });
    if (existing) return existing;

    const order = await this.orders.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== 'completed') return null;

    return this.finalize(orderId);
  }

  async exportCsv(orderId: string): Promise<{ filename: string; csv: string }> {
    const productionLog = await this.findOrCreate(orderId);
    if (!productionLog) {
      throw new NotFoundException('Production log is only available for completed orders');
    }

    const snapshot = productionLog.snapshot;
    const filename = `${safeFilename(snapshot.order.name || snapshot.order.id)}-production-run.csv`;
    return { filename, csv: buildProductionRunsCsv([snapshot]) };
  }

  async exportAllCsv(): Promise<{ filename: string; csv: string; orderCount: number }> {
    const completedOrders = await this.orders.find({
      where: { status: 'completed' },
      order: { end_time: 'ASC', created_at: 'ASC' },
    });
    const productionLogs = await Promise.all(completedOrders.map((order) => this.findOrCreate(order.id)));
    const snapshots = productionLogs
      .filter((log): log is OrderProductionLogEntity => log !== null)
      .map((log) => log.snapshot);
    const exportDate = new Date().toISOString().slice(0, 10);
    return {
      filename: `production-runs-${exportDate}.csv`,
      csv: buildProductionRunsCsv(snapshots),
      orderCount: snapshots.length,
    };
  }

  async finalize(orderId: string): Promise<OrderProductionLogEntity> {
    const order = await this.orders.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');

    const [route, stationExecutions, existing] = await Promise.all([
      this.routeSteps.find({ where: { order_id: orderId }, order: { step_no: 'ASC' } }),
      this.handshakes.find({ where: { order_id: orderId }, order: { created_at: 'ASC' } }),
      this.productionLogs.findOne({ where: { order_id: orderId } }),
    ]);

    const completedAt = order.end_time || new Date();
    const startedAt = order.start_time;
    const snapshot: OrderProductionLogSnapshot = {
      schema_version: 1,
      generated_at: new Date().toISOString(),
      order: {
        id: order.id,
        name: order.name,
        operation: order.operation,
        status: order.status,
        quantity: order.quantity,
        completed_quantity: order.completed_quantity,
        started_at: toIso(startedAt),
        completed_at: toIso(completedAt),
        duration_ms: startedAt ? Math.max(0, completedAt.getTime() - new Date(startedAt).getTime()) : undefined,
      },
      carriers: [...new Set(stationExecutions.map((entry) => entry.carrier_number))],
      route: route.map((step) => ({
        step_no: step.step_no,
        resource_id: step.resource_id,
        operation_no: step.operation_no,
        operation: step.operation,
        parameters: step.parameters || {},
      })),
      station_executions: stationExecutions.map((entry) => ({
        resource_id: entry.resource_id,
        carrier_number: entry.carrier_number,
        status: entry.status,
        result_code: entry.result_code,
        requested_at: entry.created_at.toISOString(),
        responded_at: toIso(entry.responded_at),
        acknowledged_at: toIso(entry.acknowledged_at),
        request: entry.request_payload || {},
        response: entry.response_payload,
        error_message: entry.error_message,
      })),
      quality: {
        status: 'not_evaluated',
        note: 'Der Routingerfolg ist dokumentiert; ein Soll-Ist-Qualitätsvergleich ist noch nicht implementiert.',
      },
    };

    const productionLog = existing || this.productionLogs.create({ order_id: orderId });
    productionLog.snapshot = snapshot;
    productionLog.completed_at = completedAt;
    return this.productionLogs.save(productionLog);
  }

  async remove(orderId: string): Promise<void> {
    await this.productionLogs.delete({ order_id: orderId });
  }
}

function toIso(value?: Date | string | null): string | undefined {
  return value ? new Date(value).toISOString() : undefined;
}

function durationBetween(start?: string, end?: string): number | undefined {
  if (!start || !end) return undefined;
  const duration = new Date(end).getTime() - new Date(start).getTime();
  return Number.isFinite(duration) ? Math.max(0, duration) : undefined;
}

function classifyExecution(status: string, _resultCode?: number, errorMessage?: string): 'OK' | 'ERROR' | 'UNKNOWN' {
  if (errorMessage || status === 'error') return 'ERROR';
  if (status === 'acknowledged' || status === 'responded') return 'OK';
  return 'UNKNOWN';
}

function encodeCsvCell(value: unknown): string {
  if (value === undefined || value === null) return '';
  const serialized = typeof value === 'object' ? JSON.stringify(value) : String(value);
  const protectedValue = /^[\t\r ]*[=+\-@]/.test(serialized) ? `'${serialized}` : serialized;
  return /[",\r\n]/.test(protectedValue) ? `"${protectedValue.replace(/"/g, '""')}"` : protectedValue;
}

function safeFilename(value: string): string {
  const safe = value.trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return safe || 'order';
}

const PRODUCTION_RUN_HEADERS = [
  'schema_name',
  'schema_version',
  'record_type',
  'exported_at_utc',
  'production_order_id',
  'production_order_name',
  'order_status',
  'operation',
  'planned_quantity',
  'produced_quantity',
  'production_start_utc',
  'production_end_utc',
  'production_duration_ms',
  'carrier_numbers',
  'carrier_number',
  'route_step_no',
  'operation_no',
  'work_unit_id',
  'work_unit_name',
  'execution_status',
  'result_code',
  'result_class',
  'requested_at_utc',
  'responded_at_utc',
  'acknowledged_at_utc',
  'station_cycle_time_ms',
  'acknowledgement_delay_ms',
  'route_parameters_json',
  'request_payload_json',
  'response_payload_json',
  'error_message',
  'quality_status',
  'quality_note',
] as const;

function buildProductionRunsCsv(snapshots: OrderProductionLogSnapshot[]): string {
  const exportedAt = new Date().toISOString();
  const rows = snapshots.flatMap((snapshot) => productionRunRows(snapshot, exportedAt));
  const lines = [
    PRODUCTION_RUN_HEADERS.join(','),
    ...rows.map((row) => PRODUCTION_RUN_HEADERS.map((header) => encodeCsvCell(row[header])).join(',')),
  ];
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

function productionRunRows(snapshot: OrderProductionLogSnapshot, exportedAt: string): Array<Record<string, unknown>> {
  const common = {
    schema_name: 'WARA_MES_PRODUCTION_RUN',
    schema_version: '1.0',
    exported_at_utc: exportedAt,
    production_order_id: snapshot.order.id,
    production_order_name: snapshot.order.name,
    order_status: snapshot.order.status,
    operation: snapshot.order.operation,
    planned_quantity: snapshot.order.quantity,
    produced_quantity: snapshot.order.completed_quantity,
    production_start_utc: snapshot.order.started_at,
    production_end_utc: snapshot.order.completed_at,
    production_duration_ms: snapshot.order.duration_ms,
    carrier_numbers: snapshot.carriers.join('|'),
    quality_status: snapshot.quality.status,
    quality_note: snapshot.quality.note,
  };
  const rows: Array<Record<string, unknown>> = [{
    ...common,
    record_type: 'RUN_SUMMARY',
    result_class: snapshot.order.status === 'completed' ? 'COMPLETED' : 'UNKNOWN',
  }];

  for (const execution of snapshot.station_executions) {
    const routeStep = snapshot.route.find((step) => step.resource_id === execution.resource_id);
    rows.push({
      ...common,
      record_type: 'STATION_EXECUTION',
      carrier_number: execution.carrier_number,
      route_step_no: routeStep?.step_no,
      operation_no: routeStep?.operation_no,
      work_unit_id: execution.resource_id,
      work_unit_name: routeStep?.operation,
      execution_status: execution.status,
      result_code: execution.result_code,
      result_class: classifyExecution(execution.status, execution.result_code, execution.error_message),
      requested_at_utc: execution.requested_at,
      responded_at_utc: execution.responded_at,
      acknowledged_at_utc: execution.acknowledged_at,
      station_cycle_time_ms: durationBetween(execution.requested_at, execution.responded_at),
      acknowledgement_delay_ms: durationBetween(execution.responded_at, execution.acknowledged_at),
      route_parameters_json: routeStep?.parameters || {},
      request_payload_json: execution.request || {},
      response_payload_json: execution.response || {},
      error_message: execution.error_message,
    });
  }
  return rows;
}
