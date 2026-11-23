import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
const dayjs = require('dayjs');
import { ShiftEntity, ShiftReportEntity, ProductionBatchEntity } from './entities';
import { OrderEntity } from '../orders/order.entity';
import { MachineEntity, MachineStatusEnum } from '../machines/machine.entity';
import { DowntimeLogEntity } from '../machines/downtime.entity';
import { DataPointEntity } from '../data-collection/data-point.entity';
import { AlarmEntity } from '../alarms/alarm.entity';

@Injectable()
export class ShiftsService {
  private readonly logger = new Logger(ShiftsService.name);

  constructor(
    @InjectRepository(ShiftEntity)
    private readonly shiftRepo: Repository<ShiftEntity>,
    @InjectRepository(ShiftReportEntity)
    private readonly reportRepo: Repository<ShiftReportEntity>,
    @InjectRepository(ProductionBatchEntity)
    private readonly batchRepo: Repository<ProductionBatchEntity>,
    @InjectRepository(OrderEntity)
    private readonly ordersRepo: Repository<OrderEntity>,
    @InjectRepository(MachineEntity)
    private readonly machinesRepo: Repository<MachineEntity>,
    @InjectRepository(DowntimeLogEntity)
    private readonly downtimeRepo: Repository<DowntimeLogEntity>,
    @InjectRepository(DataPointEntity)
    private readonly dataPointsRepo: Repository<DataPointEntity>,
    @InjectRepository(AlarmEntity)
    private readonly alarmsRepo: Repository<AlarmEntity>,
  ) {}

  // --- Shifts ---

  async getAllShifts(filters?: { date?: string; type?: string }): Promise<ShiftEntity[]> {
    const where: Record<string, any> = {};
    if (filters?.date) where.date = filters.date as string;
    if (filters?.type) where.type = filters.type as 'day' | 'night' | 'swing';
    return this.shiftRepo.find({ where, order: { date: 'DESC', start_time: 'ASC' } });
  }

  async createShift(dto: Partial<ShiftEntity>): Promise<ShiftEntity> {
    const existing = await this.shiftRepo.findOne({
      where: { date: dto.date as string, type: dto.type },
    });
    if (existing) throw new Error('Schicht existiert bereits am ' + dto.date);

    const shift = this.shiftRepo.create(dto);
    return this.shiftRepo.save(shift);
  }

  async closeShift(id: string): Promise<ShiftEntity> {
    const shift = await this.getShift(id);
    shift.closed = true;
    return this.shiftRepo.save(shift);
  }

  // --- Reports ---

  async generateReport(shiftId: string, dateForApi?: string): Promise<ShiftReportEntity> {
    const shift = await this.getShift(shiftId);
    const dateStr = dayjs(dateForApi || shift.date).format('YYYY-MM-DD');
    const metrics = await this.getProductionMetrics(dateStr, shift.start_time, shift.end_time);

    return this.reportRepo.save(this.reportRepo.create({
      shift_id: shiftId,
      shift_name: shift.name,
      manager_name: shift.manager_name,
      shift_start: shift.start_time,
      shift_end: shift.end_time,
      date: dateStr,
      ...metrics,
    }));
  }

  async getAllReports(filters?: { date?: string }): Promise<ShiftReportEntity[]> {
    if (filters?.date) {
      return this.reportRepo.find({ where: { date: filters.date }, order: { created_at: 'DESC' } });
    }
    return this.reportRepo.find({ order: { created_at: 'DESC' } });
  }

  async getReport(id: string): Promise<ShiftReportEntity> {
    const report = await this.reportRepo.findOne({ where: { id } });
    if (!report) throw new Error(`Shift report ${id} not found`);
    return report;
  }

  async finalizeReport(id: string, notes?: string): Promise<ShiftReportEntity> {
    const report = await this.getReport(id);
    report.finalized = true;
    if (notes) report.notes = notes;
    return this.reportRepo.save(report);
  }

  // --- Production Batches ---

  async createBatch(dto: Partial<ProductionBatchEntity>): Promise<ProductionBatchEntity> {
    const batch = this.batchRepo.create({ ...dto, started_at: new Date() });
    return this.batchRepo.save(batch);
  }

  async completeBatch(batchId: string, completedQty?: number): Promise<ProductionBatchEntity> {
    const batch = await this.getBatch(batchId);
    batch.completed_quantity = completedQty || batch.target_quantity;
    batch.finished_at = new Date();
    return this.batchRepo.save(batch);
  }

  async getShiftSummary(date: string, shiftType?: 'day' | 'night' | 'swing'): Promise<ShiftReportEntity> {
    const shift = await this.shiftRepo.findOne({ where: { date, ...(shiftType ? { type: shiftType } : {}) } });
    if (shift) return this.generateReport(shift.id, date);

    const metrics = await this.getProductionMetrics(date, '00:00', '23:59:59');
    return this.reportRepo.create({
      shift_id: '',
      date,
      shift_start: '00:00',
      shift_end: '23:59:59',
      ...metrics,
    });
  }

  async getBatch(id: string): Promise<ProductionBatchEntity> {
    const batch = await this.batchRepo.findOne({ where: { id } });
    if (!batch) throw new Error(`Batch ${id} not found`);
    return batch;
  }

  // --- Helpers ---

  private async getShift(id: string): Promise<ShiftEntity> {
    const shift = await this.shiftRepo.findOne({ where: { id } });
    if (!shift) throw new Error(`Shift ${id} not found`);
    return shift;
  }

  async createReport(dto: Partial<ShiftReportEntity>): Promise<ShiftReportEntity> {
    const report = this.reportRepo.create(dto);
    return this.reportRepo.save(report);
  }

  private async getProductionMetrics(date: string, startTime: string, endTime: string) {
    const start = dayjs(`${date}T${startTime}`).toDate();
    let end = dayjs(`${date}T${endTime}`).toDate();
    if (end <= start) end = dayjs(end).add(1, 'day').toDate();

    const [orderStats, downtimeStats, qualityStats, machines, alarms] = await Promise.all([
      this.ordersRepo.createQueryBuilder('order')
        .select('COUNT(*)', 'total_orders')
        .addSelect("COUNT(CASE WHEN order.status = 'completed' THEN 1 END)", 'completed_orders')
        .addSelect("COUNT(CASE WHEN order.status = 'cancelled' THEN 1 END)", 'cancelled_orders')
        .addSelect('COALESCE(SUM(order.quantity), 0)', 'target_quantity')
        .addSelect('COALESCE(SUM(order.completed_quantity), 0)', 'completed_quantity')
        .where('order.created_at <= :end', { end })
        .andWhere('(order.end_time IS NULL OR order.end_time >= :start)', { start })
        .getRawOne(),
      this.downtimeRepo.createQueryBuilder('downtime')
        .select('COALESCE(SUM(downtime.duration_minutes), 0)', 'minutes')
        .where('downtime.start_time < :end', { end })
        .andWhere('(downtime.end_time IS NULL OR downtime.end_time > :start)', { start })
        .getRawOne(),
      this.dataPointsRepo.createQueryBuilder('point')
        .select("COUNT(CASE WHEN point.quality = 'good' THEN 1 END)", 'good')
        .addSelect("COUNT(CASE WHEN point.quality = 'bad' THEN 1 END)", 'bad')
        .where('point.timestamp BETWEEN :start AND :end', { start, end })
        .getRawOne(),
      this.machinesRepo.find(),
      this.alarmsRepo.find({ where: { acknowledged: false } }),
    ]);

    const totalOrders = Number(orderStats.total_orders) || 0;
    const completedOrders = Number(orderStats.completed_orders) || 0;
    const cancelledOrders = Number(orderStats.cancelled_orders) || 0;
    const targetQuantity = Number(orderStats.target_quantity) || 0;
    const completedQuantity = Number(orderStats.completed_quantity) || 0;
    const downtimeMinutes = Number(downtimeStats.minutes) || 0;
    const machineCount = machines.length;
    const plannedMinutes = Math.max(0, (end.getTime() - start.getTime()) / 60000) * machineCount;
    const availability = plannedMinutes ? Math.max(0, 100 * (plannedMinutes - downtimeMinutes) / plannedMinutes) : 0;
    const performance = targetQuantity ? Math.min(100, 100 * completedQuantity / targetQuantity) : 0;
    const good = Number(qualityStats.good) || 0;
    const bad = Number(qualityStats.bad) || 0;
    const quality = good + bad ? 100 * good / (good + bad) : 0;
    const activeMachines = machines.filter((machine) => machine.status !== MachineStatusEnum.OFFLINE).map((machine) => machine.name);
    const offlineMachines = machines.filter((machine) => machine.status === MachineStatusEnum.OFFLINE).map((machine) => machine.name);

    return {
      total_orders: totalOrders,
      completed_orders: completedOrders,
      cancelled_orders: cancelledOrders,
      oee_availability: this.round(availability),
      oee_performance: this.round(performance),
      oee_quality: this.round(quality),
      oee_total: this.round(availability * performance * quality / 10000),
      throughput_units: completedQuantity,
      active_machines: activeMachines,
      offline_machines: offlineMachines,
      total_downtime_minutes: this.round(downtimeMinutes),
      critical_alarms: alarms.filter((alarm) => alarm.severity === 'critical').map((alarm) => alarm.message),
      warnings: alarms.filter((alarm) => alarm.severity === 'warning' || alarm.severity === 'error').map((alarm) => alarm.message),
    };
  }

  private round(value: number) {
    return Math.round(value * 10) / 10;
  }
}
