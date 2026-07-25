import { ConfigService } from '@nestjs/config';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { MachineProfileService } from './machine-profile.service';
import { MACHINE_PROFILE_PATH_CONFIG_KEY } from './machine-profile-loader.types';
import {
  MachineProfileError,
  MachineProfileConfigurationError,
  MachineProfileFileNotFoundError,
  MachineProfileReadError,
  MachineProfileParseError,
} from './machine-profile.errors';
const PROJECT_ROOT = process.cwd();
const SIMULATOR_RELATIVE = 'config/machines/simulator.machine.json';
const TEMPLATE_RELATIVE = 'config/machines/wara.machine.template.json';
const SIMULATOR_ABSOLUTE = resolve(PROJECT_ROOT, SIMULATOR_RELATIVE);

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'machine-profile-'));
}

function removeTempDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

function writeJsonFile(dir: string, name: string, data: unknown): string {
  const path = join(dir, name);
  writeFileSync(path, JSON.stringify(data, null, 2), 'utf8');
  return path;
}

function createValidProfile(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    profileVersion: '1.0',
    machineId: 'test-machine',
    displayName: 'Test Machine',
    description: 'A test machine profile',
    transport: 'opcua',
    operatingMode: 'observe',
    connection: {
      endpointUrl: 'opc.tcp://localhost:4840',
      applicationName: 'TestApp',
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
    },
    namespaces: [{ key: 'test', uri: 'urn:test:namespace' }],
    stations: [
      {
        stationId: 'station-1',
        displayName: 'Station 1',
        description: 'First station',
        enabled: true,
        signals: [
          {
            key: 'workRequest',
            role: 'workRequest',
            direction: 'machineToMes',
            namespace: 'test',
            identifier: 'WorkRequest',
            dataType: 'Boolean',
            access: 'read',
            required: true,
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe('MachineProfileService', () => {
  // -----------------------------------------------------------------------
  // 1. loadConfiguredProfile
  // -----------------------------------------------------------------------
  describe('loadConfiguredProfile', () => {
    it('loads the simulator profile via MACHINE_PROFILE_PATH', () => {
      const configService = new ConfigService({
        [MACHINE_PROFILE_PATH_CONFIG_KEY]: SIMULATOR_RELATIVE,
      });
      const service = new MachineProfileService(configService);
      const profile = service.loadConfiguredProfile(PROJECT_ROOT);

      expect(profile.machineId).toBe('simulator');
    });

    it('uses process.cwd() when no baseDirectory is given', () => {
      const configService = new ConfigService({
        [MACHINE_PROFILE_PATH_CONFIG_KEY]: SIMULATOR_RELATIVE,
      });
      const service = new MachineProfileService(configService);
      const profile = service.loadConfiguredProfile();

      expect(profile.machineId).toBe('simulator');
    });

    it('accepts an explicit baseDirectory', () => {
      const configService = new ConfigService({
        [MACHINE_PROFILE_PATH_CONFIG_KEY]: SIMULATOR_RELATIVE,
      });
      const service = new MachineProfileService(configService);
      const profile = service.loadConfiguredProfile(PROJECT_ROOT);

      expect(profile.machineId).toBe('simulator');
    });

    it('throws PROFILE_PATH_MISSING when config value is undefined', () => {
      const configService = new ConfigService({});
      const service = new MachineProfileService(configService);

      let error: unknown;
      try { service.loadConfiguredProfile(); } catch (e) { error = e; }
      expect(error).toBeInstanceOf(MachineProfileConfigurationError);
      if (error instanceof MachineProfileConfigurationError) {
        expect(error.code).toBe('PROFILE_PATH_MISSING');
      }
    });

    it('throws PROFILE_PATH_MISSING when config value is null', () => {
      const configService = new ConfigService({
        [MACHINE_PROFILE_PATH_CONFIG_KEY]: null,
      });
      const service = new MachineProfileService(configService);

      let error: unknown;
      try { service.loadConfiguredProfile(); } catch (e) { error = e; }
      expect(error).toBeInstanceOf(MachineProfileConfigurationError);
      if (error instanceof MachineProfileConfigurationError) {
        expect(error.code).toBe('PROFILE_PATH_MISSING');
      }
    });

    it('throws PROFILE_PATH_MISSING when config value is empty string', () => {
      const configService = new ConfigService({
        [MACHINE_PROFILE_PATH_CONFIG_KEY]: '',
      });
      const service = new MachineProfileService(configService);

      let error: unknown;
      try { service.loadConfiguredProfile(); } catch (e) { error = e; }
      expect(error).toBeInstanceOf(MachineProfileConfigurationError);
      if (error instanceof MachineProfileConfigurationError) {
        expect(error.code).toBe('PROFILE_PATH_MISSING');
      }
    });

    it('throws PROFILE_PATH_MISSING when config value is only whitespace', () => {
      const configService = new ConfigService({
        [MACHINE_PROFILE_PATH_CONFIG_KEY]: '   ',
      });
      const service = new MachineProfileService(configService);

      let error: unknown;
      try { service.loadConfiguredProfile(); } catch (e) { error = e; }
      expect(error).toBeInstanceOf(MachineProfileConfigurationError);
      if (error instanceof MachineProfileConfigurationError) {
        expect(error.code).toBe('PROFILE_PATH_MISSING');
      }
    });

    it('throws PROFILE_PATH_INVALID when config value is not a string', () => {
      const configService = new ConfigService({
        [MACHINE_PROFILE_PATH_CONFIG_KEY]: 42,
      });
      const service = new MachineProfileService(configService);

      let error: unknown;
      try { service.loadConfiguredProfile(); } catch (e) { error = e; }
      expect(error).toBeInstanceOf(MachineProfileConfigurationError);
      if (error instanceof MachineProfileConfigurationError) {
        expect(error.code).toBe('PROFILE_PATH_INVALID');
      }
    });
  });

  // -----------------------------------------------------------------------
  // 2. loadProfile with valid profiles
  // -----------------------------------------------------------------------
  describe('loadProfile with valid profiles', () => {
    it('loads config/machines/simulator.machine.json', () => {
      const configService = new ConfigService({});
      const service = new MachineProfileService(configService);
      const profile = service.loadProfile({
        profilePath: SIMULATOR_RELATIVE,
        baseDirectory: PROJECT_ROOT,
      });

      expect(profile.machineId).toBe('simulator');
    });

    it('returns a profile with three stations for the simulator', () => {
      const configService = new ConfigService({});
      const service = new MachineProfileService(configService);
      const profile = service.loadProfile({
        profilePath: SIMULATOR_RELATIVE,
        baseDirectory: PROJECT_ROOT,
      });

      expect(profile.stations.length).toBe(3);
    });

    it('loads config/machines/wara.machine.template.json', () => {
      const configService = new ConfigService({});
      const service = new MachineProfileService(configService);
      const profile = service.loadProfile({
        profilePath: TEMPLATE_RELATIVE,
        baseDirectory: PROJECT_ROOT,
      });

      expect(profile.operatingMode).toBe('control');
    });

    it('works with an absolute path', () => {
      const configService = new ConfigService({});
      const service = new MachineProfileService(configService);
      const profile = service.loadProfile({ profilePath: SIMULATOR_ABSOLUTE });

      expect(profile.machineId).toBe('simulator');
    });

    it('strips whitespace around a valid profile path', () => {
      const configService = new ConfigService({});
      const service = new MachineProfileService(configService);
      const profile = service.loadProfile({
        profilePath: `  ${SIMULATOR_RELATIVE}  `,
        baseDirectory: PROJECT_ROOT,
      });

      expect(profile.machineId).toBe('simulator');
    });
  });

  // -----------------------------------------------------------------------
  // 3. Path validation
  // -----------------------------------------------------------------------
  describe('path validation', () => {
    it('throws PROFILE_PATH_MISSING for empty profilePath', () => {
      const configService = new ConfigService({});
      const service = new MachineProfileService(configService);

      let error: unknown;
      try { service.loadProfile({ profilePath: '', baseDirectory: PROJECT_ROOT }); } catch (e) { error = e; }
      expect(error).toBeInstanceOf(MachineProfileConfigurationError);
      if (error instanceof MachineProfileConfigurationError) {
        expect(error.code).toBe('PROFILE_PATH_MISSING');
      }
    });

    it('throws PROFILE_PATH_MISSING for whitespace-only profilePath', () => {
      const configService = new ConfigService({});
      const service = new MachineProfileService(configService);

      let error: unknown;
      try { service.loadProfile({ profilePath: '   ', baseDirectory: PROJECT_ROOT }); } catch (e) { error = e; }
      expect(error).toBeInstanceOf(MachineProfileConfigurationError);
      if (error instanceof MachineProfileConfigurationError) {
        expect(error.code).toBe('PROFILE_PATH_MISSING');
      }
    });

    it('throws PROFILE_PATH_INVALID for null-byte in profilePath', () => {
      const configService = new ConfigService({});
      const service = new MachineProfileService(configService);

      let error: unknown;
      try { service.loadProfile({ profilePath: 'bad\0path.json', baseDirectory: PROJECT_ROOT }); } catch (e) { error = e; }
      expect(error).toBeInstanceOf(MachineProfileConfigurationError);
      if (error instanceof MachineProfileConfigurationError) {
        expect(error.code).toBe('PROFILE_PATH_INVALID');
      }
    });

    it('throws PROFILE_PATH_INVALID for empty baseDirectory', () => {
      const configService = new ConfigService({});
      const service = new MachineProfileService(configService);

      let error: unknown;
      try { service.loadProfile({ profilePath: 'profile.json', baseDirectory: '' }); } catch (e) { error = e; }
      expect(error).toBeInstanceOf(MachineProfileConfigurationError);
      if (error instanceof MachineProfileConfigurationError) {
        expect(error.code).toBe('PROFILE_PATH_INVALID');
      }
    });

    it('throws PROFILE_PATH_INVALID for whitespace-only baseDirectory', () => {
      const configService = new ConfigService({});
      const service = new MachineProfileService(configService);

      let error: unknown;
      try { service.loadProfile({ profilePath: 'profile.json', baseDirectory: '   ' }); } catch (e) { error = e; }
      expect(error).toBeInstanceOf(MachineProfileConfigurationError);
      if (error instanceof MachineProfileConfigurationError) {
        expect(error.code).toBe('PROFILE_PATH_INVALID');
      }
    });

    it('throws PROFILE_PATH_INVALID for null-byte in baseDirectory', () => {
      const configService = new ConfigService({});
      const service = new MachineProfileService(configService);

      let error: unknown;
      try { service.loadProfile({ profilePath: 'profile.json', baseDirectory: 'bad\0dir' }); } catch (e) { error = e; }
      expect(error).toBeInstanceOf(MachineProfileConfigurationError);
      if (error instanceof MachineProfileConfigurationError) {
        expect(error.code).toBe('PROFILE_PATH_INVALID');
      }
    });

    it('prevents directory traversal with .. that escapes base directory', () => {
      const tmpDir = createTempDir();
      try {
        const escapedContent = createValidProfile({ machineId: 'escaped' });
        writeJsonFile(tmpDir, 'escaped.json', escapedContent);

        const configService = new ConfigService({});
        const service = new MachineProfileService(configService);
        const traversalPath = join('..', '..', tmpDir, 'escaped.json');

        let error: unknown;
        try { service.loadProfile({ profilePath: traversalPath, baseDirectory: PROJECT_ROOT }); } catch (e) { error = e; }
        expect(error).toBeInstanceOf(MachineProfileConfigurationError);
        if (error instanceof MachineProfileConfigurationError) {
          expect(error.code).toBe('PROFILE_PATH_INVALID');
        }
      } finally {
        removeTempDir(tmpDir);
      }
    });

    it('trims whitespace from baseDirectory', () => {
      const configService = new ConfigService({});
      const service = new MachineProfileService(configService);
      const profile = service.loadProfile({
        profilePath: SIMULATOR_RELATIVE,
        baseDirectory: `  ${PROJECT_ROOT}  `,
      });
      expect(profile.machineId).toBe('simulator');
    });

    it('loads profile from a folder named ..cache', () => {
      const tmpDir = createTempDir();
      try {
        const cacheDir = join(tmpDir, '..cache');
        mkdirSync(cacheDir, { recursive: true });
        writeJsonFile(cacheDir, 'profile.json', createValidProfile({ machineId: 'cache-test' }));

        const configService = new ConfigService({});
        const service = new MachineProfileService(configService);
        const profile = service.loadProfile({
          profilePath: join('..cache', 'profile.json'),
          baseDirectory: tmpDir,
        });

        expect(profile.machineId).toBe('cache-test');
      } finally {
        removeTempDir(tmpDir);
      }
    });

    it('throws PROFILE_PATH_INVALID for ../outside.json', () => {
      const tmpDir = createTempDir();
      try {
        const subDir = join(tmpDir, 'sub');
        mkdirSync(subDir, { recursive: true });
        writeJsonFile(tmpDir, 'outside.json', createValidProfile());

        const configService = new ConfigService({});
        const service = new MachineProfileService(configService);

        let error: unknown;
        try { service.loadProfile({ profilePath: '../outside.json', baseDirectory: subDir }); } catch (e) { error = e; }
        expect(error).toBeInstanceOf(MachineProfileConfigurationError);
        if (error instanceof MachineProfileConfigurationError) {
          expect(error.code).toBe('PROFILE_PATH_INVALID');
        }
      } finally {
        removeTempDir(tmpDir);
      }
    });

    it('throws PROFILE_PATH_INVALID for ../../outside.json', () => {
      const tmpDir = createTempDir();
      try {
        const deepDir = join(tmpDir, 'a', 'b');
        mkdirSync(deepDir, { recursive: true });
        writeJsonFile(tmpDir, 'outside.json', createValidProfile());

        const configService = new ConfigService({});
        const service = new MachineProfileService(configService);

        let error: unknown;
        try { service.loadProfile({ profilePath: '../../outside.json', baseDirectory: deepDir }); } catch (e) { error = e; }
        expect(error).toBeInstanceOf(MachineProfileConfigurationError);
        if (error instanceof MachineProfileConfigurationError) {
          expect(error.code).toBe('PROFILE_PATH_INVALID');
        }
      } finally {
        removeTempDir(tmpDir);
      }
    });

    it('throws PROFILE_PATH_INVALID when relative() returns an absolute path (cross-drive)', () => {
      const tmpDir = createTempDir();
      try {
        const subDir = join(tmpDir, 'sub');
        mkdirSync(subDir, { recursive: true });
        const configService = new ConfigService({});
        const service = new MachineProfileService(configService);

        let error: unknown;
        try { service.loadProfile({ profilePath: '../target.json', baseDirectory: subDir }); } catch (e) { error = e; }
        expect(error).toBeInstanceOf(MachineProfileConfigurationError);
        if (error instanceof MachineProfileConfigurationError) {
          expect(error.code).toBe('PROFILE_PATH_INVALID');
        }
      } finally {
        removeTempDir(tmpDir);
      }
    });

    it('allows absolute paths outside the base directory', () => {
      const tmpDir = createTempDir();
      try {
        const validContent = createValidProfile({ machineId: 'absolute-test' });
        const profilePath = writeJsonFile(tmpDir, 'outside.json', validContent);

        const configService = new ConfigService({});
        const service = new MachineProfileService(configService);
        const profile = service.loadProfile({ profilePath });

        expect(profile.machineId).toBe('absolute-test');
      } finally {
        removeTempDir(tmpDir);
      }
    });
  });

  // -----------------------------------------------------------------------
  // 4. Missing and unreadable files
  // -----------------------------------------------------------------------
  describe('file not found and unreadable', () => {
    it('throws PROFILE_FILE_NOT_FOUND for a non-existent path', () => {
      const tmpDir = createTempDir();
      try {
        const missingPath = join(tmpDir, 'nonexistent.json');
        const configService = new ConfigService({});
        const service = new MachineProfileService(configService);

        let error: unknown;
        try { service.loadProfile({ profilePath: missingPath }); } catch (e) { error = e; }
        expect(error).toBeInstanceOf(MachineProfileFileNotFoundError);
        if (error instanceof MachineProfileFileNotFoundError) {
          expect(error.code).toBe('PROFILE_FILE_NOT_FOUND');
          expect(error.profilePath).toBe(resolve(missingPath));
          expect(error.originalCause).toBeDefined();
        }
      } finally {
        removeTempDir(tmpDir);
      }
    });

    it('throws PROFILE_FILE_UNREADABLE when path is a directory', () => {
      const tmpDir = createTempDir();
      try {
        const configService = new ConfigService({});
        const service = new MachineProfileService(configService);

        let error: unknown;
        try { service.loadProfile({ profilePath: tmpDir }); } catch (e) { error = e; }
        expect(error).toBeInstanceOf(MachineProfileReadError);
        if (error instanceof MachineProfileReadError) {
          expect(error.code).toBe('PROFILE_FILE_UNREADABLE');
          expect(error.profilePath).toBe(resolve(tmpDir));
        }
      } finally {
        removeTempDir(tmpDir);
      }
    });
  });

  // -----------------------------------------------------------------------
  // 5. Invalid JSON
  // -----------------------------------------------------------------------
  describe('invalid JSON', () => {
    const SENSITIVE_VALUE = 'DO_NOT_EXPOSE_SECRET_9381';

    it('throws PROFILE_JSON_INVALID for malformed JSON', () => {
      const tmpDir = createTempDir();
      try {
        const badJsonPath = join(tmpDir, 'bad.json');
        writeFileSync(badJsonPath, `{ "invalid": ${SENSITIVE_VALUE} }`, 'utf8');

        const configService = new ConfigService({});
        const service = new MachineProfileService(configService);

        let error: unknown;
        try { service.loadProfile({ profilePath: badJsonPath }); } catch (e) { error = e; }
        expect(error).toBeInstanceOf(MachineProfileParseError);
        if (error instanceof MachineProfileParseError) {
          expect(error.code).toBe('PROFILE_JSON_INVALID');
          expect(error.message).not.toContain(SENSITIVE_VALUE);
          expect(error.profilePath).toBe(resolve(badJsonPath));
        }
      } finally {
        removeTempDir(tmpDir);
      }
    });

    it('does not set the cache on JSON parse failure', () => {
      const tmpDir = createTempDir();
      try {
        const goodPath = writeJsonFile(tmpDir, 'good.json', createValidProfile());
        const badPath = join(tmpDir, 'bad.json');
        writeFileSync(badPath, '{ broken', 'utf8');

        const configService = new ConfigService({});
        const service = new MachineProfileService(configService);

        service.loadProfile({ profilePath: goodPath });
        expect(service.getProfile().machineId).toBe('test-machine');

        let error: unknown;
        try { service.loadProfile({ profilePath: badPath }); } catch (e) { error = e; }
        expect(error).toBeInstanceOf(MachineProfileParseError);

        expect(service.getProfile().machineId).toBe('test-machine');
      } finally {
        removeTempDir(tmpDir);
      }
    });
  });

  // -----------------------------------------------------------------------
  // 6. Structurally invalid profiles
  // -----------------------------------------------------------------------
  describe('structurally invalid profiles', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = createTempDir();
    });

    afterEach(() => {
      removeTempDir(tmpDir);
    });

    function createService(): MachineProfileService {
      return new MachineProfileService(new ConfigService({}));
    }

    function testInvalidProfile(
      description: string,
      profileData: unknown,
    ): void {
      it(description, () => {
        const path = writeJsonFile(tmpDir, `${Date.now()}.json`, profileData);
        const service = createService();

        let error: unknown;
        try { service.loadProfile({ profilePath: path }); } catch (e) { error = e; }
        expect(error).toBeInstanceOf(MachineProfileParseError);
        if (error instanceof MachineProfileParseError) {
          expect(error.code).toBe('PROFILE_JSON_INVALID');
          expect(error.message).not.toContain(JSON.stringify(profileData));
        }
      });
    }

    testInvalidProfile('root is null', null);
    testInvalidProfile('root is an array', []);
    testInvalidProfile('missing machineId', createValidProfile({ machineId: undefined }));
    testInvalidProfile('unknown operatingMode', createValidProfile({ operatingMode: 'invalid_mode' }));
    testInvalidProfile('missing connection', createValidProfile({ connection: undefined }));
    testInvalidProfile('namespaces is not an array', createValidProfile({ namespaces: 'not-an-array' }));
    testInvalidProfile('stations is not an array', createValidProfile({ stations: 'not-an-array' }));
    testInvalidProfile('unknown signal role', createValidProfile({
      stations: [
        {
          stationId: 's1',
          displayName: 'S1',
          enabled: true,
          signals: [{ key: 's', role: 'unknown_role', direction: 'machineToMes', namespace: 'test', identifier: 'X', dataType: 'Boolean', access: 'read', required: true }],
        },
      ],
    }));
    testInvalidProfile('unknown dataType', createValidProfile({
      stations: [
        {
          stationId: 's1',
          displayName: 'S1',
          enabled: true,
          signals: [{ key: 's', role: 'workRequest', direction: 'machineToMes', namespace: 'test', identifier: 'X', dataType: 'UnknownType', access: 'read', required: true }],
        },
      ],
    }));
    testInvalidProfile('metadata with non-string value', createValidProfile({ metadata: { key: 42 } }));
  });

  // -----------------------------------------------------------------------
  // 7. Environment references and optional fields
  // -----------------------------------------------------------------------
  describe('environment references and optional fields', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = createTempDir();
    });

    afterEach(() => {
      removeTempDir(tmpDir);
    });

    it('accepts valid env references', () => {
      const profile = createValidProfile({
        connection: {
          endpointUrl: 'opc.tcp://host:4840',
          applicationName: 'App',
          security: { mode: 'SignAndEncrypt', policy: 'Basic256Sha256', certificatePathEnv: 'CERT_PATH' },
          authentication: { type: 'username', usernameEnv: 'OPCUA_USER', passwordEnv: 'OPCUA_PASS' },
          connectionTimeoutMs: 15000,
          sessionTimeoutMs: 120000,
          reconnect: { enabled: true, initialDelayMs: 2000, maximumDelayMs: 60000, backoffMultiplier: 2 },
        },
      });
      const path = writeJsonFile(tmpDir, 'env.json', profile);
      const configService = new ConfigService({});
      const service = new MachineProfileService(configService);
      const loaded = service.loadProfile({ profilePath: path });

      expect(loaded.machineId).toBe('test-machine');
    });

    it('accepts profiles without optional fields', () => {
      const profile = createValidProfile();
      delete profile.description;
      delete profile.metadata;
      delete (profile.stations[0] as Record<string, unknown>).description;
      delete (profile.stations[0].signals[0] as Record<string, unknown>).description;
      delete (profile.stations[0].signals[0] as Record<string, unknown>).scaling;

      const path = writeJsonFile(tmpDir, 'minimal.json', profile);
      const configService = new ConfigService({});
      const service = new MachineProfileService(configService);
      const loaded = service.loadProfile({ profilePath: path });

      expect(loaded.machineId).toBe('test-machine');
    });

    it('accepts optional scaling with factor and offset', () => {
      const profile = createValidProfile();
      profile.stations[0].signals[0].scaling = { factor: 0.5, offset: 10 };

      const path = writeJsonFile(tmpDir, 'scaling.json', profile);
      const configService = new ConfigService({});
      const service = new MachineProfileService(configService);
      const loaded = service.loadProfile({ profilePath: path });

      expect(loaded.machineId).toBe('test-machine');
    });

    it('rejects non-string certificatePathEnv in security', () => {
      const profile = createValidProfile({
        connection: {
          endpointUrl: 'opc.tcp://host:4840',
          applicationName: 'App',
          security: { mode: 'SignAndEncrypt', policy: 'Basic256Sha256', certificatePathEnv: 123 },
          authentication: { type: 'username', usernameEnv: 'USER', passwordEnv: 'PASS' },
          connectionTimeoutMs: 10000,
          sessionTimeoutMs: 60000,
          reconnect: { enabled: true, initialDelayMs: 1000, maximumDelayMs: 30000, backoffMultiplier: 2, maxAttempts: 10 },
        },
      });

      const path = writeJsonFile(tmpDir, 'bad-cert-env.json', profile);
      const configService = new ConfigService({});
      const service = new MachineProfileService(configService);

      let error: unknown;
      try { service.loadProfile({ profilePath: path }); } catch (e) { error = e; }
      expect(error).toBeInstanceOf(MachineProfileParseError);
      if (error instanceof MachineProfileParseError) {
        expect(error.code).toBe('PROFILE_JSON_INVALID');
      }
    });

    it('rejects non-string passwordEnv in authentication', () => {
      const profile = createValidProfile({
        connection: {
          endpointUrl: 'opc.tcp://host:4840',
          applicationName: 'App',
          security: { mode: 'SignAndEncrypt', policy: 'Basic256Sha256' },
          authentication: { type: 'username', usernameEnv: 'USER', passwordEnv: false },
          connectionTimeoutMs: 10000,
          sessionTimeoutMs: 60000,
          reconnect: { enabled: true, initialDelayMs: 1000, maximumDelayMs: 30000, backoffMultiplier: 2, maxAttempts: 10 },
        },
      });

      const path = writeJsonFile(tmpDir, 'bad-pass-env.json', profile);
      const configService = new ConfigService({});
      const service = new MachineProfileService(configService);

      let error: unknown;
      try { service.loadProfile({ profilePath: path }); } catch (e) { error = e; }
      expect(error).toBeInstanceOf(MachineProfileParseError);
      if (error instanceof MachineProfileParseError) {
        expect(error.code).toBe('PROFILE_JSON_INVALID');
      }
    });

    it('rejects non-numeric scaling factor', () => {
      const path = writeJsonFile(tmpDir, 'bad-scaling.json', {
        profileVersion: '1.0',
        machineId: 'test-machine',
        displayName: 'Test Machine',
        description: 'A test machine profile',
        transport: 'opcua',
        operatingMode: 'observe',
        connection: {
          endpointUrl: 'opc.tcp://localhost:4840',
          applicationName: 'TestApp',
          security: { mode: 'None', policy: 'None' },
          authentication: { type: 'anonymous' },
          connectionTimeoutMs: 10000,
          sessionTimeoutMs: 60000,
          reconnect: { enabled: true, initialDelayMs: 1000, maximumDelayMs: 30000, backoffMultiplier: 2, maxAttempts: 10 },
        },
        namespaces: [{ key: 'test', uri: 'urn:test:namespace' }],
        stations: [
          {
            stationId: 'station-1',
            displayName: 'Station 1',
            enabled: true,
            signals: [
              {
                key: 'workRequest',
                role: 'workRequest',
                direction: 'machineToMes',
                namespace: 'test',
                identifier: 'WorkRequest',
                dataType: 'Boolean',
                access: 'read',
                required: true,
                scaling: { factor: 'wrong', offset: 10 },
              },
            ],
          },
        ],
      });

      const configService = new ConfigService({});
      const service = new MachineProfileService(configService);

      let error: unknown;
      try { service.loadProfile({ profilePath: path }); } catch (e) { error = e; }
      expect(error).toBeInstanceOf(MachineProfileParseError);
      if (error instanceof MachineProfileParseError) {
        expect(error.code).toBe('PROFILE_JSON_INVALID');
      }
    });
  });

  // -----------------------------------------------------------------------
  // 8. Cache and lazy loading
  // -----------------------------------------------------------------------
  describe('cache and lazy loading', () => {
    it('getProfile() loads the configured profile on first call (lazy)', () => {
      const configService = new ConfigService({
        [MACHINE_PROFILE_PATH_CONFIG_KEY]: SIMULATOR_RELATIVE,
      });
      const service = new MachineProfileService(configService);

      const profile = service.getProfile();

      expect(profile.machineId).toBe('simulator');
    });

    it('getProfile() returns the same object on subsequent calls', () => {
      const configService = new ConfigService({
        [MACHINE_PROFILE_PATH_CONFIG_KEY]: SIMULATOR_RELATIVE,
      });
      const service = new MachineProfileService(configService);

      const first = service.getProfile();
      const second = service.getProfile();

      expect(second).toBe(first);
    });

    it('getProfile() returns the explicitly loaded profile', () => {
      const configService = new ConfigService({});
      const service = new MachineProfileService(configService);

      const loaded = service.loadProfile({
        profilePath: SIMULATOR_ABSOLUTE,
      });
      const cached = service.getProfile();

      expect(cached).toBe(loaded);
    });

    it('does not require ConfigService after explicit loadProfile', () => {
      const configService = new ConfigService({});
      const service = new MachineProfileService(configService);

      service.loadProfile({ profilePath: SIMULATOR_ABSOLUTE });

      const cached = service.getProfile();
      expect(cached.machineId).toBe('simulator');
    });

    it('error after a successful load does not overwrite the cache', () => {
      const tmpDir = createTempDir();
      try {
        const goodPath = writeJsonFile(tmpDir, 'good.json', createValidProfile());

        const configService = new ConfigService({});
        const service = new MachineProfileService(configService);
        const first = service.loadProfile({ profilePath: goodPath });

        const badPath = join(tmpDir, 'bad.json');
        writeFileSync(badPath, '{ broken', 'utf8');

        let error: unknown;
        try { service.loadProfile({ profilePath: badPath }); } catch (e) { error = e; }
        expect(error).toBeInstanceOf(MachineProfileParseError);

        const cached = service.getProfile();
        expect(cached).toBe(first);
      } finally {
        removeTempDir(tmpDir);
      }
    });

    it('failed first load does not create a cache', () => {
      const configService = new ConfigService({
        [MACHINE_PROFILE_PATH_CONFIG_KEY]: '/nonexistent/path.json',
      });
      const service = new MachineProfileService(configService);

      let error: unknown;
      try { service.getProfile(); } catch (e) { error = e; }
      expect(error).toBeDefined();

      const profile = service.loadProfile({ profilePath: SIMULATOR_ABSOLUTE });
      expect(profile.machineId).toBe('simulator');
      const cached = service.getProfile();
      expect(cached).toBe(profile);
    });
  });

  // -----------------------------------------------------------------------
  // 9. Error classes
  // -----------------------------------------------------------------------
  describe('error classes', () => {
    it('MachineProfileConfigurationError is an instance of Error and MachineProfileError', () => {
      const error = new MachineProfileConfigurationError('PROFILE_PATH_MISSING', 'test');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(MachineProfileError);
      expect(error.name).toBe('MachineProfileConfigurationError');
      expect(error.code).toBe('PROFILE_PATH_MISSING');
    });

    it('MachineProfileFileNotFoundError has fixed code PROFILE_FILE_NOT_FOUND', () => {
      const error = new MachineProfileFileNotFoundError('not found');

      expect(error).toBeInstanceOf(MachineProfileError);
      expect(error.name).toBe('MachineProfileFileNotFoundError');
      expect(error.code).toBe('PROFILE_FILE_NOT_FOUND');
    });

    it('MachineProfileReadError has fixed code PROFILE_FILE_UNREADABLE', () => {
      const error = new MachineProfileReadError('unreadable');

      expect(error.name).toBe('MachineProfileReadError');
      expect(error.code).toBe('PROFILE_FILE_UNREADABLE');
    });

    it('MachineProfileParseError has fixed code PROFILE_JSON_INVALID', () => {
      const error = new MachineProfileParseError('parse error');

      expect(error.name).toBe('MachineProfileParseError');
      expect(error.code).toBe('PROFILE_JSON_INVALID');
    });

    it('stores profilePath and originalCause correctly', () => {
      const cause = new Error('root cause');
      const error = new MachineProfileFileNotFoundError(
        'not found',
        '/some/path.json',
        cause,
      );

      expect(error.profilePath).toBe('/some/path.json');
      expect(error.originalCause).toBe(cause);
    });

    it('MachineProfileConfigurationError only accepts the two config codes', () => {
      const missing = new MachineProfileConfigurationError('PROFILE_PATH_MISSING', 'missing');
      const invalid = new MachineProfileConfigurationError('PROFILE_PATH_INVALID', 'invalid');

      expect(missing.code).toBe('PROFILE_PATH_MISSING');
      expect(invalid.code).toBe('PROFILE_PATH_INVALID');
    });
  });
});
