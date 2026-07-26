import { ApiOperation, ApiTags, ApiBearerAuth, ApiOkResponse, ApiProduces } from '@nestjs/swagger';
import { Controller, Get, Post, Patch, Delete, Body, HttpCode, HttpStatus, Param, ParseIntPipe, ParseUUIDPipe, Res } from '@nestjs/common';
import type { Response } from 'express';
import { OrdersService } from './orders.service';
import { CreateOrderDto, UpdateOrderDto } from './order.dto';
import { Roles } from '../auth/roles.decorator';
import { UserRoleEnum } from '../users/user.entity';
import { ReplaceOrderRouteDto } from './routing.dto';
import { RoutingService } from './routing.service';
import { OrderProductionLogService } from './order-production-log.service';

@Controller('orders')
@ApiTags('Orders')
@ApiBearerAuth('JWT-auth')
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly routingService: RoutingService,
    private readonly productionLogs: OrderProductionLogService,
  ) {}

  @Post()
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR)
  create(@Body() dto: CreateOrderDto) { return this.ordersService.create(dto); }

  @Post('demo-production')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR)
  async createDemoProductionOrder(@Body() dto: CreateOrderDto) {
    const order = await this.ordersService.create(dto);
    return this.routingService.releaseDemoProductionOrder(order.id, order.quantity);
  }

  @Get()
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR, UserRoleEnum.VIEWER)
  findAll() { return this.ordersService.findAll(); }

  @Get('active')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR, UserRoleEnum.VIEWER)
  getActiveOrders() { return this.ordersService.getActiveOrders(); }

  @Get('line/:machineId/pending')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR, UserRoleEnum.VIEWER)
  getPendingByLine(@Param('machineId', ParseUUIDPipe) machineId: string) { return this.ordersService.getPendingByLine(machineId); }

  @Get('production-logs.csv')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR, UserRoleEnum.VIEWER)
  @ApiOperation({
    summary: 'Produktionsläufe aller abgeschlossenen Aufträge als Sammel-CSV exportieren',
    description: 'Eine RFC-4180-konforme UTF-8-Datei mit den Lauf- und Stationsdaten aller abgeschlossenen Aufträge.',
  })
  @ApiProduces('text/csv')
  @ApiOkResponse({
    description: 'Gesammelte Produktionsläufe als CSV-Datei',
    schema: { type: 'string', format: 'binary' },
  })
  async exportAllProductionLogsCsv(@Res({ passthrough: true }) response: Response) {
    const exportFile = await this.productionLogs.exportAllCsv();
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', `attachment; filename="${exportFile.filename}"`);
    response.setHeader('X-Exported-Order-Count', String(exportFile.orderCount));
    return exportFile.csv;
  }

  @Patch(':id/progress/:completedQty')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR)
  @ApiOperation({
    deprecated: true,
    summary: 'Auftragsfortschritt aktualisieren (veraltet; PATCH /orders/{id} verwenden)',
  })
  updateProgress(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('completedQty', ParseIntPipe) completedQty: number,
  ) { return this.ordersService.updateProgress(id, completedQty); }

  @Get(':id/production-log')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR, UserRoleEnum.VIEWER)
  getProductionLog(@Param('id', ParseUUIDPipe) id: string) {
    return this.productionLogs.findOrCreate(id);
  }

  @Get(':id/production-log.csv')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR, UserRoleEnum.VIEWER)
  @ApiOperation({
    summary: 'Produktionslauf eines abgeschlossenen Auftrags als CSV exportieren',
    description: 'RFC-4180-konformer UTF-8-Export mit ISA-95-orientierten Auftrags-, Carrier- und Stationsdaten.',
  })
  @ApiProduces('text/csv')
  @ApiOkResponse({
    description: 'Produktionslauf als CSV-Datei',
    schema: { type: 'string', format: 'binary' },
  })
  async exportProductionLogCsv(
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const exportFile = await this.productionLogs.exportCsv(id);
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', `attachment; filename="${exportFile.filename}"`);
    return exportFile.csv;
  }

  @Get(':id')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR, UserRoleEnum.VIEWER)
  findOne(@Param('id', ParseUUIDPipe) id: string) { return this.ordersService.findOne(id); }

  @Patch(':id')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateOrderDto) { return this.ordersService.update(id, dto); }

  @Delete(':id')
  @Roles(UserRoleEnum.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string) { return this.ordersService.remove(id); }

  @Get(':id/route')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR, UserRoleEnum.VIEWER)
  getRoute(@Param('id', ParseUUIDPipe) id: string) { return this.routingService.getRoute(id); }

  @Patch(':id/route')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR)
  replaceRoute(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReplaceOrderRouteDto) {
    return this.routingService.replaceRoute(id, dto);
  }
}
