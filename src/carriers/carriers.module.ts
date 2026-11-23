import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CarrierEntity } from './carrier.entity';
import { CarriersController } from './carriers.controller';
import { CarriersService } from './carriers.service';

@Module({
  imports: [TypeOrmModule.forFeature([CarrierEntity])],
  controllers: [CarriersController],
  providers: [CarriersService],
  exports: [CarriersService, TypeOrmModule],
})
export class CarriersModule {}
