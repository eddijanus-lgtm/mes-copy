import { ConfigService } from '@nestjs/config';
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MachineProfileParseError } from './machine-profile.errors';
import { MachineProfileService } from './machine-profile.service';

function profile(stations: Record<string, unknown>[]) {
  return {
    profileVersion: '1.0',
    machineId: 'equipment-profile',
    displayName: 'Equipment profile',
    transport: 'opcua',
    operatingMode: 'observe',
    connection: {
      endpointUrl: 'opc.tcp://localhost:4840',
      applicationName: 'EquipmentProfile',
      security: { mode: 'None', policy: 'None' },
      authentication: { type: 'anonymous' },
      connectionTimeoutMs: 1000,
      sessionTimeoutMs: 1000,
      reconnect: {
        enabled: true,
        initialDelayMs: 100,
        maximumDelayMs: 1000,
        backoffMultiplier: 2,
      },
    },
    namespaces: [{ key: 'equipment', uri: 'urn:equipment' }],
    stations,
  };
}

function station(resourceId: number, extra: Record<string, unknown> = {}) {
  return {
    stationId: `resource-${resourceId}`,
    resourceId,
    displayName: `Resource ${resourceId}`,
    enabled: true,
    resourceType: 'production',
    signals: [],
    ...extra,
  };
}

describe('machine profile equipment hierarchy', () => {
  let directory: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'equipment-profile-'));
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  function load(data: unknown) {
    const path = join(directory, 'profile.json');
    writeFileSync(path, JSON.stringify(data), 'utf8');
    return new MachineProfileService(new ConfigService({})).loadProfile({
      profilePath: path,
    });
  }

  it('accepts a machine with nested work units and components', () => {
    const loaded = load(
      profile([
        station(70, {
          equipmentLevel: 'machine',
          executionModel: 'work_unit_jobs',
          jobInterface: 'telemetry_only',
          capabilities: ['control', 'telemetry'],
        }),
        station(71, {
          parentResourceId: 70,
          equipmentLevel: 'work_unit',
          executionModel: 'work_unit_jobs',
          jobInterface: 'signal_handshake',
          capabilities: ['production', 'routing'],
        }),
        station(711, {
          parentResourceId: 71,
          equipmentLevel: 'component',
          jobInterface: 'telemetry_only',
          capabilities: ['telemetry'],
        }),
      ]),
    );

    expect(loaded.stations[1]).toMatchObject({
      resourceId: 71,
      parentResourceId: 70,
      equipmentLevel: 'work_unit',
    });
  });

  it('rejects an unknown parent resource', () => {
    expect(() =>
      load(
        profile([
          station(71, {
            parentResourceId: 70,
            equipmentLevel: 'work_unit',
          }),
        ]),
      ),
    ).toThrow(MachineProfileParseError);
  });

  it('rejects cycles in the equipment hierarchy', () => {
    expect(() =>
      load(
        profile([
          station(70, { parentResourceId: 71 }),
          station(71, { parentResourceId: 70 }),
        ]),
      ),
    ).toThrow(MachineProfileParseError);
  });
});
