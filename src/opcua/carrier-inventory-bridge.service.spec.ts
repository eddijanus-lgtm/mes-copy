import { CarrierInventorySyncService } from '../carriers/carrier-inventory-sync.service';
import type {
  MachineAdapter,
  MachineCarrierInventorySnapshot,
} from '../machines/adapters/machine-adapter.types';
import { CarrierInventoryBridgeService } from './carrier-inventory-bridge.service';

describe('CarrierInventoryBridgeService', () => {
  const snapshot: MachineCarrierInventorySnapshot = {
    resourceId: 100,
    stationId: 'carrier-store',
    valid: true,
    revision: 4,
    capacity: 2,
    availableCount: 1,
    totalCount: 1,
    observations: [
      {
        resourceId: 100,
        stationId: 'carrier-store',
        slotId: 'A1',
        present: true,
        carrierNumber: 128,
        rfidUid: 'RFID-128',
        rfidReadValid: true,
        physicalState: 'stored',
      },
    ],
  };

  function setup(connected = false) {
    let inventoryCallback:
      | ((value: MachineCarrierInventorySnapshot) => void)
      | undefined;
    let connectedCallback: (() => void) | undefined;
    let disconnectedCallback: ((reason: string) => void) | undefined;
    const unsubscribe = jest.fn();
    const machine = {
      isConnected: jest.fn(() => connected),
      onCarrierInventoryChanged: jest.fn((callback) => {
        inventoryCallback = callback;
        return unsubscribe;
      }),
      onConnected: jest.fn((callback) => {
        connectedCallback = callback;
        return unsubscribe;
      }),
      onDisconnected: jest.fn((callback) => {
        disconnectedCallback = callback;
        return unsubscribe;
      }),
      getStations: jest.fn(() => [
        {
          resourceId: 1,
          stationId: 'assembly',
          displayName: 'Assembly',
          enabled: true,
          resourceType: 'production',
          capabilities: ['production'],
          availableCommands: [],
        },
        {
          resourceId: 100,
          stationId: 'carrier-store',
          displayName: 'Carrier store',
          enabled: true,
          resourceType: 'inventory',
          capabilities: ['inventory'],
          availableCommands: [],
        },
      ]),
      readCarrierInventory: jest.fn(async () => snapshot),
    } as unknown as jest.Mocked<MachineAdapter>;
    const inventory = {
      synchronize: jest.fn(async () => ({
        source: 'carrier-store:100',
        revision: '4',
        applied: true,
        discovered: 1,
        updated: 0,
        staleMarked: 0,
        unidentified: 0,
        countMismatch: false,
      })),
      markStale: jest.fn(async () => 1),
    } as unknown as jest.Mocked<CarrierInventorySyncService>;
    const service = new CarrierInventoryBridgeService(machine, inventory);
    return {
      service,
      machine,
      inventory,
      unsubscribe,
      inventoryEvent: () => inventoryCallback,
      connectedEvent: () => connectedCallback,
      disconnectedEvent: () => disconnectedCallback,
    };
  }

  it('synchronizes inventory snapshots emitted by the adapter', async () => {
    const context = setup();
    context.service.onModuleInit();

    context.inventoryEvent()?.(snapshot);
    await new Promise((resolve) => setImmediate(resolve));

    expect(context.inventory.synchronize).toHaveBeenCalledWith(snapshot);
  });

  it('reads a full snapshot from inventory-capable resources on connect', async () => {
    const context = setup();
    context.service.onModuleInit();

    context.connectedEvent()?.();
    await new Promise((resolve) => setImmediate(resolve));

    expect(context.machine.readCarrierInventory).toHaveBeenCalledTimes(1);
    expect(context.machine.readCarrierInventory).toHaveBeenCalledWith(100);
    expect(context.inventory.synchronize).toHaveBeenCalledWith(snapshot);
  });

  it('marks machine-managed inventory stale on disconnect', async () => {
    const context = setup();
    context.service.onModuleInit();

    context.disconnectedEvent()?.('network lost');
    await new Promise((resolve) => setImmediate(resolve));

    expect(context.inventory.markStale).toHaveBeenCalled();
  });

  it('unsubscribes all adapter listeners on shutdown', () => {
    const context = setup();
    context.service.onModuleInit();

    context.service.onModuleDestroy();

    expect(context.unsubscribe).toHaveBeenCalledTimes(3);
  });
});
