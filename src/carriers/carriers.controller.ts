import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { UserRoleEnum } from '../users/user.entity';
import {
  AssignCarrierDto,
  CreateCarrierDto,
  UpdateCarrierDto,
} from './carrier.dto';
import { CarrierInventorySyncService } from './carrier-inventory-sync.service';
import { CarriersService } from './carriers.service';

@Controller('carriers')
@ApiTags('Carriers')
@ApiBearerAuth('JWT-auth')
export class CarriersController {
  constructor(
    private readonly carriers: CarriersService,
    private readonly inventory: CarrierInventorySyncService,
  ) {}

  @Get()
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR, UserRoleEnum.VIEWER)
  findAll() {
    return this.carriers.findAll();
  }

  @Get('inventory')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR, UserRoleEnum.VIEWER)
  getInventory() {
    return this.inventory.getLatestSummary();
  }

  @Get(':id')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR, UserRoleEnum.VIEWER)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.carriers.findOne(id);
  }

  @Post()
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR)
  create(@Body() dto: CreateCarrierDto) {
    return this.carriers.create(dto);
  }

  @Post(':id/assignment')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR)
  assign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignCarrierDto,
  ) {
    return this.carriers.assign(id, dto);
  }

  @Patch(':id')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCarrierDto,
  ) {
    return this.carriers.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRoleEnum.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.carriers.remove(id);
  }
}
