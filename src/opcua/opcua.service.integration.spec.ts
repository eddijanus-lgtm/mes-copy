import { BadGatewayException, ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

jest.mock('node-opcua', () => ({
  AttributeIds: { Value: 13 },
  DataType: { Boolean: 'Boolean', String: 'String', Int16: 'Int16', UInt16: 'UInt16', UInt32: 'UInt32' },
  Variant: class Variant {
    constructor(public readonly value: unknown) {}
  },
  resolveNodeId: jest.fn((nodeId: string) => nodeId),
}));

import { OpcUaService } from './opcua.service';

describe('OpcUaService integration contract', () => {
  let service: OpcUaService;
  const config = { get: jest.fn((key: string, fallback?: string) => (key === 'OPC_UA_ALLOWED_NODE_PREFIXES' ? 'ns=1;s=Station' : fallback)) };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new OpcUaService(config as unknown as ConfigService);
  });

  it('blocks reads outside configured node prefixes', async () => {
    await expect(service.readNode('ns=2;s=Other.Secret')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('reports unavailable when reading without a connected session', async () => {
    await expect(service.readNode('ns=1;s=Station1.stMES.Query.uiCarrierId')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('reads values from an injected OPC UA session', async () => {
    (service as any).connected = true;
    (service as any).session = { readVariableValue: jest.fn(async () => ({ value: { value: 128 } })) };

    await expect(service.readNode('ns=1;s=Station1.stMES.Query.uiCarrierId')).resolves.toBe(128);
  });

  it('wraps OPC UA read failures as bad gateway errors', async () => {
    (service as any).connected = true;
    (service as any).session = { readVariableValue: jest.fn(async () => { throw new Error('mock read failed'); }) };

    await expect(service.readNode('ns=1;s=Station1.stMES.Query.uiCarrierId')).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('writes validated control nodes to the active session', async () => {
    const write = jest.fn(async () => [{ isGood: () => true }]);
    (service as any).connected = true;
    (service as any).session = { write };

    await service.writeNodes([{ nodeId: 'ns=1;s=Station1.stMES.Control.xCmdStart', dataType: 'Boolean', value: true }]);

    expect(write).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ nodeId: 'ns=1;s=Station1.stMES.Control.xCmdStart' })]));
  });
});
