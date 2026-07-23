import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TraceEntity } from './trace.entity';
import type { CreateTraceDto, TraceQueryDto } from './trace.dto';

@Injectable()
export class TracesService {
  constructor(
    @InjectRepository(TraceEntity)
    private readonly tracesRepo: Repository<TraceEntity>,
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
    const where: Record<string, any> = {};
    if (query.machine_id) where.machine_id = query.machine_id;
    if (query.category) where.category = query.category;
    if (query.key_data_point) where.key_data_point = query.key_data_point;

    let qb = this.tracesRepo.createQueryBuilder('trace').where(where);

    if (query.min_value !== undefined) {
      qb = qb.andWhere('trace.value->>\'numeric_value\' >= :minVal', { minVal: query.min_value });
    }
    if (query.max_value !== undefined) {
      qb = qb.andWhere('trace.value->>\'numeric_value\' <= :maxVal', { maxVal: query.max_value });
    }

    return qb.orderBy('trace.collected_at', 'DESC').limit(500).getMany();
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
