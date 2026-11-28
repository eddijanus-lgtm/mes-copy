import { OrderEntity } from '../orders/order.entity';
import { OrderRouteStepEntity } from '../orders/order-route-step.entity';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AssignCarrierDto, CreateCarrierDto, UpdateCarrierDto } from './carrier.dto';
import { CarrierEntity, CarrierStatusEnum } from './carrier.entity';

@Injectable()
export class CarriersService {
  constructor(@InjectRepository(CarrierEntity) private readonly carriers: Repository<CarrierEntity>) {}

  async create(dto: CreateCarrierDto) {
    if (await this.carriers.findOne({ where: { carrier_number: dto.carrier_number } })) {
      throw new BadRequestException('Carrier number already exists');
    }
    return this.carriers.save(this.carriers.create(dto));
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
    return this.update(id, {
      order_id: dto.order_id,
      current_step_no: dto.current_step_no ?? 1,
      current_resource_id: null,
      status: CarrierStatusEnum.ASSIGNED,
    });
  }

  async update(id: string, dto: UpdateCarrierDto) {
    return this.carriers.manager.transaction(async (manager) => {
      const carrier = await manager.findOne(CarrierEntity, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!carrier) throw new NotFoundException('Carrier not found');
      if (dto.order_id && carrier.order_id && carrier.order_id !== dto.order_id) {
        throw new BadRequestException('Carrier is already assigned to another order');
      }
      Object.assign(carrier, dto);
      if (carrier.order_id && (dto.order_id !== undefined || dto.current_step_no !== undefined)) {
        const order = await manager.findOne(OrderEntity, {
          where: { id: carrier.order_id }, lock: { mode: 'pessimistic_write' },
        });
        if (!order) throw new BadRequestException('Unknown production order');
        const step = await manager.findOneBy(OrderRouteStepEntity, {
          order_id: order.id, step_no: carrier.current_step_no,
        });
        if (!step) throw new BadRequestException('Unknown route step for this order');
      }
      return manager.save(carrier);
    });
  }

  async remove(id: string) {
    const carrier = await this.findOne(id);
    if (carrier.order_id) throw new BadRequestException('Assigned carrier cannot be deleted');
    await this.carriers.remove(carrier);
  }
}
