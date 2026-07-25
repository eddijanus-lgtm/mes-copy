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
  | 'custom';

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
  readonly metadata?: Readonly<Record<string, string>>;
}

export interface MachineStationProfile {
  readonly stationId: string;
  readonly displayName: string;
  readonly description?: string;
  readonly enabled: boolean;
  readonly signals: readonly MachineSignalProfile[];
  readonly metadata?: Readonly<Record<string, string>>;
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

export interface MachineProfile {
  readonly profileVersion: MachineProfileVersion;
  readonly machineId: string;
  readonly displayName: string;
  readonly description?: string;
  readonly transport: MachineProfileTransport;
  readonly operatingMode: MachineProfileOperatingMode;
  readonly connection: MachineConnectionProfile;
  readonly namespaces: readonly MachineNamespaceProfile[];
  readonly stations: readonly MachineStationProfile[];
  readonly metadata?: Readonly<Record<string, string>>;
}
