export function emptyMachineProfile() {
  return {
    profileVersion: '1.0',
    machineId: '',
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
    stations
      .filter((station) => isPositiveInteger(station.resourceId))
      .map((station) => [Number(station.resourceId), station]),
  );

  for (const station of stations) {
    const stationId = String(station.stationId || '').trim();
    if (stationId && stationIds.has(stationId))
      errors.push(`Stations-ID ${station.stationId} ist doppelt.`);
    if (stationId) stationIds.add(stationId);
    const resourceId = isPositiveInteger(station.resourceId)
      ? Number(station.resourceId)
      : null;
    if (resourceId != null && resourceIds.has(resourceId))
      errors.push(`Ressourcen-ID ${resourceId} ist doppelt.`);
    if (resourceId != null) resourceIds.add(resourceId);
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
    if (!isPositiveInteger(station.resourceId)) continue;
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

export function stationSetupState(station) {
  const endpoint = String(station?.connection?.endpointUrl || '').trim();
  const hasIdentity =
    String(station?.stationId || '').trim() &&
    isPositiveInteger(station?.resourceId);
  const signalCount = Array.isArray(station?.signals)
    ? station.signals.length
    : 0;

  if (!endpoint) {
    return {
      key: 'planned',
      label: 'Geplant',
      detail: 'OPC-UA-Verbindung kann später ergänzt werden.',
    };
  }
  if (!hasIdentity) {
    return {
      key: 'connection_configured',
      label: 'Verbindung eingetragen',
      detail: 'Stations- und Ressourcen-ID vor Aktivierung ergänzen.',
    };
  }
  if (signalCount === 0) {
    return {
      key: 'discoverable',
      label: 'Bereit zur Erkennung',
      detail: 'DB151 und stMES können jetzt automatisch erkannt werden.',
    };
  }
  return {
    key: 'mapped',
    label: 'Daten zugeordnet',
    detail: `${signalCount} Signal${signalCount === 1 ? '' : 'e'} konfiguriert.`,
  };
}

export function profileSetupSummary(document) {
  const stations = Array.isArray(document?.stations) ? document.stations : [];
  const counts = {
    planned: 0,
    connection_configured: 0,
    discoverable: 0,
    mapped: 0,
  };
  for (const station of stations) {
    counts[stationSetupState(station).key] += 1;
  }
  return {
    stationCount: stations.length,
    endpointCount: stations.filter((station) =>
      String(station?.connection?.endpointUrl || '').trim(),
    ).length,
    mappedCount: counts.mapped,
    counts,
  };
}

function isPositiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0;
}
