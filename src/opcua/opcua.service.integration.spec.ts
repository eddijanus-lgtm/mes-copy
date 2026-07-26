import {
  BadGatewayException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

jest.mock('node-opcua', () => ({
  AttributeIds: { Value: 13 },
  DataType: {
    Boolean: 'Boolean',
    String: 'String',
    UInt16: 'UInt16',
    UInt32: 'UInt32',
  },
  Variant: class Variant {
    constructor(public readonly value: unknown) {}
  },
  resolveNodeId: jest.fn((nodeId: string) => nodeId),
}));

import { MachineProfileService } from '../machines/profiles/machine-profile.service';
import type { MachineProfile } from '../machines/profiles/machine-profile.types';
import { OpcUaService } from './opcua.service';

describe('OpcUaService profile-driven node contract', () => {
  let service: OpcUaService;
  const configuredNode = 'ns=4;s=Factory.Cell-X.Input.Carrier';
  const profile = {
    profileVersion: '1',
    machineId: 'factory-line',
    displayName: 'Factory line',
    transport: 'opcua',
    operatingMode: 'control',
    connection: {
      endpointUrl: 'opc.tcp://machine:4840',
      applicationName: 'MES',
      security: { mode: 'None', policy: 'None' },
      authentication: { type: 'anonymous' },
      connectionTimeoutMs: 1000,
      sessionTimeoutMs: 1000,
      reconnect: {
        enabled: true,
        initialDelayMs: 100,
        maximumDelayMs: 1000,
        backoffMultiplier: 2,
      },
    },
    namespaces: [{ key: 'factory', uri: 'urn:factory' }],
    stations: [
      {
        stationId: 'cell-x',
        resourceId: 17,
        displayName: 'Cell X',
        enabled: true,
        metadata: { resourceId: '17' },
        signals: [
          {
            key: 'carrierId',
            role: 'carrierId',
            direction: 'machineToMes',
            namespace: 'factory',
            identifier: configuredNode,
            dataType: 'UInt32',
            access: 'read',
            required: true,
          },
          {
            key: 'cmdStart',
            role: 'custom',
            direction: 'mesToMachine',
            namespace: 'factory',
            identifier: 'ns=4;s=Factory.Cell-X.Commands.Run',
            dataType: 'Boolean',
            access: 'write',
            required: true,
          },
        ],
      },
    ],
  } as MachineProfile;
  const config = { get: jest.fn((_key: string) => undefined) };
  const profileService = { getProfile: jest.fn(() => profile) };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new OpcUaService(
      config as unknown as ConfigService,
      profileService as unknown as MachineProfileService,
    );
    (service as any).profile = profile;
    (service as any).stations = (service as any).buildConfiguredStations(
      profile,
    );
  });

  it('blocks a plausible station node that is absent from the profile', async () => {
    await expect(
      service.readNode('ns=1;s=Station1.stMES.Query.uiCarrierId'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('reports unavailable when reading a configured node without a session', async () => {
    await expect(service.readNode(configuredNode)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('reads an arbitrary configured profile node from the active session', async () => {
    (service as any).connected = true;
    (service as any).session = {
      readVariableValue: jest.fn(async () => ({ value: { value: 128 } })),
    };

    await expect(service.readNode(configuredNode)).resolves.toBe(128);
  });

  it('wraps OPC UA failures for a configured profile node', async () => {
    (service as any).connected = true;
    (service as any).session = {
      readVariableValue: jest.fn(async () => {
        throw new Error('read failed');
      }),
    };

    await expect(service.readNode(configuredNode)).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });

  it('writes only the configured command node', async () => {
    const write = jest.fn(async () => [{ isGood: () => true }]);
    (service as any).connected = true;
    (service as any).session = { write };

    await service.writeNodes([
      {
        nodeId: 'ns=4;s=Factory.Cell-X.Commands.Run',
        dataType: 'Boolean',
        value: true,
      },
    ]);

    expect(write).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          nodeId: 'ns=4;s=Factory.Cell-X.Commands.Run',
        }),
      ]),
    );
  });

  it('derives station IDs and signals solely from the profile', () => {
    expect(service.getConfiguredSignal(17, 'carrierId')).toEqual(expect.objectContaining({
      key: 'carrierId',
      role: 'carrierId',
      nodeId: configuredNode,
      dataType: 'UInt32',
      access: 'read',
      direction: 'machineToMes',
    }));
    expect(() => service.getConfiguredSignal(1, 'carrierId')).toThrow(
      'No enabled profile station for resource 1',
    );
  });

  it('resolves namespace URIs instead of assuming a namespace index', () => {
    const uriProfile = {
      ...profile,
      stations: [
        {
          ...profile.stations[0],
          signals: [
            {
              ...profile.stations[0].signals[0],
              identifier: 'Factory.Cell-X.Input.Carrier',
            },
          ],
        },
      ],
    };
    const stations = (service as any).buildConfiguredStations(
      uriProfile,
      new Map([['urn:factory', 9]]),
    );

    expect(stations[0].signals.get('carrierId').nodeId).toBe(
      'ns=9;s=Factory.Cell-X.Input.Carrier',
    );
  });
});
