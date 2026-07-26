import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Controller, Get, Post, Body, Param, ParseArrayPipe, ParseUUIDPipe, Query } from '@nestjs/common';
import { DataCollectionService } from './data-collection.service';
import { CreateDataPointDto, DataPointQueryDto } from './data-point.dto';
import { Roles } from '../auth/roles.decorator';
import { UserRoleEnum } from '../users/user.entity';

@Controller('data-collection')
@ApiTags('Data Collection')
@ApiBearerAuth('JWT-auth')
export class DataCollectionController {
  constructor(private readonly dataCollectionService: DataCollectionService) {}

  @Post()
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR)
  create(@Body() dto: CreateDataPointDto) { return this.dataCollectionService.create(dto); }

  @Get('stats/:machineId')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR, UserRoleEnum.VIEWER)
  getStats(@Param('machineId', ParseUUIDPipe) machineId: string, @Query() query: DataPointQueryDto) {
    return this.dataCollectionService.getStatsByMachine(machineId, query.node_id);
  }

  @Post('bulk')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR)
  bulkCreate(@Body(new ParseArrayPipe({ items: CreateDataPointDto, whitelist: true, forbidNonWhitelisted: true })) points: CreateDataPointDto[]) {
    return this.dataCollectionService.bulkCreate(points);
  }

  @Get(':machineId')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR, UserRoleEnum.VIEWER)
  getLatestByMachine(@Param('machineId', ParseUUIDPipe) machineId: string, @Query() query: DataPointQueryDto) {
    return this.dataCollectionService.getLatestByMachine(machineId, query.node_id);
  }
}
