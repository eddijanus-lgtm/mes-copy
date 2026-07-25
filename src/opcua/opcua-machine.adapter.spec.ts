import { Test, TestingModule } from '@nestjs/testing';

// Mock node-opcua before any imports that use it
jest.mock('node-opcua', () => ({
  AttributeIds: { Value: 13 },
  DataType: { Boolean: 'Boolean', String: 'String', Int16: 'Int16', UInt16: 'UInt16', UInt32: 'UInt32' },
  Variant: class Variant {
    constructor(public readonly value: unknown) {}
  },
  resolveNodeId: jest.fn((nodeId: string) => nodeId),
}));

import { OpcUaService } from './opcua.service';
import { OpcUaMachineAdapter } from './opcua-machine.adapter';
import { MachineAdapter, MachineControlCommand, MachineRoutingResponse, MachineAddressWrite } from '../machines/adapters/machine-adapter.types';
import { ShopfloorTelemetryEvent } from './shopfloor-telemetry';

describe('OpcUaMachineAdapter', () => {
  let adapter: OpcUaMachineAdapter;
  let mockOpcUa: jest.Mocked<OpcUaService>;

  const mockTelemetryCallback = jest.fn();
  const mockWorkRequestCallback = jest.fn();
  const mockProcessCompletedCallback = jest.fn();
  const mockConnectedCallback = jest.fn();
  const mockDisconnectedCallback = jest.fn();

  beforeEach(async () => {
    mockOpcUa = {
      isConnected: jest.fn().mockReturnValue(true),
      getServerStatus: jest.fn().mockResolvedValue({ connected: true, endpoint: 'opc.tcp://localhost:4840/UA/WaraMesTest' }),
      onTelemetry: jest.fn().mockReturnValue(() => {}),
      onStMesRequest: jest.fn().mockReturnValue(() => {}),
      onProcessCompleted: jest.fn().mockReturnValue(() => {}),
      onConnected: jest.fn().mockReturnValue(() => {}),
      onDisconnected: jest.fn().mockReturnValue(() => {}),
      readNode: jest.fn(),
      writeNodes: jest.fn().mockResolvedValue(undefined),
      publishStMesEvent: jest.fn(),
    } as unknown as jest.Mocked<OpcUaService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OpcUaMachineAdapter,
        { provide: OpcUaService, useValue: mockOpcUa },
      ],
    }).compile();

    adapter = module.get<OpcUaMachineAdapter>(OpcUaMachineAdapter);
  });

  describe('isConnected', () => {
    it('delegates to OpcUaService.isConnected', () => {
      mockOpcUa.isConnected.mockReturnValue(true);
      expect(adapter.isConnected()).toBe(true);
      expect(mockOpcUa.isConnected).toHaveBeenCalledTimes(1);
    });

    it('returns false when OpcUaService returns false', () => {
      mockOpcUa.isConnected.mockReturnValue(false);
      expect(adapter.isConnected()).toBe(false);
    });
  });

  describe('getConnectionStatus', () => {
    it('normalizes OpcUaService.getServerStatus to MachineConnectionStatus', async () => {
      mockOpcUa.getServerStatus.mockResolvedValue({ connected: true, endpoint: 'opc.tcp://localhost:4840/UA/WaraMesTest' });
      const status = await adapter.getConnectionStatus();
      expect(status).toEqual({ connected: true, endpoint: 'opc.tcp://localhost:4840/UA/WaraMesTest' });
      expect(mockOpcUa.getServerStatus).toHaveBeenCalledTimes(1);
    });
  });

  describe('onTelemetry', () => {
    it('delegates to OpcUaService.onTelemetry', () => {
      const unsubscribe = adapter.onTelemetry(mockTelemetryCallback);
      expect(mockOpcUa.onTelemetry).toHaveBeenCalledWith(mockTelemetryCallback);
      expect(typeof unsubscribe).toBe('function');
    });
  });

  describe('onWorkRequest', () => {
    it('delegates to OpcUaService.onStMesRequest', () => {
      const unsubscribe = adapter.onWorkRequest(mockWorkRequestCallback);
      expect(mockOpcUa.onStMesRequest).toHaveBeenCalledWith(mockWorkRequestCallback);
      expect(typeof unsubscribe).toBe('function');
    });
  });

  describe('onProcessCompleted', () => {
    it('delegates to OpcUaService.onProcessCompleted', () => {
      const unsubscribe = adapter.onProcessCompleted(mockProcessCompletedCallback);
      expect(mockOpcUa.onProcessCompleted).toHaveBeenCalledWith(mockProcessCompletedCallback);
      expect(typeof unsubscribe).toBe('function');
    });
  });

  describe('onConnected', () => {
    it('delegates to OpcUaService.onConnected', () => {
      const unsubscribe = adapter.onConnected(mockConnectedCallback);
      expect(mockOpcUa.onConnected).toHaveBeenCalledWith(mockConnectedCallback);
      expect(typeof unsubscribe).toBe('function');
    });
  });

  describe('onDisconnected', () => {
    it('delegates to OpcUaService.onDisconnected', () => {
      const unsubscribe = adapter.onDisconnected(mockDisconnectedCallback);
      expect(mockOpcUa.onDisconnected).toHaveBeenCalledWith(mockDisconnectedCallback);
      expect(typeof unsubscribe).toBe('function');
    });
  });

  describe('readStationRequest', () => {
    it('uses expected legacy addresses and normalizes numbers', async () => {
      mockOpcUa.readNode
        .mockResolvedValueOnce(123)   // uiCarrierId
        .mockResolvedValueOnce(456);  // uiResourceId

      const result = await adapter.readStationRequest(1);
      expect(result).toEqual({ carrierNumber: 123, requestedResourceId: 456 });
      expect(mockOpcUa.readNode).toHaveBeenCalledTimes(2);
      expect(mockOpcUa.readNode).toHaveBeenCalledWith('ns=1;s=Station1.stMES.Query.uiCarrierId');
      expect(mockOpcUa.readNode).toHaveBeenCalledWith('ns=1;s=Station1.stMES.Query.uiResourceId');
    });
  });

  describe('markRequestBusy', () => {
    it('writes exactly the three expected values', async () => {
      await adapter.markRequestBusy(1);
      expect(mockOpcUa.writeNodes).toHaveBeenCalledTimes(1);
      expect(mockOpcUa.writeNodes).toHaveBeenCalledWith([
        { nodeId: 'ns=1;s=Station1.stMES.Query.xQryBusy', dataType: 'Boolean', value: true },
        { nodeId: 'ns=1;s=Station1.stMES.Query.xDone', dataType: 'Boolean', value: false },
        { nodeId: 'ns=1;s=Station1.stMES.Query.xError', dataType: 'Boolean', value: false },
      ]);
    });
  });

  describe('writeRoutingResponse', () => {
    it('writes response and Done/Error correctly when accepted', async () => {
      const response: MachineRoutingResponse = {
        orderNo: 'ORD-001',
        partNo: 'PART-123',
        operationNo: 10,
        stepNo: 5,
        nextResourceId: 2,
        iPar1: 100,
        iPar2: 200,
        iPar3: 300,
        iPar4: 400,
        resultCode: 0,
        accepted: true,
      };

      await adapter.writeRoutingResponse(1, response);
      expect(mockOpcUa.writeNodes).toHaveBeenCalledTimes(1);
      const writeCall = mockOpcUa.writeNodes.mock.calls[0][0];
      expect(writeCall).toContainEqual({ nodeId: 'ns=1;s=Station1.stMES.Query.sOrderNo', dataType: 'String', value: 'ORD-001' });
      expect(writeCall).toContainEqual({ nodeId: 'ns=1;s=Station1.stMES.Query.xQryBusy', dataType: 'Boolean', value: false });
      expect(writeCall).toContainEqual({ nodeId: 'ns=1;s=Station1.stMES.Query.xDone', dataType: 'Boolean', value: true });
      expect(writeCall).toContainEqual({ nodeId: 'ns=1;s=Station1.stMES.Query.xError', dataType: 'Boolean', value: false });
    });

    it('writes response and Done/Error correctly when rejected', async () => {
      const response: MachineRoutingResponse = {
        orderNo: '',
        partNo: '',
        operationNo: 0,
        stepNo: 0,
        nextResourceId: 0,
        iPar1: 0,
        iPar2: 0,
        iPar3: 0,
        iPar4: 0,
        resultCode: 404,
        accepted: false,
      };

      await adapter.writeRoutingResponse(1, response);
      const writeCall = mockOpcUa.writeNodes.mock.calls[0][0];
      expect(writeCall).toContainEqual({ nodeId: 'ns=1;s=Station1.stMES.Query.xDone', dataType: 'Boolean', value: false });
      expect(writeCall).toContainEqual({ nodeId: 'ns=1;s=Station1.stMES.Query.xError', dataType: 'Boolean', value: true });
    });
  });

  describe('writeInternalError', () => {
    it('writes the error state', async () => {
      await adapter.writeInternalError(1, 500);
      expect(mockOpcUa.writeNodes).toHaveBeenCalledTimes(1);
      expect(mockOpcUa.writeNodes).toHaveBeenCalledWith([
        { nodeId: 'ns=1;s=Station1.stMES.Query.uiResultCode', dataType: 'UInt16', value: 500 },
        { nodeId: 'ns=1;s=Station1.stMES.Query.xQryBusy', dataType: 'Boolean', value: false },
        { nodeId: 'ns=1;s=Station1.stMES.Query.xDone', dataType: 'Boolean', value: false },
        { nodeId: 'ns=1;s=Station1.stMES.Query.xError', dataType: 'Boolean', value: true },
      ]);
    });
  });

  describe('acknowledgeRequest', () => {
    it('resets the three handshake bits', async () => {
      await adapter.acknowledgeRequest(1);
      expect(mockOpcUa.writeNodes).toHaveBeenCalledTimes(1);
      expect(mockOpcUa.writeNodes).toHaveBeenCalledWith([
        { nodeId: 'ns=1;s=Station1.stMES.Query.xQryBusy', dataType: 'Boolean', value: false },
        { nodeId: 'ns=1;s=Station1.stMES.Query.xDone', dataType: 'Boolean', value: false },
        { nodeId: 'ns=1;s=Station1.stMES.Query.xError', dataType: 'Boolean', value: false },
      ]);
    });
  });

  describe('readCompletedCarrierNumber', () => {
    it('reads from process data prefix and normalizes', async () => {
      mockOpcUa.readNode.mockResolvedValueOnce(789);
      const carrierNumber = await adapter.readCompletedCarrierNumber(1);
      expect(carrierNumber).toBe(789);
      expect(mockOpcUa.readNode).toHaveBeenCalledWith('ns=1;s=Station1.dbProcessData.iCarrierID');
    });
  });

  describe('readRecoverySnapshot', () => {
    it('normalizes carrier, request active, and process busy', async () => {
      mockOpcUa.readNode
        .mockResolvedValueOnce(55)   // uiCarrierId
        .mockResolvedValueOnce(true) // xStart
        .mockResolvedValueOnce(false); // xBusy

      const snapshot = await adapter.readRecoverySnapshot(1);
      expect(snapshot).toEqual({ carrierNumber: 55, requestActive: true, processBusy: false });
      expect(mockOpcUa.readNode).toHaveBeenCalledTimes(3);
      expect(mockOpcUa.readNode).toHaveBeenCalledWith('ns=1;s=Station1.stMES.Query.uiCarrierId');
      expect(mockOpcUa.readNode).toHaveBeenCalledWith('ns=1;s=Station1.stMES.Query.xStart');
      expect(mockOpcUa.readNode).toHaveBeenCalledWith('ns=1;s=Station1.stMES.State.xBusy');
    });
  });

  describe('publishHandshakeEvent', () => {
    it('delegates to OpcUaService.publishStMesEvent', () => {
      const payload = { resourceId: 1, phase: 'requested' };
      adapter.publishHandshakeEvent(payload);
      expect(mockOpcUa.publishStMesEvent).toHaveBeenCalledWith(payload);
    });
  });

  describe('executeControlCommand', () => {
    it('maps commands to control addresses', async () => {
      await adapter.executeControlCommand(1, 'start');
      expect(mockOpcUa.writeNodes).toHaveBeenCalledWith([
        { nodeId: 'ns=1;s=Station1.stMES.Control.xCmdStart', dataType: 'Boolean', value: true },
      ]);

      await adapter.executeControlCommand(1, 'stop');
      expect(mockOpcUa.writeNodes).toHaveBeenCalledWith([
        { nodeId: 'ns=1;s=Station1.stMES.Control.xCmdStop', dataType: 'Boolean', value: true },
      ]);

      await adapter.executeControlCommand(1, 'reset');
      expect(mockOpcUa.writeNodes).toHaveBeenCalledWith([
        { nodeId: 'ns=1;s=Station1.stMES.Control.xCmdReset', dataType: 'Boolean', value: true },
      ]);

      await adapter.executeControlCommand(1, 'pause');
      expect(mockOpcUa.writeNodes).toHaveBeenCalledWith([
        { nodeId: 'ns=1;s=Station1.stMES.Control.xCmdPause', dataType: 'Boolean', value: true },
      ]);
    });
  });

  describe('executeLegacyControlCommand', () => {
    it('maps start command', async () => {
      await adapter.executeLegacyControlCommand(1, 'start');
      expect(mockOpcUa.writeNodes).toHaveBeenCalledWith([
        { nodeId: 'ns=1;s=Station1.stMES.Query.xStart', dataType: 'Boolean', value: true },
      ]);
    });

    it('maps stop command', async () => {
      await adapter.executeLegacyControlCommand(1, 'stop');
      expect(mockOpcUa.writeNodes).toHaveBeenCalledWith([
        { nodeId: 'ns=1;s=Station1.stMES.Query.xQryBusy', dataType: 'Boolean', value: false },
        { nodeId: 'ns=1;s=Station1.stMES.Query.xDone', dataType: 'Boolean', value: false },
        { nodeId: 'ns=1;s=Station1.stMES.Query.xError', dataType: 'Boolean', value: false },
      ]);
    });

    it('maps reset command', async () => {
      await adapter.executeLegacyControlCommand(1, 'reset');
      expect(mockOpcUa.writeNodes).toHaveBeenCalledWith([
        { nodeId: 'ns=1;s=Station1.stMES.Query.xStart', dataType: 'Boolean', value: false },
        { nodeId: 'ns=1;s=Station1.stMES.Query.xQryBusy', dataType: 'Boolean', value: false },
        { nodeId: 'ns=1;s=Station1.stMES.Query.xDone', dataType: 'Boolean', value: false },
        { nodeId: 'ns=1;s=Station1.stMES.Query.xError', dataType: 'Boolean', value: false },
      ]);
    });

    it('maps pause command', async () => {
      await adapter.executeLegacyControlCommand(1, 'pause');
      expect(mockOpcUa.writeNodes).toHaveBeenCalledWith([
        { nodeId: 'ns=1;s=Station1.stMES.Query.xQryBusy', dataType: 'Boolean', value: true },
      ]);
    });
  });

  describe('readDiagnosticAddress', () => {
    it('delegates to OpcUaService.readNode', async () => {
      mockOpcUa.readNode.mockResolvedValueOnce('test-value');
      const result = await adapter.readDiagnosticAddress('ns=1;s=Test');
      expect(result).toBe('test-value');
      expect(mockOpcUa.readNode).toHaveBeenCalledWith('ns=1;s=Test');
    });
  });

  describe('writeDiagnosticAddresses', () => {
    it('maps address to nodeId and delegates to writeNodes', async () => {
      const writes: readonly MachineAddressWrite[] = [
        { address: 'ns=1;s=Test1', dataType: 'Boolean', value: true },
        { address: 'ns=1;s=Test2', dataType: 'UInt16', value: 123 },
      ];
      await adapter.writeDiagnosticAddresses(writes);
      expect(mockOpcUa.writeNodes).toHaveBeenCalledWith([
        { nodeId: 'ns=1;s=Test1', dataType: 'Boolean', value: true },
        { nodeId: 'ns=1;s=Test2', dataType: 'UInt16', value: 123 },
      ]);
    });
  });
});