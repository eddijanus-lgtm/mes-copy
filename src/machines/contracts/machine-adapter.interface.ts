import {
  MachineId,
  MachineOperatingMode,
  MachineConnectionState,
  MachineStationDescription,
  MachineSnapshot,
  MachineConnectionEvent,
  MachineWorkRequest,
  MachineProcessCompletedEvent,
  MachineEventUnsubscribe,
  MachineWorkResponse,
} from './machine.types';

export interface MachineAdapter {
  readonly machineId: MachineId;
  readonly operatingMode: MachineOperatingMode;

  getConnectionState(): MachineConnectionState;

  getStations(): Promise<readonly MachineStationDescription[]>;

  readSnapshot(): Promise<MachineSnapshot>;

  onConnectionChanged(
    handler: (event: MachineConnectionEvent) => void,
  ): MachineEventUnsubscribe;

  onWorkRequested(
    handler: (
      request: MachineWorkRequest,
    ) => void | Promise<void>,
  ): MachineEventUnsubscribe;

  onProcessCompleted(
    handler: (
      event: MachineProcessCompletedEvent,
    ) => void | Promise<void>,
  ): MachineEventUnsubscribe;

  respondToWorkRequest(
    requestId: string,
    response: MachineWorkResponse,
  ): Promise<void>;
}
