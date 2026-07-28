import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductEntity } from './product.entity';
import { ProductRouteStepEntity } from './product-route-step.entity';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { MachineProfileEntity } from '../machines/profiles/machine-profile.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ProductEntity, ProductRouteStepEntity, MachineProfileEntity])],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
