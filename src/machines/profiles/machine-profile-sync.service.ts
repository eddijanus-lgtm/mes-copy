import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  MachineEntity,
  MachineStatusEnum,
} from '../machine.entity';
import { MachineProfileService } from './machine-profile.service';

@Injectable()
export class MachineProfileSyncService implements OnApplicationBootstrap {
  private readonly logger = new Logger(MachineProfileSyncService.name);

  constructor(
    private readonly profiles: MachineProfileService,
    @InjectRepository(MachineEntity)
    private readonly machines: Repository<MachineEntity>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const profile = this.profiles.getProfile();
    for (const station of profile.stations) {
      const existing = await this.machines.findOne({
        where: { resource_id: station.resourceId },
      });
      const values: Partial<MachineEntity> = {
        name: station.displayName,
        type: station.metadata?.machineType || 'OPC UA station',
        location: station.metadata?.location || profile.machineId,
        resource_id: station.resourceId,
        opcua_enabled: station.enabled,
        profile_managed: true,
        routing_enabled:
          station.enabled &&
          Boolean(station.routing) &&
          station.routing?.enabled !== false,
        route_sequence: station.routing?.sequence ?? null,
        operation_no: station.routing?.operationNo ?? null,
        dashboard_image: station.metadata?.dashboardImage ?? null,
        opcua_endpoint_url: null,
        opcua_node_prefix: null,
      };
      if (existing) {
        Object.assign(existing, values);
        await this.machines.save(existing);
      } else {
        await this.machines.save(
          this.machines.create({
            ...values,
            status: MachineStatusEnum.OFFLINE,
            telemetry: {},
          }),
        );
      }
    }
    this.logger.log(
      `Synchronized ${profile.stations.length} station(s) from machine profile ${profile.machineId}`,
    );
  }
}
