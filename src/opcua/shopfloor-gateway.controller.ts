import { ApiTags, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Controller, Get, Post, Body } from '@nestjs/common';
import { OpcUaService } from './opcua.service';
import { MqttGatewayService } from './mqtt-gateway.service';
import { MqttPublishDto, OpcUaReadDto, MachineControlDto } from './shopfloor-gateway.dto';
import { Roles } from '../auth/roles.decorator';
import { UserRoleEnum } from '../users/user.entity';
import { StMesHandshakeService } from './stmes-handshake.service';
import { WebshopOrdersService } from './webshop-orders.service';

@Controller('shopfloor')
export class ShopfloorGatewayController {
  constructor(
    private readonly opcUaService: OpcUaService,
    private readonly mqttGatewayService: MqttGatewayService,
    private readonly stMesHandshakeService: StMesHandshakeService,
    private readonly webshopOrdersService: WebshopOrdersService,
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
      ok: this.opcUaService.isConnected() && this.mqttGatewayService.isConnected(),
      name: 'Shopfloor Gateway',
      role: 'OT/IT gateway for OPC UA station handshakes, MQTT ingress and shopfloor telemetry forwarding. Routing decisions stay in MES routing.',
      timestamp: new Date().toISOString(),
      protocols: {
        opcua: { connected: this.opcUaService.isConnected(), direction: 'read/write', purpose: 'SPS stMES handshake and DB151 process data' },
        mqtt: { connected: this.mqttGatewayService.isConnected(), direction: 'subscribe/publish', purpose: 'Webshop order ingress and broker telemetry' },
      },
      opcua: this.opcUaService.isConnected(),
      mqtt: this.mqttGatewayService.isConnected(),
    };
  }

  @Get('stmes/handshakes')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR, UserRoleEnum.VIEWER)
  getRecentHandshakes() {
    return this.stMesHandshakeService.findRecent();
  }

  @Get('webshop/orders')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR, UserRoleEnum.VIEWER)
  getRecentWebshopOrders() {
    return this.webshopOrdersService.getRecentOrders();
  }

  @Post('machine/control')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR)
  async controlMachine(@Body() dto: MachineControlDto) {
    const prefix = `ns=1;s=Station${dto.resourceId}.stMES.Control.`;
    const commandNode = {
      start: 'xCmdStart',
      stop: 'xCmdStop',
      reset: 'xCmdReset',
      pause: 'xCmdPause',
    }[dto.command];
    await this.opcUaService.writeNodes([{ nodeId: prefix + commandNode, dataType: 'Boolean', value: true }]);
    return { success: true, command: dto.command, resourceId: dto.resourceId };
  }

  @Post('machine/control/legacy')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR)
  async controlMachineLegacy(@Body() dto: MachineControlDto) {
    const prefix = `ns=1;s=Station${dto.resourceId}.stMES.Query.`;
    switch (dto.command) {
      case 'start':
        await this.opcUaService.writeNodes([
          { nodeId: prefix + 'xStart', dataType: 'Boolean', value: true },
        ]);
        return { success: true, command: 'start', resourceId: dto.resourceId };
      case 'stop':
        await this.opcUaService.writeNodes([
          { nodeId: prefix + 'xQryBusy', dataType: 'Boolean', value: false },
          { nodeId: prefix + 'xDone', dataType: 'Boolean', value: false },
          { nodeId: prefix + 'xError', dataType: 'Boolean', value: false },
        ]);
        return { success: true, command: 'stop', resourceId: dto.resourceId };
      case 'reset':
        await this.opcUaService.writeNodes([
          { nodeId: prefix + 'xStart', dataType: 'Boolean', value: false },
          { nodeId: prefix + 'xQryBusy', dataType: 'Boolean', value: false },
          { nodeId: prefix + 'xDone', dataType: 'Boolean', value: false },
          { nodeId: prefix + 'xError', dataType: 'Boolean', value: false },
        ]);
        return { success: true, command: 'reset', resourceId: dto.resourceId };
      case 'pause':
        await this.opcUaService.writeNodes([
          { nodeId: prefix + 'xQryBusy', dataType: 'Boolean', value: true },
        ]);
        return { success: true, command: 'pause', resourceId: dto.resourceId };
    }
  }

  @Post('opcua/write')
  @Roles(UserRoleEnum.ADMIN)
  async writeOpcUaNode(@Body() dto: MachineControlDto) {
    const prefix = `ns=1;s=Station${dto.resourceId}.stMES.Query.`;
    const values = Object.entries(dto).map(([k, v]) => ({
      nodeId: `${prefix}${v}`,
      dataType: 'String',
      value: k,
    }));
    return this.opcUaService.writeNodes(values);
  }
}
