import { Controller, Get, Post, Body } from '@nestjs/common';
import { OpcUaService } from './opcua.service';
import { MqttGatewayService } from './mqtt-gateway.service';
import { MqttPublishDto, OpcUaReadDto } from './edge.dto';
import { Roles } from '../auth/roles.decorator';
import { UserRoleEnum } from '../users/user.entity';
import { StMesHandshakeService } from './stmes-handshake.service';

@Controller('edge')
export class EdgeController {
  constructor(
    private readonly opcUaService: OpcUaService,
    private readonly mqttGatewayService: MqttGatewayService,
    private readonly stMesHandshakeService: StMesHandshakeService,
  ) {}

  @Get('opcua/status')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR, UserRoleEnum.VIEWER)
  getOpcUaStatus() { return this.opcUaService.getServerStatus(); }

  @Get('opcua/connected')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR, UserRoleEnum.VIEWER)
  opcuaConnected() { return { connected: this.opcUaService.isConnected() }; }

  @Post('opcua/read')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR)
  readOpcUaNode(@Body() dto: OpcUaReadDto) { return this.opcUaService.readNode(dto.nodeId); }

  @Get('mqtt/connected')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR, UserRoleEnum.VIEWER)
  mqttConnected() { return { connected: this.mqttGatewayService.isConnected() }; }

  @Get('mqtt/messages')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR, UserRoleEnum.VIEWER)
  getRecentMqttMessages() { return this.mqttGatewayService.getRecentTelemetry(); }

  @Post('mqtt/publish')
  @Roles(UserRoleEnum.ADMIN)
  async publishToMqtt(@Body() dto: MqttPublishDto) {
    await this.mqttGatewayService.publish(dto.topic, dto.payload);
    return { published: true, topic: dto.topic };
  }

  @Get('health')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR, UserRoleEnum.VIEWER)
  getHealth() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      opcua: this.opcUaService.isConnected(),
      mqtt: this.mqttGatewayService.isConnected(),
    };
  }

  @Get('stmes/handshakes')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR, UserRoleEnum.VIEWER)
  getRecentHandshakes() {
    return this.stMesHandshakeService.findRecent();
  }
}
