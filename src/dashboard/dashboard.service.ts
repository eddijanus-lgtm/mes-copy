import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { OrderEntity } from '../orders/order.entity';
import { MachineEntity, MachineStatusEnum } from '../machines/machine.entity';
import { DowntimeLogEntity } from '../machines/downtime.entity';
import { DataPointEntity } from '../data-collection/data-point.entity';
import { TimescaleAggregateService } from './timescale-aggregate.service';
import {
  PRODUCTION_METRIC_NODE_IDS,
  ProductionMetricRole,
} from '../data-collection/production-metrics';

type MachineStatusCounts = Record<MachineStatusEnum, number>;

interface DashboardMachineSnapshot {
  total: number;
  connected: number;
  connectedResourceIds: number[];
  status: MachineStatusCounts;
}

interface ProductionMetricSample {
  machine_id: string;
  node_id: string;
  value: number | string;
  quality: 'good' | 'bad' | 'uncertain';
  timestamp: Date | string;
}

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
    private readonly aggregateService: TimescaleAggregateService,
  ) {}

  async getKpis(from?: string, to?: string) {
    const range = this.resolveRange(from, to);
    const [machineSnapshot, orderStats, downtimeStats, qualityRows, metricSamples] = await Promise.all([
      this.safeQuery(this.getMachineStatusSnapshot(range.end), {
        total: 0,
        connected: 0,
        connectedResourceIds: [],
        status: this.emptyMachineStatusCounts(),
      }),
      this.safeQuery(this.getOrderStats(range.start, range.end), { target_quantity: 0, completed_quantity: 0, completed_orders: 0, active_orders: 0 }),
      this.safeQuery(this.getDowntimeStats(range.start, range.end), { total_minutes: 0, event_count: 0 }),
      this.safeQuery(this.getQualityStats(range.start, range.end), { good_count: 0, bad_count: 0, uncertain_count: 0 }),
      this.safeQuery(this.getProductionMetricSamples(range.start, range.end), []),
    ]);

    const machineCount = machineSnapshot.total;
    const plannedMinutes =
      Math.max(0, (range.end.getTime() - range.start.getTime()) / 60000) *
      machineSnapshot.connected;
    const downtimeMinutes = Math.min(Number(downtimeStats.total_minutes) || 0, plannedMinutes);
    const availability =
      machineSnapshot.connected > 0 && plannedMinutes > 0
        ? (plannedMinutes - downtimeMinutes) / plannedMinutes
        : null;
    const completedQuantity = Number(orderStats.completed_quantity) || 0;
    const targetQuantity = Number(orderStats.target_quantity) || 0;
    const orderCompletion =
      targetQuantity > 0
        ? Math.min(completedQuantity / targetQuantity, 1)
        : null;
    const goodPoints = Number(qualityRows.good_count) || 0;
    const badPoints = Number(qualityRows.bad_count) || 0;
    const measuredPoints = goodPoints + badPoints;
    const telemetrySignalQuality =
      measuredPoints > 0 ? goodPoints / measuredPoints : null;
    const rangeHours = Math.max((range.end.getTime() - range.start.getTime()) / 3600000, 1);
    const production = this.calculateProductionMetrics(
      metricSamples,
      availability,
      range,
    );

    return {
      range: { from: range.start.toISOString(), to: range.end.toISOString() },
      oee: {
        availability:
          availability === null ? null : this.percent(availability),
        performance:
          production.performance === null
            ? null
            : this.percent(production.performance),
        quality:
          production.quality === null
            ? null
            : this.percent(production.quality),
        total:
          production.total === null ? null : this.percent(production.total),
        available: production.total !== null,
        missingInputs: production.missingInputs,
        availabilityBasis: 'calendar_time_minus_recorded_downtime',
        performanceBasis: 'machine_counter_delta_and_ideal_cycle_time',
        qualityBasis: 'machine_good_and_reject_counter_delta',
        productionCounts: {
          good: production.goodCount,
          reject: production.rejectCount,
        },
      },
      throughput: {
        completedQuantity,
        completedOrders: Number(orderStats.completed_orders) || 0,
        unitsPerHour: this.round(completedQuantity / rangeHours, 1),
      },
      yield:
        production.quality === null
          ? null
          : this.percent(production.quality),
      telemetrySignalQuality: {
        percent:
          telemetrySignalQuality === null
            ? null
            : this.percent(telemetrySignalQuality),
        goodSamples: goodPoints,
        badSamples: badPoints,
        uncertainSamples: Number(qualityRows.uncertain_count) || 0,
      },
      machines: {
        total: machineCount,
        connected: machineSnapshot.connected,
        connectedResourceIds: machineSnapshot.connectedResourceIds,
        status: machineSnapshot.status,
        downtimeMinutes: this.round(downtimeMinutes, 1),
        downtimeEvents: Number(downtimeStats.event_count) || 0,
      },
      orders: {
        targetQuantity,
        activeOrders: Number(orderStats.active_orders) || 0,
        completionPercent:
          orderCompletion === null ? null : this.percent(orderCompletion),
      },
    };
  }

  initializeContinuousAggregates() {
    return this.aggregateService.initializeContinuousAggregates();
  }

  private resolveRange(from?: string, to?: string) {
    const end = to && !Number.isNaN(Date.parse(to)) ? new Date(to) : new Date();
    const start = from && !Number.isNaN(Date.parse(from)) ? new Date(from) : new Date(end.getTime() - 8 * 60 * 60 * 1000);
    return start <= end ? { start, end } : { start: end, end: start };
  }

  private async getMachineStatusSnapshot(
    referenceTime: Date,
  ): Promise<DashboardMachineSnapshot> {
    const machines = await this.machinesRepo.find();
    const roots = machines.filter(
      (machine) => machine.parent_resource_id == null,
    );
    const childrenByParent = new Map<number, MachineEntity[]>();

    for (const machine of machines) {
      if (machine.parent_resource_id == null) continue;
      const children = childrenByParent.get(machine.parent_resource_id) ?? [];
      children.push(machine);
      childrenByParent.set(machine.parent_resource_id, children);
    }

    const status = this.emptyMachineStatusCounts();
    for (const root of roots) {
      const candidates = [
        root,
        ...(root.resource_id == null
          ? []
          : childrenByParent.get(root.resource_id) ?? []),
      ];
      const effectiveStatus = this.effectiveMachineStatus(
        root,
        candidates,
        referenceTime,
      );
      status[effectiveStatus] += 1;
    }

    const routableStations = machines.filter(
      (machine) =>
        machine.routing_enabled &&
        machine.opcua_enabled &&
        machine.resource_id != null,
    );
    const connectionTargets =
      routableStations.length > 0
        ? routableStations
        : roots.filter(
            (machine) =>
              machine.opcua_enabled && machine.resource_id != null,
          );
    const connectedResourceIds = connectionTargets
      .filter((machine) => this.hasFreshOnlineHeartbeat(machine, referenceTime))
      .map((machine) => machine.resource_id as number);

    return {
      total: roots.length,
      connected: connectedResourceIds.length,
      connectedResourceIds,
      status,
    };
  }

  private emptyMachineStatusCounts(): MachineStatusCounts {
    return Object.values(MachineStatusEnum).reduce((counts, status) => {
      counts[status] = 0;
      return counts;
    }, {} as MachineStatusCounts);
  }

  private effectiveMachineStatus(
    root: MachineEntity,
    candidates: MachineEntity[],
    referenceTime: Date,
  ): MachineStatusEnum {
    const liveCandidates = candidates.filter((machine) =>
      this.hasFreshOnlineHeartbeat(machine, referenceTime),
    );
    if (
      liveCandidates.some(
        (machine) => machine.status === MachineStatusEnum.ONLINE,
      )
    ) {
      return MachineStatusEnum.ONLINE;
    }
    if (
      liveCandidates.some(
        (machine) => machine.status === MachineStatusEnum.IDLE,
      )
    ) {
      return MachineStatusEnum.IDLE;
    }
    if (root.status === MachineStatusEnum.ERROR) {
      return MachineStatusEnum.ERROR;
    }
    if (root.status === MachineStatusEnum.MAINTENANCE) {
      return MachineStatusEnum.MAINTENANCE;
    }
    return MachineStatusEnum.OFFLINE;
  }

  private hasFreshOnlineHeartbeat(
    machine: MachineEntity,
    referenceTime: Date,
  ): boolean {
    if (
      machine.status !== MachineStatusEnum.ONLINE &&
      machine.status !== MachineStatusEnum.IDLE
    ) {
      return false;
    }
    if (!machine.last_heartbeat) return false;
    const heartbeatTime = new Date(machine.last_heartbeat).getTime();
    return (
      Number.isFinite(heartbeatTime) &&
      heartbeatTime <= referenceTime.getTime() &&
      referenceTime.getTime() - heartbeatTime <= 15_000
    );
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
      .addSelect("COUNT(CASE WHEN point.quality = 'uncertain' THEN 1 END)", 'uncertain_count')
      .where('point.timestamp BETWEEN :start AND :end', { start, end })
      .getRawOne();
  }

  private async getQualityStats(start: Date, end: Date) {
    const aggregateRows = await this.aggregateService.getQualityCountsFromAggregate(start, end);
    return aggregateRows ?? this.getQualityCounts(start, end);
  }

  private getProductionMetricSamples(
    start: Date,
    end: Date,
  ): Promise<ProductionMetricSample[]> {
    return this.dataPointRepo.query(
      `
        WITH baseline AS (
          SELECT DISTINCT ON (machine_id, node_id)
            machine_id, node_id, value, quality, timestamp
          FROM data_points
          WHERE node_id = ANY($1)
            AND timestamp <= $2
          ORDER BY machine_id, node_id, timestamp DESC
        ),
        range_samples AS (
          SELECT machine_id, node_id, value, quality, timestamp
          FROM data_points
          WHERE node_id = ANY($1)
            AND timestamp > $2
            AND timestamp <= $3
        )
        SELECT machine_id, node_id, value, quality, timestamp
        FROM (
          SELECT * FROM baseline
          UNION ALL
          SELECT * FROM range_samples
        ) samples
        ORDER BY machine_id, node_id, timestamp
      `,
      [Object.values(PRODUCTION_METRIC_NODE_IDS), start, end],
    );
  }

  private calculateProductionMetrics(
    samples: ProductionMetricSample[],
    availability: number | null,
    range: { start: Date; end: Date },
  ) {
    const roleByNodeId = new Map<string, ProductionMetricRole>(
      Object.entries(PRODUCTION_METRIC_NODE_IDS).map(([role, nodeId]) => [
        nodeId,
        role as ProductionMetricRole,
      ]),
    );
    const byMachine = new Map<
      string,
      Map<ProductionMetricRole, ProductionMetricSample[]>
    >();

    for (const sample of samples) {
      const role = roleByNodeId.get(sample.node_id);
      if (
        !role ||
        sample.quality !== 'good' ||
        !Number.isFinite(Number(sample.value))
      ) {
        continue;
      }
      const roles =
        byMachine.get(sample.machine_id) ||
        new Map<ProductionMetricRole, ProductionMetricSample[]>();
      const roleSamples = roles.get(role) || [];
      roleSamples.push(sample);
      roles.set(role, roleSamples);
      byMachine.set(sample.machine_id, roles);
    }

    const presentRoles = new Set<ProductionMetricRole>();
    let goodCount = 0;
    let rejectCount = 0;
    let idealProductionMs = 0;
    let observedOperatingMs = 0;

    for (const roles of byMachine.values()) {
      for (const role of roles.keys()) presentRoles.add(role);
      const idealSamples = roles.get('idealCycleTimeMs');
      const goodSamples = roles.get('goodCount');
      const rejectSamples = roles.get('rejectCount');
      if (!idealSamples || !goodSamples || !rejectSamples) continue;

      const sortedIdealSamples = this.sortMetricSamples(idealSamples);
      const idealCycleTimeMs = Number(
        sortedIdealSamples[sortedIdealSamples.length - 1]?.value,
      );
      const machineGood = this.counterDelta(goodSamples);
      const machineReject = this.counterDelta(rejectSamples);
      if (!Number.isFinite(idealCycleTimeMs) || idealCycleTimeMs <= 0) continue;

      goodCount += machineGood;
      rejectCount += machineReject;
      idealProductionMs +=
        idealCycleTimeMs * (machineGood + machineReject);
      const counterSamples = [...goodSamples, ...rejectSamples];
      const firstCounterTimestamp = Math.max(
        range.start.getTime(),
        Math.min(
          ...counterSamples.map((sample) =>
            new Date(sample.timestamp).getTime(),
          ),
        ),
      );
      const lastCounterTimestamp = Math.min(
        range.end.getTime(),
        Math.max(
          ...counterSamples.map((sample) =>
            new Date(sample.timestamp).getTime(),
          ),
        ),
      );
      observedOperatingMs += Math.max(
        0,
        lastCounterTimestamp - firstCounterTimestamp,
      );
    }

    const missingInputs: string[] = [];
    if (!presentRoles.has('idealCycleTimeMs')) {
      missingInputs.push('idealCycleTime');
    }
    if (!presentRoles.has('goodCount')) missingInputs.push('goodCount');
    if (!presentRoles.has('rejectCount')) missingInputs.push('rejectCount');

    const totalCount = goodCount + rejectCount;
    if (!missingInputs.length && totalCount === 0) {
      missingInputs.push('completedProductionCount');
    }

    const quality = totalCount > 0 ? goodCount / totalCount : null;
    const operatingMs =
      availability === null ? 0 : observedOperatingMs * availability;
    const performance =
      idealProductionMs > 0 && operatingMs > 0
        ? Math.min(idealProductionMs / operatingMs, 1)
        : null;
    const total =
      availability !== null && performance !== null && quality !== null
        ? availability * performance * quality
        : null;

    return {
      performance,
      quality,
      total,
      missingInputs,
      goodCount,
      rejectCount,
    };
  }

  private counterDelta(samples: ProductionMetricSample[]): number {
    const sorted = this.sortMetricSamples(samples);
    let delta = 0;
    for (let index = 1; index < sorted.length; index += 1) {
      const previous = Number(sorted[index - 1].value);
      const current = Number(sorted[index].value);
      if (current >= previous) {
        delta += current - previous;
      }
    }
    return Math.max(0, delta);
  }

  private sortMetricSamples(
    samples: ProductionMetricSample[],
  ): ProductionMetricSample[] {
    return [...samples].sort(
      (left, right) =>
        new Date(left.timestamp).getTime() -
        new Date(right.timestamp).getTime(),
    );
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

  async getDashboardTrends(from?: string, to?: string, interval?: string) {
    const range = this.resolveRange(from, to);
    const result = await this.getAllTrends(range.start.toISOString(), range.end.toISOString(), interval || this.intervalToTimescale(this.calculateTrendInterval(range.start, range.end)));

    return {
      from: range.start.toISOString(),
      to: range.end.toISOString(),
      trends: result.trends,
    };
  }

  async getDowntimePareto(from?: string, to?: string) {
    const range = this.resolveRange(from, to);
    const rows = await this.safeQuery(this.downtimeParetoByMachine(range.start, range.end), []);
    const totalDowntime = rows.reduce((sum, row) => sum + (Number(row.downtime_minutes) || 0), 0);
    let cumulativeDowntime = 0;

    return {
      from: range.start.toISOString(),
      to: range.end.toISOString(),
      data: rows.map((r) => {
        const downtimeMinutes = Math.round(Number(r.downtime_minutes) || 0);
        const availability = Number(r.availability_pct);
        cumulativeDowntime += downtimeMinutes;

        return {
          machine_id: r.machine_id,
          machine_name: r.machine_name,
          downtime_minutes: downtimeMinutes,
          event_count: Number(r.event_count) || 0,
          availability_pct: Number.isFinite(availability)
            ? this.round(availability, 1)
            : null,
          cumulative_pct: totalDowntime > 0 ? this.round(cumulativeDowntime / totalDowntime * 100, 1) : 0,
        };
      }),
    };
  }

  private calculateTrendInterval(start: Date, end: Date): string {
    const hours = (end.getTime() - start.getTime()) / 3600000;
    if (hours <= 1) return 'minute';
    if (hours <= 24) return 'hour';
    return 'day';
  }

  private intervalToTimescale(interval: string): string {
    if (interval === 'minute') return '1 min';
    if (interval === 'hour') return '1 hour';
    return '1 day';
  }

  private downtimeParetoByMachine(start: Date, end: Date): Promise<Array<{ machine_id: string; machine_name: string; downtime_minutes: string; event_count: string; availability_pct: string }>> {
    return this.downtimeRepo.createQueryBuilder('dt')
      .select('dt.machine_id', 'machine_id')
      .addSelect("COALESCE(m.name, 'Unbekannt')", 'machine_name')
      .addSelect("COALESCE(SUM(GREATEST(EXTRACT(EPOCH FROM (LEAST(COALESCE(dt.end_time, :end), :end) - GREATEST(dt.start_time, :start))) / 60, 0)), 0)", 'downtime_minutes')
      .addSelect('COUNT(*)', 'event_count')
      .addSelect("GREATEST(0, 100 - (COALESCE(SUM(GREATEST(EXTRACT(EPOCH FROM (LEAST(COALESCE(dt.end_time, :end), :end) - GREATEST(dt.start_time, :start))) / 60, 0)), 0) / NULLIF(EXTRACT(EPOCH FROM (CAST(:end AS timestamp) - CAST(:start AS timestamp))) / 60, 0) * 100))", 'availability_pct')
      .where('dt.start_time < :end AND (dt.end_time IS NULL OR dt.end_time > :start)', { start, end })
      .leftJoin('machines', 'm', 'm.id = "dt"."machine_id"')
      .groupBy('dt.machine_id')
      .addGroupBy("COALESCE(m.name, 'Unbekannt')")
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

    const downtimeRows = await this.safeQuery(
      this.downtimeRepo.query(downtimeQuery, {
        start: range.start,
        end: range.end,
      }),
      [],
    );

    const downtimeMap = new Map<number, number>();
    for (const r of downtimeRows as any[]) downtimeMap.set(Number(r.ts), parseFloat(r.minutes) ?? 0);

    const allTimestamps = new Set(downtimeMap.keys());
    const oeePoints: Array<{
      timestamp: number;
      availability: number | null;
      quality: null;
      performance: null;
      total: null;
    }> = [];
    const machineCount = await this.machinesRepo.count({
      where: { parent_resource_id: IsNull() },
    });
    const plannedMinutesPerInterval =
      this.intervalMinutes(chunkSize) * machineCount;

    for (const ts of Array.from(allTimestamps).sort((a, b) => a - b)) {
      const dm = downtimeMap.get(ts) ?? 0;
      const avail =
        plannedMinutesPerInterval > 0
          ? Math.max(
              0,
              (plannedMinutesPerInterval - dm) / plannedMinutesPerInterval,
            )
          : null;
      oeePoints.push({
        timestamp: ts,
        availability:
          avail === null ? null : Math.round(avail * 1000) / 1000,
        quality: null,
        performance: null,
        total: null,
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

  private intervalMinutes(interval: string): number {
    const match = interval.trim().match(/^(\d+)\s+(min|minute|hour|day)s?$/i);
    if (!match) return 15;
    const amount = Number(match[1]);
    const unit = match[2].toLowerCase();
    if (unit === 'hour') return amount * 60;
    if (unit === 'day') return amount * 24 * 60;
    return amount;
  }
}
