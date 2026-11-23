import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { DataPointEntity } from './data-point.entity';
import type { CreateDataPointDto } from './data-point.dto';

@Injectable()
export class DataCollectionService {
  constructor(
    @InjectRepository(DataPointEntity)
    private readonly dataPointsRepo: Repository<DataPointEntity>,
  ) {}

  async create(dto: CreateDataPointDto): Promise<DataPointEntity> {
    const dp = this.dataPointsRepo.create({
      machine_id: dto.machine_id,
      node_id: dto.node_id,
      value: dto.value,
      quality: dto.quality || 'good',
      timestamp: dto.timestamp || new Date(),
    });
    return this.dataPointsRepo.save(dp);
  }

  async findAll(machineId: string, nodeId?: string): Promise<DataPointEntity[]> {
    const where: Record<string, any> = { machine_id: machineId };
    if (nodeId) where.node_id = nodeId;
    return this.dataPointsRepo.find({ where, order: { timestamp: 'DESC' }, take: 100 });
  }

  async findByTimeRange(machineId: string, start: Date, end: Date, nodeId?: string): Promise<DataPointEntity[]> {
    const qry = this.dataPointsRepo.createQueryBuilder('dp2');
    qry.where('dp2.machine_id = :mid', { mid: machineId }).andWhere('dp2.timestamp BETWEEN :s AND :e', { s: start, e: end });
    if (nodeId) qry.andWhere('dp2.node_id = :nid', { nid: nodeId });
    return qry.getMany();
  }

  async bulkCreate(points: CreateDataPointDto[]): Promise<DataPointEntity[]> {
    const entities = points.map((dto) => this.dataPointsRepo.create(dto));
    return this.dataPointsRepo.save(entities);
  }

  async getLatestByMachine(machineId: string, nodeId?: string): Promise<DataPointEntity[]> {
    const sub = this.dataPointsRepo.createQueryBuilder('dp3')
      .select('MAX(dp3.timestamp)', 'max_ts')
      .where('dp3.machine_id = :machineId', { machineId })
      .groupBy('dp3.node_id');
    if (nodeId) sub.andWhere('dp3.node_id = :nodeId', { nodeId });

    return this.dataPointsRepo.createQueryBuilder('dp4')
      .innerJoin('(' + sub.getQuery() + ')', 'max', 'dp4.timestamp = max.max_ts AND dp4.node_id = max.node_id')
      .where('dp4.machine_id = :machineId', { machineId })
      .orderBy('dp4.node_id')
      .getMany();
  }

  async getStatsByMachine(machineId: string, nodeId?: string): Promise<{ min: number; max: number; avg: number; count: number }> {
    const qb = this.dataPointsRepo.createQueryBuilder('dp5').select(['MIN(dp5.value)', 'MAX(dp5.value)', 'AVG(dp5.value)', 'COUNT(dp5.id)']);
    qb.where('dp5.machine_id = :machineId', { machineId });
    if (nodeId) qb.andWhere('dp5.node_id = :nodeId', { nodeId });
    const stats = await qb.getRawOne();
    return {
      min: parseFloat(stats['MIN(dp5.value)'] || '0'),
      max: parseFloat(stats['MAX(dp5.value)'] || '0'),
      avg: parseFloat((stats['AVG(dp5.value)'] || '0').toFixed(4)),
      count: parseInt(stats['COUNT(dp5.id)'] || '0', 10),
    };
  }
}
