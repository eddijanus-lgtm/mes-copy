import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AlarmEntity } from './alarm.entity';
import type { CreateAlarmDto, UpdateAlarmDto } from './alarm.dto';

interface FindAllFilters {
  acknowledged?: boolean;
  severity?: string;
  machine_id?: string;
}

@Injectable()
export class AlarmsService {
  constructor(
    @InjectRepository(AlarmEntity)
    private readonly alarmsRepo: Repository<AlarmEntity>,
  ) {}

  async create(dto: CreateAlarmDto): Promise<AlarmEntity> {
    const alarm = this.alarmsRepo.create({
      severity: dto.severity,
      machine_id: dto.machine_id,
      message: dto.message,
      source: dto.source,
    });
    return this.alarmsRepo.save(alarm);
  }

  async findAll(filters?: FindAllFilters): Promise<AlarmEntity[]> {
    const where: Record<string, any> = {};
    if (filters?.acknowledged !== undefined) where.acknowledged = filters.acknowledged;
    if (filters?.severity) where.severity = filters.severity;
    if (filters?.machine_id) where.machine_id = filters.machine_id;
    return this.alarmsRepo.find({
      where,
      order: { created_at: 'DESC' },
    });
  }

  async findOne(id: string): Promise<AlarmEntity> {
    const alarm = await this.alarmsRepo.findOne({ where: { id } });
    if (!alarm) throw new NotFoundException('Alarm not found');
    return alarm;
  }

  async update(id: string, dto: UpdateAlarmDto): Promise<AlarmEntity> {
    const alarm = await this.findOne(id);
    Object.assign(alarm, dto);
    if (dto.acknowledged_at) alarm.acknowledged = true;
    return this.alarmsRepo.save(alarm);
  }

  async acknowledge(id: string): Promise<AlarmEntity> {
    const alarm = await this.findOne(id);
    alarm.acknowledged = true;
    alarm.acknowledged_at = new Date();
    return this.alarmsRepo.save(alarm);
  }

  async remove(id: string): Promise<void> {
    const result = await this.alarmsRepo.delete(id);
    if (result.affected === 0) throw new NotFoundException('Alarm not found');
  }

  async bulkAcknowledge(ids: string[]): Promise<{ acknowledged: number; skipped: number }> {
    if (!ids?.length) return { acknowledged: 0, skipped: 0 };
    const now = new Date();
    let acknowledged = 0;
    let skipped = 0;
    for (const id of ids) {
      const alarm = await this.alarmsRepo.findOne({ where: { id } });
      if (alarm && !alarm.acknowledged) {
        alarm.acknowledged = true;
        alarm.acknowledged_at = now;
        await this.alarmsRepo.save(alarm);
        acknowledged++;
      } else {
        skipped++;
      }
    }
    return { acknowledged, skipped };
  }

  async bulkRemove(ids: string[]): Promise<{ removed: number; notFound: number }> {
    if (!ids?.length) return { removed: 0, notFound: 0 };
    let removed = 0;
    let notFound = 0;
    for (const id of ids) {
      const result = await this.alarmsRepo.delete(id);
      if (result.affected && result.affected > 0) {
        removed++;
      } else {
        notFound++;
      }
    }
    return { removed, notFound };
  }

  async exportCsv(filters?: FindAllFilters): Promise<string> {
    const alarms = await this.findAll(filters);
    const headers = ['ID', 'Severity', 'Machine ID', 'Message', 'Source', 'Acknowledged', 'Acknowledged At', 'Created At'];
    const rows = alarms.map((a) => [
      a.id,
      a.severity,
      a.machine_id,
      `"${(a.message || '').replace(/"/g, '""')}"`,
      a.source || '',
      a.acknowledged ? 'true' : 'false',
      a.acknowledged_at ? new Date(a.acknowledged_at).toISOString() : '',
      new Date(a.created_at).toISOString(),
    ]);
    return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  }

  async setActiveCount(): Promise<number> {
    return this.alarmsRepo.count({ where: { acknowledged: false } });
  }
}
