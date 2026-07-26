import { Injectable, Logger, OnModuleInit, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RoutingResultCode, RoutingService } from '../orders/routing.service';
import { MACHINE_ADAPTER } from '../machines/adapters/machine-adapter.token';
import type { MachineAdapter } from '../machines/adapters/machine-adapter.types';
import { StMesHandshakeEntity, StMesHandshakeStatusEnum } from './stmes-handshake.entity';

@Injectable()
export class StMesHandshakeService implements OnModuleInit {
  private readonly logger = new Logger(StMesHandshakeService.name);
  private readonly processing = new Set<number>();

  constructor(
    @Inject(MACHINE_ADAPTER) private readonly machine: MachineAdapter,
    private readonly routing: RoutingService,
    @InjectRepository(StMesHandshakeEntity) private readonly handshakes: Repository<StMesHandshakeEntity>,
  ) {}

  onModuleInit() {
    this.machine.onWorkRequest((resourceId, active) => {
      if (active) void this.dispatch(resourceId);
      else void this.acknowledge(resourceId);
    });
    this.machine.onProcessCompleted((resourceId, timestamp) => void this.completeProcess(resourceId, timestamp));
  }

  findRecent(limit = 100) {
    return this.handshakes.find({ order: { created_at: 'DESC' }, take: limit });
  }

  private async dispatch(resourceId: number) {
    if (this.processing.has(resourceId)) return;
    this.processing.add(resourceId);
    let journal: StMesHandshakeEntity | undefined;

    try {
      const request = await this.machine.readStationRequest(resourceId);
      journal = await this.handshakes.save(this.handshakes.create({
        resource_id: resourceId,
        carrier_number: request.carrierNumber,
        request_payload: { carrierNumber: request.carrierNumber, requestedResourceId: request.requestedResourceId },
      }));
      this.machine.publishHandshakeEvent({
        resourceId,
        phase: 'requested',
        carrierNumber: request.carrierNumber,
        message: `SPS fordert Daten fuer Carrier ${request.carrierNumber} an`,
      });

      await this.machine.markRequestBusy(resourceId);
      this.machine.publishHandshakeEvent({
        resourceId,
        phase: 'busy',
        carrierNumber: request.carrierNumber,
        message: 'MES prueft Auftrag und Routenschritt',
      });

      const decision = await this.routing.resolveStationRequest(resourceId, request.carrierNumber);
      const ok = decision.resultCode === RoutingResultCode.OK;
      const parameters = decision.parameters || {};
      const response = {
        orderNo: decision.orderNo ?? '',
        partNo: decision.partNo ?? '',
        operationNo: decision.operationNo ?? 0,
        stepNo: decision.stepNo ?? 0,
        nextResourceId: decision.nextResourceId ?? 0,
        parameters,
        resultCode: decision.resultCode,
      };

      await this.machine.writeRoutingResponse(resourceId, { ...response, accepted: ok });

      Object.assign(journal, {
        carrier_id: decision.carrierId,
        order_id: decision.orderId,
        result_code: decision.resultCode,
        response_payload: response,
        responded_at: new Date(),
        status: ok ? StMesHandshakeStatusEnum.RESPONDED : StMesHandshakeStatusEnum.ERROR,
      });
      await this.handshakes.save(journal);
      this.machine.publishHandshakeEvent({
        resourceId,
        phase: ok ? 'done' : 'error',
        carrierNumber: request.carrierNumber,
        resultCode: decision.resultCode,
        orderNo: response.orderNo,
        operationNo: response.operationNo,
        nextResourceId: response.nextResourceId,
        message: ok ? `Auftrag ${response.orderNo} an SPS uebergeben` : `Anfrage mit Resultcode ${decision.resultCode} abgewiesen`,
      });
    } catch (error) {
      this.logger.error(`stMES dispatch failed for resource ${resourceId}: ${(error as Error).message}`);
      try {
        await this.machine.writeInternalError(resourceId, RoutingResultCode.INTERNAL_ERROR);
      } catch (writeError) {
        this.logger.error(`stMES error response failed: ${(writeError as Error).message}`);
      }
      if (journal) {
        journal.status = StMesHandshakeStatusEnum.ERROR;
        journal.result_code = RoutingResultCode.INTERNAL_ERROR;
        journal.error_message = (error as Error).message;
        await this.handshakes.save(journal);
      }
      this.machine.publishHandshakeEvent({
        resourceId,
        phase: 'error',
        resultCode: RoutingResultCode.INTERNAL_ERROR,
        message: 'Interner Fehler bei der Stationsanfrage',
      });
    }
  }

  private async acknowledge(resourceId: number) {
    try {
      await this.machine.acknowledgeRequest(resourceId);
      const latest = await this.handshakes.findOne({
        where: { resource_id: resourceId },
        order: { created_at: 'DESC' },
      });
      if (latest && latest.status !== StMesHandshakeStatusEnum.ACKNOWLEDGED) {
        latest.status = StMesHandshakeStatusEnum.ACKNOWLEDGED;
        latest.acknowledged_at = new Date();
        await this.handshakes.save(latest);
        this.machine.publishHandshakeEvent({
          resourceId,
          phase: 'acknowledged',
          carrierNumber: latest.carrier_number,
          resultCode: latest.result_code,
          message: 'SPS hat die MES-Antwort quittiert',
        });
      }
    } finally {
      this.processing.delete(resourceId);
    }
  }

  private async completeProcess(resourceId: number, timestamp: Date) {
    try {
      const carrierNumber = await this.machine.readCompletedCarrierNumber(resourceId);
      const completed = await this.routing.completeStationStep(resourceId, carrierNumber, timestamp);
      if (completed) {
        this.logger.log(`Completed route step for carrier ${carrierNumber} at resource ${resourceId}`);
        this.machine.publishHandshakeEvent({
          resourceId,
          phase: 'process_completed',
          carrierNumber,
          processTimestamp: timestamp.toISOString(),
          message: `SPS meldet Prozessabschluss fuer Carrier ${carrierNumber}`,
        });
      }
    } catch (error) {
      this.logger.error(`Process completion failed for resource ${resourceId}: ${(error as Error).message}`);
    }
  }
}
