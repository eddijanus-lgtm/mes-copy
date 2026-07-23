import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DowntimeTypeEnum, DowntimeLogEntity } from './downtime.entity';
import { MachineEntity, MachineStatusEnum } from './machine.entity';
import { CreateDowntimeDto, ResumeMachineDto, StopMachineDto } from './downtime.dto';

@Injectable()
export class DowntimeService {
  constructor(
    @InjectRepository(DowntimeLogEntity)
    private readonly downtimeRepo: Repository<DowntimeLogEntity>,
    @InjectRepository(MachineEntity)
    private readonly machineRepo: Repository<MachineEntity>,
  ) {}

  async create(dto: CreateDowntimeDto): Promise<DowntimeLogEntity> {
    const machine = await this.machineRepo.findOne({ where: { id: dto.machine_id } });
    if (!machine) throw new NotFoundException('Machine not found');

    const log = this.downtimeRepo.create({
      machine_id: dto.machine_id,
      type: dto.type,
      reason: dto.reason,
      description: dto.description,
      start_time: dto.start_time,
      end_time: dto.end_time,
      operator: dto.operator,
    });

    if (dto.end_time) {
      const durationMs = dto.end_time.getTime() - dto.start_time.getTime();
      log.duration_minutes = Math.round(durationMs / 60000);
    }

    return this.downtimeRepo.save(log);
  }

  async stopMachine(dto: StopMachineDto): Promise<DowntimeLogEntity & { machine: MachineEntity }> {
    const machine = await this.machineRepo.findOne({ where: { id: dto.machine_id } });
    if (!machine) throw new NotFoundException('Machine not found');

    // Check if already in downtime
    const openDowntime = await this.downtimeRepo.findOne({
      where: { machine_id: dto.machine_id, end_time: undefined as any },
    });
    if (openDowntime) {
      throw new BadRequestException(`Machine ${machine.name} is already in downtime: ${openDowntime.reason || 'no reason provided'}`);
    }

    // Update machine status to error
    await this.machineRepo.update(dto.machine_id, { status: MachineStatusEnum.ERROR });

    const log = await this.create({
      machine_id: dto.machine_id,
      type: dto.type,
      reason: dto.reason,
      description: dto.description,
      start_time: new Date(),
    });

    // Reload with relation
    return this.downtimeRepo.findOne({
      where: { id: log.id },
    }) as Promise<DowntimeLogEntity & { machine: MachineEntity }>;
  }

  async resumeMachine(dto: ResumeMachineDto): Promise<{ downtimeLog: DowntimeLogEntity; machine: MachineEntity }> {
    const machine = await this.machineRepo.findOne({ where: { id: dto.machine_id } });
    if (!machine) throw new NotFoundException('Machine not found');

    const openDowntime = await this.downtimeRepo.findOne({
      where: { machine_id: dto.machine_id, end_time: undefined as any },
    });
    if (!openDowntime) {
      throw new BadRequestException(`Machine ${machine.name} has no active downtime`);
    }

    const endTime = new Date();
    openDowntime.end_time = endTime;
    openDowntime.duration_minutes = Math.round(
      (endTime.getTime() - openDowntime.start_time.getTime()) / 60000
    );

    if (dto.notes) {
      openDowntime.description = `${openDowntime.description || ''} [Note: ${dto.notes}]`.trim();
    }

    await this.downtimeRepo.save(openDowntime);

    // Reset machine status back to online
    await this.machineRepo.update(dto.machine_id, { status: MachineStatusEnum.ONLINE });

    return {
      downtimeLog: openDowntime,
      machine: (await this.machineRepo.findOne({ where: { id: dto.machine_id } })) as MachineEntity,
    };
  }

  async findAll(machineId?: string): Promise<DowntimeLogEntity[]> {
    const where: any = {};
    if (machineId) where.machine_id = machineId;
    return this.downtimeRepo.find({
      where,
      order: { start_time: 'DESC' },
    });
  }

  async findOne(id: string): Promise<DowntimeLogEntity> {
    const log = await this.downtimeRepo.findOne({ where: { id } });
    if (!log) throw new NotFoundException('Downtime log not found');
    return log;
  }

  async remove(id: string): Promise<void> {
    const result = await this.downtimeRepo.delete(id);
    if (result.affected === 0) throw new NotFoundException('Downtime log not found');
  }

  async getMachineDowntimeStats(machineId: string): Promise<{
    totalDowntimeMinutes: number;
    breakdownCount: number;
    avgDowntimeMinutes: number;
    openDowntime: boolean;
  }> {
    const machine = await this.machineRepo.findOne({ where: { id: machineId } });
    if (!machine) throw new NotFoundException('Machine not found');

    const logs = await this.downtimeRepo.find({
      where: { machine_id: machineId } as any,
    });

    const closedLogs = logs.filter((l) => l.end_time !== null);
    const openDowntime = logs.some((l) => l.end_time === null);
    const totalMinutes = closedLogs.reduce((sum, l) => sum + (l.duration_minutes || 0), 0);

    return {
      totalDowntimeMinutes: Math.round(totalMinutes),
      breakdownCount: closedLogs.length,
      avgDowntimeMinutes: closedLogs.length > 0 ? Math.round(totalMinutes / closedLogs.length) : 0,
      openDowntime,
    };
  }

  async getPeriodStats(startDate: Date, endDate: Date): Promise<
    Array<{ machine_name: string; total_minutes: number; breakdown_count: number }>
  > {
    const results = await this.downtimeRepo.createQueryBuilder('dt')
      .leftJoin('dt.machine', 'm')
      .select([
        "m.name AS machine_name",
        "COALESCE(SUM(CASE WHEN dt.end_time IS NOT NULL THEN EXTRACT(EPOCH FROM (dt.end_time - dt.start_time)) / 60 ELSE 0 END), 0) AS total_minutes",
        "COUNT(CASE WHEN dt.end_time IS NOT NULL THEN 1 END) AS breakdown_count",
      ])
      .where('dt.start_time BETWEEN :start AND :end', { start: startDate, end: endDate })
      .groupBy('m.name')
      .getRawMany();

    return results.map((r) => ({
      machine_name: r.machine_name,
      total_minutes: Math.round(Number(r.total_minutes)),
      breakdown_count: Number(r.breakdown_count),
    }));
  }
}
