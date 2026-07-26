import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { CarrierInventorySyncService } from '../carriers/carrier-inventory-sync.service';
import { MACHINE_ADAPTER } from '../machines/adapters/machine-adapter.token';
import type {
  MachineAdapter,
  MachineCarrierInventorySnapshot,
  MachineStationDescriptor,
} from '../machines/adapters/machine-adapter.types';

/**
 * Connects the optional physical carrier inventory exposed by a machine
 * adapter to the MES carrier domain. The adapter remains real OPC UA code;
 * test machines implement the same contract outside the MES runtime.
 */
@Injectable()
export class CarrierInventoryBridgeService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(CarrierInventoryBridgeService.name);
  private readonly unsubscribers: Array<() => void> = [];
  private refreshing = false;

  constructor(
    @Inject(MACHINE_ADAPTER) private readonly machine: MachineAdapter,
    private readonly inventory: CarrierInventorySyncService,
  ) {}

  onModuleInit(): void {
    if (this.machine.onCarrierInventoryChanged) {
      this.unsubscribers.push(
        this.machine.onCarrierInventoryChanged((snapshot) => {
          void this.applySnapshot(snapshot);
        }),
      );
    }
    this.unsubscribers.push(
      this.machine.onConnected(() => void this.refreshAll()),
      this.machine.onDisconnected(() => void this.markInventoryStale()),
    );

    if (this.machine.isConnected()) void this.refreshAll();
  }

  onModuleDestroy(): void {
    for (const unsubscribe of this.unsubscribers.splice(0)) unsubscribe();
  }

  private async refreshAll(): Promise<void> {
    if (this.refreshing || !this.machine.readCarrierInventory) return;
    this.refreshing = true;
    try {
      const inventoryStations = this.machine
        .getStations()
        .filter((station) => this.hasInventoryCapability(station));
      for (const station of inventoryStations) {
        try {
          const snapshot = await this.machine.readCarrierInventory(
            station.resourceId,
          );
          await this.applySnapshot(snapshot);
        } catch (error) {
          this.logger.warn(
            `Carrier inventory ${station.stationId} could not be refreshed: ${
              (error as Error).message
            }`,
          );
        }
      }
    } finally {
      this.refreshing = false;
    }
  }

  private async applySnapshot(
    snapshot: MachineCarrierInventorySnapshot,
  ): Promise<void> {
    try {
      const result = await this.inventory.synchronize(snapshot);
      if (!result.applied) return;
      const message =
        `Carrier inventory ${result.source} revision ${result.revision}: ` +
        `${result.discovered} discovered, ${result.updated} updated, ` +
        `${result.staleMarked} stale`;
      if (result.countMismatch) this.logger.warn(`${message}; count mismatch`);
      else this.logger.log(message);
    } catch (error) {
      this.logger.error(
        `Carrier inventory snapshot rejected: ${(error as Error).message}`,
      );
    }
  }

  private async markInventoryStale(): Promise<void> {
    try {
      const affected = await this.inventory.markStale();
      if (affected > 0) {
        this.logger.warn(
          `Machine connection lost; marked ${affected} carrier inventory records stale`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Carrier inventory could not be marked stale: ${
          (error as Error).message
        }`,
      );
    }
  }

  private hasInventoryCapability(station: MachineStationDescriptor): boolean {
    return (
      station.capabilities?.includes('inventory') === true ||
      station.resourceType === 'inventory' ||
      station.resourceType === 'storage' ||
      station.resourceType === 'hybrid'
    );
  }
}
