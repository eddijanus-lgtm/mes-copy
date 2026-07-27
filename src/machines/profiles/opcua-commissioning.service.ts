import {
  BadGatewayException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'node:fs';
import type {
  MachineConnectionProfile,
  MachineProfile,
  MachineSignalProfile,
  MachineStationProfile,
} from './machine-profile.types';

const opcua = require('node-opcua');

const BUILTIN_DATA_TYPES: Record<number, string> = {
  1: 'Boolean',
  3: 'Byte',
  4: 'Int16',
  5: 'UInt16',
  6: 'Int32',
  7: 'UInt32',
  10: 'Float',
  11: 'Double',
  12: 'String',
  13: 'DateTime',
};

@Injectable()
export class OpcUaCommissioningService {
  constructor(private readonly config: ConfigService) {}

  async testConnection(profile: MachineProfile, stationId?: string) {
    if (stationId) {
      return this.testStationConnection(
        profile,
        this.station(profile, stationId),
      );
    }
    const enabledStations = profile.stations.filter((station) => station.enabled);
    if (enabledStations.length === 0) {
      return {
        valid: false,
        readOnly: true,
        checkedAt: new Date().toISOString(),
        message: 'Keine aktivierte Station zum Testen vorhanden.',
        stations: [],
      };
    }
    const stations = await Promise.all(
      enabledStations.map(async (station) => {
          try {
            return await this.testStationConnection(profile, station);
          } catch (error) {
            return this.stationFailure(profile, station, error);
          }
        }),
    );
    return {
      valid: stations.every((station) => station.valid),
      readOnly: true,
      checkedAt: new Date().toISOString(),
      stations,
    };
  }

  private async testStationConnection(
    profile: MachineProfile,
    station: MachineStationProfile,
  ) {
    const connection = station.connection || profile.connection;
    return this.readOnlySession(connection, async (session, endpoints) => {
      const namespaces = await this.namespaceArray(session);
      return {
        stationId: station.stationId,
        endpoint: this.safeEndpoint(connection.endpointUrl),
        valid: true,
        readOnly: true,
        checkedAt: new Date().toISOString(),
        endpointReachable: true,
        sessionEstablished: true,
        namespaceArrayReadable: true,
        namespaceArray: namespaces,
        offeredEndpoints: endpoints.map((endpoint) => ({
          endpointUrl: this.safeEndpoint(String(endpoint.endpointUrl || '')),
          securityMode:
            opcua.MessageSecurityMode[Number(endpoint.securityMode)] ||
            String(endpoint.securityMode),
          securityPolicyUri: endpoint.securityPolicyUri,
          userTokenTypes: (endpoint.userIdentityTokens || []).map(
            (token) =>
              opcua.UserTokenType[Number(token.tokenType)] ||
              String(token.tokenType),
          ),
        })),
      };
    });
  }

  async verify(profile: MachineProfile) {
    const stations = await Promise.all(
      profile.stations
        .filter((station) => station.enabled)
        .map(async (station) => {
          const connection = station.connection || profile.connection;
          try {
            return await this.readOnlySession(connection, async (session) => {
              const namespaceArray = await this.namespaceArray(session);
              const indexes = new Map(
                namespaceArray.map((uri, index) => [uri, index]),
              );
              const signals: Record<string, unknown>[] = [];
              for (const signal of station.signals) {
                signals.push(
                  await this.checkSignal(
                    session,
                    profile,
                    station.stationId,
                    signal,
                    indexes,
                  ),
                );
              }
              const invalid = signals.filter(
                (signal) =>
                  signal.status !== 'ok' &&
                  (signal.required === true || signal.exists === true),
              );
              return {
                stationId: station.stationId,
                endpoint: this.safeEndpoint(connection.endpointUrl),
                valid: invalid.length === 0,
                namespaceArray,
                signals,
              };
            });
          } catch (error) {
            return {
              ...this.stationFailure(profile, station, error),
              namespaceArray: [] as string[],
              signals: station.signals.map((signal) => ({
                stationId: station.stationId,
                key: signal.key,
                required: signal.required,
                exists: false,
                status: 'connection_failed',
              })),
            };
          }
        }),
    );
    const signals = stations.flatMap((station) => station.signals);
    const invalid = signals.filter(
      (signal) =>
        signal.status !== 'ok' &&
        (signal.required === true || signal.exists === true),
    );
    const warnings = [
      ...signals.filter(
        (signal) => signal.status !== 'ok' && !invalid.includes(signal),
      ),
      ...stations.flatMap((station) =>
        !station.valid && 'error' in station
          ? [
              {
                stationId: station.stationId,
                status: 'connection_failed',
                error: station.error,
              },
            ]
          : [],
      ),
    ];
    return {
      valid: stations.every((station) => station.valid) && invalid.length === 0,
      readOnly: true,
      checkedAt: new Date().toISOString(),
      namespaceArray: stations[0]?.namespaceArray || [],
      namespaceArrays: stations.map((station) => ({
        stationId: station.stationId,
        namespaceArray: station.namespaceArray,
      })),
      stations,
      signals,
      warnings,
      missingRequiredSignals: invalid
        .filter((signal) => signal.required === true && signal.exists !== true)
        .map((signal) => `${signal.stationId}.${signal.key}`),
      invalidDataTypes: invalid
        .filter((signal) => signal.dataTypeMatches === false)
        .map((signal) => `${signal.stationId}.${signal.key}`),
    };
  }

  async browse(
    profile: MachineProfile,
    nodeId = 'i=85',
    maxNodes = 200,
    stationId?: string,
  ) {
    const station = stationId ? this.station(profile, stationId) : undefined;
    const connection = station?.connection || profile.connection;
    return this.readOnlySession(connection, async (session) => {
      const result = await session.browse({
        nodeId,
        browseDirection: opcua.BrowseDirection.Forward,
        includeSubtypes: true,
        nodeClassMask: 0,
        resultMask: opcua.makeResultMask(
          'ReferenceType | IsForward | BrowseName | DisplayName | NodeClass | TypeDefinition',
        ),
      });
      const references = (result.references || []).slice(0, maxNodes);
      const nodes = await Promise.all(
        references.map(async (reference) => {
          const childNodeId = reference.nodeId.toString();
          const nodeClass =
            opcua.NodeClass[Number(reference.nodeClass)] ||
            String(reference.nodeClass);
          const base = {
            nodeId: childNodeId,
            browseName: this.text(reference.browseName),
            displayName: this.text(reference.displayName),
            nodeClass,
          };
          if (nodeClass !== 'Variable') return base;
          const values = await session.read([
            { nodeId: childNodeId, attributeId: opcua.AttributeIds.DataType },
            {
              nodeId: childNodeId,
              attributeId: opcua.AttributeIds.UserAccessLevel,
            },
          ]);
          const access = this.access(values[1]);
          return {
            ...base,
            dataType: this.dataType(values[0]),
            access,
          };
        }),
      );
      return {
        ...(station
          ? {
              stationId: station.stationId,
              endpoint: this.safeEndpoint(connection.endpointUrl),
            }
          : {}),
        readOnly: true,
        parentNodeId: nodeId,
        nodes,
        truncated: references.length < (result.references || []).length,
      };
    });
  }

  private async checkSignal(
    session: any,
    profile: MachineProfile,
    stationId: string,
    signal: MachineSignalProfile,
    indexes: ReadonlyMap<string, number>,
  ) {
    const nodeId = this.resolveNodeId(profile, signal, indexes);
    if (!nodeId) {
      return {
        stationId,
        key: signal.key,
        required: signal.required,
        status: 'missing_namespace',
      };
    }
    const values = await session.read([
      { nodeId, attributeId: opcua.AttributeIds.NodeClass },
      { nodeId, attributeId: opcua.AttributeIds.DataType },
      { nodeId, attributeId: opcua.AttributeIds.UserAccessLevel },
    ]);
    const exists = values.every((value) => value?.statusCode?.isGood());
    const actualDataType = this.dataType(values[1]);
    const access = this.access(values[2]);
    const expectsRead =
      signal.access === 'read' || signal.access === 'readWrite';
    const expectsWrite =
      signal.access === 'write' || signal.access === 'readWrite';
    const readable =
      !expectsRead || access === 'read' || access === 'readWrite';
    const writable =
      !expectsWrite || access === 'write' || access === 'readWrite';
    const dataTypeMatches = actualDataType === signal.dataType;
    return {
      stationId,
      key: signal.key,
      required: signal.required,
      nodeId,
      expectedDataType: signal.dataType,
      actualDataType,
      access,
      exists,
      readable,
      writable,
      dataTypeMatches,
      status:
        exists && readable && writable && dataTypeMatches ? 'ok' : 'mismatch',
    };
  }

  private async readOnlySession<T>(
    connection: MachineConnectionProfile,
    callback: (session: any, endpoints: any[]) => Promise<T>,
  ): Promise<T> {
    const security = connection.security;
    const client = opcua.OPCUAClient.create({
      applicationName: connection.applicationName,
      endpointMustExist: false,
      securityMode: opcua.MessageSecurityMode[security.mode],
      securityPolicy: opcua.SecurityPolicy[security.policy],
      connectionStrategy: { initialDelay: 0, maxDelay: 0, maxRetry: 0 },
      connectionTimeout: connection.connectionTimeoutMs,
      requestedSessionTimeout: connection.sessionTimeoutMs,
      ...(security.certificatePathEnv
        ? { certificateFile: this.environment(security.certificatePathEnv) }
        : {}),
      ...(security.privateKeyPathEnv
        ? { privateKeyFile: this.environment(security.privateKeyPathEnv) }
        : {}),
    });
    let session: any;
    try {
      await client.connect(connection.endpointUrl);
      const endpoints = await client.getEndpoints();
      session = await client.createSession(this.identity(connection));
      return await callback(session, endpoints);
    } catch (error) {
      throw new BadGatewayException(
        `Read-only OPC-UA-Prüfung fehlgeschlagen: ${this.safeError(error)}`,
      );
    } finally {
      if (session) await session.close().catch(() => undefined);
      await client.disconnect().catch(() => undefined);
    }
  }

  private identity(connection: MachineConnectionProfile) {
    const authentication = connection.authentication;
    if (authentication.type === 'anonymous') return undefined;
    if (authentication.type === 'username') {
      return {
        type: opcua.UserTokenType.UserName,
        userName: this.environment(authentication.usernameEnv || ''),
        password: this.environment(authentication.passwordEnv || ''),
      };
    }
    const certificatePath = this.environment(
      authentication.certificatePathEnv || '',
    );
    const privateKeyPath = this.environment(
      connection.security.privateKeyPathEnv || '',
    );
    return {
      type: opcua.UserTokenType.Certificate,
      certificateData: readFileSync(certificatePath),
      privateKey: readFileSync(privateKeyPath, 'utf8'),
    };
  }

  private environment(name: string): string {
    if (!name) throw new Error('Erforderliche Environment-Referenz fehlt');
    const value = this.config.get<string>(name)?.trim();
    if (!value) throw new Error(`Umgebungsvariable ${name} ist nicht gesetzt`);
    return value;
  }

  private async namespaceArray(session: any): Promise<string[]> {
    const value = await session.readVariableValue('i=2255');
    if (!value?.statusCode?.isGood() || !Array.isArray(value?.value?.value)) {
      throw new Error('Namespace-Liste konnte nicht gelesen werden');
    }
    return value.value.value.map(String);
  }

  private resolveNodeId(
    profile: MachineProfile,
    signal: MachineSignalProfile,
    indexes: ReadonlyMap<string, number>,
  ): string | undefined {
    const identifier = signal.identifier.trim();
    if (/^ns=\d+;[isgb]=/.test(identifier)) return identifier;
    const namespace = profile.namespaces.find(
      (candidate) => candidate.key === signal.namespace,
    );
    const index = namespace ? indexes.get(namespace.uri) : undefined;
    if (index === undefined) return undefined;
    return `ns=${index};${/^[isgb]=/.test(identifier) ? identifier : `s=${identifier}`}`;
  }

  private dataType(value: any): string | null {
    if (!value?.statusCode?.isGood()) return null;
    const nodeId = value?.value?.value;
    return (
      BUILTIN_DATA_TYPES[Number(nodeId?.value)] || nodeId?.toString() || null
    );
  }

  private access(value: any): 'read' | 'write' | 'readWrite' | 'none' {
    if (!value?.statusCode?.isGood()) return 'none';
    const flags = Number(value.value.value);
    const read = Boolean(flags & Number(opcua.AccessLevelFlag.CurrentRead));
    const write = Boolean(flags & Number(opcua.AccessLevelFlag.CurrentWrite));
    return read && write
      ? 'readWrite'
      : read
        ? 'read'
        : write
          ? 'write'
          : 'none';
  }

  private text(value: any): string {
    return value?.name || value?.text || value?.toString?.() || '';
  }

  private station(profile: MachineProfile, stationId: string) {
    const station = profile.stations.find(
      (candidate) => candidate.stationId === stationId,
    );
    if (!station) throw new NotFoundException('Station nicht gefunden');
    return station;
  }

  private stationFailure(
    profile: MachineProfile,
    station: MachineStationProfile,
    error: unknown,
  ) {
    const connection = station.connection || profile.connection;
    return {
      stationId: station.stationId,
      endpoint: this.safeEndpoint(connection.endpointUrl),
      valid: false,
      readOnly: true,
      checkedAt: new Date().toISOString(),
      error: this.safeError(error),
    };
  }

  private safeEndpoint(endpoint: string) {
    return endpoint.replace(/^(opc\.tcp:\/\/)[^/@]+@/i, '$1[geschützt]@');
  }

  private safeError(error: unknown): string {
    let message = error instanceof Error ? error.message : String(error);
    for (const value of Object.values(process.env)) {
      if (value && value.length >= 4)
        message = message.split(value).join('[geschützt]');
    }
    return message
      .replace(/(opc\.tcp:\/\/)[^/\s@]+@/gi, '$1[geschützt]@')
      .replace(
        /(password|private.?key|certificate)\s*[=:]\s*\S+/gi,
        '$1=[geschützt]',
      );
  }
}
