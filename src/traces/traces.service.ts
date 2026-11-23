import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';
import { TraceEntity } from './trace.entity';
import type { CreateTraceDto, TraceQueryDto } from './trace.dto';
import { DataPointEntity } from '../data-collection/data-point.entity';

const TRACE_LIMIT = 500;

@Injectable()
export class TracesService {
  constructor(
    @InjectRepository(TraceEntity)
    private readonly tracesRepo: Repository<TraceEntity>,
    @InjectRepository(DataPointEntity)
    private readonly dataPointsRepo: Repository<DataPointEntity>,
  ) {}

  async create(dto: CreateTraceDto): Promise<TraceEntity> {
    const trace = this.tracesRepo.create({
      machine_id: dto.machine_id,
      order_id: dto.order_id,
      category: dto.category,
      key_data_point: dto.key_data_point,
      value: dto.value,
      tags: dto.tags,
    });
    return this.tracesRepo.save(trace);
  }

  async findAll(): Promise<TraceEntity[]> {
    return this.tracesRepo.find({ order: { collected_at: 'DESC' }, take: 500 });
  }

  async findAllWithFilters(query: TraceQueryDto): Promise<TraceEntity[]> {
    const where: Partial<TraceEntity> = {};
    if (query.machine_id) where.machine_id = query.machine_id;
    if (query.category) where.category = query.category;
    if (query.key_data_point) where.key_data_point = query.key_data_point;

    const qb = this.tracesRepo.createQueryBuilder('trace').where(where);
    const numericValue = `CASE
      WHEN jsonb_typeof(trace.value) = 'number' THEN CAST(trace.value AS numeric)
      WHEN jsonb_typeof(trace.value->'numeric_value') = 'number'
        THEN CAST(trace.value->>'numeric_value' AS numeric)
    END`;

    if (query.min_value !== undefined) {
      qb.andWhere(`(${numericValue}) >= :minVal`, { minVal: query.min_value });
    }
    if (query.max_value !== undefined) {
      qb.andWhere(`(${numericValue}) <= :maxVal`, { maxVal: query.max_value });
    }

    const traces = qb.orderBy('trace.collected_at', 'DESC');
    if (query.include_data_points !== 'true') {
      return traces.limit(query.machine_id || query.category ? 100 : TRACE_LIMIT).getMany();
    }

    const [storedTraces, dataPoints] = await Promise.all([
      traces.limit(TRACE_LIMIT).getMany(),
      this.findProcessDataPoints(query),
    ]);
    return [...storedTraces, ...dataPoints]
      .sort((a, b) => b.collected_at.getTime() - a.collected_at.getTime())
      .slice(0, TRACE_LIMIT);
  }

  private async findProcessDataPoints(query: TraceQueryDto): Promise<TraceEntity[]> {
    if (query.category && query.category !== 'process_data') return [];

    const { min_value: min, max_value: max } = query;
    const value = min !== undefined && max !== undefined ? Between(min, max)
      : min !== undefined ? MoreThanOrEqual(min)
      : max !== undefined ? LessThanOrEqual(max)
      : undefined;
    const points = await this.dataPointsRepo.find({
      where: {
        ...(query.machine_id && { machine_id: query.machine_id }),
        ...(query.key_data_point && { node_id: query.key_data_point }),
        ...(value && { value }),
      },
      order: { timestamp: 'DESC' },
      take: TRACE_LIMIT,
    });

    return points.map((point) => ({
      id: point.id,
      machine_id: point.machine_id,
      category: 'process_data',
      key_data_point: point.node_id,
      value: point.value,
      tags: { quality: point.quality },
      collected_at: point.timestamp,
    }));
  }

  async findOne(id: string): Promise<TraceEntity> {
    const trace = await this.tracesRepo.findOne({ where: { id } });
    if (!trace) throw new NotFoundException('Trace not found');
    return trace;
  }

  async getTracesByMachine(mId: string, take = 100): Promise<TraceEntity[]> {
    return this.tracesRepo.find({ where: { machine_id: mId }, order: { collected_at: 'DESC' }, take });
  }

  async getTracesByOrder(orderId: string, take = 100): Promise<TraceEntity[]> {
    return this.tracesRepo.find({ where: { order_id: orderId }, order: { collected_at: 'ASC' }, take });
  }

  async getTracesByCategory(category: 'process_data' | 'quality' | 'material' | 'energy' | 'op_input', take = 100): Promise<TraceEntity[]> {
    return this.tracesRepo.find({ where: { category: category as any }, order: { collected_at: 'DESC' }, take });
  }

  async bulkCreate(traces: CreateTraceDto[]): Promise<TraceEntity[]> {
    const entities = traces.map((dto) => this.tracesRepo.create(dto));
    return this.tracesRepo.save(entities);
  }
}
