import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AssignCarrierDto,
  CreateCarrierDto,
  UpdateCarrierDto,
} from './carrier.dto';
import {
  CarrierEntity,
  CarrierPhysicalStateEnum,
  CarrierStatusEnum,
  isCarrierPhysicallyAvailable,
} from './carrier.entity';

@Injectable()
export class CarriersService {
  constructor(
    @InjectRepository(CarrierEntity)
    private readonly carriers: Repository<CarrierEntity>,
  ) {}

  async create(dto: CreateCarrierDto) {
    if (
      await this.carriers.findOne({
        where: { carrier_number: dto.carrier_number },
      })
    ) {
      throw new BadRequestException('Carrier number already exists');
    }
    return this.carriers.save(
      this.carriers.create({
        ...dto,
        inventory_managed: false,
        physical_state: CarrierPhysicalStateEnum.UNKNOWN,
        rfid_uid: null,
        storage_slot: null,
        rfid_read_valid: null,
        last_reader_id: null,
        last_seen_at: null,
        inventory_source: null,
        inventory_revision: null,
        inventory_stale: false,
      }),
    );
  }

  findAll() {
    return this.carriers.find({ order: { carrier_number: 'ASC' } });
  }

  async findOne(id: string) {
    const carrier = await this.carriers.findOne({ where: { id } });
    if (!carrier) throw new NotFoundException('Carrier not found');
    return carrier;
  }

  async assign(id: string, dto: AssignCarrierDto) {
    const carrier = await this.findOne(id);
    if (
      carrier.status !== CarrierStatusEnum.AVAILABLE ||
      !isCarrierPhysicallyAvailable(carrier)
    ) {
      throw new BadRequestException(
        'Carrier is not logically and physically available',
      );
    }
    carrier.order_id = dto.order_id;
    carrier.current_step_no = dto.current_step_no;
    carrier.current_resource_id = null;
    carrier.status = CarrierStatusEnum.ASSIGNED;
    return this.carriers.save(carrier);
  }

  async update(id: string, dto: UpdateCarrierDto) {
    const carrier = await this.findOne(id);
    Object.assign(carrier, dto);
    return this.carriers.save(carrier);
  }

  async remove(id: string) {
    const carrier = await this.findOne(id);
    if (carrier.order_id)
      throw new BadRequestException('Assigned carrier cannot be deleted');
    await this.carriers.remove(carrier);
  }
}
