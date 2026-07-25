import { Injectable, Logger, OnModuleInit, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MACHINE_ADAPTER } from '../machines/adapters/machine-adapter.token';
import type { MachineAdapter, MachineRecoverySnapshot } from '../machines/adapters/machine-adapter.types';
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
        machine_id: 'opcua',
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
      machine_id: 'opcua',
      message: 'OPC UA Verbindung wiederhergestellt – Recovery läuft',
      source: 'ConnectionRecoveryService',
    });

    await this.recoverStations();
  }

  private async recoverFromStartup() {
    const activeOrders = await this.ordersRepo.count({ where: { status: 'in_progress' } });
    if (activeOrders === 0) return;

    this.logger.log(`Startup: ${activeOrders} aktive/r Auftrag/aufträge gefunden – Recovery gestartet`);
    await this.alarms.create({
      severity: 'warning',
      machine_id: 'opcua',
      message: `Backend-Neustart bei ${activeOrders} aktivem/n Auftrag/aufträgen – Recovery wird durchgeführt`,
      source: 'ConnectionRecoveryService',
    });

    await this.recoverStations();
  }

  private async recoverStations() {
    const resourceIds = [1, 2, 3];
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
        const stepForStation = carrier.order_id
          ? await this.routeStepsRepo.findOne({
              where: { order_id: carrier.order_id, resource_id: found.resourceId },
            })
          : null;
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
          this.logger.log(
            `Carrier ${carrier.carrier_number} hängt (${carrier.status} step=${carrier.current_step_no}), setze zurück auf assigned step=1 für Auftrag ${orderActive.name}`,
          );
          carrier.status = CarrierStatusEnum.ASSIGNED;
          carrier.current_step_no = 1;
          carrier.current_resource_id = null;
          await this.carriersRepo.save(carrier);
        } else {
          this.logger.log(
            `Carrier ${carrier.carrier_number} hängt (${carrier.status}) ohne aktiven Auftrag, setze auf available`,
          );
          carrier.status = CarrierStatusEnum.AVAILABLE;
          carrier.order_id = undefined;
          carrier.current_step_no = 1;
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
      machine_id: 'opcua',
      message: `Recovery abgeschlossen: ${stuckCarriers.length} Carrier geprüft, ${stationCarriers.length} aktiv an Stationen`,
      source: 'ConnectionRecoveryService',
    });
  }
}
