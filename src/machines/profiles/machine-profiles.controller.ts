import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Roles } from '../../auth/roles.decorator';
import { UserRoleEnum } from '../../users/user.entity';
import {
  ActivateMachineProfileDto,
  AddStationDto,
  BrowseMachineProfileDto,
  CommissioningBrowseDto,
  CommissioningConnectionDto,
  CommissioningDiscoverSignalsDto,
  ReplaceSignalsDto,
  SaveMachineProfileDto,
} from './machine-profile.dto';
import { MachineProfileManagementService } from './machine-profile-management.service';
import { OpcUaCommissioningService } from './opcua-commissioning.service';

type AuthenticatedRequest = Request & {
  user: { userId: string; username: string; role: UserRoleEnum };
};

@Controller('machine-profiles')
@ApiTags('Machine Profiles')
@ApiBearerAuth('JWT-auth')
export class MachineProfilesController {
  constructor(
    private readonly profiles: MachineProfileManagementService,
    private readonly commissioning: OpcUaCommissioningService,
  ) {}

  @Get()
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR, UserRoleEnum.VIEWER)
  list() {
    return this.profiles.list();
  }

  @Get('suggestions')
  @Roles(UserRoleEnum.ADMIN)
  suggestions(@Query('displayName') displayName?: string) {
    return this.profiles.suggestions(displayName);
  }

  @Post()
  @Roles(UserRoleEnum.ADMIN)
  create(
    @Body() dto: SaveMachineProfileDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.profiles.create(
      dto.document,
      request.user.username,
      dto.changeSummary,
    );
  }

  @Post('commissioning/test-connection')
  @Roles(UserRoleEnum.ADMIN)
  testCommissioningConnection(@Body() dto: CommissioningConnectionDto) {
    return this.commissioning.testConnectionConfig(dto.connection);
  }

  @Post('commissioning/browse')
  @Roles(UserRoleEnum.ADMIN)
  browseCommissioningConnection(@Body() dto: CommissioningBrowseDto) {
    return this.commissioning.browseConnection(
      dto.connection,
      dto.nodeId || undefined,
      dto.maxNodes,
    );
  }

  @Post('commissioning/discover-signals')
  @Roles(UserRoleEnum.ADMIN)
  discoverCommissioningSignals(
    @Body() dto: CommissioningDiscoverSignalsDto,
  ) {
    return this.commissioning.discoverSignals(
      dto.connection,
      dto.rootNodeId || undefined,
      dto.maxDepth,
      dto.maxNodes,
    );
  }

  @Get(':profileId')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR, UserRoleEnum.VIEWER)
  find(@Param('profileId', ParseUUIDPipe) profileId: string) {
    return this.profiles.find(profileId);
  }

  @Delete(':profileId')
  @Roles(UserRoleEnum.ADMIN)
  remove(@Param('profileId', ParseUUIDPipe) profileId: string) {
    return this.profiles.remove(profileId);
  }

  @Get(':profileId/history')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR, UserRoleEnum.VIEWER)
  history(@Param('profileId', ParseUUIDPipe) profileId: string) {
    return this.profiles.history(profileId);
  }

  @Patch(':profileId')
  @Roles(UserRoleEnum.ADMIN)
  update(
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Body() dto: SaveMachineProfileDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.profiles.update(
      profileId,
      dto.document,
      request.user.username,
      dto.changeSummary,
    );
  }

  @Post(':profileId/stations')
  @Roles(UserRoleEnum.ADMIN)
  addStation(
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Body() dto: AddStationDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.profiles.addStation(
      profileId,
      dto.station,
      request.user.username,
    );
  }

  @Patch(':profileId/stations/:stationId')
  @Roles(UserRoleEnum.ADMIN)
  updateStation(
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Param('stationId') stationId: string,
    @Body() dto: AddStationDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.profiles.updateStation(
      profileId,
      stationId,
      dto.station,
      request.user.username,
    );
  }

  @Delete(':profileId/stations/:stationId')
  @Roles(UserRoleEnum.ADMIN)
  removeStation(
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Param('stationId') stationId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.profiles.removeStation(
      profileId,
      stationId,
      request.user.username,
    );
  }

  @Patch(':profileId/stations/:stationId/signals')
  @Roles(UserRoleEnum.ADMIN)
  replaceSignals(
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Param('stationId') stationId: string,
    @Body() dto: ReplaceSignalsDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.profiles.replaceSignals(
      profileId,
      stationId,
      dto.signals,
      request.user.username,
    );
  }

  @Post(':profileId/validate')
  @Roles(UserRoleEnum.ADMIN)
  validate(@Param('profileId', ParseUUIDPipe) profileId: string) {
    return this.profiles.validate(profileId);
  }

  @Post(':profileId/test-connection')
  @Roles(UserRoleEnum.ADMIN)
  async testConnection(@Param('profileId', ParseUUIDPipe) profileId: string) {
    return this.commissioning.testConnection(
      await this.profiles.document(profileId),
    );
  }

  @Post(':profileId/stations/:stationId/test-connection')
  @Roles(UserRoleEnum.ADMIN)
  async testStationConnection(
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Param('stationId') stationId: string,
  ) {
    return this.commissioning.testConnection(
      await this.profiles.document(profileId),
      stationId,
    );
  }

  @Post(':profileId/verify')
  @Roles(UserRoleEnum.ADMIN)
  async verify(@Param('profileId', ParseUUIDPipe) profileId: string) {
    const result = await this.commissioning.verify(
      await this.profiles.document(profileId),
    );
    await this.profiles.storeLiveResult(profileId, result);
    return result;
  }

  @Post(':profileId/browse')
  @Roles(UserRoleEnum.ADMIN)
  async browse(
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Body() dto: BrowseMachineProfileDto,
  ) {
    return this.commissioning.browse(
      await this.profiles.document(profileId),
      dto.nodeId || undefined,
      dto.maxNodes,
    );
  }

  @Post(':profileId/stations/:stationId/browse')
  @Roles(UserRoleEnum.ADMIN)
  async browseStation(
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Param('stationId') stationId: string,
    @Body() dto: BrowseMachineProfileDto,
  ) {
    return this.commissioning.browse(
      await this.profiles.document(profileId),
      dto.nodeId || undefined,
      dto.maxNodes,
      stationId,
    );
  }

  @Post(':profileId/activate')
  @Roles(UserRoleEnum.ADMIN)
  activate(
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Body() dto: ActivateMachineProfileDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.profiles.activate(
      profileId,
      dto.confirmation,
      dto.confirmControl === true,
      request.user.username,
    );
  }

  @Post(':profileId/deactivate')
  @Roles(UserRoleEnum.ADMIN)
  deactivate(
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.profiles.deactivate(profileId, request.user.username);
  }
}
