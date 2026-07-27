import { ShopfloorTelemetryEvent } from '../../opcua/shopfloor-telemetry';
import type { RoutingOutcome } from '../../orders/routing-outcome';

export type MachineControlCommand =
  | 'start'
  | 'stop'
  | 'reset'
  | 'pause';

export interface MachineConnectionStatus {
  readonly connected: boolean;
  readonly endpoint: string;
  readonly machineId?: string;
  readonly displayName?: string;
  readonly operatingMode?: 'observe' | 'validate' | 'control';
  readonly resultCodes?: Readonly<Record<string, string>>;
}

export interface MachineStationRequest {
  readonly carrierNumber: number;
  readonly requestedResourceId: number;
}

export interface MachineAcceptedRoutingResponse {
  readonly orderNo: string;
  readonly partNo: string;
  readonly operationNo: number;
  readonly stepNo: number;
  readonly nextResourceId: number;
  readonly parameters: Readonly<Record<string, number>>;
  readonly resultCode: number;
  readonly accepted: true;
}

export interface MachineRejectedRoutingResponse {
  readonly resultCode: number;
  readonly accepted: false;
}

export type MachineRoutingResponse =
  | MachineAcceptedRoutingResponse
  | MachineRejectedRoutingResponse;

export interface MachineRecoverySnapshot {
  readonly carrierNumber: number;
  readonly requestActive: boolean;
  readonly processBusy: boolean;
}

export interface MachineCarrierObservation {
  readonly resourceId: number;
  readonly stationId: string;
  readonly slotId: string;
  readonly present: boolean;
  readonly carrierNumber?: number;
  readonly rfidUid?: string;
  readonly rfidReadValid?: boolean;
  readonly physicalState?: string;
  readonly readerId?: string;
  readonly lastSeenAt?: Date;
}

export interface MachineCarrierInventorySnapshot {
  readonly resourceId: number;
  readonly stationId: string;
  readonly valid: boolean;
  readonly revision: number | string;
  readonly capacity?: number;
  readonly availableCount: number;
  readonly totalCount: number;
  readonly observations: readonly MachineCarrierObservation[];
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
  readonly routeSequence?: number;
  readonly operationNo?: number;
  readonly operation?: string;
  readonly resourceType: 'production' | 'inventory' | 'storage' | 'hybrid';
  readonly capabilities?: readonly (
    | 'production'
    | 'routing'
    | 'control'
    | 'inventory'
    | 'storage'
    | 'telemetry'
  )[];
  readonly availableCommands: readonly MachineControlCommand[];
}

export interface MachineOrderParameterDefinition {
  readonly key: string;
  readonly sourceKey?: string;
  readonly signalKey?: string;
  readonly targetResourceIds?: readonly number[];
  readonly required?: boolean;
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
  routingResultCode(outcome: RoutingOutcome): number;

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

  onCarrierInventoryChanged?(
    callback: (snapshot: MachineCarrierInventorySnapshot) => void,
  ): () => void;

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

  readCarrierInventory?(
    resourceId: number,
  ): Promise<MachineCarrierInventorySnapshot>;

  publishHandshakeEvent(
    payload: Readonly<Record<string, unknown>>,
  ): void;

  executeControlCommand(
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
