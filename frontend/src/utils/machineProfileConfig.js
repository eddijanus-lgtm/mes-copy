export function emptyMachineProfile(suggestion = {}) {
  return {
    profileVersion: '1.0',
    machineId: suggestion.machineId || '',
    displayName: '',
    description: '',
    manufacturer: '',
    model: '',
    machineVersion: '',
    location: '',
    transport: 'opcua',
    operatingMode: 'observe',
    connection: emptyMachineConnection(),
    namespaces: [{ key: 'machine', uri: '' }],
    stations: [],
    metadata: {},
  };
}

export function emptyMachineConnection(source = {}) {
  const defaults = {
    endpointUrl: '',
    applicationName: 'WARA MES Commissioning',
    security: { mode: 'None', policy: 'None' },
    authentication: { type: 'anonymous' },
    connectionTimeoutMs: 10000,
    sessionTimeoutMs: 60000,
    reconnect: {
      enabled: true,
      initialDelayMs: 1000,
      maximumDelayMs: 30000,
      backoffMultiplier: 2,
      maxAttempts: 10,
    },
  };
  return {
    ...defaults,
    ...structuredClone(source),
    security: { ...defaults.security, ...(source.security || {}) },
    authentication: {
      ...defaults.authentication,
      ...(source.authentication || {}),
    },
    reconnect: { ...defaults.reconnect, ...(source.reconnect || {}) },
  };
}

export function sortedRoutingPreview(stations) {
  return stations
    .filter(
      (station) =>
        station.enabled &&
        station.capabilities?.includes('routing') &&
        station.routing?.enabled !== false &&
        Number.isFinite(Number(station.routing?.sequence)),
    )
    .slice()
    .sort(
      (left, right) =>
        Number(left.routing.sequence) - Number(right.routing.sequence),
    );
}

export function namespacesFromArray(namespaceArray) {
  return (Array.isArray(namespaceArray) ? namespaceArray : [])
    .map((uri, index) => ({ key: `ns${index}`, uri: String(uri || '').trim() }))
    .filter((namespace) => namespace.uri);
}

export function normalizeProfileDocument(source, suggestion = {}) {
  const defaults = emptyMachineProfile(suggestion);
  const document = structuredClone(source || defaults);
  document.connection = { ...defaults.connection, ...document.connection };
  document.connection.security = {
    ...defaults.connection.security,
    ...document.connection.security,
  };
  document.connection.authentication = {
    ...defaults.connection.authentication,
    ...document.connection.authentication,
  };
  document.connection.reconnect = {
    ...defaults.connection.reconnect,
    ...document.connection.reconnect,
  };
  document.metadata = { ...defaults.metadata, ...document.metadata };
  document.namespaces =
    Array.isArray(document.namespaces) && document.namespaces.length
      ? document.namespaces
      : defaults.namespaces;
  document.stations = Array.isArray(document.stations)
    ? document.stations.map((station) => ({
        ...station,
        signals: Array.isArray(station.signals) ? station.signals : [],
        connection: emptyMachineConnection(
          station.connection || document.connection,
        ),
      }))
    : [];
  return document;
}

export function validateProfileDraft(document) {
  const errors = [];
  const stations = Array.isArray(document?.stations) ? document.stations : [];
  const stationIds = new Set();
  const resourceIds = new Set();
  const routeSequences = new Set();
  const byResource = new Map(
    stations.map((station) => [Number(station.resourceId), station]),
  );

  for (const station of stations) {
    if (stationIds.has(station.stationId))
      errors.push(`Stations-ID ${station.stationId} ist doppelt.`);
    stationIds.add(station.stationId);
    const resourceId = Number(station.resourceId);
    if (resourceIds.has(resourceId))
      errors.push(`Ressourcen-ID ${resourceId} ist doppelt.`);
    resourceIds.add(resourceId);
    if (station.routing?.enabled !== false && station.routing) {
      const sequence = Number(station.routing.sequence);
      if (!Number.isInteger(sequence) || sequence < 1)
        errors.push(
          `Routing-Sequenz von ${station.stationId} muss positiv sein.`,
        );
      if (routeSequences.has(sequence))
        errors.push(`Routing-Sequenz ${sequence} ist doppelt.`);
      routeSequences.add(sequence);
      if (!station.enabled || !station.capabilities?.includes('routing'))
        errors.push(
          `${station.stationId} ist für Routing nicht aktiviert oder nicht routbar.`,
        );
    }
  }

  for (const station of stations) {
    const visited = new Set([Number(station.resourceId)]);
    let parent =
      station.parentResourceId == null
        ? null
        : byResource.get(Number(station.parentResourceId));
    while (parent) {
      if (visited.has(Number(parent.resourceId))) {
        errors.push(`Hierarchiezyklus bei ${station.stationId}.`);
        break;
      }
      visited.add(Number(parent.resourceId));
      parent =
        parent.parentResourceId == null
          ? null
          : byResource.get(Number(parent.parentResourceId));
    }
  }
  return errors;
}
