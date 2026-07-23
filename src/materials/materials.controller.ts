import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { MaterialsService } from './materials.service';
import { Roles } from '../auth/roles.decorator';
import { UserRoleEnum } from '../users/user.entity';
import { CreateMaterialDto, RegisterConsumptionDto } from './material.dto';
import { MaterialTypeEnum } from './material.entity';

@Controller('materials')
export class MaterialsController {
  constructor(private readonly materialsService: MaterialsService) {}

  @Post()
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR)
  create(@Body() dto: CreateMaterialDto) { return this.materialsService.create(dto); }

  @Get()
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR, UserRoleEnum.VIEWER)
  findAll(@Query('name') name?: string, @Query('type') type?: MaterialTypeEnum) {
    if (name || type) return this.materialsService.searchByName(name || '', type);
    return this.materialsService.findAll();
  }

  @Get('low-stock')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR)
  findLowStock() { return this.materialsService.findLowStock(); }

  @Get(':id/consumption/:orderId')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR, UserRoleEnum.VIEWER)
  getConsumptionByOrder(@Param('orderId') orderId: string) {
    return this.materialsService.getConsumptionByOrder(orderId);
  }

  @Get(':id/total-consumption/:orderId')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR, UserRoleEnum.VIEWER)
  getTotalConsumption(@Param('orderId') orderId: string) {
    return this.materialsService.getTotalConsumptionForOrder(orderId);
  }

  @Get(':id')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR, UserRoleEnum.VIEWER)
  findOne(@Param('id') id: string) { return this.materialsService.findOne(id); }

  @Patch(':id')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR)
  update(@Param('id') id: string, @Body() dto: CreateMaterialDto) { return this.materialsService.update(id, dto); }

  @Delete(':id')
  @Roles(UserRoleEnum.ADMIN)
  remove(@Param('id') id: string) { return this.materialsService.remove(id); }

  @Post('consumption')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR)
  registerConsumption(@Body() dto: RegisterConsumptionDto) {
    return this.materialsService.registerConsumption(dto);
  }
}
