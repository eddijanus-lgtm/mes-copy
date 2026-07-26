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
  MachineProfile,
  MachineSignalProfile,
  MachineStationProfile,
} from '../machines/profiles/machine-profile.types';
import { ShopfloorTelemetryEvent } from './shopfloor-telemetry';

const nodeOpcua = require('node-opcua');

export interface OpcUaConfiguredSignal {
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
  readonly signals: ReadonlyMap<string, OpcUaConfiguredSignal>;
}

@Injectable()
export class OpcUaService implements OnModuleInit, OnModuleDestroy {
  private client: any;
  private session: any;
  private readonly logger = new Logger(OpcUaService.name);
  private connected = false;
  private connecting = false;
  private shuttingDown = false;
  private reconnectTimer?: NodeJS.Timeout;
  private pollingTimer?: NodeJS.Timeout;
  private polling = false;
  private subscription: any;
  private monitoredItems: any[] = [];
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
  private readonly disconnectedCallbacks = new Set<
    (reason: string) => void
  >();
  private readonly lastCompletionTimestamp = new Map<number, number>();
  private readonly lastMonitoredValues = new Map<string, unknown>();
  private reconnectAttempts = 0;

  constructor(
    private readonly configService: ConfigService,
    private readonly machineProfileService: MachineProfileService,
  ) {}

  async onModuleInit() {
    this.profile = this.machineProfileService.getProfile();
    this.address = this.profile.connection.endpointUrl.trim();
    this.stations = this.buildConfiguredStations(this.profile);
    await this.connect();
  }

  async onModuleDestroy() {
    this.shuttingDown = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.pollingTimer) clearInterval(this.pollingTimer);
    await this.closeConnection();
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

  async readNode(nodeId: string): Promise<any> {
    if (!this.isNodeAllowed(nodeId)) {
      throw new ForbiddenException('OPC UA node is not allowed');
    }
    if (!this.session || !this.connected) {
      throw new ServiceUnavailableException('OPC UA server is not connected');
    }
    try {
      const dataValue = await this.session.readVariableValue(
        nodeOpcua.resolveNodeId(nodeId),
      );
      return dataValue?.value?.value;
    } catch (error) {
      throw new BadGatewayException(
        'OPC UA read failed: ' + (error as Error).message,
      );
    }
  }

  async writeNodes(
    nodes: Array<{ nodeId: string; dataType: string; value: unknown }>,
  ): Promise<void> {
    if (this.profile?.operatingMode !== 'control') {
      throw new ForbiddenException(
        `OPC UA writes are disabled in ${this.profile?.operatingMode || 'unknown'} mode`,
      );
    }
    if (nodes.some((node) => !this.isNodeAllowed(node.nodeId))) {
      throw new ForbiddenException('OPC UA node is not allowed');
    }
    if (!this.session || !this.connected) {
      throw new ServiceUnavailableException('OPC UA server is not connected');
    }
    const writes = nodes.map((node) => ({
      nodeId: node.nodeId,
      attributeId: nodeOpcua.AttributeIds.Value,
      value: {
        value: new nodeOpcua.Variant({
          dataType: nodeOpcua.DataType[node.dataType],
          value: node.value,
        }),
      },
    }));
    const results = await this.session.write(writes);
    const failed = results.find((statusCode) => !statusCode.isGood());
    if (failed) {
      throw new BadGatewayException(
        'OPC UA write failed: ' + failed.toString(),
      );
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  async getServerStatus() {
    return {
      connected: this.connected,
      endpoint: this.address,
      machineId: this.profile?.machineId,
      displayName: this.profile?.displayName,
      operatingMode: this.profile?.operatingMode,
      resultCodes: this.profile?.resultCodes || {},
      stations: this.stations.map((station) => ({
        resourceId: station.resourceId,
        stationId: station.stationId,
        displayName: station.displayName,
      })),
    };
  }

  onTelemetry(
    callback: (event: ShopfloorTelemetryEvent) => void,
  ): () => void {
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

  private async connect() {
    if (
      this.connecting ||
      this.connected ||
      this.shuttingDown ||
      !this.profile
    ) {
      return;
    }
    this.connecting = true;

    try {
      const reconnect = this.profile.connection.reconnect;
      const security = this.profile.connection.security;
      this.client = nodeOpcua.OPCUAClient.create({
        applicationName: this.profile.connection.applicationName,
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
        connectionTimeout: this.profile.connection.connectionTimeoutMs,
        requestedSessionTimeout: this.profile.connection.sessionTimeoutMs,
      });
      this.client.on('connection_lost', () =>
        this.handleDisconnect('connection lost'),
      );

      await this.client.connect(this.address);
      this.session = await this.client.createSession(
        this.userIdentity(this.profile),
      );
      this.stations = await this.resolveConfiguredStations(this.profile);
      this.connected = true;
      this.reconnectAttempts = 0;
      this.logger.log(
        `Connected to ${this.profile.machineId} at ${this.address} with ${this.stations.length} station(s)`,
      );
      await this.startProfileSubscriptions();
      this.startPolling();
      for (const callback of this.connectedCallbacks) {
        try {
          callback();
        } catch (error) {
          this.logger.error('connected callback failed', error);
        }
      }
    } catch (error) {
      this.connected = false;
      this.logger.warn(
        'OPC UA connection failed: ' + (error as Error).message,
      );
      await this.closeConnection();
      this.scheduleReconnect();
    } finally {
      this.connecting = false;
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
            key: signal.key,
            role: signal.role,
            nodeId: this.resolveSignalNodeId(
              profile,
              signal,
              namespaceIndexes,
            ),
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
          signals,
        };
      });
  }

  private async resolveConfiguredStations(
    profile: MachineProfile,
  ): Promise<readonly OpcUaConfiguredStation[]> {
    const requiresNamespaceResolution = profile.stations.some((station) =>
      station.signals.some(
        (signal) => !signal.identifier.trim().startsWith('ns='),
      ),
    );
    if (!requiresNamespaceResolution) {
      return this.buildConfiguredStations(profile);
    }

    const namespaceValue = await this.session.readVariableValue('i=2255');
    const namespaceArray = namespaceValue?.value?.value;
    if (!Array.isArray(namespaceArray)) {
      throw new Error('OPC UA NamespaceArray could not be read');
    }
    const namespaceIndexes = new Map<string, number>();
    namespaceArray.forEach((uri: unknown, index: number) => {
      if (typeof uri === 'string') namespaceIndexes.set(uri, index);
    });
    return this.buildConfiguredStations(profile, namespaceIndexes);
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

    const normalizedIdentifier =
      /^(s|i|g|b)=/.test(identifier) ? identifier : `s=${identifier}`;
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

  private isNodeAllowed(nodeId: string): boolean {
    if (
      this.stations.some((station) =>
        [...station.signals.values()].some(
          (signal) => signal.nodeId === nodeId,
        ),
      )
    ) {
      return true;
    }

    return false;
  }

  private startPolling() {
    if (this.pollingTimer) clearInterval(this.pollingTimer);
    void this.pollTelemetry();
    this.pollingTimer = setInterval(() => void this.pollTelemetry(), 1000);
  }

  private async pollTelemetry() {
    if (this.polling || !this.connected || !this.session) return;
    this.polling = true;
    try {
      for (const station of this.stations) {
        const readableSignals = [...station.signals.values()].filter(
          (signal) =>
            signal.direction === 'machineToMes' &&
            (signal.access === 'read' || signal.access === 'readWrite'),
        );
        const values: Array<[string, unknown]> = [];
        const signalErrors: Record<string, string> = {};
        for (const signal of readableSignals) {
          try {
            const rawValue = await this.readNode(signal.nodeId);
            values.push([signal.key, this.fromMachineValue(signal, rawValue)]);
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
          ...(Object.keys(signalErrors).length ? { signalErrors } : {}),
        });
      }
    } catch (error) {
      this.logger.warn(
        'OPC UA telemetry read failed: ' + (error as Error).message,
      );
      this.handleDisconnect('telemetry read failed');
    } finally {
      this.polling = false;
    }
  }

  private async startProfileSubscriptions() {
    const subscriptions = this.stations.flatMap((station) => {
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

    this.subscription = await this.session.createSubscription2({
      requestedPublishingInterval: 250,
      requestedLifetimeCount: 120,
      requestedMaxKeepAliveCount: 10,
      maxNotificationsPerPublish: Math.max(20, subscriptions.length * 2),
      publishingEnabled: true,
      priority: 10,
    });

    for (const entry of subscriptions) {
      const item = nodeOpcua.ClientMonitoredItem.create(
        this.subscription,
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
        this.lastCompletionTimestamp.set(
          entry.station.resourceId,
          timestampMs,
        );
        for (const callback of this.processCompletedCallbacks) {
          callback(entry.station.resourceId, timestamp);
        }
      });
      item.on('err', (error) =>
        this.logger.error(
          `${entry.type} monitor error for resource ${entry.station.resourceId}: ${error.message}`,
        ),
      );
      this.monitoredItems.push(item);
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

  private handleDisconnect(reason: string) {
    if (!this.connected && !this.session) return;
    this.logger.warn('OPC UA disconnected: ' + reason);
    for (const callback of this.disconnectedCallbacks) {
      try {
        callback(reason);
      } catch (error) {
        this.logger.error('disconnected callback failed', error);
      }
    }
    this.connected = false;
    if (this.pollingTimer) clearInterval(this.pollingTimer);
    this.pollingTimer = undefined;
    void this.closeConnection().finally(() => this.scheduleReconnect());
  }

  private scheduleReconnect() {
    if (
      this.shuttingDown ||
      this.reconnectTimer ||
      !this.profile?.connection.reconnect.enabled
    ) {
      return;
    }
    const reconnect = this.profile.connection.reconnect;
    if (
      reconnect.maxAttempts !== undefined &&
      reconnect.maxAttempts > 0 &&
      this.reconnectAttempts >= reconnect.maxAttempts
    ) {
      this.logger.error(
        `Reconnect limit ${reconnect.maxAttempts} reached for ${this.profile.machineId}`,
      );
      return;
    }
    const delay = Math.min(
      reconnect.maximumDelayMs,
      reconnect.initialDelayMs *
        reconnect.backoffMultiplier ** this.reconnectAttempts,
    );
    this.reconnectAttempts += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.connect();
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

  private requiredEnvironmentValue(name: string): string {
    const value = this.configService.get<string>(name)?.trim();
    if (!value) {
      throw new Error(`Required OPC UA environment variable ${name} is missing`);
    }
    return value;
  }

  private userIdentity(profile: MachineProfile): unknown {
    const authentication = profile.connection.authentication;
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
      throw new Error(
        'Certificate authentication requires certificatePathEnv',
      );
    }
    const certificatePath = this.requiredEnvironmentValue(
      authentication.certificatePathEnv,
    );
    const privateKeyEnv = profile.connection.security.privateKeyPathEnv;
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

  private async closeConnection() {
    const session = this.session;
    const client = this.client;
    this.session = null;
    this.client = null;
    this.monitoredItems = [];
    try {
      if (this.subscription) await this.subscription.terminate();
    } catch (error) {
      this.logger.warn(
        'OPC UA subscription close failed: ' + (error as Error).message,
      );
    }
    this.subscription = null;
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
      this.logger.warn(
        'OPC UA disconnect failed: ' + (error as Error).message,
      );
    }
  }
}
