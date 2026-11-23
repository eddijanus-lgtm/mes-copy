import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DemoRoutingResultCode, RoutingService } from '../orders/routing.service';
import { OpcUaService } from './opcua.service';
import { StMesHandshakeEntity, StMesHandshakeStatusEnum } from './stmes-handshake.entity';

@Injectable()
export class StMesHandshakeService implements OnModuleInit {
  private readonly logger = new Logger(StMesHandshakeService.name);
  private readonly processing = new Set<number>();

  constructor(
    private readonly opcUa: OpcUaService,
    private readonly routing: RoutingService,
    @InjectRepository(StMesHandshakeEntity) private readonly handshakes: Repository<StMesHandshakeEntity>,
  ) {}

  onModuleInit() {
    this.opcUa.onStMesRequest((resourceId, active) => {
      if (active) void this.dispatch(resourceId);
      else void this.acknowledge(resourceId);
    });
    this.opcUa.onProcessCompleted((resourceId, timestamp) => void this.completeProcess(resourceId, timestamp));
  }

  findRecent(limit = 100) {
    return this.handshakes.find({ order: { created_at: 'DESC' }, take: limit });
  }

  private async dispatch(resourceId: number) {
    if (this.processing.has(resourceId)) return;
    this.processing.add(resourceId);
    const prefix = this.queryPrefix(resourceId);
    let journal: StMesHandshakeEntity | undefined;

    try {
      const [carrierNumber, requestedResourceId] = await Promise.all([
        this.opcUa.readNode(prefix + 'uiCarrierId'),
        this.opcUa.readNode(prefix + 'uiResourceId'),
      ]);
      journal = await this.handshakes.save(this.handshakes.create({
        resource_id: resourceId,
        carrier_number: Number(carrierNumber),
        request_payload: { carrierNumber, requestedResourceId },
      }));
      this.opcUa.publishStMesEvent({
        resourceId,
        phase: 'requested',
        carrierNumber: Number(carrierNumber),
        message: `SPS fordert Daten fuer Carrier ${Number(carrierNumber)} an`,
      });

      await this.opcUa.writeNodes([
        { nodeId: prefix + 'xQryBusy', dataType: 'Boolean', value: true },
        { nodeId: prefix + 'xDone', dataType: 'Boolean', value: false },
        { nodeId: prefix + 'xError', dataType: 'Boolean', value: false },
      ]);
      this.opcUa.publishStMesEvent({
        resourceId,
        phase: 'busy',
        carrierNumber: Number(carrierNumber),
        message: 'MES prueft Auftrag und Routenschritt',
      });

      const decision = await this.routing.resolveStationRequest(resourceId, Number(carrierNumber));
      const ok = decision.resultCode === DemoRoutingResultCode.OK;
      const parameters = decision.parameters || {};
      const response = {
        orderNo: decision.orderNo || '',
        partNo: decision.partNo || '',
        operationNo: decision.operationNo || 0,
        stepNo: decision.stepNo || 0,
        nextResourceId: decision.nextResourceId || 0,
        iPar1: parameters.iPar1 || 0,
        iPar2: parameters.iPar2 || 0,
        iPar3: parameters.iPar3 || 0,
        iPar4: parameters.iPar4 || 0,
        resultCode: decision.resultCode,
      };

      await this.opcUa.writeNodes([
        { nodeId: prefix + 'sOrderNo', dataType: 'String', value: response.orderNo },
        { nodeId: prefix + 'sPartNo', dataType: 'String', value: response.partNo },
        { nodeId: prefix + 'uiOperationNo', dataType: 'UInt16', value: response.operationNo },
        { nodeId: prefix + 'iStepNo', dataType: 'Int16', value: response.stepNo },
        { nodeId: prefix + 'uiNextResourceId', dataType: 'UInt16', value: response.nextResourceId },
        { nodeId: prefix + 'iPar1', dataType: 'Int16', value: response.iPar1 },
        { nodeId: prefix + 'iPar2', dataType: 'Int16', value: response.iPar2 },
        { nodeId: prefix + 'iPar3', dataType: 'Int16', value: response.iPar3 },
        { nodeId: prefix + 'iPar4', dataType: 'Int16', value: response.iPar4 },
        { nodeId: prefix + 'uiResultCode', dataType: 'UInt16', value: response.resultCode },
        { nodeId: prefix + 'xQryBusy', dataType: 'Boolean', value: false },
        { nodeId: prefix + 'xDone', dataType: 'Boolean', value: ok },
        { nodeId: prefix + 'xError', dataType: 'Boolean', value: !ok },
      ]);

      Object.assign(journal, {
        carrier_id: decision.carrierId,
        order_id: decision.orderId,
        result_code: decision.resultCode,
        response_payload: response,
        responded_at: new Date(),
        status: ok ? StMesHandshakeStatusEnum.RESPONDED : StMesHandshakeStatusEnum.ERROR,
      });
      await this.handshakes.save(journal);
      this.opcUa.publishStMesEvent({
        resourceId,
        phase: ok ? 'done' : 'error',
        carrierNumber: Number(carrierNumber),
        resultCode: decision.resultCode,
        orderNo: response.orderNo,
        operationNo: response.operationNo,
        nextResourceId: response.nextResourceId,
        message: ok ? `Auftrag ${response.orderNo} an SPS uebergeben` : `Anfrage mit Resultcode ${decision.resultCode} abgewiesen`,
      });
    } catch (error) {
      this.logger.error(`Demo stMES dispatch failed for resource ${resourceId}: ${(error as Error).message}`);
      try {
        await this.opcUa.writeNodes([
          { nodeId: prefix + 'uiResultCode', dataType: 'UInt16', value: DemoRoutingResultCode.INTERNAL_ERROR },
          { nodeId: prefix + 'xQryBusy', dataType: 'Boolean', value: false },
          { nodeId: prefix + 'xDone', dataType: 'Boolean', value: false },
          { nodeId: prefix + 'xError', dataType: 'Boolean', value: true },
        ]);
      } catch (writeError) {
        this.logger.error(`Demo stMES error response failed: ${(writeError as Error).message}`);
      }
      if (journal) {
        journal.status = StMesHandshakeStatusEnum.ERROR;
        journal.result_code = DemoRoutingResultCode.INTERNAL_ERROR;
        journal.error_message = (error as Error).message;
        await this.handshakes.save(journal);
      }
      this.opcUa.publishStMesEvent({
        resourceId,
        phase: 'error',
        resultCode: DemoRoutingResultCode.INTERNAL_ERROR,
        message: 'Interner Fehler bei der Stationsanfrage',
      });
    }
  }

  private async acknowledge(resourceId: number) {
    const prefix = this.queryPrefix(resourceId);
    try {
      await this.opcUa.writeNodes([
        { nodeId: prefix + 'xQryBusy', dataType: 'Boolean', value: false },
        { nodeId: prefix + 'xDone', dataType: 'Boolean', value: false },
        { nodeId: prefix + 'xError', dataType: 'Boolean', value: false },
      ]);
      const latest = await this.handshakes.findOne({
        where: { resource_id: resourceId },
        order: { created_at: 'DESC' },
      });
      if (latest && latest.status !== StMesHandshakeStatusEnum.ACKNOWLEDGED) {
        latest.status = StMesHandshakeStatusEnum.ACKNOWLEDGED;
        latest.acknowledged_at = new Date();
        await this.handshakes.save(latest);
        this.opcUa.publishStMesEvent({
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
      const carrierNumber = Number(await this.opcUa.readNode(`ns=1;s=Station${resourceId}.dbProcessData.iCarrierID`));
      const completed = await this.routing.completeStationStep(resourceId, carrierNumber, timestamp);
      if (completed) {
        this.logger.log(`Completed route step for carrier ${carrierNumber} at resource ${resourceId}`);
        this.opcUa.publishStMesEvent({
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

  private queryPrefix(resourceId: number) {
    return `ns=1;s=Station${resourceId}.stMES.Query.`;
  }
}
