import { ConfigService } from '@nestjs/config';
import { resolve } from 'node:path';
import { MachineProfileService } from './machine-profile.service';

describe('MachineProfileService runtime source', () => {
  it('loads the active persisted profile before the legacy file', async () => {
    const persisted = {
      profileVersion: '1.0',
      machineId: 'persisted-machine',
      displayName: 'Persisted machine',
      transport: 'opcua',
      operatingMode: 'observe',
      connection: {
        endpointUrl: 'opc.tcp://persisted:4840',
        applicationName: 'MES',
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
      namespaces: [{ key: 'machine', uri: 'urn:persisted' }],
      stations: [
        {
          stationId: 'station',
          resourceId: 901,
          displayName: 'Station',
          enabled: true,
          resourceType: 'production',
          capabilities: ['telemetry'],
          signals: [],
        },
      ],
    };
    const repository = {
      findOne: jest.fn().mockResolvedValue({
        profile_id: '00000000-0000-4000-8000-000000000001',
        version: 3,
        machine_id: persisted.machineId,
        document: persisted,
      }),
    };
    const service = new MachineProfileService(
      new ConfigService({
        MACHINE_PROFILE_PATH: resolve(
          process.cwd(),
          'test-machines/opcua-simulator/profile.json',
        ),
      }),
      repository as never,
    );

    await service.onModuleInit();

    expect(service.getProfile().machineId).toBe('persisted-machine');
    expect(service.getSource()).toBe('database');
  });

  it('keeps MACHINE_PROFILE_PATH as fallback without an active profile', async () => {
    const repository = { findOne: jest.fn().mockResolvedValue(null) };
    const service = new MachineProfileService(
      new ConfigService({
        MACHINE_PROFILE_PATH: resolve(
          process.cwd(),
          'test-machines/opcua-simulator/profile.json',
        ),
      }),
      repository as never,
    );

    await service.onModuleInit();

    expect(service.getProfile().machineId).toBe('simulator');
    expect(service.getSource()).toBe('legacy_file');
  });
});
