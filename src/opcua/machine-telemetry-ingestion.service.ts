import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DataPointEntity } from '../data-collection/data-point.entity';
import {
  isProductionMetricRole,
  PRODUCTION_METRIC_NODE_IDS,
} from '../data-collection/production-metrics';
import type { MachineAdapter } from '../machines/adapters/machine-adapter.types';
import { MACHINE_ADAPTER } from '../machines/adapters/machine-adapter.token';
import {
  MachineEntity,
  MachineStatusEnum,
} from '../machines/machine.entity';
import { ShopfloorTelemetryEvent } from './shopfloor-telemetry';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function telemetryQuality(
  value: unknown,
): DataPointEntity['quality'] {
  return value === 'good' || value === 'bad' || value === 'uncertain'
    ? value
    : 'uncertain';
}

@Injectable()
export class MachineTelemetryIngestionService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(MachineTelemetryIngestionService.name);
  private unsubscribeTelemetry?: () => void;
  private unsubscribeDisconnected?: () => void;
  private collectionChain = Promise.resolve();
  private readonly lastMetricValues = new Map<
    string,
    { value: number; quality: DataPointEntity['quality'] }
  >();

  constructor(
    @Inject(MACHINE_ADAPTER) private readonly machine: MachineAdapter,
    @InjectRepository(MachineEntity)
    private readonly machines: Repository<MachineEntity>,
    @InjectRepository(DataPointEntity)
    private readonly dataPoints: Repository<DataPointEntity>,
  ) {}

  onModuleInit(): void {
    this.unsubscribeTelemetry = this.machine.onTelemetry((event) => {
      this.collectionChain = this.collectionChain
        .then(() => this.collectSnapshot(event))
        .catch((error) =>
          this.logger.error(
            `Machine telemetry could not be persisted: ${(error as Error).message}`,
          ),
        );
    });
    this.unsubscribeDisconnected = this.machine.onDisconnected(() => {
      void this.markProfileStationsOffline();
    });
  }

  onModuleDestroy(): void {
    this.unsubscribeTelemetry?.();
    this.unsubscribeDisconnected?.();
  }

  private async collectSnapshot(event: ShopfloorTelemetryEvent): Promise<void> {
    if (
      event.source !== 'opcua' ||
      event.payload.kind !== 'station.snapshot' ||
      !isRecord(event.payload.roles) ||
      !isRecord(event.payload.signals)
    ) {
      return;
    }

    const resourceId = Number(event.payload.resourceId);
    if (!Number.isInteger(resourceId) || resourceId <= 0) return;

    const machine = await this.machines.findOne({
      where: { resource_id: resourceId },
    });
    if (!machine) {
      this.logger.warn(
        `Telemetry ignored because resource ${resourceId} is not synchronized yet`,
      );
      return;
    }

    const timestamp = new Date(event.timestamp);
    const measuredAt = Number.isNaN(timestamp.getTime())
      ? new Date()
      : timestamp;

    await this.machines.update(machine.id, {
      status: MachineStatusEnum.ONLINE,
      last_heartbeat: measuredAt,
      telemetry: event.payload.signals as Record<string, any>,
    });

    const points: DataPointEntity[] = [];
    const cachedValues: Array<
      [
        string,
        { value: number; quality: DataPointEntity['quality'] },
      ]
    > = [];
    const roleQualities = isRecord(event.payload.roleQualities)
      ? event.payload.roleQualities
      : {};
    for (const [role, rawValue] of Object.entries(event.payload.roles)) {
      if (!isProductionMetricRole(role)) continue;
      const value = Number(rawValue);
      if (!Number.isFinite(value) || value < 0) continue;

      const cacheKey = `${machine.id}:${role}`;
      const quality = telemetryQuality(roleQualities[role]);
      const previous = this.lastMetricValues.get(cacheKey);
      if (
        previous &&
        Object.is(previous.value, value) &&
        previous.quality === quality
      ) {
        continue;
      }

      points.push(
        this.dataPoints.create({
          machine_id: machine.id,
          node_id: PRODUCTION_METRIC_NODE_IDS[role],
          value,
          quality,
          timestamp: measuredAt,
        }),
      );
      cachedValues.push([cacheKey, { value, quality }]);
    }

    if (points.length) {
      await this.dataPoints.save(points);
      for (const [cacheKey, snapshot] of cachedValues) {
        this.lastMetricValues.set(cacheKey, snapshot);
      }
    }
  }

  private async markProfileStationsOffline(): Promise<void> {
    try {
      for (const station of this.machine.getStations()) {
        await this.machines.update(
          { resource_id: station.resourceId },
          { status: MachineStatusEnum.OFFLINE },
        );
      }
    } catch (error) {
      this.logger.error(
        `Disconnected machine status could not be persisted: ${(error as Error).message}`,
      );
    }
  }
}
