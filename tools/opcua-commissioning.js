'use strict';

/**
 * Read-only OPC UA commissioning helper.
 *
 * Commands:
 *   node tools/opcua-commissioning.js scan
 *   node tools/opcua-commissioning.js check <machine-profile.json>
 *
 * The tool never calls session.write(). Reports intentionally exclude
 * usernames, passwords, certificates and private keys.
 */

const fs = require('node:fs');
const path = require('node:path');
const {
  AccessLevelFlag,
  AttributeIds,
  BrowseDirection,
  MessageSecurityMode,
  NodeClass,
  OPCUAClient,
  SecurityPolicy,
  UserTokenType,
  accessLevelFlagToString,
  makeResultMask,
} = require('node-opcua');

const BUILTIN_DATA_TYPES = Object.freeze({
  1: 'Boolean',
  2: 'SByte',
  3: 'Byte',
  4: 'Int16',
  5: 'UInt16',
  6: 'Int32',
  7: 'UInt32',
  8: 'Int64',
  9: 'UInt64',
  10: 'Float',
  11: 'Double',
  12: 'String',
  13: 'DateTime',
});

function readArg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function readInteger(name, fallback, minimum, maximum) {
  const raw = readArg(name) || process.env[name] || String(fallback);
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} to ${maximum}.`);
  }
  return parsed;
}

function securityMode(value) {
  const resolved = MessageSecurityMode[value || 'None'];
  if (resolved === undefined || value === 'Invalid') {
    throw new Error(`Unsupported OPC UA security mode: ${value}`);
  }
  return resolved;
}

function securityPolicy(value) {
  const resolved = SecurityPolicy[value || 'None'];
  if (resolved === undefined) {
    throw new Error(`Unsupported OPC UA security policy: ${value}`);
  }
  return resolved;
}

function safeText(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (typeof value.text === 'string') return value.text;
  return value.toString();
}

function statusIsGood(dataValue) {
  return Boolean(dataValue && dataValue.statusCode && dataValue.statusCode.isGood());
}

function dataTypeName(dataValue) {
  if (!statusIsGood(dataValue)) return null;
  const nodeId = dataValue.value && dataValue.value.value;
  if (!nodeId) return null;
  const numericId = Number(nodeId.value);
  return BUILTIN_DATA_TYPES[numericId] || nodeId.toString();
}

function accessText(dataValue) {
  if (!statusIsGood(dataValue)) return null;
  return accessLevelFlagToString(Number(dataValue.value.value));
}

function nodeClassName(nodeClass) {
  if (nodeClass === null || nodeClass === undefined) return 'Unspecified';
  if (typeof nodeClass.key === 'string') return nodeClass.key;
  return NodeClass[Number(nodeClass)] || nodeClass.toString();
}

function sanitizeEndpoint(endpoint) {
  return {
    endpointUrl: endpoint.endpointUrl,
    securityMode:
      MessageSecurityMode[Number(endpoint.securityMode)] ||
      safeText(endpoint.securityMode),
    securityPolicyUri: endpoint.securityPolicyUri,
    securityLevel: endpoint.securityLevel,
    userTokenTypes: (endpoint.userIdentityTokens || []).map((token) =>
      UserTokenType[Number(token.tokenType)] || safeText(token.tokenType),
    ),
  };
}

function timestampForFile() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function writeReport(report, requestedOutput) {
  const output =
    requestedOutput ||
    path.join(
      'artifacts',
      'opcua-scans',
      `${report.command}-${timestampForFile()}.json`,
    );
  const absoluteOutput = path.resolve(output);
  fs.mkdirSync(path.dirname(absoluteOutput), { recursive: true });
  fs.writeFileSync(absoluteOutput, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`Report written to ${absoluteOutput}`);
  return absoluteOutput;
}

async function allReferences(session, nodeId) {
  let result = await session.browse({
    nodeId,
    browseDirection: BrowseDirection.Forward,
    includeSubtypes: true,
    nodeClassMask: 0,
    resultMask: makeResultMask(
      'ReferenceType | IsForward | BrowseName | DisplayName | NodeClass | TypeDefinition',
    ),
  });
  const references = [...(result.references || [])];

  while (result.continuationPoint) {
    result = await session.browseNext(result.continuationPoint, false);
    references.push(...(result.references || []));
  }
  return references;
}

async function variableMetadata(session, nodeId) {
  const values = await session.read([
    { nodeId, attributeId: AttributeIds.DataType },
    { nodeId, attributeId: AttributeIds.AccessLevel },
    { nodeId, attributeId: AttributeIds.UserAccessLevel },
    { nodeId, attributeId: AttributeIds.ValueRank },
  ]);

  return {
    dataType: dataTypeName(values[0]),
    accessLevel: accessText(values[1]),
    userAccessLevel: accessText(values[2]),
    valueRank: statusIsGood(values[3]) ? Number(values[3].value.value) : null,
  };
}

async function scanAddressSpace(session, rootNode, maxDepth, maxNodes) {
  const queue = [{ nodeId: rootNode, depth: 0, path: rootNode }];
  const visited = new Set();
  const nodes = [];
  let truncated = false;

  while (queue.length > 0) {
    const current = queue.shift();
    const currentId = current.nodeId.toString();
    if (visited.has(currentId)) continue;
    visited.add(currentId);

    if (nodes.length >= maxNodes) {
      truncated = true;
      break;
    }

    const references = await allReferences(session, current.nodeId);
    for (const reference of references) {
      if (nodes.length >= maxNodes) {
        truncated = true;
        break;
      }

      const id = reference.nodeId.toString();
      const browseName = safeText(reference.browseName);
      const displayName = safeText(reference.displayName);
      const childPath = `${current.path}/${browseName || displayName || id}`;
      const className = nodeClassName(reference.nodeClass);
      const entry = {
        nodeId: id,
        browseName,
        displayName,
        nodeClass: className,
        path: childPath,
      };

      if (className === 'Variable') {
        Object.assign(entry, await variableMetadata(session, reference.nodeId));
      }

      nodes.push(entry);

      if (
        current.depth < maxDepth &&
        !visited.has(id) &&
        (className === 'Object' || className === 'View')
      ) {
        queue.push({
          nodeId: reference.nodeId,
          depth: current.depth + 1,
          path: childPath,
        });
      }
    }
  }

  return { nodes, truncated };
}

function loadProfile(profilePath) {
  if (!profilePath) {
    throw new Error(
      'Profile path missing. Use: npm run opcua:check-profile -- <profile.json>',
    );
  }
  const absolutePath = path.resolve(profilePath);
  const profile = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
  return { profile, absolutePath };
}

function hasStationCapability(station, capability) {
  if (Array.isArray(station.capabilities)) {
    return station.capabilities.includes(capability);
  }
  const resourceType = station.resourceType || 'production';
  if (resourceType === 'production') {
    return ['production', 'routing', 'control'].includes(capability);
  }
  if (resourceType === 'inventory') return capability === 'inventory';
  if (resourceType === 'storage') {
    return capability === 'inventory' || capability === 'storage';
  }
  return true;
}

function validateProfileShape(profile) {
  const errors = [];
  const warnings = [];
  const requiredStrings = [
    ['profileVersion', profile.profileVersion],
    ['machineId', profile.machineId],
    ['displayName', profile.displayName],
    ['transport', profile.transport],
    ['operatingMode', profile.operatingMode],
    ['connection.endpointUrl', profile.connection && profile.connection.endpointUrl],
  ];

  for (const [name, value] of requiredStrings) {
    if (typeof value !== 'string' || value.trim() === '') {
      errors.push(`${name} is missing.`);
    }
  }

  if (!Array.isArray(profile.namespaces) || profile.namespaces.length === 0) {
    errors.push('At least one namespace is required.');
  }
  if (!Array.isArray(profile.stations) || profile.stations.length === 0) {
    errors.push('At least one station is required.');
  }

  const serialized = JSON.stringify(profile);
  if (serialized.includes('YOUR_')) {
    errors.push('Profile still contains YOUR_* placeholders.');
  }
  const security = (profile.connection && profile.connection.security) || {};
  const authentication =
    (profile.connection && profile.connection.authentication) || {};
  if ((security.mode === 'None') !== (security.policy === 'None')) {
    errors.push(
      'OPC UA security mode and policy must both be None or both be secure.',
    );
  }
  if (
    security.mode !== 'None' &&
    (!security.certificatePathEnv || !security.privateKeyPathEnv)
  ) {
    errors.push(
      'Secure OPC UA connections require certificatePathEnv and privateKeyPathEnv.',
    );
  }
  if (
    authentication.type === 'username' &&
    (!authentication.usernameEnv || !authentication.passwordEnv)
  ) {
    errors.push(
      'Username authentication requires usernameEnv and passwordEnv.',
    );
  }
  if (
    authentication.type === 'certificate' &&
    (!authentication.certificatePathEnv || !security.privateKeyPathEnv)
  ) {
    errors.push(
      'Certificate authentication requires certificatePathEnv and privateKeyPathEnv.',
    );
  }

  const namespaceKeys = new Set();
  for (const namespace of profile.namespaces || []) {
    if (!namespace.key || !namespace.uri) {
      errors.push('Each namespace needs a key and URI.');
      continue;
    }
    if (namespaceKeys.has(namespace.key)) {
      errors.push(`Duplicate namespace key: ${namespace.key}`);
    }
    namespaceKeys.add(namespace.key);
  }

  const stationIds = new Set();
  const resourceIds = new Set();
  const routeSequences = new Set();
  const requiredControlRoles = [
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
  for (const station of profile.stations || []) {
    if (!station.stationId) errors.push('A stationId is missing.');
    if (stationIds.has(station.stationId)) {
      errors.push(`Duplicate stationId: ${station.stationId}`);
    }
    stationIds.add(station.stationId);
    if (!Number.isInteger(station.resourceId) || station.resourceId < 1) {
      errors.push(`Station ${station.stationId} needs a positive integer resourceId.`);
    } else if (resourceIds.has(station.resourceId)) {
      errors.push(`Duplicate resourceId: ${station.resourceId}`);
    }
    resourceIds.add(station.resourceId);
    if (
      profile.operatingMode === 'control' &&
      station.enabled &&
      hasStationCapability(station, 'routing') &&
      (!station.routing || station.routing.enabled !== false)
    ) {
      if (!station.routing) {
        errors.push(`Control station ${station.stationId} needs routing.`);
      } else if (
        !Number.isInteger(station.routing.sequence) ||
        !Number.isInteger(station.routing.operationNo) ||
        !station.routing.operation
      ) {
        errors.push(`Station ${station.stationId} has incomplete routing.`);
      } else if (routeSequences.has(station.routing.sequence)) {
        errors.push(`Duplicate routing sequence: ${station.routing.sequence}`);
      } else {
        routeSequences.add(station.routing.sequence);
      }
    }

    const signalKeys = new Set();
    const signalRoles = new Map();
    for (const signal of station.signals || []) {
      if (!signal.key || !signal.identifier || !signal.namespace) {
        errors.push(`Incomplete signal in station ${station.stationId}.`);
        continue;
      }
      if (signalKeys.has(signal.key)) {
        errors.push(
          `Duplicate signal key ${signal.key} in station ${station.stationId}.`,
        );
      }
      signalKeys.add(signal.key);
      signalRoles.set(signal.role, (signalRoles.get(signal.role) || 0) + 1);
      if (!namespaceKeys.has(signal.namespace)) {
        errors.push(
          `Signal ${station.stationId}.${signal.key} references unknown namespace ${signal.namespace}.`,
        );
      }
      if (
        profile.operatingMode === 'observe' &&
        (signal.direction === 'mesToMachine' ||
          signal.access === 'write' ||
          signal.access === 'readWrite')
      ) {
        warnings.push(
          `Observe profile contains writable signal ${station.stationId}.${signal.key}; the commissioning tool will still never write it.`,
        );
      }
      if (
        signal.direction === 'machineToMes' &&
        signal.access === 'write'
      ) {
        errors.push(
          `Machine-to-MES signal ${station.stationId}.${signal.key} is not readable.`,
        );
      }
      if (
        signal.direction === 'mesToMachine' &&
        signal.access === 'read'
      ) {
        errors.push(
          `MES-to-machine signal ${station.stationId}.${signal.key} is not writable.`,
        );
      }
    }
    if (
      profile.operatingMode === 'control' &&
      station.enabled &&
      hasStationCapability(station, 'production')
    ) {
      for (const role of requiredControlRoles) {
        if ((signalRoles.get(role) || 0) !== 1) {
          errors.push(
            `Control station ${station.stationId} requires exactly one ${role} signal.`,
          );
        }
      }
    }
  }

  for (const definition of profile.orderParameterDefinitions || []) {
    const signalKey = definition.signalKey || definition.key;
    for (const station of (profile.stations || []).filter(
      (candidate) =>
        candidate.enabled && hasStationCapability(candidate, 'production'),
    )) {
      const signal = (station.signals || []).find(
        (candidate) =>
          candidate.role === 'routingParameter' &&
          candidate.key === signalKey,
      );
      if (profile.operatingMode === 'control' && !signal) {
        errors.push(
          `Order parameter ${definition.key} has no routingParameter signal ${signalKey} in ${station.stationId}.`,
        );
      }
    }
  }

  return { errors, warnings };
}

function profileSecurity(profile) {
  return {
    mode:
      (profile.connection &&
        profile.connection.security &&
        profile.connection.security.mode) ||
      'None',
    policy:
      (profile.connection &&
        profile.connection.security &&
        profile.connection.security.policy) ||
      'None',
  };
}

function profileSessionIdentity(profile) {
  const authentication =
    (profile.connection && profile.connection.authentication) || {
      type: 'anonymous',
    };
  if (authentication.type === 'anonymous') {
    return undefined;
  }
  if (authentication.type === 'certificate') {
    const certificatePath =
      process.env.OPCUA_SCAN_USER_CERTIFICATE ||
      process.env[authentication.certificatePathEnv || ''];
    const privateKeyPath =
      process.env.OPCUA_SCAN_USER_PRIVATE_KEY ||
      process.env[
        (profile.connection.security &&
          profile.connection.security.privateKeyPathEnv) ||
          ''
      ];
    if (!certificatePath || !privateKeyPath) {
      throw new Error(
        'Certificate authentication requires user certificate and private key environment variables.',
      );
    }
    return {
      type: UserTokenType.Certificate,
      certificateData: fs.readFileSync(certificatePath),
      privateKey: fs.readFileSync(privateKeyPath, 'utf8'),
    };
  }
  const username =
    process.env.OPCUA_SCAN_USERNAME ||
    process.env[authentication.usernameEnv || ''];
  const password =
    process.env.OPCUA_SCAN_PASSWORD ||
    process.env[authentication.passwordEnv || ''];
  if (!username) {
    throw new Error('OPC UA username is missing.');
  }
  if (!password) {
    throw new Error('OPC UA username is set, but password is missing.');
  }
  return {
    type: UserTokenType.UserName,
    userName: username,
    password,
  };
}

async function namespaceMap(session) {
  const dataValue = await session.readVariableValue('i=2255');
  if (!statusIsGood(dataValue) || !Array.isArray(dataValue.value.value)) {
    throw new Error('Server NamespaceArray could not be read.');
  }
  const uris = dataValue.value.value.map(String);
  return {
    uris,
    indexesByUri: new Map(uris.map((uri, index) => [uri, index])),
  };
}

function resolveSignalNodeId(signal, profile, indexesByUri) {
  if (/^ns=\d+;[isgb]=/.test(signal.identifier)) {
    return {
      nodeId: signal.identifier,
      warning: 'Signal uses a fixed namespace index.',
    };
  }

  const namespace = (profile.namespaces || []).find(
    (candidate) => candidate.key === signal.namespace,
  );
  if (!namespace) {
    return { error: `Unknown namespace key ${signal.namespace}.` };
  }
  const index = indexesByUri.get(namespace.uri);
  if (index === undefined) {
    return { error: `Namespace URI not exposed by server: ${namespace.uri}` };
  }

  const identifier = /^[isgb]=/.test(signal.identifier)
    ? signal.identifier
    : `s=${signal.identifier}`;
  return { nodeId: `ns=${index};${identifier}` };
}

async function checkSignal(session, profile, station, signal, indexesByUri) {
  const resolution = resolveSignalNodeId(signal, profile, indexesByUri);
  if (resolution.error) {
    return {
      stationId: station.stationId,
      key: signal.key,
      expectedDataType: signal.dataType,
      status: 'error',
      error: resolution.error,
    };
  }

  const values = await session.read([
    { nodeId: resolution.nodeId, attributeId: AttributeIds.NodeClass },
    { nodeId: resolution.nodeId, attributeId: AttributeIds.DataType },
    { nodeId: resolution.nodeId, attributeId: AttributeIds.AccessLevel },
    { nodeId: resolution.nodeId, attributeId: AttributeIds.UserAccessLevel },
  ]);
  const actualDataType = dataTypeName(values[1]);
  const userAccess = statusIsGood(values[3])
    ? Number(values[3].value.value)
    : 0;
  const expectsRead = signal.access === 'read' || signal.access === 'readWrite';
  const expectsWrite =
    signal.access === 'write' || signal.access === 'readWrite';
  const checks = {
    exists: values.every((value) => statusIsGood(value)),
    dataTypeMatches: actualDataType === signal.dataType,
    readable:
      !expectsRead || Boolean(userAccess & Number(AccessLevelFlag.CurrentRead)),
    writable:
      !expectsWrite || Boolean(userAccess & Number(AccessLevelFlag.CurrentWrite)),
  };
  const passed = Object.values(checks).every(Boolean);

  return {
    stationId: station.stationId,
    key: signal.key,
    nodeId: resolution.nodeId,
    nodeClass: statusIsGood(values[0])
      ? nodeClassName(values[0].value.value)
      : null,
    expectedDataType: signal.dataType,
    actualDataType,
    accessLevel: accessText(values[2]),
    userAccessLevel: accessText(values[3]),
    checks,
    status: passed ? 'ok' : 'mismatch',
    warning: resolution.warning,
  };
}

async function withSession(options, callback) {
  const client = OPCUAClient.create({
    applicationName: 'NodeOPCUA-Client',
    endpointMustExist: false,
    securityMode: securityMode(options.securityMode),
    securityPolicy: securityPolicy(options.securityPolicy),
    connectionStrategy: {
      initialDelay: 500,
      maxDelay: 2000,
      maxRetry: 0,
    },
    connectionTimeout: options.connectionTimeout,
    ...(options.certificateFile
      ? { certificateFile: options.certificateFile }
      : {}),
    ...(options.privateKeyFile
      ? { privateKeyFile: options.privateKeyFile }
      : {}),
  });

  let session;
  try {
    await client.connect(options.endpoint);
    const endpoints = await client.getEndpoints();
    session = await client.createSession(options.identity);
    return await callback(session, endpoints);
  } finally {
    if (session) await session.close().catch(() => undefined);
    await client.disconnect().catch(() => undefined);
  }
}

async function scanCommand() {
  const endpoint =
    readArg('endpoint') ||
    process.env.OPCUA_SCAN_ENDPOINT;
  if (!endpoint) throw new Error('OPC UA endpoint is missing.');

  const report = await withSession(
    {
      endpoint,
      securityMode:
        readArg('security-mode') ||
        process.env.OPCUA_SCAN_SECURITY_MODE ||
        'None',
      securityPolicy:
        readArg('security-policy') ||
        process.env.OPCUA_SCAN_SECURITY_POLICY ||
        'None',
      identity:
        process.env.OPCUA_SCAN_USERNAME || process.env.OPCUA_SCAN_PASSWORD
          ? {
              type: UserTokenType.UserName,
              userName: process.env.OPCUA_SCAN_USERNAME,
              password: process.env.OPCUA_SCAN_PASSWORD,
            }
          : undefined,
      connectionTimeout: 10000,
    },
    async (session, endpoints) => {
      const namespaces = await namespaceMap(session);
      const maxDepth = readInteger(
        'OPCUA_SCAN_MAX_DEPTH',
        5,
        0,
        20,
      );
      const maxNodes = readInteger(
        'OPCUA_SCAN_MAX_NODES',
        2000,
        1,
        50000,
      );
      const rootNode =
        readArg('root') || process.env.OPCUA_SCAN_ROOT_NODE || 'i=85';
      const addressSpace = await scanAddressSpace(
        session,
        rootNode,
        maxDepth,
        maxNodes,
      );

      return {
        reportVersion: '1.0',
        command: 'scan',
        readOnly: true,
        capturedAt: new Date().toISOString(),
        endpoint,
        rootNode,
        limits: { maxDepth, maxNodes },
        endpoints: endpoints.map(sanitizeEndpoint),
        namespaceArray: namespaces.uris,
        nodeCount: addressSpace.nodes.length,
        truncated: addressSpace.truncated,
        nodes: addressSpace.nodes,
      };
    },
  );

  writeReport(report, readArg('output'));
  console.log(
    `Read-only scan complete: ${report.nodeCount} nodes, ${report.namespaceArray.length} namespaces, truncated=${report.truncated}.`,
  );
}

async function checkCommand() {
  const profilePath =
    process.argv[3] && !process.argv[3].startsWith('--')
      ? process.argv[3]
      : readArg('profile') || process.env.MACHINE_PROFILE_PATH;
  const { profile, absolutePath } = loadProfile(profilePath);
  const shape = validateProfileShape(profile);
  if (shape.errors.length > 0) {
    throw new Error(`Invalid profile:\n- ${shape.errors.join('\n- ')}`);
  }

  const endpoint =
    readArg('endpoint') ||
    process.env.OPCUA_SCAN_ENDPOINT ||
    profile.connection.endpointUrl;
  const identity = profileSessionIdentity(profile);
  const security = profileSecurity(profile);

  const report = await withSession(
    {
      endpoint,
      securityMode:
        readArg('security-mode') ||
        process.env.OPCUA_SCAN_SECURITY_MODE ||
        security.mode,
      securityPolicy:
        readArg('security-policy') ||
        process.env.OPCUA_SCAN_SECURITY_POLICY ||
        security.policy,
      identity,
      certificateFile: profile.connection.security.certificatePathEnv
        ? process.env[profile.connection.security.certificatePathEnv]
        : undefined,
      privateKeyFile: profile.connection.security.privateKeyPathEnv
        ? process.env[profile.connection.security.privateKeyPathEnv]
        : undefined,
      connectionTimeout: profile.connection.connectionTimeoutMs || 10000,
    },
    async (session, endpoints) => {
      const namespaces = await namespaceMap(session);
      const signals = [];
      for (const station of profile.stations) {
        if (!station.enabled) continue;
        for (const signal of station.signals || []) {
          signals.push(
            await checkSignal(
              session,
              profile,
              station,
              signal,
              namespaces.indexesByUri,
            ),
          );
        }
      }
      const summary = {
        total: signals.length,
        ok: signals.filter((signal) => signal.status === 'ok').length,
        mismatch: signals.filter((signal) => signal.status === 'mismatch')
          .length,
        error: signals.filter((signal) => signal.status === 'error').length,
      };

      return {
        reportVersion: '1.0',
        command: 'profile-check',
        readOnly: true,
        capturedAt: new Date().toISOString(),
        profilePath: absolutePath,
        machineId: profile.machineId,
        operatingMode: profile.operatingMode,
        endpoint,
        endpoints: endpoints.map(sanitizeEndpoint),
        namespaceArray: namespaces.uris,
        warnings: shape.warnings,
        summary,
        signals,
      };
    },
  );

  writeReport(report, readArg('output'));
  console.log(
    `Read-only profile check complete: ${report.summary.ok}/${report.summary.total} signals OK.`,
  );
  if (report.summary.mismatch > 0 || report.summary.error > 0) {
    process.exitCode = 2;
  }
}

function validateCommand() {
  const profilePath =
    process.argv[3] && !process.argv[3].startsWith('--')
      ? process.argv[3]
      : readArg('profile') || process.env.MACHINE_PROFILE_PATH;
  const { profile, absolutePath } = loadProfile(profilePath);
  const shape = validateProfileShape(profile);

  console.log(`Profile: ${absolutePath}`);
  console.log(`Machine: ${profile.machineId || '-'}`);
  console.log(`Mode: ${profile.operatingMode || '-'}`);
  console.log(
    `Stations: ${Array.isArray(profile.stations) ? profile.stations.length : 0}`,
  );
  for (const warning of shape.warnings) console.warn(`WARNING: ${warning}`);
  if (shape.errors.length > 0) {
    throw new Error(`Invalid profile:\n- ${shape.errors.join('\n- ')}`);
  }
  console.log('Profile structure is valid. No server connection was made.');
}

async function main() {
  const command = process.argv[2];
  if (command === 'scan') return scanCommand();
  if (command === 'validate') return validateCommand();
  if (command === 'check') return checkCommand();
  throw new Error(
    'Usage:\n  npm run opcua:scan -- --endpoint opc.tcp://host:4840/path\n  npm run opcua:validate-profile -- config/machines/profile.json\n  npm run opcua:check-profile -- config/machines/profile.json',
  );
}

main().catch((error) => {
  console.error(`OPC UA commissioning failed: ${error.message}`);
  process.exitCode = 1;
});
