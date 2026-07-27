import { Injectable, Logger, OnModuleInit, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RoutingService } from '../orders/routing.service';
import { MACHINE_ADAPTER } from '../machines/adapters/machine-adapter.token';
import type { MachineAdapter } from '../machines/adapters/machine-adapter.types';
import type { MachineRoutingResponse } from '../machines/adapters/machine-adapter.types';
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
      const requestedAt = new Date();
      journal = await this.handshakes.save(this.handshakes.create({
        resource_id: resourceId,
        carrier_number: request.carrierNumber,
        request_payload: { carrierNumber: request.carrierNumber, requestedResourceId: request.requestedResourceId },
        created_at: requestedAt,
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
      const ok = decision.outcome === 'accepted';
      const resultCode = this.machine.routingResultCode(decision.outcome);
      if (
        ok &&
        (typeof decision.orderNo !== 'string' ||
          !decision.orderNo ||
          typeof decision.partNo !== 'string' ||
          !decision.partNo ||
          !Number.isInteger(decision.operationNo) ||
          !Number.isInteger(decision.stepNo) ||
          !Number.isInteger(decision.nextResourceId) ||
          typeof decision.parameters !== 'object' ||
          decision.parameters === null ||
          Array.isArray(decision.parameters))
      ) {
        throw new Error('Accepted routing decision is incomplete');
      }
      const response: MachineRoutingResponse = ok
        ? {
            orderNo: decision.orderNo!,
            partNo: decision.partNo!,
            operationNo: decision.operationNo!,
            stepNo: decision.stepNo!,
            nextResourceId: decision.nextResourceId!,
            parameters: decision.parameters!,
            resultCode,
            accepted: true,
          }
        : {
            resultCode,
            accepted: false,
          };

      await this.machine.writeRoutingResponse(resourceId, response);

      Object.assign(journal, {
        carrier_id: decision.carrierId,
        order_id: decision.orderId,
        result_code: resultCode,
        response_payload: response,
        responded_at: new Date(),
        status: ok ? StMesHandshakeStatusEnum.RESPONDED : StMesHandshakeStatusEnum.ERROR,
      });
      await this.handshakes.save(journal);
      this.machine.publishHandshakeEvent({
        resourceId,
        phase: ok ? 'done' : 'error',
        carrierNumber: request.carrierNumber,
        resultCode,
        ...(response.accepted
          ? {
              orderNo: response.orderNo,
              operationNo: response.operationNo,
              nextResourceId: response.nextResourceId,
            }
          : {}),
        message: response.accepted
          ? `Auftrag ${response.orderNo} an SPS uebergeben`
          : `Anfrage mit Resultcode ${resultCode} abgewiesen`,
      });
    } catch (error) {
      this.logger.error(`stMES dispatch failed for resource ${resourceId}: ${(error as Error).message}`);
      let internalErrorCode: number | undefined;
      try {
        internalErrorCode = this.machine.routingResultCode('internal_error');
        await this.machine.writeInternalError(resourceId, internalErrorCode);
      } catch (writeError) {
        this.logger.error(`stMES error response failed: ${(writeError as Error).message}`);
      }
      if (journal) {
        try {
          await this.routing.failStationStep(
            resourceId,
            journal.carrier_number,
            new Date(),
          );
        } catch (executionError) {
          this.logger.error(
            `Execution-step failure update failed: ${(executionError as Error).message}`,
          );
        }
        journal.status = StMesHandshakeStatusEnum.ERROR;
        journal.result_code = internalErrorCode;
        journal.error_message = (error as Error).message;
        await this.handshakes.save(journal);
      }
      this.machine.publishHandshakeEvent({
        resourceId,
        phase: 'error',
        ...(internalErrorCode === undefined
          ? {}
          : { resultCode: internalErrorCode }),
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
