import { Injectable, Logger, OnModuleInit, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MACHINE_ADAPTER } from '../machines/adapters/machine-adapter.token';
import type { MachineAdapter, MachineRecoverySnapshot, MachineStationDescriptor } from '../machines/adapters/machine-adapter.types';
import { AlarmsService } from '../alarms/alarms.service';
import { OrderEntity } from '../orders/order.entity';
import { OrderRouteStepEntity } from '../orders/order-route-step.entity';
import { CarrierEntity, CarrierStatusEnum } from '../carriers/carrier.entity';

@Injectable()
export class ConnectionRecoveryService implements OnModuleInit {
  private readonly logger = new Logger(ConnectionRecoveryService.name);
  private hadActiveOrders = false;

  constructor(
    @Inject(MACHINE_ADAPTER) private readonly machine: MachineAdapter,
    private readonly alarms: AlarmsService,
    @InjectRepository(OrderEntity) private readonly ordersRepo: Repository<OrderEntity>,
    @InjectRepository(CarrierEntity) private readonly carriersRepo: Repository<CarrierEntity>,
    @InjectRepository(OrderRouteStepEntity) private readonly routeStepsRepo: Repository<OrderRouteStepEntity>,
  ) {}

  async onModuleInit() {
    this.machine.onDisconnected((reason) => void this.handleDisconnect(reason));
    this.machine.onConnected(() => void this.handleReconnect());

    await this.recoverFromStartup();
  }

  private async handleDisconnect(reason: string) {
    const active = await this.ordersRepo.count({ where: { status: 'in_progress' } });
    this.hadActiveOrders = active > 0;

    if (active > 0) {
      const msg = `OPC UA Verbindung verloren (${reason}) bei ${active} aktivem/n Auftrag/aufträgen`;
      this.logger.warn(msg);
      await this.alarms.create({
        severity: 'critical',
        machine_id: await this.machineId(),
        message: msg,
        source: 'ConnectionRecoveryService',
      });
    }
  }

  private async handleReconnect() {
    if (!this.hadActiveOrders) return;
    this.hadActiveOrders = false;

    this.logger.log('OPC UA wieder verbunden – prüfe Aufträge und Carrier');
    await this.alarms.create({
      severity: 'info',
      machine_id: await this.machineId(),
      message: 'OPC UA Verbindung wiederhergestellt – Recovery läuft',
      source: 'ConnectionRecoveryService',
    });

    await this.recoverStations();
  }

  private async recoverFromStartup() {
    await this.releaseCarriersWithoutActiveOrder();

    const activeOrders = await this.ordersRepo.count({ where: { status: 'in_progress' } });
    if (activeOrders === 0) return;

    this.logger.log(`Startup: ${activeOrders} aktive/r Auftrag/aufträge gefunden – Recovery gestartet`);
    await this.alarms.create({
      severity: 'warning',
      machine_id: await this.machineId(),
      message: `Backend-Neustart bei ${activeOrders} aktivem/n Auftrag/aufträgen – Recovery wird durchgeführt`,
      source: 'ConnectionRecoveryService',
    });

    await this.recoverStations();
  }

  private async recoverStations() {
    await this.releaseCarriersWithoutActiveOrder();

    const resourceIds = this.machine
      .getStations()
      .filter((station: MachineStationDescriptor) => station.enabled)
      .map((station: MachineStationDescriptor) => station.resourceId);
    const stationCarriers: Array<{ resourceId: number; carrierNumber: number }> = [];

    for (const resourceId of resourceIds) {
      try {
        const snapshot: MachineRecoverySnapshot = await this.machine.readRecoverySnapshot(resourceId);
        const { carrierNumber, requestActive, processBusy } = snapshot;

        if (carrierNumber > 0 && (requestActive || processBusy)) {
          stationCarriers.push({ resourceId, carrierNumber });
        }
      } catch (err) {
        this.logger.warn(`Station ${resourceId} konnte nicht gelesen werden: ${(err as Error).message}`);
      }
    }

    const stuckCarriers = await this.carriersRepo.find({
      where: [
        { status: CarrierStatusEnum.IN_PROCESS },
        { status: CarrierStatusEnum.ASSIGNED },
      ],
    });

    for (const carrier of stuckCarriers) {
      const found = stationCarriers.find((sc) => sc.carrierNumber === carrier.carrier_number);

      if (found) {
        const route = carrier.order_id
          ? await this.routeStepsRepo.find({
              where: { order_id: carrier.order_id },
              order: { step_no: 'ASC' },
            })
          : [];
        const stepForStation =
          route.find(
            (step) =>
              step.step_no === carrier.current_step_no &&
              step.resource_id === found.resourceId,
          ) ||
          route.find(
            (step) =>
              step.step_no >= (carrier.current_step_no ?? 0) &&
              step.resource_id === found.resourceId,
          );
        if (stepForStation && carrier.current_step_no !== stepForStation.step_no) {
          this.logger.log(
            `Carrier ${carrier.carrier_number} an Station ${found.resourceId}, korrigiere step ${carrier.current_step_no} -> ${stepForStation.step_no}`,
          );
          carrier.current_step_no = stepForStation.step_no;
          carrier.current_resource_id = found.resourceId;
          carrier.status = CarrierStatusEnum.IN_PROCESS;
          await this.carriersRepo.save(carrier);
        } else {
          this.logger.log(
            `Carrier ${carrier.carrier_number} ist an Station ${found.resourceId} (Status=${carrier.status})`,
          );
        }
      } else {
        const orderActive = carrier.order_id
          ? await this.ordersRepo.findOne({ where: { id: carrier.order_id, status: 'in_progress' } })
          : null;

        if (orderActive) {
          const firstStep = await this.routeStepsRepo.findOne({
            where: { order_id: orderActive.id },
            order: { step_no: 'ASC' },
          });
          if (!firstStep) continue;
          this.logger.log(
            `Carrier ${carrier.carrier_number} hängt (${carrier.status} step=${carrier.current_step_no}), setze zurück auf assigned step=${firstStep.step_no} für Auftrag ${orderActive.name}`,
          );
          carrier.status = CarrierStatusEnum.ASSIGNED;
          carrier.current_step_no = firstStep.step_no;
          carrier.current_resource_id = null;
          await this.carriersRepo.save(carrier);
        } else {
          this.logger.log(
            `Carrier ${carrier.carrier_number} hängt (${carrier.status}) ohne aktiven Auftrag, setze auf available`,
          );
          carrier.status = CarrierStatusEnum.AVAILABLE;
          carrier.order_id = null;
          carrier.current_step_no = null;
          carrier.current_resource_id = null;
          await this.carriersRepo.save(carrier);
        }
      }
    }

    if (stuckCarriers.length === 0 && stationCarriers.length === 0) {
      this.logger.log('Recovery abgeschlossen – keine hängenden Carrier gefunden');
    } else {
      this.logger.log(
        `Recovery abgeschlossen – ${stuckCarriers.length} Carrier geprüft, ${stationCarriers.length} an Stationen aktiv`,
      );
    }

    await this.alarms.create({
      severity: 'info',
      machine_id: await this.machineId(),
      message: `Recovery abgeschlossen: ${stuckCarriers.length} Carrier geprüft, ${stationCarriers.length} aktiv an Stationen`,
      source: 'ConnectionRecoveryService',
    });
  }

  private async releaseCarriersWithoutActiveOrder() {
    const availableCarriers = await this.carriersRepo.find({
      where: { status: CarrierStatusEnum.AVAILABLE },
    });
    for (const carrier of availableCarriers) {
      if (
        carrier.order_id == null &&
        carrier.current_step_no == null &&
        carrier.current_resource_id == null
      ) {
        continue;
      }
      carrier.order_id = null;
      carrier.current_step_no = null;
      carrier.current_resource_id = null;
      await this.carriersRepo.save(carrier);
    }

    const assignedCarriers = await this.carriersRepo.find({
      where: [
        { status: CarrierStatusEnum.IN_PROCESS },
        { status: CarrierStatusEnum.ASSIGNED },
        { status: CarrierStatusEnum.COMPLETED },
      ],
    });

    for (const carrier of assignedCarriers) {
      if (!carrier.order_id) continue;

      const activeOrder = await this.ordersRepo.findOne({
        where: { id: carrier.order_id, status: 'in_progress' },
      });
      if (activeOrder) continue;

      this.logger.log(
        `Carrier ${carrier.carrier_number} gehört zu keinem aktiven Auftrag mehr, setze auf available`,
      );
      carrier.status = CarrierStatusEnum.AVAILABLE;
      carrier.order_id = null;
      carrier.current_step_no = null;
      carrier.current_resource_id = null;
      await this.carriersRepo.save(carrier);
    }
  }

  private async machineId(): Promise<string> {
    const status = await this.machine.getConnectionStatus();
    return status.machineId || 'machine-adapter';
  }
}
