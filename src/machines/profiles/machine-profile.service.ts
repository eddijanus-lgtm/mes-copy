import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
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
import { ROUTING_OUTCOMES } from '../../orders/routing-outcome';
import { MachineProfileEntity } from './machine-profile.entity';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getNodeErrorCode(error: unknown): string | undefined {
  if (!isRecord(error)) return undefined;
  if (typeof error.code === 'string') return error.code;
  return getNodeErrorCode(error.driverError);
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

function isNumberRecord(value: unknown): value is Readonly<Record<string, number>> {
  if (!isRecord(value)) return false;
  return Object.values(value).every(isNumber);
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
  'telemetry',
];
const VALID_EQUIPMENT_LEVEL_VALUES: readonly string[] = [
  'machine',
  'work_unit',
  'component',
];
const VALID_EXECUTION_MODEL_VALUES: readonly string[] = [
  'machine_job',
  'work_unit_jobs',
];
const VALID_JOB_INTERFACE_VALUES: readonly string[] = [
  'signal_handshake',
  'job_control',
  'telemetry_only',
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
  'idealCycleTimeMs',
  'goodCount',
  'rejectCount',
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
  if (
    value.parentResourceId !== undefined &&
    (!Number.isInteger(value.parentResourceId) ||
      Number(value.parentResourceId) < 1)
  ) {
    return false;
  }
  if (!isString(value.displayName)) return false;
  if (value.description !== undefined && !isString(value.description)) return false;
  if (!isBoolean(value.enabled)) return false;
  if (
    value.equipmentLevel !== undefined &&
    !isInAllowedValues(value.equipmentLevel, VALID_EQUIPMENT_LEVEL_VALUES)
  ) {
    return false;
  }
  if (
    value.executionModel !== undefined &&
    !isInAllowedValues(value.executionModel, VALID_EXECUTION_MODEL_VALUES)
  ) {
    return false;
  }
  if (
    value.jobInterface !== undefined &&
    !isInAllowedValues(value.jobInterface, VALID_JOB_INTERFACE_VALUES)
  ) {
    return false;
  }
  if (!isInAllowedValues(value.resourceType, VALID_RESOURCE_TYPE_VALUES)) {
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
  if (
    value.connection !== undefined &&
    !isMachineConnectionProfile(value.connection)
  ) {
    return false;
  }
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
  if (
    value.targetResourceIds !== undefined &&
    (!Array.isArray(value.targetResourceIds) ||
      value.targetResourceIds.length === 0 ||
      !value.targetResourceIds.every(
        (resourceId: unknown) =>
          Number.isInteger(resourceId) && Number(resourceId) > 0,
      ))
  ) {
    return false;
  }
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

export function isMachineProfile(value: unknown): value is MachineProfile {
  if (!isRecord(value)) return false;
  if (!isString(value.profileVersion)) return false;
  if (!isString(value.machineId)) return false;
  if (!isString(value.displayName)) return false;
  if (value.description !== undefined && !isString(value.description)) return false;
  if (value.manufacturer !== undefined && !isString(value.manufacturer)) return false;
  if (value.model !== undefined && !isString(value.model)) return false;
  if (value.machineVersion !== undefined && !isString(value.machineVersion)) return false;
  if (value.location !== undefined && !isString(value.location)) return false;
  if (!isInAllowedValues(value.transport, VALID_TRANSPORT_VALUES)) return false;
  if (!isInAllowedValues(value.operatingMode, VALID_OPERATING_MODE_VALUES)) return false;
  if (!isMachineConnectionProfile(value.connection)) return false;
  if (!Array.isArray(value.namespaces)) return false;
  if (!value.namespaces.every((ns: unknown) => isMachineNamespaceProfile(ns))) return false;
  if (
    value.routing !== undefined &&
    (!isRecord(value.routing) ||
      !Number.isInteger(value.routing.terminalResourceId) ||
      Number(value.routing.terminalResourceId) < 0)
  ) {
    return false;
  }
  if (value.orderParameterDefinitions !== undefined && (!Array.isArray(value.orderParameterDefinitions) || !value.orderParameterDefinitions.every(isMachineOrderParameterDefinitionProfile))) return false;
  if (value.resultCodes !== undefined && !isStringRecord(value.resultCodes)) return false;
  if (
    value.routingResultCodes !== undefined &&
    !isNumberRecord(value.routingResultCodes)
  ) {
    return false;
  }
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

  const resourceType = station.resourceType;
  if (resourceType === 'production') {
    return ['production', 'routing', 'control'].includes(capability);
  }
  if (resourceType === 'inventory') {
    return capability === 'inventory';
  }
  if (resourceType === 'storage') {
    return capability === 'inventory' || capability === 'storage';
  }
  return false;
}

function machineConnectionSemanticErrors(
  connection: MachineConnectionProfile,
  context: string,
): string[] {
  const errors: string[] = [];
  const { security, authentication, reconnect } = connection;
  if (!connection.endpointUrl.trim().startsWith('opc.tcp://')) {
    errors.push(`${context} endpointUrl must start with opc.tcp://`);
  }
  if (!connection.applicationName.trim()) {
    errors.push(`${context} applicationName must not be empty`);
  }
  if (connection.connectionTimeoutMs <= 0 || connection.sessionTimeoutMs <= 0) {
    errors.push(`${context} connection and session timeouts must be positive`);
  }
  if ((security.mode === 'None') !== (security.policy === 'None')) {
    errors.push(`${context} security mode and policy must both be None or both be secure`);
  }
  if (
    security.mode !== 'None' &&
    (!security.certificatePathEnv || !security.privateKeyPathEnv)
  ) {
    errors.push(`${context} secure connection requires certificatePathEnv and privateKeyPathEnv`);
  }
  if (
    authentication.type === 'username' &&
    (!authentication.usernameEnv || !authentication.passwordEnv)
  ) {
    errors.push(`${context} username authentication requires usernameEnv and passwordEnv`);
  }
  if (
    authentication.type === 'certificate' &&
    (!authentication.certificatePathEnv || !security.privateKeyPathEnv)
  ) {
    errors.push(`${context} certificate authentication requires certificatePathEnv and privateKeyPathEnv`);
  }
  if (
    reconnect.initialDelayMs < 0 ||
    reconnect.maximumDelayMs < reconnect.initialDelayMs ||
    reconnect.backoffMultiplier < 1 ||
    (reconnect.maxAttempts !== undefined &&
      (!Number.isInteger(reconnect.maxAttempts) || reconnect.maxAttempts < 0))
  ) {
    errors.push(`${context} reconnect settings are invalid`);
  }
  return errors;
}

export function machineProfileSemanticErrors(profile: MachineProfile): string[] {
  const errors: string[] = [];
  if (!profile.machineId.trim()) errors.push('machineId must not be empty');
  if (!profile.displayName.trim()) errors.push('displayName must not be empty');
  if (profile.stations.some((station) => !station.connection)) {
    errors.push(...machineConnectionSemanticErrors(profile.connection, 'Default OPC UA'));
  }
  if (profile.namespaces.length === 0) {
    errors.push('At least one OPC UA namespace is required');
  }
  if (profile.stations.length === 0) {
    errors.push('At least one station is required');
  }
  const namespaceKeys = new Set<string>();
  for (const namespace of profile.namespaces) {
    if (!namespace.key.trim() || !namespace.uri.trim()) {
      errors.push('Namespace key and URI must not be empty');
    }
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
  const hasControlledRouting = profile.stations.some(
    (station) =>
      station.enabled &&
      hasStationCapability(station, 'routing') &&
      station.jobInterface !== 'job_control' &&
      station.routing?.enabled !== false,
  );
  if (profile.operatingMode === 'control' && hasControlledRouting) {
    if (!profile.routing) {
      errors.push(
        'Control profiles with routing require routing.terminalResourceId',
      );
    }
    const configuredCodes = profile.routingResultCodes;
    if (!configuredCodes) {
      errors.push(
        'Control profiles with routing require routingResultCodes',
      );
    } else {
      const values: number[] = [];
      for (const outcome of ROUTING_OUTCOMES) {
        const value = configuredCodes[outcome];
        if (!Number.isInteger(value) || value < 0) {
          errors.push(
            `routingResultCodes.${outcome} must be a non-negative integer`,
          );
        } else {
          values.push(value);
        }
      }
      if (new Set(values).size !== values.length) {
        errors.push('routingResultCodes values must be unique');
      }
    }
  }

  for (const station of profile.stations) {
    if (station.connection) {
      errors.push(
        ...machineConnectionSemanticErrors(
          station.connection,
          `Station ${station.stationId} OPC UA`,
        ),
      );
    }
    if (!station.stationId.trim() || !station.displayName.trim()) {
      errors.push('Station ID and display name must not be empty');
    }
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
    if (station.routing?.enabled !== false && station.routing) {
      if (!station.enabled) {
        errors.push(`Routing station ${station.stationId} must be enabled`);
      }
      if (!hasStationCapability(station, 'routing')) {
        errors.push(
          `Routing station ${station.stationId} requires routing capability`,
        );
      }
      if (routeSequences.has(station.routing.sequence)) {
        errors.push(`Duplicate routing sequence ${station.routing.sequence}`);
      } else {
        routeSequences.add(station.routing.sequence);
      }
    } else if (
      profile.operatingMode === 'control' &&
      hasStationCapability(station, 'routing') &&
      station.enabled
    ) {
      if (!station.routing) {
        errors.push(`Station ${station.stationId} requires routing configuration`);
      }
    }

    const signalKeys = new Set<string>();
    const roles = new Map<MachineSignalRole, number>();
    for (const signal of station.signals) {
      if (!signal.key.trim() || !signal.identifier.trim()) {
        errors.push(
          `Signal key and identifier must not be empty in ${station.stationId}`,
        );
      }
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
      hasStationCapability(station, 'production') &&
      station.jobInterface !== 'job_control' &&
      station.jobInterface !== 'telemetry_only'
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

  const stationByResource = new Map(
    profile.stations.map((station) => [station.resourceId, station] as const),
  );
  for (const station of profile.stations) {
    if (station.parentResourceId === undefined) continue;
    if (station.parentResourceId === station.resourceId) {
      errors.push(`Station ${station.stationId} cannot be its own parent`);
      continue;
    }
    if (!stationByResource.has(station.parentResourceId)) {
      errors.push(
        `Station ${station.stationId} references unknown parent resource ${station.parentResourceId}`,
      );
      continue;
    }

    const visited = new Set<number>([station.resourceId]);
    let ancestor = stationByResource.get(station.parentResourceId);
    while (ancestor) {
      if (visited.has(ancestor.resourceId)) {
        errors.push(`Equipment hierarchy contains a cycle at ${station.stationId}`);
        break;
      }
      visited.add(ancestor.resourceId);
      ancestor =
        ancestor.parentResourceId === undefined
          ? undefined
          : stationByResource.get(ancestor.parentResourceId);
    }
  }

  for (const definition of profile.orderParameterDefinitions || []) {
    const signalKey = definition.signalKey || definition.key;
    const targetResourceIds = definition.targetResourceIds;
    if (
      targetResourceIds &&
      new Set(targetResourceIds).size !== targetResourceIds.length
    ) {
      errors.push(
        `Order parameter ${definition.key} has duplicate targetResourceIds`,
      );
    }
    for (const resourceId of targetResourceIds || []) {
      if (!resourceIds.has(resourceId)) {
        errors.push(
          `Order parameter ${definition.key} targets unknown resource ${resourceId}`,
        );
      }
    }
    for (const station of profile.stations.filter(
      (candidate) =>
        candidate.enabled &&
        hasStationCapability(candidate, 'production') &&
        (!targetResourceIds ||
          targetResourceIds.includes(candidate.resourceId)),
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
export class MachineProfileService implements OnModuleInit {
  private readonly logger = new Logger(MachineProfileService.name);
  private loadedProfile?: MachineProfile;
  private source: 'database' | 'legacy_file' | undefined;

  constructor(
    private readonly configService: ConfigService,
    @Optional()
    @InjectRepository(MachineProfileEntity)
    private readonly profileVersions?: Repository<MachineProfileEntity>,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.profileVersions) return;
    let active: MachineProfileEntity | null;
    try {
      active = await this.profileVersions.findOne({
        where: { active: true },
        order: { created_at: 'DESC' },
      });
    } catch (error) {
      if (getNodeErrorCode(error) === '42P01') {
        this.logger.warn(
          'machine_profile_versions is not installed; using MACHINE_PROFILE_PATH until the machine-profile migration is applied',
        );
        return;
      }
      throw error;
    }
    if (!active) return;

    const validation = this.validateDocument(active.document);
    if (!validation.valid || !validation.profile) {
      throw new MachineProfileParseError(
        `Active persisted machine profile is invalid: ${validation.errors.join('; ')}`,
        `database:${active.profile_id}:${active.version}`,
      );
    }
    this.loadedProfile = validation.profile;
    this.source = 'database';
    this.logger.log(
      `Loaded active persisted machine profile ${active.machine_id} version ${active.version}`,
    );
  }

  validateDocument(value: unknown): {
    valid: boolean;
    errors: string[];
    profile?: MachineProfile;
  } {
    if (!isMachineProfile(value)) {
      return {
        valid: false,
        errors: ['Machine profile does not match the expected structure'],
      };
    }
    const errors = machineProfileSemanticErrors(value);
    return errors.length
      ? { valid: false, errors, profile: value }
      : { valid: true, errors: [], profile: value };
  }

  getSource(): 'database' | 'legacy_file' | undefined {
    return this.source;
  }

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

    const validation = this.validateDocument(parsed);
    if (!validation.valid || !validation.profile) {
      throw new MachineProfileParseError(
        `Machine profile validation failed: ${validation.errors.join('; ')}`,
        resolvedPath,
      );
    }

    this.loadedProfile = validation.profile;
    this.source = 'legacy_file';
    return validation.profile;
  }

  getProfile(): MachineProfile {
    if (this.loadedProfile !== undefined) {
      return this.loadedProfile;
    }

    return this.loadConfiguredProfile();
  }
}
