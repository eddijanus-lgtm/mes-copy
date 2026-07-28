import {
  BadGatewayException,
  ForbiddenException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'node:fs';
import { MachineProfileService } from '../machines/profiles/machine-profile.service';
import type {
  MachineConnectionProfile,
  MachineProfile,
  MachineSignalProfile,
  MachineStationProfile,
} from '../machines/profiles/machine-profile.types';
import { ShopfloorTelemetryEvent } from './shopfloor-telemetry';
import { OpcUaDataQuality, opcUaDataQuality } from './opcua-data-quality';

const nodeOpcua = require('node-opcua');

export interface OpcUaConfiguredSignal {
  readonly resourceId: number;
  readonly key: string;
  readonly role: MachineSignalProfile['role'];
  readonly nodeId: string;
  readonly dataType: MachineSignalProfile['dataType'];
  readonly access: MachineSignalProfile['access'];
  readonly direction: MachineSignalProfile['direction'];
  readonly required: boolean;
  readonly scaling?: MachineSignalProfile['scaling'];
  readonly event?: MachineSignalProfile['event'];
  readonly metadata?: MachineSignalProfile['metadata'];
}

interface OpcUaConfiguredStation {
  readonly resourceId: number;
  readonly stationId: string;
  readonly displayName: string;
  readonly runtimeKey: string;
  readonly signals: ReadonlyMap<string, OpcUaConfiguredSignal>;
}

interface OpcUaRuntime {
  readonly key: string;
  readonly connection: MachineConnectionProfile;
  readonly resourceIds: Set<number>;
  client?: any;
  session?: any;
  connected: boolean;
  connecting: boolean;
  reconnectAttempts: number;
  reconnectTimer?: NodeJS.Timeout;
  pollingTimer?: NodeJS.Timeout;
  polling: boolean;
  subscription?: any;
  monitoredItems: any[];
}

@Injectable()
export class OpcUaService implements OnModuleInit, OnModuleDestroy {
  private client: any;
  private session: any;
  private readonly logger = new Logger(OpcUaService.name);
  private connected = false;
  private shuttingDown = false;
  private address = '';
  private profile?: MachineProfile;
  private stations: readonly OpcUaConfiguredStation[] = [];
  private readonly telemetryCallbacks = new Set<
    (event: ShopfloorTelemetryEvent) => void
  >();
  private readonly stMesCallbacks = new Set<
    (resourceId: number, active: boolean) => void
  >();
  private readonly processCompletedCallbacks = new Set<
    (resourceId: number, timestamp: Date) => void
  >();
  private readonly carrierInventoryChangedCallbacks = new Set<
    (resourceId: number) => void
  >();
  private readonly connectedCallbacks = new Set<() => void>();
  private readonly disconnectedCallbacks = new Set<(reason: string) => void>();
  private readonly lastCompletionTimestamp = new Map<number, number>();
  private readonly lastMonitoredValues = new Map<string, unknown>();
  private readonly runtimes = new Map<string, OpcUaRuntime>();

  constructor(
    private readonly configService: ConfigService,
    private readonly machineProfileService: MachineProfileService,
  ) {}

  async onModuleInit() {
    this.profile = this.machineProfileService.getProfile();
    this.address = this.profile.connection.endpointUrl.trim();
    this.stations = this.buildConfiguredStations(this.profile);
    this.buildRuntimes(this.profile);
    await Promise.all(
      [...this.runtimes.values()].map((runtime) => this.connect(runtime)),
    );
  }

  async onModuleDestroy() {
    this.shuttingDown = true;
    for (const runtime of this.runtimes.values()) {
      if (runtime.reconnectTimer) clearTimeout(runtime.reconnectTimer);
      if (runtime.pollingTimer) clearInterval(runtime.pollingTimer);
    }
    await Promise.all(
      [...this.runtimes.values()].map((runtime) =>
        this.closeConnection(runtime),
      ),
    );
  }

  getConfiguredSignal(
    resourceId: number,
    signalKey: string,
  ): OpcUaConfiguredSignal {
    const station = this.stations.find(
      (candidate) => candidate.resourceId === resourceId,
    );
    if (!station) {
      throw new ServiceUnavailableException(
        `No enabled profile station for resource ${resourceId}`,
      );
    }

    const signal = station.signals.get(signalKey);
    if (!signal) {
      throw new ServiceUnavailableException(
        `Signal ${signalKey} is not configured for resource ${resourceId}`,
      );
    }
    if (!signal.nodeId) {
      throw new ServiceUnavailableException(
        `Signal ${signalKey} for resource ${resourceId} has not been resolved`,
      );
    }
    return signal;
  }

  getConfiguredSignalByRole(
    resourceId: number,
    role: MachineSignalProfile['role'],
  ): OpcUaConfiguredSignal {
    const station = this.station(resourceId);
    const matches = [...station.signals.values()].filter(
      (signal) => signal.role === role,
    );
    if (matches.length !== 1) {
      throw new ServiceUnavailableException(
        `Expected exactly one ${role} signal for resource ${resourceId}, found ${matches.length}`,
      );
    }
    return matches[0];
  }

  getConfiguredSignalsByRole(
    resourceId: number,
    role: MachineSignalProfile['role'],
  ): readonly OpcUaConfiguredSignal[] {
    return [...this.station(resourceId).signals.values()].filter(
      (signal) => signal.role === role,
    );
  }

  async readNode(resourceId: number, nodeId: string): Promise<any>;
  async readNode(nodeId: string): Promise<any>;
  async readNode(
    resourceIdOrNodeId: number | string,
    scopedNodeId?: string,
  ): Promise<any> {
    const resourceId =
      typeof resourceIdOrNodeId === 'number'
        ? resourceIdOrNodeId
        : this.resourceForNode(resourceIdOrNodeId);
    const nodeId =
      typeof resourceIdOrNodeId === 'number'
        ? scopedNodeId!
        : resourceIdOrNodeId;
    const dataValue = await this.readNodeDataValue(resourceId, nodeId);
    return dataValue?.value?.value;
  }

  private async readNodeDataValue(
    resourceId: number,
    nodeId: string,
  ): Promise<any> {
    if (!this.isNodeAllowed(resourceId, nodeId)) {
      throw new ForbiddenException('OPC UA node is not allowed');
    }
    const runtime = this.runtimeForResource(resourceId);
    const session = runtime?.session ?? this.session;
    const connected = runtime ? runtime.connected : this.connected;
    if (!session || !connected) {
      throw new ServiceUnavailableException('OPC UA server is not connected');
    }
    try {
      const dataValue = await session.readVariableValue(
        nodeOpcua.resolveNodeId(nodeId),
      );
      return dataValue;
    } catch (error) {
      throw new BadGatewayException(
        'OPC UA read failed: ' + (error as Error).message,
      );
    }
  }

  async writeNodes(
    nodes: Array<{
      resourceId?: number;
      nodeId: string;
      dataType: string;
      value: unknown;
    }>,
  ): Promise<void> {
    if (this.profile?.operatingMode !== 'control') {
      throw new ForbiddenException(
        `OPC UA writes are disabled in ${this.profile?.operatingMode || 'unknown'} mode`,
      );
    }
    const scopedNodes = nodes.map((node) => ({
      ...node,
      resourceId: node.resourceId ?? this.resourceForNode(node.nodeId),
    }));
    if (
      scopedNodes.some(
        (node) => !this.isNodeAllowed(node.resourceId, node.nodeId),
      )
    ) {
      throw new ForbiddenException('OPC UA node is not allowed');
    }
    const groups = new Map<any, typeof scopedNodes>();
    for (const node of scopedNodes) {
      const runtime = this.runtimeForResource(node.resourceId);
      const session = runtime?.session ?? this.session;
      const connected = runtime ? runtime.connected : this.connected;
      if (!session || !connected) {
        throw new ServiceUnavailableException('OPC UA server is not connected');
      }
      groups.set(session, [...(groups.get(session) || []), node]);
    }
    for (const [session, group] of groups) {
      const writes = group.map((node) => ({
        nodeId: node.nodeId,
        attributeId: nodeOpcua.AttributeIds.Value,
        value: {
          value: new nodeOpcua.Variant({
            dataType: nodeOpcua.DataType[node.dataType],
            value: node.value,
          }),
        },
      }));
      const results = await session.write(writes);
      const failed = results.find((statusCode) => !statusCode.isGood());
      if (failed) {
        throw new BadGatewayException(
          'OPC UA write failed: ' + failed.toString(),
        );
      }
    }
  }

  isConnected(): boolean {
    return this.runtimes.size
      ? [...this.runtimes.values()].some((runtime) => runtime.connected)
      : this.connected;
  }

  async getServerStatus() {
    return {
      connected: this.isConnected(),
      endpoint:
        this.address || this.profile?.connection.endpointUrl.trim() || '',
      machineId: this.profile?.machineId,
      displayName: this.profile?.displayName,
      operatingMode: this.profile?.operatingMode,
      resultCodes: this.profile?.resultCodes || {},
      stations: this.stations.map((station) => ({
        resourceId: station.resourceId,
        stationId: station.stationId,
        displayName: station.displayName,
        endpoint:
          this.runtimeForResource(
            station.resourceId,
          )?.connection.endpointUrl.trim() || this.address,
        connected:
          this.runtimeForResource(station.resourceId)?.connected ??
          this.connected,
      })),
    };
  }

  onTelemetry(callback: (event: ShopfloorTelemetryEvent) => void): () => void {
    this.telemetryCallbacks.add(callback);
    return () => this.telemetryCallbacks.delete(callback);
  }

  onStMesRequest(
    callback: (resourceId: number, active: boolean) => void,
  ): () => void {
    this.stMesCallbacks.add(callback);
    return () => this.stMesCallbacks.delete(callback);
  }

  onProcessCompleted(
    callback: (resourceId: number, timestamp: Date) => void,
  ): () => void {
    this.processCompletedCallbacks.add(callback);
    return () => this.processCompletedCallbacks.delete(callback);
  }

  onCarrierInventoryChanged(
    callback: (resourceId: number) => void,
  ): () => void {
    this.carrierInventoryChangedCallbacks.add(callback);
    return () => this.carrierInventoryChangedCallbacks.delete(callback);
  }

  onConnected(callback: () => void): () => void {
    this.connectedCallbacks.add(callback);
    return () => this.connectedCallbacks.delete(callback);
  }

  onDisconnected(callback: (reason: string) => void): () => void {
    this.disconnectedCallbacks.add(callback);
    return () => this.disconnectedCallbacks.delete(callback);
  }

  publishStMesEvent(payload: Record<string, unknown>) {
    this.emitTelemetry({ kind: 'stmes.handshake', ...payload });
  }

  private async connect(runtime: OpcUaRuntime) {
    if (
      runtime.connecting ||
      runtime.connected ||
      this.shuttingDown ||
      !this.profile
    ) {
      return;
    }
    runtime.connecting = true;

    try {
      const reconnect = runtime.connection.reconnect;
      const security = runtime.connection.security;
      runtime.client = nodeOpcua.OPCUAClient.create({
        applicationName: runtime.connection.applicationName,
        endpointMustExist: false,
        securityMode: nodeOpcua.MessageSecurityMode[security.mode],
        securityPolicy: nodeOpcua.SecurityPolicy[security.policy],
        ...(security.certificatePathEnv
          ? {
              certificateFile: this.requiredEnvironmentValue(
                security.certificatePathEnv,
              ),
            }
          : {}),
        ...(security.privateKeyPathEnv
          ? {
              privateKeyFile: this.requiredEnvironmentValue(
                security.privateKeyPathEnv,
              ),
            }
          : {}),
        connectionStrategy: {
          initialDelay: reconnect.initialDelayMs,
          maxDelay: reconnect.maximumDelayMs,
          maxRetry: 0,
        },
        connectionTimeout: runtime.connection.connectionTimeoutMs,
        requestedSessionTimeout: runtime.connection.sessionTimeoutMs,
      });
      runtime.client.on('connection_lost', () =>
        this.handleDisconnect(runtime, 'connection lost'),
      );

      await runtime.client.connect(runtime.connection.endpointUrl.trim());
      runtime.session = await runtime.client.createSession(
        this.userIdentity(runtime.connection),
      );
      const resolved = await this.resolveConfiguredStations(
        this.profile,
        runtime,
      );
      this.stations = this.stations.map(
        (station) =>
          resolved.find(
            (candidate) => candidate.resourceId === station.resourceId,
          ) || station,
      );
      const wasConnected = this.isConnected();
      runtime.connected = true;
      runtime.reconnectAttempts = 0;
      this.syncLegacyState();
      this.logger.log(
        `Connected to ${this.profile.machineId} at ${runtime.connection.endpointUrl.trim()} with ${runtime.resourceIds.size} station(s)`,
      );
      await this.startProfileSubscriptions(runtime);
      this.startPolling(runtime);
      if (!wasConnected) {
        for (const callback of this.connectedCallbacks) {
          try {
            callback();
          } catch (error) {
            this.logger.error('connected callback failed', error);
          }
        }
      }
    } catch (error) {
      runtime.connected = false;
      this.syncLegacyState();
      this.logger.warn(
        `OPC UA connection to ${runtime.connection.endpointUrl.trim()} failed: ${(error as Error).message}`,
      );
      await this.closeConnection(runtime);
      this.scheduleReconnect(runtime);
    } finally {
      runtime.connecting = false;
    }
  }

  private buildRuntimes(profile: MachineProfile) {
    this.runtimes.clear();
    for (const station of profile.stations.filter(
      (candidate) => candidate.enabled,
    )) {
      const resourceId = this.resourceId(station);
      const connection = this.stationConnection(station) || profile.connection;
      const key = this.stationConnection(station)
        ? `station:${resourceId}`
        : 'legacy';
      let runtime = this.runtimes.get(key);
      if (!runtime) {
        runtime = {
          key,
          connection,
          resourceIds: new Set(),
          connected: false,
          connecting: false,
          reconnectAttempts: 0,
          polling: false,
          monitoredItems: [],
        };
        this.runtimes.set(key, runtime);
      }
      runtime.resourceIds.add(resourceId);
    }
  }

  private buildConfiguredStations(
    profile: MachineProfile,
    namespaceIndexes?: ReadonlyMap<string, number>,
  ): readonly OpcUaConfiguredStation[] {
    return profile.stations
      .filter((station) => station.enabled)
      .map((station) => {
        const resourceId = this.resourceId(station);
        const signals = new Map<string, OpcUaConfiguredSignal>();
        for (const signal of station.signals) {
          if (signals.has(signal.key)) {
            throw new Error(
              `Duplicate signal key ${signal.key} in station ${station.stationId}`,
            );
          }
          signals.set(signal.key, {
            resourceId,
            key: signal.key,
            role: signal.role,
            nodeId: this.resolveSignalNodeId(profile, signal, namespaceIndexes),
            dataType: signal.dataType,
            access: signal.access,
            direction: signal.direction,
            required: signal.required,
            scaling: signal.scaling,
            event: signal.event,
            metadata: signal.metadata,
          });
        }
        return {
          resourceId,
          stationId: station.stationId,
          displayName: station.displayName,
          runtimeKey: this.stationConnection(station)
            ? `station:${resourceId}`
            : 'legacy',
          signals,
        };
      });
  }

  private async resolveConfiguredStations(
    profile: MachineProfile,
    runtime: OpcUaRuntime,
  ): Promise<readonly OpcUaConfiguredStation[]> {
    const runtimeStations = profile.stations.filter((station) =>
      runtime.resourceIds.has(station.resourceId),
    );
    const requiresNamespaceResolution = runtimeStations.some((station) =>
      station.signals.some(
        (signal) => !signal.identifier.trim().startsWith('ns='),
      ),
    );
    if (!requiresNamespaceResolution) {
      return this.buildConfiguredStations({
        ...profile,
        stations: runtimeStations,
      });
    }

    const namespaceValue = await runtime.session.readVariableValue('i=2255');
    const namespaceArray = namespaceValue?.value?.value;
    if (!Array.isArray(namespaceArray)) {
      throw new Error('OPC UA NamespaceArray could not be read');
    }
    const namespaceIndexes = new Map<string, number>();
    namespaceArray.forEach((uri: unknown, index: number) => {
      if (typeof uri === 'string') namespaceIndexes.set(uri, index);
    });
    return this.buildConfiguredStations(
      { ...profile, stations: runtimeStations },
      namespaceIndexes,
    );
  }

  private resolveSignalNodeId(
    profile: MachineProfile,
    signal: MachineSignalProfile,
    namespaceIndexes?: ReadonlyMap<string, number>,
  ): string {
    const identifier = signal.identifier.trim();
    if (identifier.startsWith('ns=')) return identifier;
    if (!namespaceIndexes) return '';

    const namespace = profile.namespaces.find(
      (candidate) => candidate.key === signal.namespace,
    );
    if (!namespace) {
      throw new Error(
        `Unknown namespace key ${signal.namespace} for signal ${signal.key}`,
      );
    }
    const namespaceIndex = namespaceIndexes.get(namespace.uri);
    if (namespaceIndex === undefined) {
      throw new Error(
        `Namespace URI ${namespace.uri} is not exposed by the OPC UA server`,
      );
    }

    const normalizedIdentifier = /^(s|i|g|b)=/.test(identifier)
      ? identifier
      : `s=${identifier}`;
    return `ns=${namespaceIndex};${normalizedIdentifier}`;
  }

  private resourceId(station: MachineStationProfile): number {
    const resourceId = station.resourceId;
    if (!Number.isInteger(resourceId) || resourceId <= 0) {
      throw new Error(
        `Station ${station.stationId} requires a positive integer resourceId`,
      );
    }
    return resourceId;
  }

  private isNodeAllowed(resourceId: number, nodeId: string): boolean {
    return [...this.station(resourceId).signals.values()].some(
      (signal) => signal.nodeId === nodeId,
    );
  }

  private startPolling(runtime: OpcUaRuntime) {
    if (runtime.pollingTimer) clearInterval(runtime.pollingTimer);
    void this.pollTelemetry(runtime);
    runtime.pollingTimer = setInterval(
      () => void this.pollTelemetry(runtime),
      1000,
    );
  }

  private async pollTelemetry(runtime: OpcUaRuntime) {
    if (runtime.polling || !runtime.connected || !runtime.session) return;
    runtime.polling = true;
    try {
      for (const station of this.stations.filter(
        (candidate) => candidate.runtimeKey === runtime.key,
      )) {
        const readableSignals = [...station.signals.values()].filter(
          (signal) =>
            signal.direction === 'machineToMes' &&
            (signal.access === 'read' || signal.access === 'readWrite'),
        );
        const values: Array<[string, unknown]> = [];
        const qualities: Array<[string, OpcUaDataQuality]> = [];
        const signalErrors: Record<string, string> = {};
        for (const signal of readableSignals) {
          try {
            const dataValue = await this.readNodeDataValue(
              station.resourceId,
              signal.nodeId,
            );
            const rawValue = dataValue?.value?.value;
            values.push([signal.key, this.fromMachineValue(signal, rawValue)]);
            qualities.push([
              signal.key,
              opcUaDataQuality(dataValue?.statusCode),
            ]);
          } catch (error) {
            if (signal.required) throw error;
            signalErrors[signal.key] = (error as Error).message;
          }
        }
        this.emitTelemetry({
          kind: 'station.snapshot',
          resourceId: station.resourceId,
          stationId: station.stationId,
          displayName: station.displayName,
          signals: Object.fromEntries(values),
          signalQualities: Object.fromEntries(qualities),
          roles: Object.fromEntries(
            readableSignals
              .filter(
                (signal) =>
                  signal.role !== 'custom' &&
                  signal.role !== 'routingParameter',
              )
              .map((signal) => [
                signal.role,
                values.find(([key]) => key === signal.key)?.[1],
              ]),
          ),
          roleQualities: Object.fromEntries(
            readableSignals
              .filter(
                (signal) =>
                  signal.role !== 'custom' &&
                  signal.role !== 'routingParameter',
              )
              .map((signal) => [
                signal.role,
                qualities.find(([key]) => key === signal.key)?.[1] ??
                  'uncertain',
              ]),
          ),
          ...(Object.keys(signalErrors).length ? { signalErrors } : {}),
        });
      }
    } catch (error) {
      this.logger.warn(
        'OPC UA telemetry read failed: ' + (error as Error).message,
      );
      this.handleDisconnect(runtime, 'telemetry read failed');
    } finally {
      runtime.polling = false;
    }
  }

  private async startProfileSubscriptions(runtime: OpcUaRuntime) {
    const subscriptions = this.stations
      .filter((station) => station.runtimeKey === runtime.key)
      .flatMap((station) => {
        const workRequest = [...station.signals.values()].find(
          (signal) => signal.role === 'workRequest',
        );
        const processCompleted = [...station.signals.values()].find(
          (signal) => signal.role === 'processCompleted',
        );
        const inventoryRevision = [...station.signals.values()].find(
          (signal) => signal.role === 'inventoryRevision',
        );
        return [
          ...(workRequest
            ? [{ station, signal: workRequest, type: 'workRequest' as const }]
            : []),
          ...(processCompleted
            ? [
                {
                  station,
                  signal: processCompleted,
                  type: 'processCompleted' as const,
                },
              ]
            : []),
          ...(inventoryRevision
            ? [
                {
                  station,
                  signal: inventoryRevision,
                  type: 'inventoryRevision' as const,
                },
              ]
            : []),
        ];
      });
    if (subscriptions.length === 0) return;

    runtime.subscription = await runtime.session.createSubscription2({
      requestedPublishingInterval: 250,
      requestedLifetimeCount: 120,
      requestedMaxKeepAliveCount: 10,
      maxNotificationsPerPublish: Math.max(20, subscriptions.length * 2),
      publishingEnabled: true,
      priority: 10,
    });

    for (const entry of subscriptions) {
      const item = nodeOpcua.ClientMonitoredItem.create(
        runtime.subscription,
        {
          nodeId: entry.signal.nodeId,
          attributeId: nodeOpcua.AttributeIds.Value,
        },
        { samplingInterval: 100, discardOldest: true, queueSize: 10 },
        nodeOpcua.TimestampsToReturn.Both,
      );
      item.on('changed', (dataValue) => {
        const monitorKey = `${entry.station.resourceId}:${entry.signal.key}`;
        const rawValue = dataValue?.value?.value;
        const previousValue = this.lastMonitoredValues.get(monitorKey);
        this.lastMonitoredValues.set(monitorKey, rawValue);
        if (entry.type === 'workRequest') {
          const active = Boolean(rawValue);
          if (
            previousValue === undefined
              ? !active
              : !this.triggerMatches(
                  entry.signal.event?.trigger || 'change',
                  Boolean(previousValue),
                  active,
                )
          ) {
            return;
          }
          for (const callback of this.stMesCallbacks) {
            callback(entry.station.resourceId, active);
          }
          return;
        }

        if (entry.type === 'inventoryRevision') {
          if (
            previousValue !== undefined &&
            Object.is(previousValue, rawValue)
          ) {
            return;
          }
          for (const callback of this.carrierInventoryChangedCallbacks) {
            callback(entry.station.resourceId);
          }
          return;
        }

        if (entry.signal.dataType === 'Boolean') {
          if (
            !this.triggerMatches(
              entry.signal.event?.trigger || 'rising',
              Boolean(previousValue),
              Boolean(rawValue),
            )
          ) {
            return;
          }
          const eventTimestamp =
            dataValue?.sourceTimestamp ||
            dataValue?.serverTimestamp ||
            new Date();
          for (const callback of this.processCompletedCallbacks) {
            callback(entry.station.resourceId, new Date(eventTimestamp));
          }
          return;
        }

        const timestamp = new Date(rawValue);
        const timestampMs = timestamp.getTime();
        if (
          !Number.isFinite(timestampMs) ||
          timestamp.getUTCFullYear() <= 1970 ||
          this.lastCompletionTimestamp.get(entry.station.resourceId) ===
            timestampMs
        ) {
          return;
        }
        this.lastCompletionTimestamp.set(entry.station.resourceId, timestampMs);
        for (const callback of this.processCompletedCallbacks) {
          callback(entry.station.resourceId, timestamp);
        }
      });
      item.on('err', (error) =>
        this.logger.error(
          `${entry.type} monitor error for resource ${entry.station.resourceId}: ${error.message}`,
        ),
      );
      runtime.monitoredItems.push(item);
    }

    for (const resourceId of new Set(
      subscriptions
        .filter((entry) => entry.type === 'inventoryRevision')
        .map((entry) => entry.station.resourceId),
    )) {
      for (const callback of this.carrierInventoryChangedCallbacks) {
        callback(resourceId);
      }
    }
  }

  private emitTelemetry(payload: Record<string, unknown>) {
    const event: ShopfloorTelemetryEvent = {
      type: 'shopfloor.telemetry',
      timestamp: new Date().toISOString(),
      source: 'opcua',
      payload,
    };
    for (const callback of this.telemetryCallbacks) {
      try {
        callback(event);
      } catch (error) {
        this.logger.error('OPC UA telemetry callback failed', error);
      }
    }
  }

  private handleDisconnect(runtime: OpcUaRuntime, reason: string) {
    if (!runtime.connected && !runtime.session) return;
    this.logger.warn(
      `OPC UA disconnected from ${runtime.connection.endpointUrl.trim()}: ${reason}`,
    );
    runtime.connected = false;
    if (runtime.pollingTimer) clearInterval(runtime.pollingTimer);
    runtime.pollingTimer = undefined;
    this.syncLegacyState();
    if (!this.isConnected()) {
      for (const callback of this.disconnectedCallbacks) {
        try {
          callback(reason);
        } catch (error) {
          this.logger.error('disconnected callback failed', error);
        }
      }
    }
    void this.closeConnection(runtime).finally(() =>
      this.scheduleReconnect(runtime),
    );
  }

  private scheduleReconnect(runtime: OpcUaRuntime) {
    if (
      this.shuttingDown ||
      runtime.reconnectTimer ||
      !runtime.connection.reconnect.enabled
    ) {
      return;
    }
    const reconnect = runtime.connection.reconnect;
    if (
      reconnect.maxAttempts !== undefined &&
      reconnect.maxAttempts > 0 &&
      runtime.reconnectAttempts >= reconnect.maxAttempts
    ) {
      this.logger.error(
        `Reconnect limit ${reconnect.maxAttempts} reached for ${runtime.connection.endpointUrl.trim()}`,
      );
      return;
    }
    const delay = Math.min(
      reconnect.maximumDelayMs,
      reconnect.initialDelayMs *
        reconnect.backoffMultiplier ** runtime.reconnectAttempts,
    );
    runtime.reconnectAttempts += 1;
    runtime.reconnectTimer = setTimeout(() => {
      runtime.reconnectTimer = undefined;
      void this.connect(runtime);
    }, delay);
  }

  private station(resourceId: number): OpcUaConfiguredStation {
    const station = this.stations.find(
      (candidate) => candidate.resourceId === resourceId,
    );
    if (!station) {
      throw new ServiceUnavailableException(
        `No enabled profile station for resource ${resourceId}`,
      );
    }
    return station;
  }

  private stationConnection(
    station: MachineStationProfile,
  ): MachineConnectionProfile | undefined {
    return (
      station as MachineStationProfile & {
        readonly connection?: MachineConnectionProfile;
      }
    ).connection;
  }

  private runtimeForResource(resourceId: number): OpcUaRuntime | undefined {
    const station = this.stations.find(
      (candidate) => candidate.resourceId === resourceId,
    );
    return station ? this.runtimes.get(station.runtimeKey) : undefined;
  }

  private resourceForNode(nodeId: string): number {
    const resourceIds = this.stations
      .filter((station) =>
        [...station.signals.values()].some(
          (signal) => signal.nodeId === nodeId,
        ),
      )
      .map((station) => station.resourceId);
    if (resourceIds.length !== 1) {
      if (resourceIds.length === 0) {
        throw new ForbiddenException('OPC UA node is not allowed');
      }
      throw new ServiceUnavailableException(
        'OPC UA node is configured for multiple resources; resourceId is required',
      );
    }
    return resourceIds[0];
  }

  private syncLegacyState() {
    const legacy = this.runtimes.get('legacy');
    this.client = legacy?.client;
    this.session = legacy?.session;
    this.connected = this.runtimes.size
      ? [...this.runtimes.values()].some((runtime) => runtime.connected)
      : this.connected;
  }

  private requiredEnvironmentValue(name: string): string {
    const value = this.configService.get<string>(name)?.trim();
    if (!value) {
      throw new Error(
        `Required OPC UA environment variable ${name} is missing`,
      );
    }
    return value;
  }

  private userIdentity(connection: MachineConnectionProfile): unknown {
    const authentication = connection.authentication;
    if (authentication.type === 'anonymous') return undefined;
    if (authentication.type === 'username') {
      if (!authentication.usernameEnv || !authentication.passwordEnv) {
        throw new Error(
          'Username authentication requires usernameEnv and passwordEnv',
        );
      }
      return {
        type: nodeOpcua.UserTokenType.UserName,
        userName: this.requiredEnvironmentValue(authentication.usernameEnv),
        password: this.requiredEnvironmentValue(authentication.passwordEnv),
      };
    }
    if (!authentication.certificatePathEnv) {
      throw new Error('Certificate authentication requires certificatePathEnv');
    }
    const certificatePath = this.requiredEnvironmentValue(
      authentication.certificatePathEnv,
    );
    const privateKeyEnv = connection.security.privateKeyPathEnv;
    if (!privateKeyEnv) {
      throw new Error(
        'Certificate authentication requires security.privateKeyPathEnv',
      );
    }
    return {
      type: nodeOpcua.UserTokenType.Certificate,
      certificateData: readFileSync(certificatePath),
      privateKey: readFileSync(
        this.requiredEnvironmentValue(privateKeyEnv),
        'utf8',
      ),
    };
  }

  private fromMachineValue(
    signal: OpcUaConfiguredSignal,
    value: unknown,
  ): unknown {
    if (!signal.scaling || typeof value !== 'number') return value;
    return value * signal.scaling.factor + signal.scaling.offset;
  }

  private triggerMatches(
    trigger: 'change' | 'rising' | 'falling',
    previous: boolean,
    current: boolean,
  ): boolean {
    if (trigger === 'rising') return !previous && current;
    if (trigger === 'falling') return previous && !current;
    return previous !== current;
  }

  private async closeConnection(runtime: OpcUaRuntime) {
    const session = runtime.session;
    const client = runtime.client;
    runtime.session = undefined;
    runtime.client = undefined;
    runtime.connected = false;
    runtime.monitoredItems = [];
    try {
      if (runtime.subscription) await runtime.subscription.terminate();
    } catch (error) {
      this.logger.warn(
        'OPC UA subscription close failed: ' + (error as Error).message,
      );
    }
    runtime.subscription = undefined;
    try {
      if (session) await session.close();
    } catch (error) {
      this.logger.warn(
        'OPC UA session close failed: ' + (error as Error).message,
      );
    }
    try {
      if (client) await client.disconnect();
    } catch (error) {
      this.logger.warn('OPC UA disconnect failed: ' + (error as Error).message);
    }
    this.syncLegacyState();
  }
}
