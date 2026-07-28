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
import { OpcUaMachineAdapter } from './opcua-machine.adapter';
import { OpcUaConfiguredSignal, OpcUaService } from './opcua.service';

describe('OpcUaMachineAdapter profile contract', () => {
  let adapter: OpcUaMachineAdapter;
  let opcUa: jest.Mocked<OpcUaService>;
  let profileService: jest.Mocked<MachineProfileService>;
  let signals: Map<string, OpcUaConfiguredSignal>;

  const profile = {
    routingResultCodes: {
      accepted: 10,
      carrier_unknown: 20,
      order_missing: 30,
      wrong_resource: 40,
      already_completed: 50,
      internal_error: 99,
    },
    stations: [
      {
        stationId: 'loading-cell',
        resourceId: 7,
        displayName: 'Loading cell',
        enabled: true,
        routing: { sequence: 1, operationNo: 70, operation: 'Load' },
        signals: [
          { role: 'controlStart' },
          { role: 'controlStop' },
          { role: 'controlReset' },
          { role: 'controlPause' },
        ],
      },
      {
        stationId: 'inspection-cell',
        resourceId: 42,
        displayName: 'Inspection cell',
        enabled: true,
        routing: { sequence: 2, operationNo: 80, operation: 'Inspect' },
        signals: [],
      },
      {
        stationId: 'disabled-cell',
        resourceId: 99,
        displayName: 'Disabled cell',
        enabled: false,
        signals: [],
      },
    ],
    orderParameterDefinitions: [
      {
        key: 'iPar1',
        signalKey: 'parameter1',
        label: 'Colour',
        type: 'number',
      },
      { key: 'iPar2', signalKey: 'parameter2', label: 'Red', type: 'number' },
      { key: 'iPar3', signalKey: 'parameter3', label: 'Green', type: 'number' },
      { key: 'iPar4', signalKey: 'parameter4', label: 'Blue', type: 'number' },
    ],
  } as unknown as MachineProfile;

  function configuredSignal(
    key: string,
    nodeId: string,
    dataType: OpcUaConfiguredSignal['dataType'],
    access: OpcUaConfiguredSignal['access'],
    direction: OpcUaConfiguredSignal['direction'],
    role: OpcUaConfiguredSignal['role'] = 'custom',
  ): OpcUaConfiguredSignal {
    return {
      resourceId: 7,
      key,
      role,
      nodeId,
      dataType,
      access,
      direction,
      required: true,
    };
  }

  beforeEach(() => {
    signals = new Map<string, OpcUaConfiguredSignal>();
    const readSignals = [
      ['carrierId', 'ns=4;s=LineA.Input.Carrier', 'UInt32', 'carrierId'],
      ['resourceId', 'ns=4;s=LineA.Input.Resource', 'UInt16', 'resourceId'],
      ['workRequest', 'ns=4;s=LineA.Input.Request', 'Boolean', 'workRequest'],
      [
        'processActive',
        'ns=4;s=LineA.State.Active',
        'Boolean',
        'processActive',
      ],
      [
        'carrierIdProcess',
        'ns=4;s=LineA.Process.Carrier',
        'UInt32',
        'completedCarrierId',
      ],
    ] as const;
    for (const [key, nodeId, dataType, role] of readSignals) {
      signals.set(
        key,
        configuredSignal(key, nodeId, dataType, 'read', 'machineToMes', role),
      );
    }

    const writeSignals = [
      ['requestBusy', 'ns=4;s=LineA.Output.Busy', 'Boolean', 'requestBusy'],
      [
        'requestAccepted',
        'ns=4;s=LineA.Output.Accepted',
        'Boolean',
        'requestAccepted',
      ],
      [
        'requestRejected',
        'ns=4;s=LineA.Output.Rejected',
        'Boolean',
        'requestRejected',
      ],
      ['orderId', 'ns=4;s=LineA.Output.Order', 'String', 'orderId'],
      ['partNumber', 'ns=4;s=LineA.Output.Part', 'String', 'partNumber'],
      ['operationId', 'ns=4;s=LineA.Output.Operation', 'UInt16', 'operationId'],
      ['stepNumber', 'ns=4;s=LineA.Output.Step', 'UInt16', 'stepNumber'],
      ['nextStationId', 'ns=4;s=LineA.Output.Next', 'UInt16', 'nextStationId'],
      [
        'parameter1',
        'ns=4;s=LineA.Output.Parameter.A',
        'UInt16',
        'routingParameter',
      ],
      [
        'parameter2',
        'ns=4;s=LineA.Output.Parameter.B',
        'UInt16',
        'routingParameter',
      ],
      [
        'parameter3',
        'ns=4;s=LineA.Output.Parameter.C',
        'UInt16',
        'routingParameter',
      ],
      [
        'parameter4',
        'ns=4;s=LineA.Output.Parameter.D',
        'UInt16',
        'routingParameter',
      ],
      [
        'processResult',
        'ns=4;s=LineA.Output.Result',
        'UInt16',
        'processResult',
      ],
      ['cmdStart', 'ns=4;s=LineA.Commands.Run', 'Boolean', 'controlStart'],
      ['cmdStop', 'ns=4;s=LineA.Commands.Stop', 'Boolean', 'controlStop'],
      ['cmdReset', 'ns=4;s=LineA.Commands.Reset', 'Boolean', 'controlReset'],
      ['cmdPause', 'ns=4;s=LineA.Commands.Pause', 'Boolean', 'controlPause'],
    ] as const;
    for (const [key, nodeId, dataType, role] of writeSignals) {
      signals.set(
        key,
        configuredSignal(key, nodeId, dataType, 'write', 'mesToMachine', role),
      );
    }

    opcUa = {
      isConnected: jest.fn().mockReturnValue(true),
      getServerStatus: jest
        .fn()
        .mockResolvedValue({ connected: true, endpoint: 'opc.tcp://machine' }),
      onTelemetry: jest.fn().mockReturnValue(() => undefined),
      onStMesRequest: jest.fn().mockReturnValue(() => undefined),
      onProcessCompleted: jest.fn().mockReturnValue(() => undefined),
      onCarrierInventoryChanged: jest.fn().mockReturnValue(() => undefined),
      onConnected: jest.fn().mockReturnValue(() => undefined),
      onDisconnected: jest.fn().mockReturnValue(() => undefined),
      readNode: jest.fn(),
      writeNodes: jest.fn().mockResolvedValue(undefined),
      publishStMesEvent: jest.fn(),
      getConfiguredSignal: jest.fn((resourceId: number, key: string) => {
        if (resourceId !== 7 || !signals.has(key)) {
          throw new Error(`Signal ${key} is not configured`);
        }
        return signals.get(key)!;
      }),
      getConfiguredSignalByRole: jest.fn((resourceId: number, role: string) => {
        const match = [...signals.values()].find(
          (signal) => signal.role === role,
        );
        if (resourceId !== 7 || !match) {
          throw new Error(`Signal role ${role} is not configured`);
        }
        return match;
      }),
    } as unknown as jest.Mocked<OpcUaService>;
    profileService = {
      getProfile: jest.fn().mockReturnValue(profile),
    } as unknown as jest.Mocked<MachineProfileService>;
    adapter = new OpcUaMachineAdapter(opcUa, profileService);
  });

  it('reads a station request only from arbitrary nodes configured in the profile', async () => {
    opcUa.readNode.mockResolvedValueOnce(321).mockResolvedValueOnce(7);

    await expect(adapter.readStationRequest(7)).resolves.toEqual({
      carrierNumber: 321,
      requestedResourceId: 7,
    });
    expect(opcUa.readNode).toHaveBeenNthCalledWith(
      1,
      7,
      'ns=4;s=LineA.Input.Carrier',
    );
    expect(opcUa.readNode).toHaveBeenNthCalledWith(
      2,
      7,
      'ns=4;s=LineA.Input.Resource',
    );
  });

  it('maps semantic routing outcomes through the machine profile', () => {
    expect(adapter.routingResultCode('accepted')).toBe(10);
    expect(adapter.routingResultCode('internal_error')).toBe(99);
  });

  it('writes every routing value to its own configured profile signal', async () => {
    await adapter.writeRoutingResponse(7, {
      orderNo: 'ORD-15',
      partNo: 'PART-A',
      operationNo: 30,
      stepNo: 2,
      nextResourceId: 42,
      parameters: { iPar1: 11, iPar2: 22, iPar3: 33, iPar4: 44 },
      resultCode: 0,
      accepted: true,
    });

    const writes = opcUa.writeNodes.mock.calls[0][0];
    expect(writes).toEqual(
      expect.arrayContaining([
        {
          resourceId: 7,
          nodeId: 'ns=4;s=LineA.Output.Parameter.A',
          dataType: 'UInt16',
          value: 11,
        },
        {
          resourceId: 7,
          nodeId: 'ns=4;s=LineA.Output.Parameter.B',
          dataType: 'UInt16',
          value: 22,
        },
        {
          resourceId: 7,
          nodeId: 'ns=4;s=LineA.Output.Parameter.C',
          dataType: 'UInt16',
          value: 33,
        },
        {
          resourceId: 7,
          nodeId: 'ns=4;s=LineA.Output.Parameter.D',
          dataType: 'UInt16',
          value: 44,
        },
        {
          resourceId: 7,
          nodeId: 'ns=4;s=LineA.Output.Accepted',
          dataType: 'Boolean',
          value: true,
        },
      ]),
    );
  });

  it('does not invent zero for a missing routing parameter', async () => {
    await expect(
      adapter.writeRoutingResponse(7, {
        orderNo: 'ORD-16',
        partNo: 'PART-B',
        operationNo: 30,
        stepNo: 2,
        nextResourceId: 42,
        parameters: { iPar1: 11, iPar2: 22, iPar3: 33 },
        resultCode: 0,
        accepted: true,
      }),
    ).rejects.toThrow(
      'Routing parameter iPar4 has neither an order value nor a configured default_value',
    );
    expect(opcUa.writeNodes).not.toHaveBeenCalled();
  });

  it('writes station-scoped routing parameters only to their target resource', async () => {
    profileService.getProfile.mockReturnValue({
      ...profile,
      orderParameterDefinitions: profile.orderParameterDefinitions!.map(
        (definition) =>
          definition.key === 'iPar4'
            ? { ...definition, targetResourceIds: [42] }
            : definition,
      ),
    });

    await adapter.writeRoutingResponse(7, {
      orderNo: 'ORD-17',
      partNo: 'PART-C',
      operationNo: 70,
      stepNo: 1,
      nextResourceId: 42,
      parameters: { iPar1: 11, iPar2: 22, iPar3: 33 },
      resultCode: 10,
      accepted: true,
    });

    const writes = opcUa.writeNodes.mock.calls[0][0];
    expect(writes).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          nodeId: 'ns=4;s=LineA.Output.Parameter.D',
        }),
      ]),
    );
  });

  it('writes no invented order payload for a rejected routing request', async () => {
    await adapter.writeRoutingResponse(7, {
      resultCode: 40,
      accepted: false,
    });

    const writes = opcUa.writeNodes.mock.calls[0][0];
    expect(writes).toEqual([
      {
        resourceId: 7,
        nodeId: 'ns=4;s=LineA.Output.Result',
        dataType: 'UInt16',
        value: 40,
      },
      {
        resourceId: 7,
        nodeId: 'ns=4;s=LineA.Output.Busy',
        dataType: 'Boolean',
        value: false,
      },
      {
        resourceId: 7,
        nodeId: 'ns=4;s=LineA.Output.Accepted',
        dataType: 'Boolean',
        value: false,
      },
      {
        resourceId: 7,
        nodeId: 'ns=4;s=LineA.Output.Rejected',
        dataType: 'Boolean',
        value: true,
      },
    ]);
  });

  it('does not invent a fallback address when a profile signal is missing', async () => {
    signals.delete('resourceId');
    opcUa.readNode.mockResolvedValue(1);

    await expect(adapter.readStationRequest(7)).rejects.toThrow(
      'Signal role resourceId is not configured',
    );
    expect(opcUa.readNode).toHaveBeenCalledTimes(1);
  });

  it('reads recovery and completion signals through the profile', async () => {
    opcUa.readNode
      .mockResolvedValueOnce(501)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    await expect(adapter.readRecoverySnapshot(7)).resolves.toEqual({
      carrierNumber: 501,
      requestActive: true,
      processBusy: false,
    });

    opcUa.readNode.mockResolvedValueOnce(501);
    await expect(adapter.readCompletedCarrierNumber(7)).resolves.toBe(501);
    expect(opcUa.readNode).toHaveBeenLastCalledWith(
      7,
      'ns=4;s=LineA.Process.Carrier',
    );
  });

  it('reads a complete carrier inventory from primitive profile signals', async () => {
    const inventorySignals = [
      ['inventoryValid', 'ns=4;s=Inventory.Valid', 'Boolean', 'inventoryValid'],
      [
        'inventoryRevision',
        'ns=4;s=Inventory.Revision',
        'UInt32',
        'inventoryRevision',
      ],
      [
        'inventoryCapacity',
        'ns=4;s=Inventory.Capacity',
        'UInt16',
        'inventoryCapacity',
      ],
      [
        'availableCount',
        'ns=4;s=Inventory.Available',
        'UInt16',
        'availableCarrierCount',
      ],
      ['totalCount', 'ns=4;s=Inventory.Total', 'UInt16', 'totalCarrierCount'],
      [
        'slot1Present',
        'ns=4;s=Inventory.Slot1.Present',
        'Boolean',
        'slotOccupied',
      ],
      ['slot1Carrier', 'ns=4;s=Inventory.Slot1.Carrier', 'UInt32', 'carrierId'],
      ['slot1Rfid', 'ns=4;s=Inventory.Slot1.Rfid', 'String', 'rfidUid'],
      [
        'slot1RfidValid',
        'ns=4;s=Inventory.Slot1.RfidValid',
        'Boolean',
        'rfidReadValid',
      ],
      [
        'slot1State',
        'ns=4;s=Inventory.Slot1.State',
        'String',
        'carrierPhysicalState',
      ],
      [
        'slot1Reader',
        'ns=4;s=Inventory.Slot1.Reader',
        'String',
        'carrierReaderId',
      ],
      [
        'slot1LastSeen',
        'ns=4;s=Inventory.Slot1.LastSeen',
        'DateTime',
        'carrierLastSeen',
      ],
    ] as const;
    for (const [key, nodeId, dataType, role] of inventorySignals) {
      signals.set(
        key,
        configuredSignal(key, nodeId, dataType, 'read', 'machineToMes', role),
      );
    }
    profileService.getProfile.mockReturnValue({
      ...profile,
      stations: [
        {
          stationId: 'carrier-store',
          resourceId: 7,
          resourceType: 'storage',
          capabilities: ['inventory', 'storage'],
          displayName: 'Carrier store',
          enabled: true,
          signals: [],
          inventory: {
            validSignalKey: 'inventoryValid',
            revisionSignalKey: 'inventoryRevision',
            capacitySignalKey: 'inventoryCapacity',
            availableCountSignalKey: 'availableCount',
            totalCountSignalKey: 'totalCount',
            slots: [
              {
                slotId: 'PALLET-01',
                presentSignalKey: 'slot1Present',
                carrierIdSignalKey: 'slot1Carrier',
                rfidUidSignalKey: 'slot1Rfid',
                rfidReadValidSignalKey: 'slot1RfidValid',
                physicalStateSignalKey: 'slot1State',
                readerIdSignalKey: 'slot1Reader',
                lastSeenSignalKey: 'slot1LastSeen',
              },
            ],
          },
        },
      ],
    });
    const values: Record<string, unknown> = {
      'ns=4;s=Inventory.Valid': true,
      'ns=4;s=Inventory.Revision': 18,
      'ns=4;s=Inventory.Capacity': 4,
      'ns=4;s=Inventory.Available': 1,
      'ns=4;s=Inventory.Total': 1,
      'ns=4;s=Inventory.Slot1.Present': true,
      'ns=4;s=Inventory.Slot1.Carrier': 128,
      'ns=4;s=Inventory.Slot1.Rfid': 'E200-128',
      'ns=4;s=Inventory.Slot1.RfidValid': true,
      'ns=4;s=Inventory.Slot1.State': 'stored',
      'ns=4;s=Inventory.Slot1.Reader': 'RF210R-1',
      'ns=4;s=Inventory.Slot1.LastSeen': new Date('2026-07-26T12:00:00Z'),
    };
    opcUa.readNode.mockImplementation(
      async (_resourceId: number, nodeId: string) => values[nodeId],
    );

    await expect(adapter.readCarrierInventory(7)).resolves.toEqual({
      resourceId: 7,
      stationId: 'carrier-store',
      valid: true,
      revision: 18,
      capacity: 4,
      availableCount: 1,
      totalCount: 1,
      observations: [
        {
          resourceId: 7,
          stationId: 'carrier-store',
          slotId: 'PALLET-01',
          present: true,
          carrierNumber: 128,
          rfidUid: 'E200-128',
          rfidReadValid: true,
          physicalState: 'stored',
          readerId: 'RF210R-1',
          lastSeenAt: new Date('2026-07-26T12:00:00Z'),
        },
      ],
    });

    values['ns=4;s=Inventory.Available'] = 0;
    values['ns=4;s=Inventory.Total'] = 0;
    values['ns=4;s=Inventory.Slot1.Present'] = false;
    values['ns=4;s=Inventory.Slot1.Carrier'] = 0;

    const emptySnapshot = await adapter.readCarrierInventory(7);
    expect(emptySnapshot.observations[0]).toEqual({
      resourceId: 7,
      stationId: 'carrier-store',
      slotId: 'PALLET-01',
      present: false,
    });
  });

  it('uses the configured command node and datatype', async () => {
    await adapter.executeControlCommand(7, 'start');

    expect(opcUa.writeNodes).toHaveBeenCalledWith([
      {
        resourceId: 7,
        nodeId: 'ns=4;s=LineA.Commands.Run',
        dataType: 'Boolean',
        value: true,
      },
    ]);
  });

  it('returns all enabled profile stations without assuming their count or IDs', () => {
    expect(adapter.getStations()).toEqual([
      {
        resourceId: 7,
        stationId: 'loading-cell',
        displayName: 'Loading cell',
        enabled: true,
        routeSequence: 1,
        operationNo: 70,
        operation: 'Load',
        availableCommands: ['start', 'stop', 'reset', 'pause'],
      },
      {
        resourceId: 42,
        stationId: 'inspection-cell',
        displayName: 'Inspection cell',
        enabled: true,
        routeSequence: 2,
        operationNo: 80,
        operation: 'Inspect',
        availableCommands: [],
      },
    ]);
  });

  it('describes a product-routed station without a legacy route sequence', () => {
    profileService.getProfile.mockReturnValue({
      ...profile,
      stations: [
        {
          stationId: 'press-cell',
          resourceId: 30,
          displayName: 'Press 01',
          enabled: true,
          capabilities: ['production', 'routing'],
          signals: [],
        },
      ],
    });

    expect(adapter.getStations()).toEqual([
      {
        resourceId: 30,
        stationId: 'press-cell',
        displayName: 'Press 01',
        enabled: true,
        routeSequence: undefined,
        operationNo: 30,
        operation: 'Press 01',
        capabilities: ['production', 'routing'],
        availableCommands: [],
      },
    ]);
  });

  it('rejects an enabled station without a valid resource id', () => {
    profileService.getProfile.mockReturnValue({
      ...profile,
      stations: [
        {
          ...profile.stations[0],
          resourceId: 0,
        },
      ],
    });

    expect(() => adapter.getStations()).toThrow(
      'requires a positive integer resourceId',
    );
  });

  it('delegates connection state, callbacks and telemetry publication', async () => {
    const telemetryCallback = jest.fn();
    const workCallback = jest.fn();
    const completionCallback = jest.fn();
    const payload = { resourceId: 7, phase: 'accepted' };

    expect(adapter.isConnected()).toBe(true);
    await expect(adapter.getConnectionStatus()).resolves.toEqual({
      connected: true,
      endpoint: 'opc.tcp://machine',
    });
    adapter.onTelemetry(telemetryCallback);
    adapter.onWorkRequest(workCallback);
    adapter.onProcessCompleted(completionCallback);
    adapter.publishHandshakeEvent(payload);

    expect(opcUa.onTelemetry).toHaveBeenCalledWith(telemetryCallback);
    expect(opcUa.onStMesRequest).toHaveBeenCalledWith(workCallback);
    expect(opcUa.onProcessCompleted).toHaveBeenCalledWith(completionCallback);
    expect(opcUa.publishStMesEvent).toHaveBeenCalledWith(payload);
  });
});
