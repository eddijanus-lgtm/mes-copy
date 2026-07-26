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
