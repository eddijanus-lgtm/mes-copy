import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ProductEntity } from './product.entity';
import { ProductRouteStepEntity } from './product-route-step.entity';
import type { CreateProductDto, UpdateProductDto } from './product.dto';
import { MachineProfileEntity } from '../machines/profiles/machine-profile.entity';

@Injectable()
export class ProductsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(ProductEntity) private readonly productsRepo: Repository<ProductEntity>,
    @InjectRepository(ProductRouteStepEntity) private readonly routeStepsRepo: Repository<ProductRouteStepEntity>,
    @InjectRepository(MachineProfileEntity) private readonly profilesRepo: Repository<MachineProfileEntity>,
  ) {}

  async create(dto: CreateProductDto) {
    const normalizedSteps = await this.validateRoute(
      dto.route_steps,
      dto.profile_machine_id,
    );
    return this.dataSource.transaction(async (manager) => {
      const product = await manager.save(ProductEntity, manager.create(ProductEntity, {
        part_no: dto.part_no,
        name: dto.name,
        profile_machine_id: dto.profile_machine_id,
        description: dto.description,
        is_active: dto.is_active ?? true,
        parameter_definitions: dto.parameter_definitions || [],
      }));
      const route_steps = await manager.save(ProductRouteStepEntity, normalizedSteps.map((step) => manager.create(ProductRouteStepEntity, {
        ...step,
        product_id: product.id,
        parameters: step.parameters || {},
      })));
      return { ...product, route_steps };
    });
  }

  async findAll() {
    const products = await this.productsRepo.find({ order: { part_no: 'ASC' } });
    const routeSteps = await this.routeStepsRepo.find({ order: { step_no: 'ASC' } });
    return products.map((product) => ({
      ...product,
      route_steps: routeSteps.filter((step) => step.product_id === product.id),
    }));
  }

  async findOne(id: string) {
    const product = await this.productsRepo.findOne({ where: { id } });
    if (!product) throw new NotFoundException('Product not found');
    const route_steps = await this.routeStepsRepo.find({ where: { product_id: id }, order: { step_no: 'ASC' } });
    return { ...product, route_steps };
  }

  async update(id: string, dto: UpdateProductDto) {
    return this.dataSource.transaction(async (manager) => {
      const product = await manager.findOne(ProductEntity, { where: { id } });
      if (!product) throw new NotFoundException('Product not found');
      Object.assign(product, {
        ...(dto.part_no !== undefined ? { part_no: dto.part_no } : {}),
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.profile_machine_id !== undefined ? { profile_machine_id: dto.profile_machine_id } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.is_active !== undefined ? { is_active: dto.is_active } : {}),
        ...(dto.parameter_definitions !== undefined ? { parameter_definitions: dto.parameter_definitions } : {}),
      });
      const savedProduct = await manager.save(product);

      if (dto.route_steps) {
        const normalizedSteps = await this.validateRoute(
          dto.route_steps,
          dto.profile_machine_id ?? product.profile_machine_id ?? '',
        );
        await manager.delete(ProductRouteStepEntity, { product_id: id });
        await manager.save(ProductRouteStepEntity, normalizedSteps.map((step) => manager.create(ProductRouteStepEntity, {
          ...step,
          product_id: id,
          parameters: step.parameters || {},
        })));
      }

      const route_steps = await manager.find(ProductRouteStepEntity, { where: { product_id: id }, order: { step_no: 'ASC' } });
      return { ...savedProduct, route_steps };
    });
  }

  async remove(id: string) {
    await this.routeStepsRepo.delete({ product_id: id });
    const result = await this.productsRepo.delete(id);
    if (result.affected === 0) throw new NotFoundException('Product not found');
  }

  private async validateRoute(
    steps: Array<{
      step_no: number;
      resource_id: number;
      operation_no: number;
      operation: string;
      parameters?: Record<string, number>;
    }>,
    machineId: string,
  ): Promise<Array<{
    step_no: number;
    resource_id: number;
    operation_no: number;
    operation: string;
    parameters?: Record<string, number>;
  }>> {
    if (!steps.length) throw new BadRequestException('Product route requires at least one step');
    const uniqueSteps = new Set(steps.map((step) => step.step_no));
    if (uniqueSteps.size !== steps.length) throw new BadRequestException('Product route step numbers must be unique');
    if (steps.some((step, index) => step.step_no !== index + 1)) {
      throw new BadRequestException('Product route step numbers must be contiguous from 1');
    }
    const profile = await this.profilesRepo.findOne({
      where: { machine_id: machineId },
      order: { version: 'DESC' },
    });
    if (!profile) throw new BadRequestException(`Machine ${machineId} not found`);
    const stations = new Map(
      profile.document.stations.map((station) => [station.resourceId, station]),
    );
    return steps.map((step) => {
      const station = stations.get(step.resource_id);
      if (!station || !station.enabled) {
        throw new BadRequestException(
          `Resource ${step.resource_id} does not belong to enabled machine ${machineId}`,
        );
      }
      const operationNo = station.routing?.operationNo || station.resourceId;
      if (step.operation_no !== operationNo) {
        throw new BadRequestException(
          `Operation ${step.operation_no} is not available at resource ${step.resource_id}`,
        );
      }
      return {
        ...step,
        operation:
          station.routing?.operation?.trim() ||
          station.displayName?.trim() ||
          'Standardaktion',
      };
    });
  }
}
