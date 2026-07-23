import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MachineEntity, MachineStatusEnum } from './machine.entity';
import type { CreateMachineDto, UpdateMachineDto } from './machine.dto';

@Injectable()
export class MachinesService {
  constructor(
    @InjectRepository(MachineEntity)
    private readonly machinesRepo: Repository<MachineEntity>,
  ) {}

  async create(dto: CreateMachineDto): Promise<MachineEntity> {
    const machine = this.machinesRepo.create({
      name: dto.name,
      status: dto.status as MachineStatusEnum,
      type: dto.type,
      location: dto.location,
      model: dto.model,
      serial_number: dto.serial_number,
      resource_id: dto.resource_id,
      opcua_endpoint_url: dto.opcua_endpoint_url,
      opcua_node_prefix: dto.opcua_node_prefix,
      opcua_enabled: dto.opcua_enabled || false,
      telemetry: {},
    });
    return this.machinesRepo.save(machine);
  }

  async findAll(): Promise<MachineEntity[]> {
    return this.machinesRepo.find({ order: { name: 'ASC' } });
  }

  async findOne(id: string): Promise<MachineEntity> {
    const machine = await this.machinesRepo.findOne({ where: { id } });
    if (!machine) throw new NotFoundException('Machine not found');
    return machine;
  }

  async update(id: string, dto: UpdateMachineDto): Promise<MachineEntity> {
    const machine = await this.findOne(id);
    Object.assign(machine, dto);
    if (dto.type) machine.type = dto.type;
    return this.machinesRepo.save(machine);
  }

  async remove(id: string): Promise<void> {
    const result = await this.machinesRepo.delete(id);
    if (result.affected === 0) throw new NotFoundException('Machine not found');
  }

  async updateHeartbeat(id: string): Promise<MachineEntity> {
    await this.machinesRepo.update(id, { last_heartbeat: new Date() });
    return this.findOne(id);
  }

  async findOnline(): Promise<MachineEntity[]> {
    return this.machinesRepo.find({ where: { status: MachineStatusEnum.ONLINE }, order: { name: 'ASC' } });
  }

  async findByLocation(location: string): Promise<MachineEntity[]> {
    return this.machinesRepo.find({ where: { location }, order: { name: 'ASC' } });
  }

  findOpcUaStations(): Promise<MachineEntity[]> {
    return this.machinesRepo.find({ where: { opcua_enabled: true }, order: { resource_id: 'ASC' } });
  }

  generateCsvTemplate(): string {
    return [
      'name,type,status,location,model,serial_number,resource_id,opcua_endpoint_url,opcua_node_prefix,opcua_enabled',
      '',
      '# Beispiele (Zeilen mit # werden ignoriert):',
      'Station-1,CNC,online,Halle A,M800,SN001,1,opc.tcp://localhost:26598,,true',
      'Station-2,PLC,offline,Halle B,P300,SN002,2,,,false',
      'Roboter-A,Roboter,maintenance,Halle C,RB2000,SN003,3,,,true',
    ].join('\n');
  }

  async importFromCsv(csv: string): Promise<{ imported: number; errors: Array<{ row: number; message: string }> }> {
    const lines = csv.trim().split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return { imported: 0, errors: [] };

    const headerLine = lines[0];
    const headers = headerLine.split(',').map((h) => h.toLowerCase().replace(/\s/g, '_'));
    const errors: Array<{ row: number; message: string }> = [];
    let imported = 0;

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',');
      if (cols.length === 0) continue;

      try {
        const get = (name: string): string | undefined => {
          const idx = headers.indexOf(name);
          return idx >= 0 ? cols[idx]?.trim() || undefined : undefined;
        };

        const name = get('name');
        const location = get('location');
        if (!name || !location) throw new Error(`name and location required`);

        let resource_id: number | undefined;
        const rid = get('resource_id');
        if (rid !== undefined) {
          resource_id = parseInt(rid, 10);
          if (isNaN(resource_id)) resource_id = undefined;
        }

        const opcua_enabled = get('opcua_enabled');

        const rawStatus = get('status') || 'offline';
        const validStatus = (['online', 'offline', 'maintenance', 'error', 'idle'] as const).includes(rawStatus as any) ? rawStatus : 'offline';

        const dto: CreateMachineDto & { type?: string; opcua_enabled?: boolean } = {
          name,
          status: validStatus as any,
          type: get('type') || 'CNC',
          location,
          model: get('model'),
          serial_number: get('serial_number'),
          resource_id,
          opcua_endpoint_url: get('opcua_endpoint_url'),
          opcua_node_prefix: get('opcua_node_prefix'),
        };

        if (opcua_enabled !== undefined) {
          dto.opcua_enabled = opcua_enabled.toLowerCase() === 'true';
        }

        await this.machinesRepo.save(this.machinesRepo.create(dto as any));
        imported++;
      } catch (err: any) {
        errors.push({ row: i + 1, message: err.message || 'Unknown error' });
      }
    }

    return { imported, errors };
  }
}
