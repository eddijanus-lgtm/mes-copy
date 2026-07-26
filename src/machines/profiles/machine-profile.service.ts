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
  'custom',
];

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
  if (value.metadata !== undefined && !isStringRecord(value.metadata)) return false;
  return true;
}

function isMachineStationProfile(value: unknown): value is MachineStationProfile {
  if (!isRecord(value)) return false;
  if (!isString(value.stationId)) return false;
  if (!isString(value.displayName)) return false;
  if (value.description !== undefined && !isString(value.description)) return false;
  if (!isBoolean(value.enabled)) return false;
  if (!Array.isArray(value.signals)) return false;
  if (!value.signals.every((s: unknown) => isMachineSignalProfile(s))) return false;
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
  if (!Array.isArray(value.stations)) return false;
  if (!value.stations.every((st: unknown) => isMachineStationProfile(st))) return false;
  if (value.metadata !== undefined && !isStringRecord(value.metadata)) return false;
  return true;
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
