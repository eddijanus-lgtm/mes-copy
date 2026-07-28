import {
  BadRequestException,
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
import {
  isMachineConnectionProfile,
  machineConnectionSemanticErrors,
} from './machine-profile.service';

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

  async testConnectionConfig(rawConnection: unknown) {
    return this.connectionDetails(this.connection(rawConnection));
  }

  async testConnection(profile: MachineProfile, stationId?: string) {
    if (stationId) {
      return this.testStationConnection(
        profile,
        this.station(profile, stationId),
      );
    }
    const enabledStations = profile.stations.filter(
      (station) => station.enabled,
    );
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
    const result = await this.connectionDetails(connection);
    return { ...result, stationId: station.stationId };
  }

  private async connectionDetails(connection: MachineConnectionProfile) {
    return this.readOnlySession(connection, async (session, endpoints) => {
      const namespaces = await this.namespaceArray(session);
      return {
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
    const result = await this.browseWithConnection(
      connection,
      nodeId,
      maxNodes,
    );
    return { ...(station ? { stationId: station.stationId } : {}), ...result };
  }

  async browseConnection(
    rawConnection: unknown,
    nodeId = 'i=85',
    maxNodes = 200,
  ) {
    return this.browseWithConnection(
      this.connection(rawConnection),
      nodeId,
      maxNodes,
    );
  }

  async discoverSignals(
    rawConnection: unknown,
    rootNodeId = 'i=85',
    maxDepth = 6,
    maxNodes = 2000,
  ) {
    const connection = this.connection(rawConnection);
    return this.readOnlySession(connection, async (session) => {
      const namespaceArray = await this.namespaceArray(session);
      const queue = [{ nodeId: rootNodeId, path: '', depth: 0 }];
      const siemensNamespaceIndex = namespaceArray.indexOf(
        'http://www.siemens.com/simatic-s7-opcua',
      );
      if (siemensNamespaceIndex >= 0) {
        queue.push({
          nodeId: `ns=${siemensNamespaceIndex};s="dbProcessData"`,
          path: 'dbProcessData',
          depth: 0,
        });
      }
      const visited = new Set<string>();
      const signals: Record<string, unknown>[] = [];
      const unmappedSignals: Record<string, unknown>[] = [];
      let scannedNodes = 0;
      let candidateVariables = 0;

      while (queue.length && scannedNodes < maxNodes) {
        const current = queue.shift()!;
        if (visited.has(current.nodeId) || current.depth >= maxDepth) continue;
        visited.add(current.nodeId);
        const result = await session.browse({
          nodeId: current.nodeId,
          browseDirection: opcua.BrowseDirection.Forward,
          includeSubtypes: true,
          nodeClassMask: 0,
          resultMask: opcua.makeResultMask(
            'ReferenceType | IsForward | BrowseName | DisplayName | NodeClass | TypeDefinition',
          ),
        });

        for (const reference of result.references || []) {
          if (scannedNodes >= maxNodes) break;
          scannedNodes += 1;
          const nodeId = reference.nodeId.toString();
          const nodeClass =
            opcua.NodeClass[Number(reference.nodeClass)] ||
            String(reference.nodeClass);
          const displayName =
            this.text(reference.displayName) || this.text(reference.browseName);
          const path = current.path
            ? `${current.path}/${displayName}`
            : displayName;

          if (nodeClass !== 'Variable') {
            if (nodeClass === 'Object' || nodeClass === 'Folder') {
              queue.push({ nodeId, path, depth: current.depth + 1 });
            }
            continue;
          }

          const namespaceIndex = this.namespaceIndex(nodeId);
          if (namespaceIndex === 0) continue;
          candidateVariables += 1;
          const suggestion = this.signalSuggestion(displayName);
          if (!suggestion) {
            unmappedSignals.push({ nodeId, displayName, path });
            continue;
          }
          const values = await session.read([
            { nodeId, attributeId: opcua.AttributeIds.DataType },
            { nodeId, attributeId: opcua.AttributeIds.UserAccessLevel },
          ]);
          const dataType = this.dataType(values[0]);
          const actualAccess = this.access(values[1]);
          if (!dataType || actualAccess === 'none' || actualAccess === 'write') {
            continue;
          }
          signals.push({
            ...suggestion,
            namespaceIndex,
            namespaceUri: namespaceArray[namespaceIndex] || null,
            namespaceKey: `ns${namespaceIndex}`,
            identifier: this.nodeIdentifier(nodeId),
            nodeId,
            displayName,
            path,
            dataType,
            access: 'read',
            direction: 'machineToMes',
            required: false,
            event: { trigger: 'change' },
          });
        }
      }

      return {
        endpoint: this.safeEndpoint(connection.endpointUrl),
        readOnly: true,
        namespaceArray,
        scannedNodes,
        candidateVariables,
        mappedCount: signals.length,
        unmappedCount: Math.max(0, candidateVariables - signals.length),
        unmappedSignals,
        truncated: queue.length > 0,
        signals,
      };
    });
  }

  private async browseWithConnection(
    connection: MachineConnectionProfile,
    nodeId: string,
    maxNodes: number,
  ) {
    return this.readOnlySession(connection, async (session) => {
      const namespaceArray = await this.namespaceArray(session);
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
          const namespaceIndex = this.namespaceIndex(childNodeId);
          const nodeClass =
            opcua.NodeClass[Number(reference.nodeClass)] ||
            String(reference.nodeClass);
          const base = {
            nodeId: childNodeId,
            browseName: this.text(reference.browseName),
            displayName: this.text(reference.displayName),
            nodeClass,
            namespaceIndex,
            namespaceUri: namespaceArray[namespaceIndex] || null,
            namespaceKey: `ns${namespaceIndex}`,
            identifier: this.nodeIdentifier(childNodeId),
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
        endpoint: this.safeEndpoint(connection.endpointUrl),
        readOnly: true,
        parentNodeId: nodeId,
        namespaceArray,
        nodes,
        truncated: references.length < (result.references || []).length,
      };
    });
  }

  private connection(value: unknown): MachineConnectionProfile {
    if (!isMachineConnectionProfile(value)) {
      throw new BadRequestException(
        'Ungültige OPC-UA-Verbindungskonfiguration',
      );
    }
    const errors = machineConnectionSemanticErrors(value, 'OPC UA');
    if (errors.length) throw new BadRequestException(errors.join('; '));
    return value;
  }

  private namespaceIndex(nodeId: string): number {
    const match = /^ns=(\d+);/.exec(nodeId);
    return match ? Number(match[1]) : 0;
  }

  private nodeIdentifier(nodeId: string): string {
    return nodeId.replace(/^ns=\d+;/, '');
  }

  private signalSuggestion(name: string) {
    const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const exact: Record<string, { key: string; role: string }> = {
      workrequest: { key: 'workRequest', role: 'workRequest' },
      requestbusy: { key: 'requestBusy', role: 'requestBusy' },
      requestaccepted: { key: 'requestAccepted', role: 'requestAccepted' },
      requestrejected: { key: 'requestRejected', role: 'requestRejected' },
      requestcompleted: { key: 'requestCompleted', role: 'requestCompleted' },
      orderid: { key: 'orderId', role: 'orderId' },
      partnumber: { key: 'partNumber', role: 'partNumber' },
      operationid: { key: 'operationId', role: 'operationId' },
      nextstationid: { key: 'nextStationId', role: 'nextStationId' },
      processactive: { key: 'processActive', role: 'processActive' },
      processcompleted: { key: 'processCompleted', role: 'processCompleted' },
      processresult: { key: 'processResult', role: 'processResult' },
      completedcarrierid: {
        key: 'completedCarrierId',
        role: 'completedCarrierId',
      },
      idealcycletimems: { key: 'idealCycleTimeMs', role: 'idealCycleTimeMs' },
      goodcount: { key: 'goodCount', role: 'goodCount' },
      rejectcount: { key: 'rejectCount', role: 'rejectCount' },
    };
    const direct = exact[normalized] || exact[normalized.replace(/^[xib]/, '')];
    if (direct) return { ...direct, confidence: 'high' };
    if (/carrierid$/.test(normalized)) {
      return { key: 'carrierId', role: 'carrierId', confidence: 'high' };
    }
    if (/resourceid$|stationid$/.test(normalized)) {
      return { key: 'resourceId', role: 'resourceId', confidence: 'high' };
    }
    if (/stepno$|stepnumber$/.test(normalized)) {
      return { key: 'stepNumber', role: 'stepNumber', confidence: 'high' };
    }
    if (/timestamp$|datetime$/.test(normalized)) {
      return { key: 'timestamp', role: 'timestamp', confidence: 'high' };
    }
    const parameter = /^(?:i)?par(?:ameter)?0*(\d+)$/.exec(normalized);
    if (parameter) {
      return {
        key: `parameter${Number(parameter[1])}`,
        role: 'routingParameter',
        confidence: 'high',
      };
    }
    return undefined;
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
