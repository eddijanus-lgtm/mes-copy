import test from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyMachineProfile,
  namespacesFromArray,
  normalizeProfileDocument,
  profileSetupSummary,
  sortedRoutingPreview,
  stationSetupState,
  validateProfileDraft,
} from './machineProfileConfig.js';

test('new profiles always start in observe', () => {
  assert.equal(
    emptyMachineProfile({ machineId: 'plc-1' }).operatingMode,
    'observe',
  );
});

test('route preview includes only enabled routable stations and sorts them', () => {
  const stations = [
    {
      stationId: 'b',
      enabled: true,
      capabilities: ['routing'],
      routing: { enabled: true, sequence: 2 },
    },
    {
      stationId: 'disabled',
      enabled: false,
      capabilities: ['routing'],
      routing: { enabled: true, sequence: 1 },
    },
    {
      stationId: 'a',
      enabled: true,
      capabilities: ['routing'],
      routing: { enabled: true, sequence: 1 },
    },
  ];
  assert.deepEqual(
    sortedRoutingPreview(stations).map((station) => station.stationId),
    ['a', 'b'],
  );
});

test('draft validation reports duplicate IDs, routing sequences and cycles', () => {
  const stations = [
    {
      stationId: 'same',
      resourceId: 1,
      parentResourceId: 2,
      enabled: true,
      capabilities: ['routing'],
      routing: { enabled: true, sequence: 1 },
    },
    {
      stationId: 'same',
      resourceId: 2,
      parentResourceId: 1,
      enabled: true,
      capabilities: ['routing'],
      routing: { enabled: true, sequence: 1 },
    },
  ];
  const errors = validateProfileDraft({ stations }).join(' ');
  assert.match(errors, /Stations-ID/);
  assert.match(errors, /Routing-Sequenz/);
  assert.match(errors, /Hierarchiezyklus/);
});

test('station connections stay independent from the legacy profile connection', () => {
  const source = emptyMachineProfile();
  source.connection.endpointUrl = 'opc.tcp://legacy:4840';
  source.stations = [
    {
      stationId: 'station-1',
      resourceId: 1,
      signals: [],
      connection: {
        ...source.connection,
        endpointUrl: 'opc.tcp://station-1:4840',
      },
    },
  ];
  const normalized = normalizeProfileDocument(source);
  normalized.stations[0].connection.endpointUrl = 'opc.tcp://changed:4840';
  assert.equal(normalized.connection.endpointUrl, 'opc.tcp://legacy:4840');
});

test('OPC UA namespace arrays become stable profile namespaces', () => {
  assert.deepEqual(
    namespacesFromArray([
      'http://opcfoundation.org/UA/',
      'urn:SIMATIC.S7-1500.OPC-UA.Application:PLC_1',
    ]),
    [
      { key: 'ns0', uri: 'http://opcfoundation.org/UA/' },
      { key: 'ns1', uri: 'urn:SIMATIC.S7-1500.OPC-UA.Application:PLC_1' },
    ],
  );
});

test('offline drafts can start without technical machine or station data', () => {
  const draft = emptyMachineProfile();
  assert.equal(draft.machineId, '');
  assert.deepEqual(draft.stations, []);
  assert.deepEqual(validateProfileDraft(draft), []);
});

test('planned stations become progressively ready without blocking the draft', () => {
  const planned = {
    stationId: 'presse01',
    displayName: 'Presse01',
    signals: [],
    connection: { endpointUrl: '' },
  };
  const connected = {
    ...planned,
    resourceId: 30,
    connection: { endpointUrl: 'opc.tcp://192.168.0.30:4840' },
  };
  const mapped = {
    ...connected,
    signals: [{ key: 'carrier', role: 'carrierId' }],
  };

  assert.equal(stationSetupState(planned).key, 'planned');
  assert.equal(stationSetupState(connected).key, 'discoverable');
  assert.equal(stationSetupState(mapped).key, 'mapped');
  assert.deepEqual(
    profileSetupSummary({ stations: [planned, connected, mapped] }),
    {
      stationCount: 3,
      endpointCount: 2,
      mappedCount: 1,
      counts: {
        planned: 1,
        connection_configured: 0,
        discoverable: 1,
        mapped: 1,
      },
    },
  );
});

test('draft validation ignores missing resource IDs but reports real duplicates', () => {
  const errors = validateProfileDraft({
    stations: [
      { displayName: 'Geplant A' },
      { displayName: 'Geplant B' },
      { stationId: 'ready-a', resourceId: 30 },
      { stationId: 'ready-b', resourceId: 30 },
    ],
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /Ressourcen-ID 30/);
});
