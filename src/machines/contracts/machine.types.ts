export type MachineId = string;
export type StationId = string;
export type CarrierId = string;

export type MachineOperatingMode =
  | 'observe'
  | 'validate'
  | 'control';

export type MachineConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'degraded';

export type StationOperatingState =
  | 'unknown'
  | 'idle'
  | 'requesting'
  | 'processing'
  | 'paused'
  | 'stopped'
  | 'faulted';

export type MachineParameterValue =
  | string
  | number
  | boolean
  | null;

export type MachineParameters =
  Readonly<Record<string, MachineParameterValue>>;

export type MachineEventUnsubscribe = () => void;

export type MachineWorkAcceptance = 'accepted' | 'rejected';

export type MachineProcessOutcome = 'success' | 'failure';

export interface MachineDescription {
  readonly machineId: MachineId;
  readonly displayName: string;
  readonly operatingMode: MachineOperatingMode;
}

export interface MachineStationDescription {
  readonly stationId: StationId;
  readonly machineId: MachineId;
  readonly displayName: string;
  readonly description?: string;
}

export interface MachineStationState {
  readonly stationId: StationId;
  readonly operatingState: StationOperatingState;
  readonly carrierId?: CarrierId;
  readonly timestamp: Date;
  readonly stateData?: MachineParameters;
}

export interface MachineSnapshot {
  readonly machineId: MachineId;
  readonly connectionState: MachineConnectionState;
  readonly timestamp: Date;
  readonly stationStates: readonly MachineStationState[];
}

export interface MachineWorkRequest {
  readonly requestId: string;
  readonly machineId: MachineId;
  readonly stationId: StationId;
  readonly carrierId: CarrierId;
  readonly timestamp: Date;
  readonly parameters: MachineParameters;
}

export interface MachineWorkResponse {
  readonly requestId: string;
  readonly machineId: MachineId;
  readonly stationId: StationId;
  readonly acceptance: MachineWorkAcceptance;
  readonly orderNumber?: string;
  readonly partNumber?: string;
  readonly operationId?: string;
  readonly stepNumber?: number;
  readonly nextStationId?: StationId;
  readonly parameters?: MachineParameters;
  readonly resultCode?: string;
  readonly errorMessage?: string;
}

export interface MachineProcessCompletedEvent {
  readonly machineId: MachineId;
  readonly stationId: StationId;
  readonly carrierId: CarrierId;
  readonly timestamp: Date;
  readonly outcome: MachineProcessOutcome;
  readonly resultData?: MachineParameters;
}

export interface MachineConnectionEvent {
  readonly machineId: MachineId;
  readonly previousState: MachineConnectionState;
  readonly newState: MachineConnectionState;
  readonly timestamp: Date;
  readonly reason?: string;
}
