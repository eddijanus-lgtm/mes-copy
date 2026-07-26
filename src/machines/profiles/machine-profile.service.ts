import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'node:fs';
import { resolve, relative, isAbsolute, normalize, sep } from 'node:path';
import {
  MachineProfile,
  MachineProfileTransport,
  MachineProfileOperatingMode,
  MachineProfileSecurityMode,
  MachineProfileSecurityPolicy,
  MachineProfileAuthenticationType,
  MachineProfileDataType,
  MachineProfileAccessMode,
  MachineSignalDirection,
  MachineSignalRole,
  MachineConnectionProfile,
  MachineSecurityProfile,
  MachineAuthenticationProfile,
  MachineReconnectProfile,
  MachineNamespaceProfile,
  MachineStationProfile,
  MachineSignalProfile,
  MachineSignalScalingProfile,
  MachineCarrierInventoryProfile,
} from './machine-profile.types';
import {
  MACHINE_PROFILE_PATH_CONFIG_KEY,
  MachineProfileLoadOptions,
} from './machine-profile-loader.types';
import {
  MachineProfileConfigurationError,
  MachineProfileFileNotFoundError,
  MachineProfileReadError,
  MachineProfileParseError,
} from './machine-profile.errors';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getNodeErrorCode(error: unknown): string | undefined {
  if (!isRecord(error)) return undefined;
  return typeof error.code === 'string' ? error.code : undefined;
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !Number.isNaN(value);
}

function isStringRecord(value: unknown): value is Readonly<Record<string, string>> {
  if (!isRecord(value)) return false;
  for (const val of Object.values(value)) {
    if (!isString(val)) return false;
  }
  return true;
}

const VALID_TRANSPORT_VALUES: readonly string[] = ['opcua'];
const VALID_OPERATING_MODE_VALUES: readonly string[] = ['observe', 'validate', 'control'];
const VALID_SECURITY_MODE_VALUES: readonly string[] = ['None', 'Sign', 'SignAndEncrypt'];
const VALID_SECURITY_POLICY_VALUES: readonly string[] = [
  'None',
  'Basic256Sha256',
  'Aes128_Sha256_RsaOaep',
  'Aes256_Sha256_RsaPss',
];
const VALID_AUTH_TYPE_VALUES: readonly string[] = ['anonymous', 'username', 'certificate'];
const VALID_DATA_TYPE_VALUES: readonly string[] = [
  'Boolean',
  'Byte',
  'UInt16',
  'UInt32',
  'Int16',
  'Int32',
  'Float',
  'Double',
  'String',
  'DateTime',
];
const VALID_ACCESS_MODE_VALUES: readonly string[] = ['read', 'write', 'readWrite'];
const VALID_DIRECTION_VALUES: readonly string[] = ['machineToMes', 'mesToMachine'];
const VALID_RESOURCE_TYPE_VALUES: readonly string[] = [
  'production',
  'inventory',
  'storage',
  'hybrid',
];
const VALID_RESOURCE_CAPABILITY_VALUES: readonly string[] = [
  'production',
  'routing',
  'control',
  'inventory',
  'storage',
];
const VALID_ROLE_VALUES: readonly string[] = [
  'workRequest',
  'requestBusy',
  'requestAccepted',
  'requestRejected',
  'requestCompleted',
  'carrierId',
  'resourceId',
  'orderId',
  'partNumber',
  'operationId',
  'stepNumber',
  'nextStationId',
  'processActive',
  'processCompleted',
  'processResult',
  'timestamp',
  'completedCarrierId',
  'routingParameter',
  'controlStart',
  'controlStop',
  'controlReset',
  'controlPause',
  'inventoryValid',
  'inventoryRevision',
  'inventoryCapacity',
  'availableCarrierCount',
  'totalCarrierCount',
  'slotOccupied',
  'slotId',
  'rfidUid',
  'rfidReadValid',
  'carrierPhysicalState',
  'carrierReaderId',
  'carrierLastSeen',
  'custom',
];
const VALID_TRIGGER_VALUES: readonly string[] = ['change', 'rising', 'falling'];

function isInAllowedValues(value: unknown, allowed: readonly string[]): boolean {
  return isString(value) && allowed.includes(value);
}

function isMachineSecurityProfile(value: unknown): value is MachineSecurityProfile {
  if (!isRecord(value)) return false;
  if (!isInAllowedValues(value.mode, VALID_SECURITY_MODE_VALUES)) return false;
  if (!isInAllowedValues(value.policy, VALID_SECURITY_POLICY_VALUES)) return false;
  if (value.certificatePathEnv !== undefined && !isString(value.certificatePathEnv)) return false;
  if (value.privateKeyPathEnv !== undefined && !isString(value.privateKeyPathEnv)) return false;
  return true;
}

function isMachineAuthenticationProfile(value: unknown): value is MachineAuthenticationProfile {
  if (!isRecord(value)) return false;
  if (!isInAllowedValues(value.type, VALID_AUTH_TYPE_VALUES)) return false;
  if (value.usernameEnv !== undefined && !isString(value.usernameEnv)) return false;
  if (value.passwordEnv !== undefined && !isString(value.passwordEnv)) return false;
  if (value.certificatePathEnv !== undefined && !isString(value.certificatePathEnv)) return false;
  return true;
}

function isMachineReconnectProfile(value: unknown): value is MachineReconnectProfile {
  if (!isRecord(value)) return false;
  if (!isBoolean(value.enabled)) return false;
  if (!isNumber(value.initialDelayMs)) return false;
  if (!isNumber(value.maximumDelayMs)) return false;
  if (!isNumber(value.backoffMultiplier)) return false;
  if (value.maxAttempts !== undefined && !isNumber(value.maxAttempts)) return false;
  return true;
}

function isMachineNamespaceProfile(value: unknown): value is MachineNamespaceProfile {
  if (!isRecord(value)) return false;
  if (!isString(value.key)) return false;
  if (!isString(value.uri)) return false;
  return true;
}

function isMachineSignalScalingProfile(value: unknown): value is MachineSignalScalingProfile {
  if (!isRecord(value)) return false;
  if (!isNumber(value.factor)) return false;
  if (!isNumber(value.offset)) return false;
  return true;
}

function isMachineSignalEventProfile(value: unknown): boolean {
  return (
    isRecord(value) &&
    isInAllowedValues(value.trigger, VALID_TRIGGER_VALUES)
  );
}

function isMachineSignalProfile(value: unknown): value is MachineSignalProfile {
  if (!isRecord(value)) return false;
  if (!isString(value.key)) return false;
  if (!isInAllowedValues(value.role, VALID_ROLE_VALUES)) return false;
  if (!isInAllowedValues(value.direction, VALID_DIRECTION_VALUES)) return false;
  if (!isString(value.namespace)) return false;
  if (!isString(value.identifier)) return false;
  if (!isInAllowedValues(value.dataType, VALID_DATA_TYPE_VALUES)) return false;
  if (!isInAllowedValues(value.access, VALID_ACCESS_MODE_VALUES)) return false;
  if (!isBoolean(value.required)) return false;
  if (value.description !== undefined && !isString(value.description)) return false;
  if (value.scaling !== undefined && !isMachineSignalScalingProfile(value.scaling)) return false;
  if (value.event !== undefined && !isMachineSignalEventProfile(value.event)) return false;
  if (value.metadata !== undefined && !isStringRecord(value.metadata)) return false;
  return true;
}

function isMachineStationRoutingProfile(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (!Number.isInteger(value.sequence) || Number(value.sequence) < 1) return false;
  if (!Number.isInteger(value.operationNo) || Number(value.operationNo) < 1) return false;
  if (!isString(value.operation) || !value.operation.trim()) return false;
  if (value.enabled !== undefined && !isBoolean(value.enabled)) return false;
  return true;
}

function isMachineCarrierInventoryProfile(
  value: unknown,
): value is MachineCarrierInventoryProfile {
  if (!isRecord(value)) return false;
  if (!isString(value.validSignalKey)) return false;
  if (!isString(value.revisionSignalKey)) return false;
  if (
    value.capacitySignalKey !== undefined &&
    !isString(value.capacitySignalKey)
  ) {
    return false;
  }
  if (!isString(value.availableCountSignalKey)) return false;
  if (!isString(value.totalCountSignalKey)) return false;
  if (!Array.isArray(value.slots) || value.slots.length === 0) return false;
  return value.slots.every((slot: unknown) => {
    if (!isRecord(slot)) return false;
    if (!isString(slot.slotId) || !slot.slotId.trim()) return false;
    if (!isString(slot.presentSignalKey)) return false;
    for (const optionalKey of [
      'carrierIdSignalKey',
      'rfidUidSignalKey',
      'rfidReadValidSignalKey',
      'physicalStateSignalKey',
      'readerIdSignalKey',
      'lastSeenSignalKey',
    ]) {
      if (slot[optionalKey] !== undefined && !isString(slot[optionalKey])) {
        return false;
      }
    }
    return true;
  });
}

function isMachineStationProfile(value: unknown): value is MachineStationProfile {
  if (!isRecord(value)) return false;
  if (!isString(value.stationId)) return false;
  if (!Number.isInteger(value.resourceId) || Number(value.resourceId) < 1) return false;
  if (!isString(value.displayName)) return false;
  if (value.description !== undefined && !isString(value.description)) return false;
  if (!isBoolean(value.enabled)) return false;
  if (
    value.resourceType !== undefined &&
    !isInAllowedValues(value.resourceType, VALID_RESOURCE_TYPE_VALUES)
  ) {
    return false;
  }
  if (
    value.capabilities !== undefined &&
    (!Array.isArray(value.capabilities) ||
      !value.capabilities.every((capability: unknown) =>
        isInAllowedValues(capability, VALID_RESOURCE_CAPABILITY_VALUES),
      ))
  ) {
    return false;
  }
  if (!Array.isArray(value.signals)) return false;
  if (!value.signals.every((s: unknown) => isMachineSignalProfile(s))) return false;
  if (value.routing !== undefined && !isMachineStationRoutingProfile(value.routing)) return false;
  if (
    value.inventory !== undefined &&
    !isMachineCarrierInventoryProfile(value.inventory)
  ) {
    return false;
  }
  if (value.metadata !== undefined && !isStringRecord(value.metadata)) return false;
  return true;
}

function isMachineOrderParameterOptionProfile(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (!isString(value.label)) return false;
  if (!isNumber(value.value)) return false;
  if (value.available_quantity !== undefined && !isNumber(value.available_quantity)) return false;
  return true;
}

function isMachineOrderParameterDefinitionProfile(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (!isString(value.key)) return false;
  if (value.sourceKey !== undefined && !isString(value.sourceKey)) return false;
  if (value.signalKey !== undefined && !isString(value.signalKey)) return false;
  if (value.required !== undefined && !isBoolean(value.required)) return false;
  if (!isString(value.label)) return false;
  if (!isInAllowedValues(value.type, ['number', 'select'])) return false;
  if (value.default_value !== undefined && !isNumber(value.default_value)) return false;
  if (value.min_value !== undefined && !isNumber(value.min_value)) return false;
  if (value.max_value !== undefined && !isNumber(value.max_value)) return false;
  if (value.unit !== undefined && !isString(value.unit)) return false;
  if (value.available_quantity !== undefined && !isNumber(value.available_quantity)) return false;
  if (value.options !== undefined && (!Array.isArray(value.options) || !value.options.every(isMachineOrderParameterOptionProfile))) return false;
  return true;
}

function isMachineConnectionProfile(value: unknown): value is MachineConnectionProfile {
  if (!isRecord(value)) return false;
  if (!isString(value.endpointUrl)) return false;
  if (!isString(value.applicationName)) return false;
  if (!isMachineSecurityProfile(value.security)) return false;
  if (!isMachineAuthenticationProfile(value.authentication)) return false;
  if (!isNumber(value.connectionTimeoutMs)) return false;
  if (!isNumber(value.sessionTimeoutMs)) return false;
  if (!isMachineReconnectProfile(value.reconnect)) return false;
  return true;
}

function isMachineProfile(value: unknown): value is MachineProfile {
  if (!isRecord(value)) return false;
  if (!isString(value.profileVersion)) return false;
  if (!isString(value.machineId)) return false;
  if (!isString(value.displayName)) return false;
  if (value.description !== undefined && !isString(value.description)) return false;
  if (!isInAllowedValues(value.transport, VALID_TRANSPORT_VALUES)) return false;
  if (!isInAllowedValues(value.operatingMode, VALID_OPERATING_MODE_VALUES)) return false;
  if (!isMachineConnectionProfile(value.connection)) return false;
  if (!Array.isArray(value.namespaces)) return false;
  if (!value.namespaces.every((ns: unknown) => isMachineNamespaceProfile(ns))) return false;
  if (value.orderParameterDefinitions !== undefined && (!Array.isArray(value.orderParameterDefinitions) || !value.orderParameterDefinitions.every(isMachineOrderParameterDefinitionProfile))) return false;
  if (value.resultCodes !== undefined && !isStringRecord(value.resultCodes)) return false;
  if (!Array.isArray(value.stations)) return false;
  if (!value.stations.every((st: unknown) => isMachineStationProfile(st))) return false;
  if (value.metadata !== undefined && !isStringRecord(value.metadata)) return false;
  return true;
}

function hasStationCapability(
  station: MachineStationProfile,
  capability:
    | 'production'
    | 'routing'
    | 'control'
    | 'inventory'
    | 'storage',
): boolean {
  if (station.capabilities !== undefined) {
    return station.capabilities.includes(capability);
  }

  const resourceType = station.resourceType || 'production';
  if (resourceType === 'production') {
    return ['production', 'routing', 'control'].includes(capability);
  }
  if (resourceType === 'inventory') {
    return capability === 'inventory';
  }
  if (resourceType === 'storage') {
    return capability === 'inventory' || capability === 'storage';
  }
  return true;
}

function machineProfileSemanticErrors(profile: MachineProfile): string[] {
  const errors: string[] = [];
  const { security, authentication, reconnect } = profile.connection;
  if ((security.mode === 'None') !== (security.policy === 'None')) {
    errors.push('OPC UA security mode and policy must both be None or both be secure');
  }
  if (
    security.mode !== 'None' &&
    (!security.certificatePathEnv || !security.privateKeyPathEnv)
  ) {
    errors.push('Secure OPC UA connections require certificatePathEnv and privateKeyPathEnv');
  }
  if (
    authentication.type === 'username' &&
    (!authentication.usernameEnv || !authentication.passwordEnv)
  ) {
    errors.push('Username authentication requires usernameEnv and passwordEnv');
  }
  if (
    authentication.type === 'certificate' &&
    (!authentication.certificatePathEnv || !security.privateKeyPathEnv)
  ) {
    errors.push('Certificate authentication requires certificatePathEnv and privateKeyPathEnv');
  }
  if (
    reconnect.initialDelayMs < 0 ||
    reconnect.maximumDelayMs < reconnect.initialDelayMs ||
    reconnect.backoffMultiplier < 1 ||
    (reconnect.maxAttempts !== undefined &&
      (!Number.isInteger(reconnect.maxAttempts) || reconnect.maxAttempts < 0))
  ) {
    errors.push('Reconnect settings are invalid');
  }
  const namespaceKeys = new Set<string>();
  for (const namespace of profile.namespaces) {
    if (namespaceKeys.has(namespace.key)) {
      errors.push(`Duplicate namespace key ${namespace.key}`);
    }
    namespaceKeys.add(namespace.key);
  }

  const stationIds = new Set<string>();
  const resourceIds = new Set<number>();
  const routeSequences = new Set<number>();
  const requiredControlRoles: readonly MachineSignalRole[] = [
    'workRequest',
    'requestBusy',
    'requestAccepted',
    'requestRejected',
    'carrierId',
    'resourceId',
    'orderId',
    'partNumber',
    'operationId',
    'stepNumber',
    'nextStationId',
    'processActive',
    'processCompleted',
    'processResult',
    'completedCarrierId',
  ];

  for (const station of profile.stations) {
    if (stationIds.has(station.stationId)) {
      errors.push(`Duplicate stationId ${station.stationId}`);
    }
    stationIds.add(station.stationId);
    if (resourceIds.has(station.resourceId)) {
      errors.push(`Duplicate resourceId ${station.resourceId}`);
    }
    resourceIds.add(station.resourceId);
    if (
      station.capabilities &&
      new Set(station.capabilities).size !== station.capabilities.length
    ) {
      errors.push(`Duplicate capability in ${station.stationId}`);
    }
    if (
      profile.operatingMode === 'control' &&
      hasStationCapability(station, 'routing') &&
      station.routing?.enabled !== false
    ) {
      if (!station.routing) {
        errors.push(`Station ${station.stationId} requires routing configuration`);
      } else if (routeSequences.has(station.routing.sequence)) {
        errors.push(`Duplicate routing sequence ${station.routing.sequence}`);
      } else {
        routeSequences.add(station.routing.sequence);
      }
    }

    const signalKeys = new Set<string>();
    const roles = new Map<MachineSignalRole, number>();
    for (const signal of station.signals) {
      if (signalKeys.has(signal.key)) {
        errors.push(`Duplicate signal key ${signal.key} in ${station.stationId}`);
      }
      signalKeys.add(signal.key);
      roles.set(signal.role, (roles.get(signal.role) || 0) + 1);
      if (!namespaceKeys.has(signal.namespace)) {
        errors.push(
          `Unknown namespace ${signal.namespace} for ${station.stationId}.${signal.key}`,
        );
      }
      if (
        signal.direction === 'machineToMes' &&
        signal.access === 'write'
      ) {
        errors.push(
          `Machine-to-MES signal ${station.stationId}.${signal.key} is not readable`,
        );
      }
      if (
        signal.direction === 'mesToMachine' &&
        signal.access === 'read'
      ) {
        errors.push(
          `MES-to-machine signal ${station.stationId}.${signal.key} is not writable`,
        );
      }
    }

    if (
      profile.operatingMode === 'control' &&
      station.enabled &&
      hasStationCapability(station, 'production')
    ) {
      for (const role of requiredControlRoles) {
        if ((roles.get(role) || 0) !== 1) {
          errors.push(
            `Control station ${station.stationId} requires exactly one ${role} signal`,
          );
        }
      }
    }

    const inventoryCapable = hasStationCapability(station, 'inventory');
    if (station.enabled && inventoryCapable && !station.inventory) {
      errors.push(
        `Inventory resource ${station.stationId} requires inventory configuration`,
      );
    }
    if (station.inventory && !inventoryCapable) {
      errors.push(
        `Station ${station.stationId} has inventory configuration without inventory capability`,
      );
    }
    if (station.inventory) {
      const signalByKey = new Map(
        station.signals.map((signal) => [signal.key, signal] as const),
      );
      const inventory = station.inventory;
      const summarySignals: ReadonlyArray<
        readonly [string, MachineSignalRole]
      > = [
        [inventory.validSignalKey, 'inventoryValid'],
        [inventory.revisionSignalKey, 'inventoryRevision'],
        [inventory.availableCountSignalKey, 'availableCarrierCount'],
        [inventory.totalCountSignalKey, 'totalCarrierCount'],
        ...(inventory.capacitySignalKey
          ? ([
              [inventory.capacitySignalKey, 'inventoryCapacity'],
            ] as const)
          : []),
      ];
      const slotIds = new Set<string>();

      const validateInventorySignal = (
        signalKey: string,
        expectedRole: MachineSignalRole,
        context: string,
      ) => {
        const signal = signalByKey.get(signalKey);
        if (!signal) {
          errors.push(
            `Inventory ${context} references unknown signal ${signalKey} in ${station.stationId}`,
          );
          return;
        }
        if (signal.role !== expectedRole) {
          errors.push(
            `Inventory ${context} signal ${station.stationId}.${signalKey} requires role ${expectedRole}`,
          );
        }
        if (
          signal.direction !== 'machineToMes' ||
          (signal.access !== 'read' && signal.access !== 'readWrite')
        ) {
          errors.push(
            `Inventory signal ${station.stationId}.${signalKey} must be readable machineToMes`,
          );
        }
      };

      for (const [signalKey, role] of summarySignals) {
        validateInventorySignal(signalKey, role, role);
      }

      for (const slot of inventory.slots) {
        if (slotIds.has(slot.slotId)) {
          errors.push(
            `Duplicate inventory slotId ${slot.slotId} in ${station.stationId}`,
          );
        }
        slotIds.add(slot.slotId);
        if (!slot.carrierIdSignalKey && !slot.rfidUidSignalKey) {
          errors.push(
            `Inventory slot ${station.stationId}.${slot.slotId} requires carrierIdSignalKey or rfidUidSignalKey`,
          );
        }
        const slotSignals: ReadonlyArray<
          readonly [string | undefined, MachineSignalRole]
        > = [
          [slot.presentSignalKey, 'slotOccupied'],
          [slot.carrierIdSignalKey, 'carrierId'],
          [slot.rfidUidSignalKey, 'rfidUid'],
          [slot.rfidReadValidSignalKey, 'rfidReadValid'],
          [slot.physicalStateSignalKey, 'carrierPhysicalState'],
          [slot.readerIdSignalKey, 'carrierReaderId'],
          [slot.lastSeenSignalKey, 'carrierLastSeen'],
        ];
        for (const [signalKey, role] of slotSignals) {
          if (signalKey) {
            validateInventorySignal(
              signalKey,
              role,
              `slot ${slot.slotId}`,
            );
          }
        }
      }
    }
  }

  for (const definition of profile.orderParameterDefinitions || []) {
    const signalKey = definition.signalKey || definition.key;
    for (const station of profile.stations.filter(
      (candidate) =>
        candidate.enabled && hasStationCapability(candidate, 'production'),
    )) {
      const signal = station.signals.find(
        (candidate) =>
          candidate.role === 'routingParameter' &&
          candidate.key === signalKey,
      );
      if (profile.operatingMode === 'control' && !signal) {
        errors.push(
          `Order parameter ${definition.key} has no routingParameter signal ${signalKey} in ${station.stationId}`,
        );
      }
    }
  }
  return errors;
}

function hasNullByte(value: string): boolean {
  return value.includes('\0');
}

function resolveProfilePath(profilePath: string, baseDirectory?: string): string {
  const base = baseDirectory !== undefined ? resolve(baseDirectory) : process.cwd();

  if (isAbsolute(profilePath)) {
    return normalize(profilePath);
  }

  const resolved = resolve(base, profilePath);
  const relativePath = relative(base, resolved);

  if (
    relativePath === '..' ||
    relativePath.startsWith('..' + sep) ||
    isAbsolute(relativePath)
  ) {
    throw new MachineProfileConfigurationError(
      'PROFILE_PATH_INVALID',
      'Relative profile path escapes the base directory.',
      profilePath,
    );
  }

  return resolved;
}

@Injectable()
export class MachineProfileService {
  private loadedProfile?: MachineProfile;

  constructor(private readonly configService: ConfigService) {}

  loadConfiguredProfile(baseDirectory?: string): MachineProfile {
    const rawValue: unknown = this.configService.get(MACHINE_PROFILE_PATH_CONFIG_KEY);

    if (rawValue === undefined || rawValue === null) {
      throw new MachineProfileConfigurationError(
        'PROFILE_PATH_MISSING',
        'Machine profile path is not configured.',
      );
    }

    if (!isString(rawValue)) {
      throw new MachineProfileConfigurationError(
        'PROFILE_PATH_INVALID',
        'Machine profile path is not a string.',
      );
    }

    const trimmed = rawValue.trim();

    if (trimmed.length === 0) {
      throw new MachineProfileConfigurationError(
        'PROFILE_PATH_MISSING',
        'Machine profile path is empty.',
      );
    }

    return this.loadProfile({ profilePath: trimmed, baseDirectory });
  }

  loadProfile(options: MachineProfileLoadOptions): MachineProfile {
    const trimmedPath = options.profilePath.trim();

    if (trimmedPath.length === 0) {
      throw new MachineProfileConfigurationError(
        'PROFILE_PATH_MISSING',
        'Profile path is missing or empty.',
        options.profilePath,
      );
    }

    if (hasNullByte(trimmedPath)) {
      throw new MachineProfileConfigurationError(
        'PROFILE_PATH_INVALID',
        'Profile path contains invalid characters.',
        options.profilePath,
      );
    }

    let trimmedBase: string | undefined;
    if (options.baseDirectory !== undefined) {
      trimmedBase = options.baseDirectory.trim();
      if (trimmedBase.length === 0 || hasNullByte(trimmedBase)) {
        throw new MachineProfileConfigurationError(
          'PROFILE_PATH_INVALID',
          'Base directory is invalid.',
        );
      }
    }

    let resolvedPath: string;

    try {
      resolvedPath = resolveProfilePath(trimmedPath, trimmedBase);
    } catch (error) {
      if (error instanceof MachineProfileConfigurationError) {
        throw error;
      }
      throw new MachineProfileConfigurationError(
        'PROFILE_PATH_INVALID',
        'Failed to resolve profile path.',
        options.profilePath,
        error,
      );
    }

    let fileContent: string;

    try {
      fileContent = readFileSync(resolvedPath, 'utf8');
    } catch (error) {
      const errorCode = getNodeErrorCode(error);

      if (errorCode === 'ENOENT') {
        throw new MachineProfileFileNotFoundError(
          `Machine profile file not found: ${resolvedPath}`,
          resolvedPath,
          error,
        );
      }

      throw new MachineProfileReadError(
        `Failed to read machine profile: ${resolvedPath}`,
        resolvedPath,
        error,
      );
    }

    let parsed: unknown;

    try {
      parsed = JSON.parse(fileContent);
    } catch (error) {
      throw new MachineProfileParseError(
        'Machine profile is not valid JSON.',
        resolvedPath,
        error,
      );
    }

    if (!isMachineProfile(parsed)) {
      throw new MachineProfileParseError(
        'Machine profile does not match the expected structure.',
        resolvedPath,
      );
    }

    const semanticErrors = machineProfileSemanticErrors(parsed);
    if (semanticErrors.length) {
      throw new MachineProfileParseError(
        `Machine profile semantic validation failed: ${semanticErrors.join('; ')}`,
        resolvedPath,
      );
    }

    this.loadedProfile = parsed;
    return parsed;
  }

  getProfile(): MachineProfile {
    if (this.loadedProfile !== undefined) {
      return this.loadedProfile;
    }

    return this.loadConfiguredProfile();
  }
}
