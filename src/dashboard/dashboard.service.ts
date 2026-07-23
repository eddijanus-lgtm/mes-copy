import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrderEntity } from '../orders/order.entity';
import { MachineEntity, MachineStatusEnum } from '../machines/machine.entity';
import { DowntimeLogEntity } from '../machines/downtime.entity';
import { DataPointEntity } from '../data-collection/data-point.entity';

type MachineStatusCounts = Record<MachineStatusEnum, number>;

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(OrderEntity)
    private readonly ordersRepo: Repository<OrderEntity>,
    @InjectRepository(MachineEntity)
    private readonly machinesRepo: Repository<MachineEntity>,
    @InjectRepository(DowntimeLogEntity)
    private readonly downtimeRepo: Repository<DowntimeLogEntity>,
    @InjectRepository(DataPointEntity)
    private readonly dataPointRepo: Repository<DataPointEntity>,
  ) {}

  async getKpis(from?: string, to?: string) {
    const range = this.resolveRange(from, to);
    const [machineRows, orderStats, downtimeStats, qualityRows] = await Promise.all([
      this.safeQuery(this.getMachineStatusCounts(), this.emptyMachineStatusCounts()),
      this.safeQuery(this.getOrderStats(range.start, range.end), { target_quantity: 0, completed_quantity: 0, completed_orders: 0, active_orders: 0 }),
      this.safeQuery(this.getDowntimeStats(range.start, range.end), { total_minutes: 0, event_count: 0 }),
      this.safeQuery(this.getQualityCounts(range.start, range.end), { good_count: 0, bad_count: 0 }),
    ]);

    const machineCount = Object.values(machineRows).reduce((sum, count) => sum + count, 0);
    const plannedMinutes = Math.max(0, (range.end.getTime() - range.start.getTime()) / 60000) * machineCount;
    const downtimeMinutes = Math.min(Number(downtimeStats.total_minutes) || 0, plannedMinutes);
    const availability = plannedMinutes > 0 ? (plannedMinutes - downtimeMinutes) / plannedMinutes : 1;
    const completedQuantity = Number(orderStats.completed_quantity) || 0;
    const targetQuantity = Number(orderStats.target_quantity) || 0;
    const performance = targetQuantity > 0 ? Math.min(completedQuantity / targetQuantity, 1) : 1;
    const goodPoints = Number(qualityRows.good_count) || 0;
    const badPoints = Number(qualityRows.bad_count) || 0;
    const measuredPoints = goodPoints + badPoints;
    const quality = measuredPoints > 0 ? goodPoints / measuredPoints : 1;
    const rangeHours = Math.max((range.end.getTime() - range.start.getTime()) / 3600000, 1);

    return {
      range: { from: range.start.toISOString(), to: range.end.toISOString() },
      oee: {
        availability: this.percent(availability),
        performance: this.percent(performance),
        quality: this.percent(quality),
        total: this.percent(availability * performance * quality),
      },
      throughput: {
        completedQuantity,
        completedOrders: Number(orderStats.completed_orders) || 0,
        unitsPerHour: this.round(completedQuantity / rangeHours, 1),
      },
      yield: this.percent(quality),
      machines: {
        total: machineCount,
        status: machineRows,
        downtimeMinutes: this.round(downtimeMinutes, 1),
        downtimeEvents: Number(downtimeStats.event_count) || 0,
      },
      orders: {
        targetQuantity,
        activeOrders: Number(orderStats.active_orders) || 0,
      },
    };
  }

  private resolveRange(from?: string, to?: string) {
    const end = to && !Number.isNaN(Date.parse(to)) ? new Date(to) : new Date();
    const start = from && !Number.isNaN(Date.parse(from)) ? new Date(from) : new Date(end.getTime() - 8 * 60 * 60 * 1000);
    return start <= end ? { start, end } : { start: end, end: start };
  }

  private async getMachineStatusCounts(): Promise<MachineStatusCounts> {
    const rows = await this.machinesRepo.createQueryBuilder('machine')
      .select('machine.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('machine.status')
      .getRawMany<{ status: MachineStatusEnum; count: string }>();

    return Object.values(MachineStatusEnum).reduce((counts, status) => {
      counts[status] = Number(rows.find((row) => row.status === status)?.count) || 0;
      return counts;
    }, this.emptyMachineStatusCounts());
  }

  private emptyMachineStatusCounts(): MachineStatusCounts {
    return Object.values(MachineStatusEnum).reduce((counts, status) => {
      counts[status] = 0;
      return counts;
    }, {} as MachineStatusCounts);
  }

  private getOrderStats(start: Date, end: Date) {
    return this.ordersRepo.createQueryBuilder('orders')
      .select('COALESCE(SUM(orders.quantity), 0)', 'target_quantity')
      .addSelect('COALESCE(SUM(orders.completed_quantity), 0)', 'completed_quantity')
      .addSelect("COUNT(CASE WHEN orders.status = 'completed' THEN 1 END)", 'completed_orders')
      .addSelect("COUNT(CASE WHEN orders.status = 'in_progress' THEN 1 END)", 'active_orders')
      .where('orders.created_at <= :end', { end })
      .andWhere('(orders.end_time IS NULL OR orders.end_time >= :start)', { start })
      .getRawOne();
  }

  private getDowntimeStats(start: Date, end: Date) {
    return this.downtimeRepo.createQueryBuilder('downtime')
      .select('COALESCE(SUM(EXTRACT(EPOCH FROM (LEAST(COALESCE(downtime.end_time, :end), :end) - GREATEST(downtime.start_time, :start))) / 60), 0)', 'total_minutes')
      .addSelect('COUNT(*)', 'event_count')
      .where('downtime.start_time < :end', { end })
      .andWhere('(downtime.end_time IS NULL OR downtime.end_time > :start)', { start })
      .getRawOne();
  }

  private getQualityCounts(start: Date, end: Date) {
    return this.dataPointRepo.createQueryBuilder('point')
      .select("COUNT(CASE WHEN point.quality = 'good' THEN 1 END)", 'good_count')
      .addSelect("COUNT(CASE WHEN point.quality = 'bad' THEN 1 END)", 'bad_count')
      .where('point.timestamp BETWEEN :start AND :end', { start, end })
      .getRawOne();
  }

  private percent(value: number) {
    return this.round(Math.max(0, Math.min(value, 1)) * 100, 1);
  }

  private round(value: number, decimals: number) {
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
  }

  private async safeQuery<T>(query: Promise<T>, fallback: T): Promise<T> {
    try {
      return await query;
    } catch (error: any) {
      if (error?.code === '42P01') return fallback;
      throw error;
    }
  }
}
