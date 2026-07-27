import type { RoutingOutcome } from '../../orders/routing-outcome';

export type MachineProfileVersion = string;

export type MachineProfileTransport = 'opcua';

export type MachineProfileOperatingMode =
  | 'observe'
  | 'validate'
  | 'control';

export type MachineProfileSecurityMode =
  | 'None'
  | 'Sign'
  | 'SignAndEncrypt';

export type MachineProfileSecurityPolicy =
  | 'None'
  | 'Basic256Sha256'
  | 'Aes128_Sha256_RsaOaep'
  | 'Aes256_Sha256_RsaPss';

export type MachineProfileAuthenticationType =
  | 'anonymous'
  | 'username'
  | 'certificate';

export type MachineProfileDataType =
  | 'Boolean'
  | 'Byte'
  | 'UInt16'
  | 'UInt32'
  | 'Int16'
  | 'Int32'
  | 'Float'
  | 'Double'
  | 'String'
  | 'DateTime';

export type MachineProfileAccessMode =
  | 'read'
  | 'write'
  | 'readWrite';

export type MachineSignalDirection =
  | 'machineToMes'
  | 'mesToMachine';

export type MachineSignalRole =
  | 'workRequest'
  | 'requestBusy'
  | 'requestAccepted'
  | 'requestRejected'
  | 'requestCompleted'
  | 'carrierId'
  | 'resourceId'
  | 'orderId'
  | 'partNumber'
  | 'operationId'
  | 'stepNumber'
  | 'nextStationId'
  | 'processActive'
  | 'processCompleted'
  | 'processResult'
  | 'timestamp'
  | 'completedCarrierId'
  | 'routingParameter'
  | 'controlStart'
  | 'controlStop'
  | 'controlReset'
  | 'controlPause'
  | 'inventoryValid'
  | 'inventoryRevision'
  | 'inventoryCapacity'
  | 'availableCarrierCount'
  | 'totalCarrierCount'
  | 'idealCycleTimeMs'
  | 'goodCount'
  | 'rejectCount'
  | 'slotOccupied'
  | 'slotId'
  | 'rfidUid'
  | 'rfidReadValid'
  | 'carrierPhysicalState'
  | 'carrierReaderId'
  | 'carrierLastSeen'
  | 'custom';

export type MachineResourceType =
  | 'production'
  | 'inventory'
  | 'storage'
  | 'hybrid';

export type MachineResourceCapability =
  | 'production'
  | 'routing'
  | 'control'
  | 'inventory'
  | 'storage'
  | 'telemetry';

export type MachineEquipmentLevel =
  | 'machine'
  | 'work_unit'
  | 'component';

export type MachineExecutionModel =
  | 'machine_job'
  | 'work_unit_jobs';

export type MachineJobInterface =
  | 'signal_handshake'
  | 'job_control'
  | 'telemetry_only';

export type MachineSignalTrigger =
  | 'change'
  | 'rising'
  | 'falling';

export interface MachineEnvironmentReference {
  readonly env: string;
  readonly required?: boolean;
}

export interface MachineSecurityProfile {
  readonly mode: MachineProfileSecurityMode;
  readonly policy: MachineProfileSecurityPolicy;
  readonly certificatePathEnv?: string;
  readonly privateKeyPathEnv?: string;
}

export interface MachineAuthenticationProfile {
  readonly type: MachineProfileAuthenticationType;
  readonly usernameEnv?: string;
  readonly passwordEnv?: string;
  readonly certificatePathEnv?: string;
}

export interface MachineReconnectProfile {
  readonly enabled: boolean;
  readonly initialDelayMs: number;
  readonly maximumDelayMs: number;
  readonly backoffMultiplier: number;
  readonly maxAttempts?: number;
}

export interface MachineNamespaceProfile {
  readonly key: string;
  readonly uri: string;
}

export interface MachineSignalScalingProfile {
  readonly factor: number;
  readonly offset: number;
}

export interface MachineSignalEventProfile {
  readonly trigger: MachineSignalTrigger;
}

export interface MachineSignalProfile {
  readonly key: string;
  readonly role: MachineSignalRole;
  readonly direction: MachineSignalDirection;
  readonly namespace: string;
  readonly identifier: string;
  readonly dataType: MachineProfileDataType;
  readonly access: MachineProfileAccessMode;
  readonly required: boolean;
  readonly description?: string;
  readonly scaling?: MachineSignalScalingProfile;
  readonly event?: MachineSignalEventProfile;
  readonly metadata?: Readonly<Record<string, string>>;
}

export interface MachineStationRoutingProfile {
  readonly sequence: number;
  readonly operationNo: number;
  readonly operation: string;
  readonly enabled?: boolean;
}

export interface MachineCarrierInventorySlotProfile {
  readonly slotId: string;
  readonly presentSignalKey: string;
  readonly carrierIdSignalKey?: string;
  readonly rfidUidSignalKey?: string;
  readonly rfidReadValidSignalKey?: string;
  readonly physicalStateSignalKey?: string;
  readonly readerIdSignalKey?: string;
  readonly lastSeenSignalKey?: string;
}

export interface MachineCarrierInventoryProfile {
  readonly validSignalKey: string;
  readonly revisionSignalKey: string;
  readonly capacitySignalKey?: string;
  readonly availableCountSignalKey: string;
  readonly totalCountSignalKey: string;
  readonly slots: readonly MachineCarrierInventorySlotProfile[];
}

export interface MachineStationProfile {
  readonly stationId: string;
  readonly resourceId: number;
  readonly parentResourceId?: number;
  readonly displayName: string;
  readonly description?: string;
  readonly enabled: boolean;
  readonly equipmentLevel?: MachineEquipmentLevel;
  readonly executionModel?: MachineExecutionModel;
  readonly jobInterface?: MachineJobInterface;
  readonly resourceType: MachineResourceType;
  readonly capabilities?: readonly MachineResourceCapability[];
  readonly signals: readonly MachineSignalProfile[];
  readonly routing?: MachineStationRoutingProfile;
  readonly inventory?: MachineCarrierInventoryProfile;
  readonly metadata?: Readonly<Record<string, string>>;
}

export interface MachineOrderParameterOptionProfile {
  readonly label: string;
  readonly value: number;
  readonly available_quantity?: number;
}

export interface MachineOrderParameterDefinitionProfile {
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
  readonly options?: readonly MachineOrderParameterOptionProfile[];
}

export interface MachineConnectionProfile {
  readonly endpointUrl: string;
  readonly applicationName: string;
  readonly security: MachineSecurityProfile;
  readonly authentication: MachineAuthenticationProfile;
  readonly connectionTimeoutMs: number;
  readonly sessionTimeoutMs: number;
  readonly reconnect: MachineReconnectProfile;
}

export interface MachineRoutingProfile {
  readonly terminalResourceId: number;
}

export interface MachineProfile {
  readonly profileVersion: MachineProfileVersion;
  readonly machineId: string;
  readonly displayName: string;
  readonly description?: string;
  readonly transport: MachineProfileTransport;
  readonly operatingMode: MachineProfileOperatingMode;
  readonly connection: MachineConnectionProfile;
  readonly namespaces: readonly MachineNamespaceProfile[];
  readonly routing?: MachineRoutingProfile;
  readonly orderParameterDefinitions?: readonly MachineOrderParameterDefinitionProfile[];
  readonly resultCodes?: Readonly<Record<string, string>>;
  readonly routingResultCodes?: Readonly<Record<RoutingOutcome, number>>;
  readonly stations: readonly MachineStationProfile[];
  readonly metadata?: Readonly<Record<string, string>>;
}
