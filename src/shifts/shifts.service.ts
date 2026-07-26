import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
const dayjs = require('dayjs');
import { ShiftEntity, ShiftReportEntity, ProductionBatchEntity } from './entities';

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
    const startOfDay = dayjs(dateStr).startOf('day').toISOString();
    const endOfDay = dayjs(dateStr).endOf('day').toISOString();

    // Orders stats (simulated from existing orders module)
    const totalOrders = Math.floor(Math.random() * 5);
    const completedOrders = Math.floor(totalOrders * 0.8);
    const cancelledOrders = totalOrders - completedOrders;

    // OEE calculation placeholder
    const oeeAvail = 85 + Math.floor(Math.random() * 10);
    const oeePerf = 75 + Math.floor(Math.random() * 10);
    const oeeQual = 90 + Math.floor(Math.random() * 5);
    const oeeTotal = (oeeAvail / 100) * (oeePerf / 100) * (oeeQual / 100) * 100;

    const report = this.reportRepo.create({
      shift_id: shiftId,
      shift_name: shift.name,
      manager_name: shift.manager_name || 'N/A',
      shift_start: shift.start_time,
      shift_end: shift.end_time,
      date: dateStr,
      total_orders: totalOrders,
      completed_orders: completedOrders,
      cancelled_orders: cancelledOrders,
      oee_availability: oeeAvail,
      oee_performance: oeePerf,
      oee_quality: oeeQual,
      oee_total: parseFloat(oeeTotal.toFixed(2)),
      throughput_units: 150 + Math.floor(Math.random() * 50),
      active_machines: ['Resource1', 'Resource2', 'Resource3'],
      offline_machines: [],
      total_downtime_minutes: 10 + Math.floor(Math.random() * 30),
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

  async completeBatch(batchId: string, completedQty?: number): Promise<ProductionBatchEntity> {
    const batch = await this.getBatch(batchId);
    batch.completed_quantity = completedQty ?? batch.target_quantity;
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

  // TODO: Implement production report generation with real data from Orders, Downtime, DataCollection modules
  private async generateReportForDate(dateStr: string): Promise<ShiftReportEntity> {
    const start = dayjs(dateStr).startOf('day').toISOString();
    const end = dayjs(dateStr).endOf('day').toISOString();

    // Simulate report data until we have actual integration with Orders/Downtime/DataCollection modules
    const totalOrders = Math.floor(Math.random() * 5);
    const completedOrders = Math.floor(totalOrders * 0.8);
    const cancelledOrders = totalOrders - completedOrders;
    const oeeAvail = 85 + Math.floor(Math.random() * 10);
    const oeePerf = 75 + Math.floor(Math.random() * 10);
    const oeeQual = 90 + Math.floor(Math.random() * 5);
    const oeeTotal = (oeeAvail / 100) * (oeePerf / 100) * (oeeQual / 100) * 100;

    return this.reportRepo.save(this.reportRepo.create({
      date: dateStr,
      shift_start: '06:00',
      shift_end: '14:00',
      total_orders: totalOrders,
      completed_orders: completedOrders,
      cancelled_orders: cancelledOrders,
      oee_availability: oeeAvail,
      oee_performance: oeePerf,
      oee_quality: oeeQual,
      oee_total: parseFloat(oeeTotal.toFixed(2)),
      throughput_units: 150 + Math.floor(Math.random() * 50),
      active_machines: ['Resource1', 'Resource2', 'Resource3'],
      offline_machines: [],
      total_downtime_minutes: 10 + Math.floor(Math.random() * 30),
    }));
  }

  async createReport(dto: Partial<ShiftReportEntity>): Promise<ShiftReportEntity> {
    const report = this.reportRepo.create(dto);
    return this.reportRepo.save(report);
  }

  /** TODO: Implement production report generation with real data from Orders, Downtime, DataCollection modules */
}
