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

  async getDashboardTrends(from?: string, to?: string) {
    const range = this.resolveRange(from, to);
    const interval = this.calculateTrendInterval(range.start, range.end);

    const [qualityRows, throughputRows, orderRows, downtimeRows, machineRows] = await Promise.all([
      this.safeQuery(this.dataPointRepo.createQueryBuilder('dp')
      .select(`date_trunc('${interval}', dp.timestamp)::text`, 'ts')
      .addSelect("COUNT(CASE WHEN dp.quality = 'good' THEN 1 END)", 'good_count')
      .addSelect("COUNT(CASE WHEN dp.quality = 'bad' THEN 1 END)", 'bad_count')
      .where('dp.timestamp BETWEEN :start AND :end', { start: range.start, end: range.end })
      .groupBy(`date_trunc('${interval}', dp.timestamp)::text`)
      .orderBy("ts", 'ASC')
      .getRawMany(), []),
      this.safeQuery(this.dataPointRepo.createQueryBuilder('dp')
      .select(`date_trunc('${interval}', dp.timestamp)::text`, 'ts')
      .addSelect('SUM(dp.value)', 'throughput_value')
      .where('dp.timestamp BETWEEN :start AND :end', { start: range.start, end: range.end })
      .groupBy(`date_trunc('${interval}', dp.timestamp)::text`)
      .orderBy("ts", 'ASC')
      .getRawMany(), []),
      this.safeQuery(this.ordersRepo.createQueryBuilder('orders')
      .select(`date_trunc('${interval}', orders.created_at)::text`, 'ts')
      .addSelect("SUM(CASE WHEN orders.status = 'completed' THEN orders.completed_quantity ELSE 0 END)", 'completed_quantity')
      .where('orders.created_at BETWEEN :start AND :end', { start: range.start, end: range.end })
      .groupBy(`date_trunc('${interval}', orders.created_at)::text`)
      .orderBy("ts", 'ASC')
      .getRawMany(), []),
      this.safeQuery(this.downtimeRepo.createQueryBuilder('dt')
      .select(`date_trunc('${interval}', dt.start_time)::text`, 'ts')
      .addSelect("COALESCE(SUM(CASE WHEN dt.end_time IS NOT NULL THEN EXTRACT(EPOCH FROM (dt.end_time - dt.start_time)) / 60 ELSE 0 END), 0)", 'minutes')
      .addSelect('COUNT(*)', 'event_count')
      .where('dt.start_time BETWEEN :start AND :end', { start: range.start, end: range.end })
      .groupBy(`date_trunc('${interval}', dt.start_time)::text`)
      .orderBy('ts', 'ASC')
      .getRawMany(), []),
      this.safeQuery(this.machinesRepo.createQueryBuilder('machine')
      .select('machine.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('machine.status')
      .getRawMany(), []),
    ]);

    const allTimestamps = new Set<string>();
    qualityRows.forEach(r => allTimestamps.add(r.ts));
    throughputRows.forEach(r => allTimestamps.add(r.ts));
    orderRows.forEach(r => allTimestamps.add(r.ts));

    const points = Array.from(allTimestamps).sort().map((ts) => {
        const q = qualityRows.find(r => r.ts === ts);
        const t = throughputRows.find(r => r.ts === ts);
        const o = orderRows.find(r => r.ts === ts);
        const good = Number(q?.good_count) || 0;
        const bad = Number(q?.bad_count) || 0;
        return {
          timestamp: ts,
          completed_quantity: Number(o?.completed_quantity) || 0,
          throughput_value: t ? Math.round(Number(t.throughput_value)) : 0,
          quality_good_ratio: (good + bad) > 0 ? Math.round(good / (good + bad) * 1000) / 1000 : 1,
          good,
          bad,
        };
      });

    const machineStatusPoint = {
      timestamp: range.end.toISOString(),
      online: Number(machineRows.find((row) => row.status === MachineStatusEnum.ONLINE)?.count) || 0,
      idle: Number(machineRows.find((row) => row.status === MachineStatusEnum.IDLE)?.count) || 0,
      error: Number(machineRows.find((row) => row.status === MachineStatusEnum.ERROR)?.count) || 0,
      offline: Number(machineRows.find((row) => row.status === MachineStatusEnum.OFFLINE)?.count) || 0,
      maintenance: Number(machineRows.find((row) => row.status === MachineStatusEnum.MAINTENANCE)?.count) || 0,
    };

    return {
      from: range.start.toISOString(),
      to: range.end.toISOString(),
      trends: [
        { series: 'telemetry', points: points.map((point) => ({ timestamp: point.timestamp, avg: point.throughput_value, min: point.throughput_value, max: point.throughput_value })) },
        { series: 'order_progress', points: points.map((point) => ({ timestamp: point.timestamp, completedQty: point.completed_quantity })) },
        { series: 'throughput', points: points.map((point) => ({ timestamp: point.timestamp, completedQty: point.completed_quantity })) },
        { series: 'quality', points: points.map((point) => ({ timestamp: point.timestamp, good: point.good, bad: point.bad, yieldPct: this.percent(point.quality_good_ratio) })) },
        { series: 'oee', points: points.map((point) => ({ timestamp: point.timestamp, availability: 100, performance: point.completed_quantity > 0 ? 100 : 0, quality: this.percent(point.quality_good_ratio) })) },
        { series: 'downtime', points: downtimeRows.map((row) => ({ timestamp: row.ts, minutes: Math.round(Number(row.minutes) || 0), eventCount: Number(row.event_count) || 0 })) },
        { series: 'machine_status', points: [machineStatusPoint] },
      ],
    };
  }

  async getDowntimePareto(from?: string, to?: string) {
    const range = this.resolveRange(from, to);
    const rows = await this.safeQuery(this.downtimeParetoByMachine(range.start, range.end), []);
    return {
      from: range.start.toISOString(),
      to: range.end.toISOString(),
      data: rows.map((r) => ({
        machine_name: r.machine_name,
        downtime_minutes: Math.round(Number(r.downtime_minutes) || 0),
        event_count: Number(r.event_count) || 0,
      })),
    };
  }

  private calculateTrendInterval(start: Date, end: Date): string {
    const hours = (end.getTime() - start.getTime()) / 3600000;
    if (hours <= 1) return 'minute';
    if (hours <= 24) return 'hour';
    return 'day';
  }

  private downtimeParetoByMachine(start: Date, end: Date): Promise<Array<{ machine_name: string; downtime_minutes: string; event_count: string }>> {
    return this.downtimeRepo.createQueryBuilder('dt')
      .select("COALESCE(m.name, 'Unbekannt')", 'machine_name')
      .addSelect("COALESCE(SUM(CASE WHEN dt.end_time IS NOT NULL THEN EXTRACT(EPOCH FROM (LEAST(dt.end_time, :end) - GREATEST(dt.start_time, :start))) / 60 ELSE 0 END), 0)", 'downtime_minutes')
      .addSelect('COUNT(*)', 'event_count')
      .where('dt.start_time < :end AND (dt.end_time IS NULL OR dt.end_time > :start)', { start, end })
      .leftJoin('machines', 'm', 'm.id = "dt"."machine_id"')
      .groupBy("COALESCE(m.name, 'Unbekannt')")
      .orderBy('downtime_minutes', 'DESC')
      .getRawMany();
  }


  async getTelemetryTrend(from?: string, to?: string, interval?: string, nodeId?: string, machineId?: string) {
    const range = this.resolveRange(from, to);
    const chunkSize = interval || '1 min';

    let whereClause = 'dp.timestamp BETWEEN :start AND :end';
    const params: Record<string, any> = { start: range.start, end: range.end };

    if (nodeId) {
      whereClause += ' AND dp.node_id = :node_id';
      params.node_id = nodeId;
    }
    if (machineId) {
      whereClause += ' AND dp.machine_id = :machine_id';
      params.machine_id = machineId;
    }

    const query = `
      SELECT
        EXTRACT(EPOCH FROM time_bucket(${this.quoteLiteral(chunkSize)}, dp.timestamp))::bigint * 1000 AS ts,
        AVG(dp.value) AS avg_value,
        MIN(dp.value) AS min_value,
        MAX(dp.value) AS max_value,
        COUNT(*) AS cnt
      FROM data_points dp
      WHERE ${whereClause}
      GROUP BY ts
      ORDER BY ts ASC
    `;

    const rows = await this.safeQuery(
      this.dataPointRepo.query(query, params),
      [],
    );

    return {
      series: 'telemetry',
      node_id: nodeId || null,
      machine_id: machineId || null,
      interval: chunkSize,
      range: { from: range.start.toISOString(), to: range.end.toISOString() },
      points: rows.map((r: any) => ({
        timestamp: Number(r.ts),
        avg: parseFloat(r.avg_value) ?? 0,
        min: parseFloat(r.min_value) ?? 0,
        max: parseFloat(r.max_value) ?? 0,
        count: parseInt(r.cnt, 10) ?? 0,
      })),
    };
  }

  async getOrderProgressTrend(from?: string, to?: string, interval?: string) {
    const range = this.resolveRange(from, to);
    const chunkSize = interval || '5 min';

    const query = `
      SELECT
        EXTRACT(EPOCH FROM time_bucket(${this.quoteLiteral(chunkSize)}, o.created_at))::bigint * 1000 AS ts,
        COUNT(*) AS order_count,
        COALESCE(SUM(o.quantity), 0) AS target_qty,
        COALESCE(SUM(o.completed_quantity), 0) AS completed_qty
      FROM orders o
      WHERE o.created_at BETWEEN :start AND :end
      GROUP BY ts
      ORDER BY ts ASC
    `;

    const rows = await this.safeQuery(
      this.ordersRepo.query(query, { start: range.start, end: range.end }),
      [],
    );

    return {
      series: 'order_progress',
      interval: chunkSize,
      range: { from: range.start.toISOString(), to: range.end.toISOString() },
      points: rows.map((r: any) => ({
        timestamp: Number(r.ts),
        orderCount: parseInt(r.order_count, 10) ?? 0,
        targetQty: parseFloat(r.target_qty) ?? 0,
        completedQty: parseFloat(r.completed_qty) ?? 0,
      })),
    };
  }

  async getOeeTrend(from?: string, to?: string, interval?: string) {
    const range = this.resolveRange(from, to);
    const chunkSize = interval || '15 min';

    const downtimeQuery = `
      SELECT
        EXTRACT(EPOCH FROM time_bucket(${this.quoteLiteral(chunkSize)}, downtime.start_time))::bigint * 1000 AS ts,
        COALESCE(SUM(EXTRACT(EPOCH FROM (LEAST(COALESCE(downtime.end_time, :end), :end) - GREATEST(downtime.start_time, :start)))), 0) / 60.0 AS minutes
      FROM downtime_logs downtime
      WHERE downtime.start_time BETWEEN :start AND :end
      GROUP BY ts
      ORDER BY ts ASC
    `;

    const qualityQuery = `
      SELECT
        EXTRACT(EPOCH FROM time_bucket(${this.quoteLiteral(chunkSize)}, dp.timestamp))::bigint * 1000 AS ts,
        COUNT(CASE WHEN dp.quality = 'good' THEN 1 END) AS good,
        COUNT(CASE WHEN dp.quality = 'bad' THEN 1 END) AS bad
      FROM data_points dp
      WHERE dp.timestamp BETWEEN :start AND :end
      GROUP BY ts
      ORDER BY ts ASC
    `;

const [downtimeRows, qualityRows] = await Promise.all([
      this.safeQuery(this.downtimeRepo.query(downtimeQuery, { start: range.start, end: range.end }), []),
      this.safeQuery(this.dataPointRepo.query(qualityQuery, { start: range.start, end: range.end }), []),
    ]);

    const downtimeMap = new Map<number, number>();
    for (const r of downtimeRows as any[]) downtimeMap.set(Number(r.ts), parseFloat(r.minutes) ?? 0);

    const qualityMap = new Map<number, { good: number; bad: number }>();
    for (const r of qualityRows as any[]) qualityMap.set(Number(r.ts), { good: parseInt(r.good, 10) ?? 0, bad: parseInt(r.bad, 10) ?? 0 });

    const allTimestamps = new Set([...downtimeMap.keys(), ...qualityMap.keys()]);
    const oeePoints: Array<{ timestamp: number; availability: number; quality: number; performance: number }> = [];
    const machineCount = await this.machinesRepo.count();
    const plannedMinutesPerInterval = (parseInt(chunkSize.match(/\d+/)?.[0] || '15', 10) || 15) * machineCount;

    for (const ts of Array.from(allTimestamps).sort((a, b) => a - b)) {
      const dm = downtimeMap.get(ts) ?? 0;
      const qm = qualityMap.get(ts) ?? { good: 0, bad: 0 };
      const avail = plannedMinutesPerInterval > 0 ? Math.max(0, (plannedMinutesPerInterval - dm) / plannedMinutesPerInterval) : 1;
      const measured = qm.good + qm.bad;
      const qual = measured > 0 ? qm.good / measured : 1;
      oeePoints.push({
        timestamp: ts,
        availability: Math.round(avail * 1000) / 1000,
        quality: Math.round(qual * 1000) / 1000,
        performance: 1.0,
      });
    }

    return { series: 'oee', interval: chunkSize, range: { from: range.start.toISOString(), to: range.end.toISOString() }, points: oeePoints };
  }

  async getDowntimeTrend(from?: string, to?: string, interval?: string) {
    const range = this.resolveRange(from, to);
    const chunkSize = interval || '5 min';

    const query = `
      SELECT
        EXTRACT(EPOCH FROM time_bucket(${this.quoteLiteral(chunkSize)}, downtime.start_time))::bigint * 1000 AS ts,
        COALESCE(SUM(EXTRACT(EPOCH FROM (LEAST(COALESCE(downtime.end_time, :end), :end) - GREATEST(downtime.start_time, :start)))), 0) / 60.0 AS minutes,
        COUNT(*) AS event_count
      FROM downtime_logs downtime
      WHERE downtime.start_time BETWEEN :start AND :end
      GROUP BY ts
      ORDER BY ts ASC
    `;

    const rows = await this.safeQuery(
      this.downtimeRepo.query(query, { start: range.start, end: range.end }),
      [],
    );

    return {
      series: 'downtime',
      interval: chunkSize,
      range: { from: range.start.toISOString(), to: range.end.toISOString() },
      points: rows.map((r: any) => ({
        timestamp: Number(r.ts),
        minutes: parseFloat(r.minutes) ?? 0,
        eventCount: parseInt(r.event_count, 10) ?? 0,
      })),
    };
  }

  async getQualityTrend(from?: string, to?: string, interval?: string) {
    const range = this.resolveRange(from, to);
    const chunkSize = interval || '5 min';

    const query = `
      SELECT
        EXTRACT(EPOCH FROM time_bucket(${this.quoteLiteral(chunkSize)}, dp.timestamp))::bigint * 1000 AS ts,
        COUNT(CASE WHEN dp.quality = 'good' THEN 1 END) AS good,
        COUNT(CASE WHEN dp.quality = 'bad' THEN 1 END) AS bad,
        COUNT(*) AS total
      FROM data_points dp
      WHERE dp.timestamp BETWEEN :start AND :end
      GROUP BY ts
      ORDER BY ts ASC
    `;

    const rows = await this.safeQuery(
      this.dataPointRepo.query(query, { start: range.start, end: range.end }),
      [],
    );

    return {
      series: 'quality',
      interval: chunkSize,
      range: { from: range.start.toISOString(), to: range.end.toISOString() },
      points: rows.map((r: any) => {
        const good = parseInt(r.good, 10) ?? 0;
        const bad = parseInt(r.bad, 10) ?? 0;
        return {
          timestamp: Number(r.ts),
          good,
          bad,
          total: good + bad,
          yieldPct: (good + bad) > 0 ? Math.round((good / (good + bad)) * 1000) / 10 : 0,
        };
      }),
    };
  }

  async getThroughputTrend(from?: string, to?: string, interval?: string) {
    const range = this.resolveRange(from, to);
    const chunkSize = interval || '5 min';

    const query = `
      SELECT
        EXTRACT(EPOCH FROM time_bucket(${this.quoteLiteral(chunkSize)}, o.created_at))::bigint * 1000 AS ts,
        COALESCE(SUM(o.completed_quantity), 0) AS completed_qty
      FROM orders o
      WHERE o.created_at BETWEEN :start AND :end
      GROUP BY ts
      ORDER BY ts ASC
    `;

    const rows = await this.safeQuery(
      this.ordersRepo.query(query, { start: range.start, end: range.end }),
      [],
    );

    return {
      series: 'throughput',
      interval: chunkSize,
      range: { from: range.start.toISOString(), to: range.end.toISOString() },
      points: rows.map((r: any) => ({
        timestamp: Number(r.ts),
        completedQty: parseFloat(r.completed_qty) ?? 0,
      })),
    };
  }

  async getMachineStatusTrend(from?: string, to?: string, interval?: string, machineId?: string) {
    const range = this.resolveRange(from, to);
    const chunkSize = interval || '1 min';

    let whereClause = 'm.updated_at BETWEEN :start AND :end';
    const params: Record<string, any> = { start: range.start, end: range.end };

    if (machineId) {
      whereClause += ' AND m.id = :machine_id';
      params.machine_id = machineId;
    }

    const query = `
      SELECT
        EXTRACT(EPOCH FROM time_bucket(${this.quoteLiteral(chunkSize)}, m.updated_at))::bigint * 1000 AS ts,
        m.status,
        COUNT(*) AS cnt
      FROM machines m
      WHERE ${whereClause}
      GROUP BY ts, m.status
      ORDER BY ts ASC
    `;

    const rows = await this.safeQuery(
      this.machinesRepo.query(query, params),
      [],
    );

    const timestamps = new Set<number>();
    for (const r of rows as any[]) timestamps.add(Number(r.ts));

    const statusKeys = ['online', 'offline', 'maintenance', 'error', 'idle'];

    const points = Array.from(timestamps).sort((a, b) => a - b).map((ts) => {
      const point: Record<string, number> = { timestamp: ts };
      for (const s of statusKeys) {
        const matched = rows.find((r: any) => Number(r.ts) === ts && r.status === s);
        point[s] = matched ? parseInt(matched.cnt, 10) ?? 0 : 0;
      }
      return point;
    });

    return { series: 'machine_status', interval: chunkSize, range: { from: range.start.toISOString(), to: range.end.toISOString() }, points };
  }

  async getDeliveryProgressTrend(from?: string, to?: string, interval?: string) {
    const range = this.resolveRange(from, to);
    const chunkSize = interval || '5 min';

    const query = `
      SELECT
        m.name AS machine_name,
        m.id AS machine_id,
        EXTRACT(EPOCH FROM time_bucket(${this.quoteLiteral(chunkSize)}, o.created_at))::bigint * 1000 AS ts,
        COALESCE(SUM(o.quantity), 0) AS target_qty,
        COALESCE(SUM(o.completed_quantity), 0) AS completed_qty
      FROM orders o
      JOIN machines m ON m.id = o.machine_id
      WHERE o.created_at BETWEEN :start AND :end
      GROUP BY ts, m.name, m.id
      ORDER BY ts ASC
    `;

    const rows = await this.safeQuery(
      this.ordersRepo.query(query, { start: range.start, end: range.end }),
      [],
    );

    const machines = [...new Map(rows.map((r: any) => [r.machine_id, { id: r.machine_id, name: r.machine_name }])).values()];

    const groups: Record<string, any[]> = {};
    for (const r of rows as any[]) {
      if (!groups[r.machine_id]) groups[r.machine_id] = [];
      groups[r.machine_id].push({
        timestamp: Number(r.ts),
        targetQty: parseFloat(r.target_qty) ?? 0,
        completedQty: parseFloat(r.completed_qty) ?? 0,
      });
    }

    return { series: 'delivery_progress', interval: chunkSize, range: { from: range.start.toISOString(), to: range.end.toISOString() }, machines, groups };
  }

  async getDeliveryProgressDetail(machineId?: string) {
    let query = `
      SELECT m.id AS machine_id, m.name AS machine_name,
        COALESCE(SUM(o.quantity), 0) AS total_target,
        COALESCE(SUM(o.completed_quantity), 0) AS total_completed
      FROM orders o JOIN machines m ON m.id = o.machine_id
    `;

    const params: any[] = [];
    if (machineId) {
      query += ' WHERE m.id = $1';
      params.push(machineId);
    }

    query += ` GROUP BY m.id, m.name ORDER BY m.name`;

    const rows = await this.safeQuery(
      this.ordersRepo.query(query, params),
      [],
    );

    return { machines: rows.map((r: any) => ({
      id: r.machine_id,
      name: r.machine_name,
      target: parseFloat(r.total_target) ?? 0,
      completed: parseFloat(r.total_completed) ?? 0,
      progressPct: (parseFloat(r.total_target) ?? 0) > 0
        ? Math.round(((parseFloat(r.total_completed) ?? 0) / (parseFloat(r.total_target) ?? 1)) * 1000) / 10
        : 0,
    }))};
  }

  async getAllTrends(from?: string, to?: string, interval?: string) {
    const results = await Promise.allSettled([
      this.getTelemetryTrend(from, to, interval),
      this.getOrderProgressTrend(from, to, interval),
      this.getOeeTrend(from, to, interval),
      this.getDowntimeTrend(from, to, interval),
      this.getQualityTrend(from, to, interval),
      this.getThroughputTrend(from, to, interval),
      this.getMachineStatusTrend(from, to, interval),
      this.getDeliveryProgressTrend(from, to, interval),
    ]);

    const trends: any[] = [];
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) trends.push(r.value);
    }

    return { range: { from, to }, trends };
  }

  private quoteLiteral(value: string): string {
    return "'" + value.replace(/'/g, "''") + "'";
  }
}
