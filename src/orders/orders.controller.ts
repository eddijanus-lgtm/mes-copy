import { Controller, Get, Post, Patch, Delete, Body, Param, ParseIntPipe, ParseUUIDPipe } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto, UpdateOrderDto } from './order.dto';
import { Roles } from '../auth/roles.decorator';
import { UserRoleEnum } from '../users/user.entity';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR)
  create(@Body() dto: CreateOrderDto) { return this.ordersService.create(dto); }

  @Get()
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR, UserRoleEnum.VIEWER)
  findAll() { return this.ordersService.findAll(); }

  @Get('active')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR, UserRoleEnum.VIEWER)
  getActiveOrders() { return this.ordersService.getActiveOrders(); }

  @Get('line/:machineId/pending')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR, UserRoleEnum.VIEWER)
  getPendingByLine(@Param('machineId', ParseUUIDPipe) machineId: string) { return this.ordersService.getPendingByLine(machineId); }

  @Patch(':id/progress/:completedQty')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR)
  updateProgress(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('completedQty', ParseIntPipe) completedQty: number,
  ) { return this.ordersService.updateProgress(id, completedQty); }

  @Get(':id')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR, UserRoleEnum.VIEWER)
  findOne(@Param('id', ParseUUIDPipe) id: string) { return this.ordersService.findOne(id); }

  @Patch(':id')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateOrderDto) { return this.ordersService.update(id, dto); }

  @Delete(':id')
  @Roles(UserRoleEnum.ADMIN)
  remove(@Param('id', ParseUUIDPipe) id: string) { return this.ordersService.remove(id); }
}
