import { ShopfloorTelemetryEvent } from '../../opcua/shopfloor-telemetry';

export type MachineControlCommand =
  | 'start'
  | 'stop'
  | 'reset'
  | 'pause';

export interface MachineConnectionStatus {
  readonly connected: boolean;
  readonly endpoint: string;
}

export interface MachineStationRequest {
  readonly carrierNumber: number;
  readonly requestedResourceId: number;
}

export interface MachineRoutingResponse {
  readonly orderNo: string;
  readonly partNo: string;
  readonly operationNo: number;
  readonly stepNo: number;
  readonly nextResourceId: number;
  readonly iPar1: number;
  readonly iPar2: number;
  readonly iPar3: number;
  readonly iPar4: number;
  readonly resultCode: number;
  readonly accepted: boolean;
}

export interface MachineRecoverySnapshot {
  readonly carrierNumber: number;
  readonly requestActive: boolean;
  readonly processBusy: boolean;
}

export interface MachineAddressWrite {
  readonly address: string;
  readonly dataType: string;
  readonly value: unknown;
}

export interface MachineStationDescriptor {
  readonly resourceId: number;
  readonly stationId: string;
  readonly displayName: string;
  readonly enabled: boolean;
}

export interface MachineOrderParameterDefinition {
  readonly key: string;
  readonly label: string;
  readonly type: 'number' | 'select';
  readonly default_value?: number;
  readonly min_value?: number;
  readonly max_value?: number;
  readonly unit?: string;
  readonly available_quantity?: number;
  readonly options?: readonly {
    readonly label: string;
    readonly value: number;
    readonly available_quantity?: number;
  }[];
}

export interface MachineAdapter {
  isConnected(): boolean;
  getConnectionStatus(): Promise<MachineConnectionStatus>;

  onTelemetry(
    callback: (event: ShopfloorTelemetryEvent) => void,
  ): () => void;

  onWorkRequest(
    callback: (resourceId: number, active: boolean) => void,
  ): () => void;

  onProcessCompleted(
    callback: (resourceId: number, timestamp: Date) => void,
  ): () => void;

  onConnected(callback: () => void): () => void;
  onDisconnected(callback: (reason: string) => void): () => void;

  readStationRequest(resourceId: number): Promise<MachineStationRequest>;
  markRequestBusy(resourceId: number): Promise<void>;

  writeRoutingResponse(
    resourceId: number,
    response: MachineRoutingResponse,
  ): Promise<void>;

  writeInternalError(
    resourceId: number,
    resultCode: number,
  ): Promise<void>;

  acknowledgeRequest(resourceId: number): Promise<void>;

  readCompletedCarrierNumber(resourceId: number): Promise<number>;

  readRecoverySnapshot(
    resourceId: number,
  ): Promise<MachineRecoverySnapshot>;

  publishHandshakeEvent(
    payload: Readonly<Record<string, unknown>>,
  ): void;

  executeControlCommand(
    resourceId: number,
    command: MachineControlCommand,
  ): Promise<void>;

  executeLegacyControlCommand(
    resourceId: number,
    command: MachineControlCommand,
  ): Promise<void>;

  readDiagnosticAddress(address: string): Promise<unknown>;

  writeDiagnosticAddresses(
    writes: readonly MachineAddressWrite[],
  ): Promise<void>;

  getStations(): readonly MachineStationDescriptor[];
  getOrderParameterDefinitions(): readonly MachineOrderParameterDefinition[];
}
