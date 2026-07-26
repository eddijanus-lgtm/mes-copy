import { Controller, Get, Post, Body, Param, ParseArrayPipe, ParseUUIDPipe, Query, ValidationPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { TracesService } from './traces.service';
import { CreateTraceDto, TraceQueryDto, TraceTakeQueryDto } from './trace.dto';
import { Roles } from '../auth/roles.decorator';
import { UserRoleEnum } from '../users/user.entity';

@Controller('traces')
@ApiTags('Traces')
@ApiBearerAuth('JWT-auth')
export class TracesController {
  constructor(private readonly tracesService: TracesService) {}

  @Post()
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR)
  create(@Body() dto: CreateTraceDto) { return this.tracesService.create(dto); }

  @Get()
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR, UserRoleEnum.VIEWER)
  findAll(@Query() query: TraceQueryDto) {
    if (query.machine_id) return this.tracesService.getTracesByMachine(query.machine_id);
    if (query.category) return this.tracesService.getTracesByCategory(query.category);
    return this.tracesService.findAllWithFilters(query);
  }

  @Get('machine/:machineId')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR, UserRoleEnum.VIEWER)
  getByMachine(
    @Param('machineId', ParseUUIDPipe) machineId: string,
    @Query(new ValidationPipe({ transform: true })) query: TraceTakeQueryDto,
  ) {
    return this.tracesService.getTracesByMachine(machineId, query.take ?? 100);
  }

  @Get('order/:orderId')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR, UserRoleEnum.VIEWER)
  getByOrder(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Query(new ValidationPipe({ transform: true })) query: TraceTakeQueryDto,
  ) {
    return this.tracesService.getTracesByOrder(orderId, query.take ?? 100);
  }

  @Post('bulk')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR)
  bulkCreate(@Body(new ParseArrayPipe({ items: CreateTraceDto, whitelist: true, forbidNonWhitelisted: true })) traces: CreateTraceDto[]) {
    return this.tracesService.bulkCreate(traces);
  }

  @Get(':id')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR, UserRoleEnum.VIEWER)
  findOne(@Param('id', ParseUUIDPipe) id: string) { return this.tracesService.findOne(id); }
}
