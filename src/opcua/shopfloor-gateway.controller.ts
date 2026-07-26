import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Controller, Get, Post, Body, Inject } from '@nestjs/common';
import { MqttGatewayService } from './mqtt-gateway.service';
import { MqttPublishDto, OpcUaReadDto, MachineControlDto, OpcUaWriteDto } from './shopfloor-gateway.dto';
import { Roles } from '../auth/roles.decorator';
import { UserRoleEnum } from '../users/user.entity';
import { StMesHandshakeService } from './stmes-handshake.service';
import { WebshopOrdersService } from './webshop-orders.service';
import { MACHINE_ADAPTER } from '../machines/adapters/machine-adapter.token';
import type { MachineAdapter, MachineAddressWrite } from '../machines/adapters/machine-adapter.types';

@Controller('shopfloor')
@ApiTags('Shopfloor')
@ApiBearerAuth('JWT-auth')
export class ShopfloorGatewayController {
  constructor(
    @Inject(MACHINE_ADAPTER) private readonly machine: MachineAdapter,
    private readonly mqttGatewayService: MqttGatewayService,
    private readonly stMesHandshakeService: StMesHandshakeService,
    private readonly webshopOrdersService: WebshopOrdersService,
  ) {}

  @Get('opcua/status')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR, UserRoleEnum.VIEWER)
  async getOpcUaStatus() { return this.machine.getConnectionStatus(); }

  @Get('opcua/connected')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR, UserRoleEnum.VIEWER)
  opcuaConnected() { return { connected: this.machine.isConnected() }; }

  @Post('opcua/read')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR)
  async readOpcUaNode(@Body() dto: OpcUaReadDto) { return this.machine.readDiagnosticAddress(dto.nodeId); }

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
  async getHealth() {
    const machineStatus = await this.machine.getConnectionStatus();
    return {
      status: 'ok',
      ok: this.machine.isConnected() && this.mqttGatewayService.isConnected(),
      name: 'Shopfloor Gateway',
      role: 'OT/IT gateway for OPC UA station handshakes, MQTT ingress and shopfloor telemetry forwarding. Routing decisions stay in MES routing.',
      timestamp: new Date().toISOString(),
      protocols: {
        opcua: {
          connected: this.machine.isConnected(),
          direction:
            machineStatus.operatingMode === 'control'
              ? 'read/write'
              : 'read-only',
          purpose: 'Profile-configured machine signals and production events',
        },
        mqtt: { connected: this.mqttGatewayService.isConnected(), direction: 'subscribe/publish', purpose: 'Webshop order ingress and broker telemetry' },
      },
      opcua: this.machine.isConnected(),
      mqtt: this.mqttGatewayService.isConnected(),
      machine: {
        ...machineStatus,
        stations: this.machine.getStations(),
      },
    };
  }

  @Get('machine/order-parameters')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR, UserRoleEnum.VIEWER)
  getOrderParameterDefinitions() {
    return { source: 'machine-adapter', parameters: this.machine.getOrderParameterDefinitions() };
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
    await this.machine.executeControlCommand(dto.resourceId, dto.command);
    return { success: true, command: dto.command, resourceId: dto.resourceId };
  }

  @Post('opcua/write')
  @Roles(UserRoleEnum.ADMIN)
  async writeOpcUaNode(@Body() dto: OpcUaWriteDto) {
    const writes: MachineAddressWrite[] = dto.writes.map(item => ({
      address: item.address,
      dataType: item.dataType,
      value: item.value,
    }));
    await this.machine.writeDiagnosticAddresses(writes);
    return { success: true, written: dto.writes.length };
  }
}
