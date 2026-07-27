import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
const dayjs = require('dayjs');
import { ShiftEntity, ShiftReportEntity, ProductionBatchEntity } from './entities';
import { OrderEntity } from '../orders/order.entity';
import { MachineEntity, MachineStatusEnum } from '../machines/machine.entity';
import { DashboardService } from '../dashboard/dashboard.service';

@Injectable()
export class ShiftsService {
  constructor(
    @InjectRepository(ShiftEntity)
    private readonly shiftRepo: Repository<ShiftEntity>,
    @InjectRepository(ShiftReportEntity)
    private readonly reportRepo: Repository<ShiftReportEntity>,
    @InjectRepository(ProductionBatchEntity)
    private readonly batchRepo: Repository<ProductionBatchEntity>,
    @InjectRepository(OrderEntity)
    private readonly orderRepo: Repository<OrderEntity>,
    @InjectRepository(MachineEntity)
    private readonly machineRepo: Repository<MachineEntity>,
    private readonly dashboard: DashboardService,
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
    if (existing) throw new ConflictException('Schicht existiert bereits am ' + dto.date);

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
    const { start, end } = this.resolveShiftWindow(dateStr, shift.start_time, shift.end_time);
    const [kpis, orderStats, machines] = await Promise.all([
      this.dashboard.getKpis(start.toISOString(), end.toISOString()),
      this.getOrderStats(start, end),
      this.machineRepo.find({ order: { name: 'ASC' } }),
    ]);
    const activeStatuses = new Set([
      MachineStatusEnum.ONLINE,
      MachineStatusEnum.IDLE,
    ]);

    const report = this.reportRepo.create({
      shift_id: shiftId,
      shift_name: shift.name,
      manager_name: shift.manager_name || 'N/A',
      shift_start: shift.start_time,
      shift_end: shift.end_time,
      date: dateStr,
      total_orders: orderStats.totalOrders,
      completed_orders: orderStats.completedOrders,
      cancelled_orders: orderStats.cancelledOrders,
      oee_availability: kpis.oee.availability,
      oee_performance: kpis.oee.performance,
      oee_quality: kpis.oee.quality,
      oee_total: kpis.oee.total,
      throughput_units: kpis.throughput.completedQuantity,
      active_machines: machines
        .filter((machine) => activeStatuses.has(machine.status))
        .map((machine) => machine.name),
      offline_machines: machines
        .filter((machine) => !activeStatuses.has(machine.status))
        .map((machine) => machine.name),
      total_downtime_minutes: kpis.machines.downtimeMinutes,
    });

    return this.reportRepo.save(report);
  }

  async getAllReports(filters?: { date?: string }): Promise<ShiftReportEntity[]> {
    if (filters?.date) {
      return this.reportRepo.find({ where: { date: filters.date }, order: { created_at: 'DESC' } });
    }
    return this.reportRepo.find({ order: { created_at: 'DESC' } });
  }

  async getReport(id: string): Promise<ShiftReportEntity> {
    const report = await this.reportRepo.findOne({ where: { id } });
    if (!report) throw new NotFoundException(`Shift report ${id} not found`);
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

  async completeBatch(batchId: string, completedQty: number): Promise<ProductionBatchEntity> {
    if (!Number.isInteger(completedQty) || completedQty < 0) {
      throw new BadRequestException(
        'completed_quantity must be provided as a non-negative integer',
      );
    }
    const batch = await this.getBatch(batchId);
    batch.completed_quantity = completedQty;
    batch.finished_at = new Date();
    return this.batchRepo.save(batch);
  }

  async getShiftSummary(date: string, shiftType?: 'day' | 'night' | 'swing'): Promise<ShiftReportEntity> {
    const shifts = await this.shiftRepo.find({
      where: {
        date,
        ...(shiftType ? { type: shiftType } : {}),
      },
      order: { start_time: 'ASC' },
    });
    if (!shifts.length) {
      throw new NotFoundException(`No shift found for ${date}`);
    }
    return this.generateReport(shifts[0].id, date);
  }

  async getBatches(shiftId?: string): Promise<ProductionBatchEntity[]> {
    return this.batchRepo.find({
      where: shiftId ? { id: shiftId } : {},
      order: { created_at: 'DESC' },
    });
  }

  async getBatch(id: string): Promise<ProductionBatchEntity> {
    const batch = await this.batchRepo.findOne({ where: { id } });
    if (!batch) throw new NotFoundException(`Batch ${id} not found`);
    return batch;
  }

  // --- Helpers ---

  private async getShift(id: string): Promise<ShiftEntity> {
    const shift = await this.shiftRepo.findOne({ where: { id } });
    if (!shift) throw new NotFoundException(`Shift ${id} not found`);
    return shift;
  }

  async createReport(dto: Partial<ShiftReportEntity>): Promise<ShiftReportEntity> {
    const report = this.reportRepo.create(dto);
    return this.reportRepo.save(report);
  }

  private resolveShiftWindow(date: string, startTime: string, endTime: string) {
    const start = dayjs(`${date}T${startTime}`);
    let end = dayjs(`${date}T${endTime}`);
    if (!end.isAfter(start)) end = end.add(1, 'day');
    return { start: start.toDate(), end: end.toDate() };
  }

  private async getOrderStats(start: Date, end: Date): Promise<{
    totalOrders: number;
    completedOrders: number;
    cancelledOrders: number;
  }> {
    const row = await this.orderRepo
      .createQueryBuilder('orders')
      .select('COUNT(*)', 'total_orders')
      .addSelect(
        "COUNT(CASE WHEN orders.status = 'completed' THEN 1 END)",
        'completed_orders',
      )
      .addSelect(
        "COUNT(CASE WHEN orders.status = 'cancelled' THEN 1 END)",
        'cancelled_orders',
      )
      .where('orders.created_at < :end', { end })
      .andWhere('(orders.end_time IS NULL OR orders.end_time >= :start)', {
        start,
      })
      .getRawOne<{
        total_orders: string;
        completed_orders: string;
        cancelled_orders: string;
      }>();

    return {
      totalOrders: Number(row?.total_orders) || 0,
      completedOrders: Number(row?.completed_orders) || 0,
      cancelledOrders: Number(row?.cancelled_orders) || 0,
    };
  }
}
