import { BadRequestException, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { MachineProfile } from './machine-profile.types';
import { MachineProfileManagementService } from './machine-profile-management.service';
import { MachineProfileService } from './machine-profile.service';

function profile(overrides: Partial<MachineProfile> = {}): MachineProfile {
  const stations = [
    {
      stationId: 'machine-root',
      resourceId: 100,
      displayName: 'Echte Maschine',
      enabled: true,
      equipmentLevel: 'machine' as const,
      executionModel: 'work_unit_jobs' as const,
      jobInterface: 'telemetry_only' as const,
      resourceType: 'production' as const,
      capabilities: ['telemetry'] as const,
      signals: [],
    },
    ...[1, 2, 3].map((number) => ({
      stationId: `work-unit-${number}`,
      resourceId: 100 + number,
      parentResourceId: 100,
      displayName: `Work Unit ${number}`,
      enabled: true,
      equipmentLevel: 'work_unit' as const,
      executionModel: 'work_unit_jobs' as const,
      jobInterface: 'signal_handshake' as const,
      resourceType: 'production' as const,
      capabilities: ['production', 'routing', 'telemetry'] as const,
      routing: {
        enabled: true,
        sequence: number,
        operationNo: number * 10,
        operation: `Arbeitsgang ${number}`,
      },
      signals: [
        {
          key: 'processActive',
          role: 'processActive' as const,
          direction: 'machineToMes' as const,
          namespace: 'plc',
          identifier: `s=Unit${number}.Active`,
          dataType: 'Boolean' as const,
          access: 'read' as const,
          required: true,
        },
      ],
    })),
  ];
  return {
    profileVersion: '1.0',
    machineId: 'real-plc-1',
    displayName: 'Echte SPS Maschine',
    transport: 'opcua',
    operatingMode: 'observe',
    connection: {
      endpointUrl: 'opc.tcp://192.0.2.10:4840',
      applicationName: 'WARA MES Commissioning',
      security: { mode: 'None', policy: 'None' },
      authentication: { type: 'anonymous' },
      connectionTimeoutMs: 10_000,
      sessionTimeoutMs: 60_000,
      reconnect: {
        enabled: true,
        initialDelayMs: 1_000,
        maximumDelayMs: 30_000,
        backoffMultiplier: 2,
      },
    },
    namespaces: [{ key: 'plc', uri: 'urn:real:plc' }],
    stations,
    ...overrides,
  };
}

function setup(existing: any[] = [], manualMachines: any[] = []) {
  const rows = existing;
  const versions = {
    create: jest.fn((value) => ({
      id: value.id || `version-${rows.length + 1}`,
      created_at: value.created_at || new Date(),
      ...value,
    })),
    save: jest.fn(async (value) => {
      const index = rows.findIndex((row) => row.id === value.id);
      if (index >= 0) rows[index] = value;
      else rows.push(value);
      return value;
    }),
    find: jest.fn(async (options = {}) => {
      if (options.where?.active === true)
        return rows.filter((row) => row.active);
      if (options.where?.profile_id) {
        const excluded = options.where.profile_id._value;
        return rows.filter((row) => row.profile_id !== excluded);
      }
      return rows;
    }),
    findOne: jest.fn(async ({ where, order }) => {
      const matches = rows.filter((row) =>
        where.profile_id
          ? row.profile_id === where.profile_id &&
            (where.active === undefined || row.active === where.active)
          : row.active === where.active,
      );
      return (
        matches.sort((left, right) =>
          order?.version === 'DESC' ? right.version - left.version : 0,
        )[0] || null
      );
    }),
  };
  const machines = { find: jest.fn(async () => manualMachines) };
  const managerRepository = {
    ...versions,
    findOneByOrFail: jest.fn(async ({ id }) =>
      rows.find((row) => row.id === id),
    ),
  };
  const dataSource = {
    transaction: jest.fn(async (callback) =>
      callback({ getRepository: () => managerRepository }),
    ),
  };
  const validator = new MachineProfileService(new ConfigService({}));
  return {
    rows,
    service: new MachineProfileManagementService(
      versions as never,
      machines as never,
      dataSource as never,
      validator,
    ),
  };
}

describe('MachineProfileManagementService', () => {
  it('creates an observe draft with a machine root and three work units', async () => {
    const { service } = setup();
    const result = await service.create(
      { ...profile(), operatingMode: 'control' },
      'admin',
    );

    expect(result.status).toBe('draft');
    expect(result.document.operatingMode).toBe('observe');
    expect(result.document.stations).toHaveLength(4);
    expect(result.createdBy).toBe('admin');
  });

  it('stores an offline draft before stations or OPC UA data exist', async () => {
    const { service } = setup();

    const result = await service.create(
      {
        machineId: 'lernfabrik-linie-c',
        displayName: 'Lernfabrik 4.0 – Linie C',
        stations: [],
      },
      'admin',
    );

    expect(result).toMatchObject({
      status: 'draft',
      active: false,
      document: {
        machineId: 'lernfabrik-linie-c',
        displayName: 'Lernfabrik 4.0 – Linie C',
        operatingMode: 'observe',
        stations: [],
      },
    });
  });

  it('keeps technical machine IDs unique for incomplete drafts', async () => {
    const existingDocument = profile();
    const { service } = setup([
      {
        id: 'v1',
        profile_id: '00000000-0000-4000-8000-000000000001',
        version: 1,
        machine_id: 'lernfabrik-linie-c',
        status: 'draft',
        active: false,
        document: existingDocument,
        created_by: 'admin',
        created_at: new Date(),
      },
    ]);

    await expect(
      service.create(
        {
          machineId: 'lernfabrik-linie-c',
          displayName: 'Zweiter Entwurf',
          stations: [],
        },
        'admin',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects persisted secrets instead of returning or storing them', async () => {
    const { service, rows } = setup();
    const document = profile() as any;
    document.connection.authentication = {
      type: 'username',
      usernameEnv: 'PLC_USER',
      password: 'actual-secret',
    };

    await expect(service.create(document, 'admin')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(rows).toHaveLength(0);
  });

  it('allows only dedicated OPCUA environment references', async () => {
    const { service } = setup();
    const document = profile() as any;
    document.connection.authentication = {
      type: 'username',
      usernameEnv: 'OPCUA_REAL_PLC_USERNAME',
      passwordEnv: 'DB_PASSWORD',
    };

    await expect(service.create(document, 'admin')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects globally used resource IDs', async () => {
    const { service } = setup(
      [],
      [{ resource_id: 101, profile_managed: false }],
    );

    await expect(service.create(profile(), 'admin')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('reports cycles, duplicate station IDs and duplicate route sequences', async () => {
    const document = profile() as any;
    document.stations[0].parentResourceId = 101;
    document.stations[1].stationId = document.stations[2].stationId;
    document.stations[1].routing.sequence = 2;
    const { service } = setup([
      {
        id: 'v1',
        profile_id: '00000000-0000-4000-8000-000000000001',
        version: 1,
        machine_id: document.machineId,
        status: 'draft',
        active: false,
        document,
        created_by: 'admin',
        created_at: new Date(),
      },
    ]);

    const result = await service.validate(
      '00000000-0000-4000-8000-000000000001',
    );

    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain('Duplicate stationId');
    expect(result.errors.join(' ')).toContain('Duplicate routing sequence');
    expect(result.errors.join(' ')).toContain('cycle');
  });

  it('validates required signals and activates a valid version explicitly', async () => {
    const document = profile();
    const row = {
      id: 'v1',
      profile_id: '00000000-0000-4000-8000-000000000001',
      version: 1,
      machine_id: document.machineId,
      status: 'draft',
      active: false,
      document,
      validation_result: null,
      live_validation_result: null,
      created_by: 'admin',
      created_at: new Date(),
    };
    const { service } = setup([row]);

    const validation = await service.validate(row.profile_id);
    expect(validation.valid).toBe(true);
    expect((validation.summary as any).requiredSignals).toContain(
      'work-unit-1.processActive',
    );
    expect((validation.summary as any).endpoint).toBeUndefined();
    expect((validation.summary as any).endpoints).toEqual(
      expect.arrayContaining([
        {
          stationId: 'work-unit-1',
          endpoint: document.connection.endpointUrl,
        },
      ]),
    );

    const activated = await service.activate(
      row.profile_id,
      document.machineId,
      false,
      'admin',
    );
    expect(activated.active).toBe(true);
    expect(activated.restartRequired).toBe(true);
  });

  it('shows each station connection with profile fallback in validation', async () => {
    const document = profile() as any;
    document.stations[1].connection = {
      ...document.connection,
      endpointUrl: 'opc.tcp://station-one:4840',
    };
    const row = {
      id: 'v1',
      profile_id: '00000000-0000-4000-8000-000000000001',
      version: 1,
      machine_id: document.machineId,
      status: 'draft',
      active: false,
      document,
      validation_result: null,
      live_validation_result: null,
      created_by: 'admin',
      created_at: new Date(),
    };
    const { service } = setup([row]);

    const validation = await service.validate(row.profile_id);

    expect((validation.summary as any).endpoints).toEqual(
      expect.arrayContaining([
        {
          stationId: 'machine-root',
          endpoint: document.connection.endpointUrl,
        },
        { stationId: 'work-unit-1', endpoint: 'opc.tcp://station-one:4840' },
      ]),
    );
  });

  it('does not activate an invalid profile', async () => {
    const document = profile({ stations: [] });
    const row = {
      id: 'v1',
      profile_id: '00000000-0000-4000-8000-000000000001',
      version: 1,
      machine_id: document.machineId,
      status: 'draft',
      active: false,
      document,
      validation_result: null,
      live_validation_result: null,
      created_by: 'admin',
      created_at: new Date(),
    };
    const { service } = setup([row]);

    await expect(
      service.activate(row.profile_id, document.machineId, false, 'admin'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires a successful live check of the exact control version', async () => {
    const document = profile({
      operatingMode: 'control',
      stations: [profile().stations[0]],
    });
    const row = {
      id: 'v1',
      profile_id: '00000000-0000-4000-8000-000000000001',
      version: 1,
      machine_id: document.machineId,
      status: 'structurally_valid',
      active: false,
      document,
      validation_result: { valid: true },
      live_validation_result: null,
      created_by: 'admin',
      created_at: new Date(),
    };
    const { service } = setup([row]);

    await expect(
      service.activate(row.profile_id, document.machineId, true, 'admin'),
    ).rejects.toThrow('erfolgreicher Live-Prüfung');

    row.live_validation_result = {
      valid: true,
      checkedAt: new Date().toISOString(),
    };
    await expect(
      service.activate(row.profile_id, document.machineId, true, 'admin'),
    ).resolves.toMatchObject({ active: true, restartRequired: true });
  });

  it('keeps an older active runtime version visible and deactivatable beside a draft', async () => {
    const document = profile();
    const profileId = '00000000-0000-4000-8000-000000000001';
    const active = {
      id: 'v1',
      profile_id: profileId,
      version: 1,
      machine_id: document.machineId,
      status: 'active',
      active: true,
      document,
      validation_result: { valid: true },
      live_validation_result: null,
      created_by: 'admin',
      created_at: new Date(),
    };
    const draft = {
      ...active,
      id: 'v2',
      version: 2,
      status: 'draft',
      active: false,
      document: { ...document, displayName: 'Neuer Entwurf' },
    };
    const { service } = setup([active, draft]);

    await expect(service.find(profileId)).resolves.toMatchObject({
      version: 2,
      active: false,
      runtimeActiveVersion: 1,
    });
    await expect(service.deactivate(profileId, 'admin')).resolves.toMatchObject(
      {
        version: 1,
        active: false,
        restartRequired: true,
      },
    );
  });
});
