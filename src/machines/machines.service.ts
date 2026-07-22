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
}
