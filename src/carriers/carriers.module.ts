import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CarrierInventoryStateEntity } from './carrier-inventory-state.entity';
import { CarrierInventorySyncService } from './carrier-inventory-sync.service';
import { CarrierEntity } from './carrier.entity';
import { CarriersController } from './carriers.controller';
import { CarriersService } from './carriers.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([CarrierEntity, CarrierInventoryStateEntity]),
  ],
  controllers: [CarriersController],
  providers: [CarriersService, CarrierInventorySyncService],
  exports: [CarriersService, CarrierInventorySyncService, TypeOrmModule],
})
export class CarriersModule {}
