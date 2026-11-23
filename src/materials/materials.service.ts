import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MaterialEntity, MaterialTypeEnum } from './material.entity';
import { MaterialConsumptionEntity } from './material-consumption.entity';
import { CreateMaterialDto, RegisterConsumptionDto } from './material.dto';

@Injectable()
export class MaterialsService {
  constructor(
    @InjectRepository(MaterialEntity)
    private readonly materialsRepo: Repository<MaterialEntity>,
    @InjectRepository(MaterialConsumptionEntity)
    private readonly consumptionRepo: Repository<MaterialConsumptionEntity>,
  ) {}

  async create(dto: CreateMaterialDto): Promise<MaterialEntity> {
    const material = this.materialsRepo.create({
      name: dto.name,
      description: dto.description,
      type: dto.type,
      unit_price: dto.unit_price ?? 0,
      unit: dto.unit ?? 'pcs',
      stock_quantity: dto.stock_quantity ?? 0,
      minimum_stock: dto.minimum_stock,
      supplier: dto.supplier,
      sku: dto.sku,
    });
    return this.materialsRepo.save(material);
  }

  async findAll(): Promise<MaterialEntity[]> {
    return this.materialsRepo.find({ order: { id: 'DESC' } });
  }

  async findOne(id: string): Promise<MaterialEntity> {
    const material = await this.materialsRepo.findOne({ where: { id } });
    if (!material) throw new NotFoundException('Material not found');
    return material;
  }

  async update(id: string, dto: CreateMaterialDto): Promise<MaterialEntity> {
    const material = await this.findOne(id);
    Object.assign(material, dto);
    return this.materialsRepo.save(material);
  }

  async remove(id: string): Promise<void> {
    const result = await this.materialsRepo.delete(id);
    if (result.affected === 0) throw new NotFoundException('Material not found');
  }

  async searchByName(name: string, type?: MaterialTypeEnum): Promise<MaterialEntity[]> {
    const conditions: any = {};
    if (name) conditions.name = name;
    if (type) conditions.type = type;
    return this.materialsRepo.find({ where: conditions });
  }

  async findLowStock(): Promise<MaterialEntity[]> {
    return this.materialsRepo.find({ where: {} });
  }

  async registerConsumption(dto: RegisterConsumptionDto): Promise<MaterialConsumptionEntity> {
    const material = await this.materialsRepo.findOne({ where: { id: dto.material_id } });
    if (!material) throw new NotFoundException('Material not found');

    if (material.stock_quantity < dto.quantity) {
      throw new BadRequestException(`Insufficient stock for ${material.name}: available=${material.stock_quantity}, requested=${dto.quantity}`);
    }

    material.stock_quantity -= dto.quantity;
    await this.materialsRepo.save(material);

    const consumption = this.consumptionRepo.create({
      material_id: dto.material_id,
      order_id: dto.order_id,
      quantity: dto.quantity,
      total_cost: dto.unit_price * dto.quantity,
      notes: dto.notes,
    });
    return this.consumptionRepo.save(consumption);
  }

  async getConsumptionByOrder(orderId: string): Promise<MaterialConsumptionEntity[]> {
    return this.consumptionRepo.find({
      where: { order_id: orderId },
      order: { consumed_at: 'DESC' },
    });
  }

  async getTotalConsumptionForOrder(orderId: string): Promise<{ totalCost: number; items: Array<{ materialName: string; quantity: number; total_cost: number }> }> {
    const consumptions = await this.getConsumptionByOrder(orderId);
    let totalCost = 0;
    const itemTotals = new Map<string, { name: string; qty: number; cost: number }>();

    for (const c of consumptions) {
      totalCost += c.total_cost;
      const existing = itemTotals.get(c.material_id);
      if (existing) {
        existing.qty += c.quantity;
        existing.cost += c.total_cost;
      } else {
        const material = await this.materialsRepo.findOne({ where: { id: c.material_id } });
        itemTotals.set(c.material_id, { name: material?.name || c.material_id, qty: c.quantity, cost: c.total_cost });
      }
    }

    const items = Array.from(itemTotals.entries()).map(([_, v]) => ({ materialName: v.name, quantity: v.qty, total_cost: v.cost }));
    return { totalCost, items };
  }
}
