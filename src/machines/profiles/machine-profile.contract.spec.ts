import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PROJECT_ROOT = process.cwd();

const SIMULATOR_PATH = resolve(
  PROJECT_ROOT,
  'test-machines',
  'opcua-simulator',
  'profile.json',
);
const TEMPLATE_PATH = resolve(
  PROJECT_ROOT,
  'config',
  'machines',
  'wara.machine.template.json',
);
const SCHEMA_PATH = resolve(
  PROJECT_ROOT,
  'config',
  'machines',
  'machine-profile.schema.json',
);

const REQUIRED_SIGNAL_KEYS: ReadonlyArray<string> = [
  'key',
  'role',
  'direction',
  'namespace',
  'identifier',
  'dataType',
  'access',
  'required',
];

const EXPECTED_SIMULATOR_ROLES: ReadonlyArray<string> = [
  'workRequest',
  'requestBusy',
  'requestCompleted',
  'carrierId',
  'orderId',
  'resourceId',
  'processCompleted',
  'processResult',
  'idealCycleTimeMs',
  'goodCount',
  'rejectCount',
];

const SCHEMA_DEF_NAMES: ReadonlyArray<string> = [
  'connection',
  'security',
  'authentication',
  'reconnect',
  'namespace',
  'station',
  'stationRouting',
  'carrierInventory',
  'carrierInventorySlot',
  'signal',
  'signalEvent',
  'scaling',
  'envReference',
  'orderParameterDefinition',
  'orderParameterOption',
];

const SCHEMA_ROOT_REQUIRED: ReadonlyArray<string> = [
  'profileVersion',
  'machineId',
  'displayName',
  'transport',
  'operatingMode',
  'connection',
  'namespaces',
  'stations',
];

const PROHIBITED_SECRET_KEYS: ReadonlyArray<string> = [
  'password',
  'secret',
  'token',
  'privateKey',
  'certificateContent',
];

function parseJsonFile(filePath: string): unknown {
  return JSON.parse(readFileSync(filePath, 'utf8')) as unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertRecord(value: unknown): asserts value is Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error('Expected a non-null object');
  }
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function collectLeafKeys(
  obj: Record<string, unknown>,
  prefix: string,
  results: Array<{ key: string; value: unknown }>,
): void {
  for (const [k, v] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (isRecord(v)) {
      collectLeafKeys(v, fullKey, results);
    } else {
      results.push({ key: fullKey, value: v });
    }
  }
}

function findKeysContaining(
  obj: Record<string, unknown>,
  pattern: string,
  prefix: string,
  results: Array<{ key: string; value: unknown }>,
): void {
  for (const [k, v] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (k === pattern || k.toLowerCase().includes(pattern.toLowerCase())) {
      results.push({ key: fullKey, value: v });
    }
    if (isRecord(v)) {
      findKeysContaining(v, pattern, fullKey, results);
    }
  }
}

function hasOwnProperty<X extends Record<string, unknown>, Y extends string>(
  obj: X,
  prop: Y,
): obj is X & Record<Y, unknown> {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MachineProfile Contract', () => {
  // ---- 1. JSON readability ----
  describe('JSON readability', () => {
    it('parses the external test-machine profile as valid JSON', () => {
      const result = parseJsonFile(SIMULATOR_PATH);
      assertRecord(result);
    });

    it('parses wara.machine.template.json as valid JSON', () => {
      const result = parseJsonFile(TEMPLATE_PATH);
      assertRecord(result);
    });

    it('parses machine-profile.schema.json as valid JSON', () => {
      const result = parseJsonFile(SCHEMA_PATH);
      assertRecord(result);
    });
  });

  // ---- 2. Simulator basic structure ----
  describe('Simulator basic structure', () => {
    let profile: Record<string, unknown>;

    beforeAll(() => {
      const parsed = parseJsonFile(SIMULATOR_PATH);
      assertRecord(parsed);
      profile = parsed;
    });

    it('has profileVersion "1.0"', () => {
      expect(profile.profileVersion).toBe('1.0');
    });

    it('has machineId "simulator"', () => {
      expect(profile.machineId).toBe('simulator');
    });

    it('has transport "opcua"', () => {
      expect(profile.transport).toBe('opcua');
    });

    it('has operatingMode "control"', () => {
      expect(profile.operatingMode).toBe('control');
    });

    it('keeps demo PLC result codes in the simulator profile only', () => {
      expect(profile.routingResultCodes).toEqual({
        accepted: 0,
        carrier_unknown: 1,
        order_missing: 2,
        wrong_resource: 3,
        already_completed: 4,
        internal_error: 9,
      });
    });

    it('has a connection block', () => {
      expect(isRecord(profile.connection)).toBe(true);
    });

    it('has a non-empty namespaces array', () => {
      expect(Array.isArray(profile.namespaces)).toBe(true);
      expect((profile.namespaces as unknown[]).length).toBeGreaterThan(0);
    });

    it('has three production stations and one inventory resource', () => {
      expect(Array.isArray(profile.stations)).toBe(true);
      const stations = profile.stations as Record<string, unknown>[];
      expect(stations).toHaveLength(4);
      expect(
        stations.filter((station) => station.resourceType === 'inventory'),
      ).toHaveLength(1);
    });
  });

  // ---- 3. WARA template ----
  describe('WARA template structure', () => {
    let profile: Record<string, unknown>;

    beforeAll(() => {
      const parsed = parseJsonFile(TEMPLATE_PATH);
      assertRecord(parsed);
      profile = parsed;
    });

    it('uses a placeholder for machineId', () => {
      expect(isString(profile.machineId)).toBe(true);
      expect((profile.machineId as string).includes('YOUR_')).toBe(true);
    });

    it('uses a placeholder for endpointUrl', () => {
      assertRecord(profile.connection);
      const conn = profile.connection;
      expect(isString(conn.endpointUrl)).toBe(true);
      expect((conn.endpointUrl as string).includes('YOUR_')).toBe(true);
    });

    it('stays in validate mode until real result codes are commissioned', () => {
      expect(profile.operatingMode).toBe('validate');
    });

    it('has authentication type "username"', () => {
      assertRecord(profile.connection);
      assertRecord(profile.connection.authentication);
      expect(profile.connection.authentication.type).toBe('username');
    });

    it('references username and password via env vars only', () => {
      assertRecord(profile.connection);
      assertRecord(profile.connection.authentication);
      const auth = profile.connection.authentication;
      expect(isString(auth.usernameEnv)).toBe(true);
      expect(isString(auth.passwordEnv)).toBe(true);
    });

    it('contains no inline credentials', () => {
      const secrets: Array<{ key: string; value: unknown }> = [];
      findKeysContaining(profile, 'password', '', secrets);
      findKeysContaining(profile, 'secret', '', secrets);
      findKeysContaining(profile, 'token', '', secrets);

      const inlineSecrets = secrets.filter(
        (s) =>
          !s.key.endsWith('Env') &&
          !s.key.endsWith('PathEnv') &&
          !s.key.endsWith('CertificatePathEnv'),
      );
      expect(inlineSecrets.length).toBe(0);
    });
  });

  // ---- 4. Namespace rules ----
  describe('Namespace rules', () => {
    function testNamespaceRules(
      description: string,
      filePath: string,
    ): void {
      it(description, () => {
        const parsed = parseJsonFile(filePath);
        assertRecord(parsed);
        const namespaces = parsed.namespaces;
        expect(Array.isArray(namespaces)).toBe(true);

        for (const ns of namespaces as unknown[]) {
          assertRecord(ns);
          expect(isString(ns.key)).toBe(true);
          expect((ns.key as string).length).toBeGreaterThan(0);
          expect(isString(ns.uri)).toBe(true);
          expect((ns.uri as string).length).toBeGreaterThan(0);
          expect(hasOwnProperty(ns, 'ns')).toBe(false);
        }
      });
    }

    testNamespaceRules(
      'simulator namespaces have key and uri, no ns field',
      SIMULATOR_PATH,
    );

    testNamespaceRules(
      'template namespaces have key and uri, no ns field',
      TEMPLATE_PATH,
    );

    function testNoNsIndexPattern(
      description: string,
      filePath: string,
    ): void {
      it(description, () => {
        const content = readFileSync(filePath, 'utf8');
        expect(content).not.toMatch(/ns=\d+/);
      });
    }

    testNoNsIndexPattern(
      'template contains no "ns=<number>" pattern',
      TEMPLATE_PATH,
    );

    function testSignalNamespacesExist(
      description: string,
      filePath: string,
    ): void {
      it(description, () => {
        const parsed = parseJsonFile(filePath);
        assertRecord(parsed);
        const stations = parsed.stations;
        expect(Array.isArray(stations)).toBe(true);

        const namespaces = parsed.namespaces;
        expect(Array.isArray(namespaces)).toBe(true);

        const definedKeys = new Set<string>();
        for (const ns of namespaces as unknown[]) {
          assertRecord(ns);
          if (isString(ns.key)) {
            definedKeys.add(ns.key);
          }
        }

        for (const station of stations as unknown[]) {
          assertRecord(station);
          const signals = station.signals;
          expect(Array.isArray(signals)).toBe(true);

          for (const signal of signals as unknown[]) {
            assertRecord(signal);
            expect(isString(signal.namespace)).toBe(true);
            expect(definedKeys.has(signal.namespace as string)).toBe(true);
          }
        }
      });
    }

    testSignalNamespacesExist(
      'simulator signal namespaces reference defined keys',
      SIMULATOR_PATH,
    );

    testSignalNamespacesExist(
      'template signal namespaces reference defined keys',
      TEMPLATE_PATH,
    );
  });

  // ---- 5. Stations and Signals ----
  describe('Stations and Signals', () => {
    function testStationSignalRules(
      description: string,
      filePath: string,
    ): void {
      it(description, () => {
        const parsed = parseJsonFile(filePath);
        assertRecord(parsed);
        const stations = parsed.stations;
        expect(Array.isArray(stations)).toBe(true);

        const stationIds = new Set<string>();

        for (const station of stations as unknown[]) {
          assertRecord(station);

          expect(isString(station.stationId)).toBe(true);
          expect((station.stationId as string).length).toBeGreaterThan(0);
          expect(stationIds.has(station.stationId as string)).toBe(false);
          stationIds.add(station.stationId as string);

          expect(isString(station.displayName)).toBe(true);
          expect((station.displayName as string).length).toBeGreaterThan(0);

          expect(typeof station.enabled).toBe('boolean');

          const signals = station.signals;
          expect(Array.isArray(signals)).toBe(true);
          expect((signals as unknown[]).length).toBeGreaterThan(0);

          const signalKeys = new Set<string>();

          for (const signal of signals as unknown[]) {
            assertRecord(signal);

            for (const requiredKey of REQUIRED_SIGNAL_KEYS) {
              expect(hasOwnProperty(signal, requiredKey)).toBe(true);
              expect(signal[requiredKey]).not.toBe(undefined);
            }

            expect(isString(signal.key)).toBe(true);
            expect(signalKeys.has(signal.key as string)).toBe(false);
            signalKeys.add(signal.key as string);
          }
        }
      });
    }

    testStationSignalRules(
      'simulator stations and signals are valid',
      SIMULATOR_PATH,
    );

    testStationSignalRules(
      'template stations and signals are valid',
      TEMPLATE_PATH,
    );
  });

  // ---- 6. NodeID portability rules ----
  describe('NodeID portability rules', () => {
    function testNoNodeIds(
      description: string,
      filePath: string,
    ): void {
      it(description, () => {
        const content = readFileSync(filePath, 'utf8');
        expect(content).not.toMatch(/ns=\d+/i);
        expect(content).not.toMatch(/nsu=/i);

        const parsed = parseJsonFile(filePath);
        assertRecord(parsed);
        const stations = parsed.stations;
        expect(Array.isArray(stations)).toBe(true);

        for (const station of stations as unknown[]) {
          assertRecord(station);
          const signals = station.signals;
          expect(Array.isArray(signals)).toBe(true);

          for (const signal of signals as unknown[]) {
            assertRecord(signal);
            if (isString(signal.identifier)) {
              expect(signal.identifier).not.toMatch(/^i=\d+$/);
              expect(signal.identifier).not.toMatch(/^ns=/);
              expect(signal.identifier).not.toMatch(/^nsu=/);
            }
          }
        }
      });
    }

    testNoNodeIds(
      'template identifiers contain no full NodeIDs',
      TEMPLATE_PATH,
    );

    it('simulator uses deterministic full NodeIDs from the local test server', () => {
      const parsed = parseJsonFile(SIMULATOR_PATH);
      assertRecord(parsed);
      const stations = parsed.stations;
      expect(Array.isArray(stations)).toBe(true);

      for (const station of stations as unknown[]) {
        assertRecord(station);
        const signals = station.signals;
        expect(Array.isArray(signals)).toBe(true);
        for (const signal of signals as unknown[]) {
          assertRecord(signal);
          expect(signal.identifier).toMatch(/^ns=\d+;[isgb]=/);
        }
      }
    });
  });

  // ---- 7. No embedded secrets ----
  describe('No embedded secrets', () => {
    function testNoSecrets(
      description: string,
      filePath: string,
    ): void {
      it(description, () => {
        const parsed = parseJsonFile(filePath);
        assertRecord(parsed);

        const leaves: Array<{ key: string; value: unknown }> = [];
        collectLeafKeys(parsed, '', leaves);

        const secretFieldNames = leaves.filter((l) =>
          PROHIBITED_SECRET_KEYS.some(
            (prohibited) =>
              l.key.endsWith(`.${prohibited}`) ||
              l.key === prohibited,
          ),
        );
        expect(secretFieldNames.length).toBe(0);

        const envRefs = leaves.filter(
          (l) =>
            l.key.endsWith('.passwordEnv') ||
            l.key.endsWith('.usernameEnv') ||
            l.key.endsWith('.privateKeyPathEnv') ||
            l.key.endsWith('.certificatePathEnv'),
        );

        for (const ref of envRefs) {
          expect(isString(ref.value)).toBe(true);
          expect((ref.value as string).length).toBeGreaterThan(0);
        }
      });
    }

    testNoSecrets(
      'simulator has no embedded secrets',
      SIMULATOR_PATH,
    );

    testNoSecrets(
      'template has no embedded secrets',
      TEMPLATE_PATH,
    );
  });

  // ---- 8. Schema basic structure ----
  describe('Schema basic structure', () => {
    let schema: Record<string, unknown>;

    beforeAll(() => {
      const parsed = parseJsonFile(SCHEMA_PATH);
      assertRecord(parsed);
      schema = parsed;
    });

    it('uses JSON Schema Draft 2020-12', () => {
      expect(isString(schema.$schema)).toBe(true);
      expect((schema.$schema as string)).toBe(
        'https://json-schema.org/draft/2020-12/schema',
      );
    });

    it('has exactly the expected $defs', () => {
      assertRecord(schema.$defs);
      const defNames = Object.keys(schema.$defs).sort();
      expect(defNames).toEqual([...SCHEMA_DEF_NAMES].sort());
    });

    it('has root type "object"', () => {
      expect(schema.type).toBe('object');
    });

    it('has the expected root required fields', () => {
      expect(isStringArray(schema.required)).toBe(true);
      const sortedRequired = (schema.required as string[]).sort();
      expect(sortedRequired).toEqual([...SCHEMA_ROOT_REQUIRED].sort());
    });

    it('uses additionalProperties: false at root', () => {
      expect(schema.additionalProperties).toBe(false);
    });
  });

  // ---- 9. Enum consistency ----
  describe('Enum consistency between profiles and schema', () => {
    let transportValues: string[];
    let operatingModeValues: string[];
    let securityModeValues: string[];
    let policyValues: string[];
    let authValues: string[];
    let roleValues: string[];
    let directionValues: string[];
    let dataTypeValues: string[];
    let accessValues: string[];

    beforeAll(() => {
      const parsed = parseJsonFile(SCHEMA_PATH);
      assertRecord(parsed);
      const schema = parsed;
      assertRecord(schema.properties);
      const props = schema.properties as Record<string, unknown>;

      assertRecord(props.transport);
      transportValues = (props.transport as Record<string, unknown>).enum as string[];

      assertRecord(props.operatingMode);
      operatingModeValues = (props.operatingMode as Record<string, unknown>).enum as string[];

      assertRecord(schema.$defs);
      const defs = schema.$defs as Record<string, unknown>;

      function readDefEnum(defName: string, propName: string): string[] {
        assertRecord(defs[defName]);
        const def = defs[defName] as Record<string, unknown>;
        assertRecord(def.properties);
        const defProps = def.properties as Record<string, unknown>;
        assertRecord(defProps[propName]);
        return (defProps[propName] as Record<string, unknown>).enum as string[];
      }

      securityModeValues = readDefEnum('security', 'mode');
      policyValues = readDefEnum('security', 'policy');
      authValues = readDefEnum('authentication', 'type');
      roleValues = readDefEnum('signal', 'role');
      directionValues = readDefEnum('signal', 'direction');
      dataTypeValues = readDefEnum('signal', 'dataType');
      accessValues = readDefEnum('signal', 'access');
    });

    function assertProfileProperty(
      filePath: string,
      profilePropPath: string,
    ): unknown {
      const parsed = parseJsonFile(filePath);
      assertRecord(parsed);
      const parts = profilePropPath.split('.');
      let current: unknown = parsed;
      for (const part of parts) {
        assertRecord(current as Record<string, unknown>);
        current = (current as Record<string, unknown>)[part];
      }
      return current;
    }

    it('simulator transport is in schema enum', () => {
      expect(transportValues).toContain(
        assertProfileProperty(SIMULATOR_PATH, 'transport'),
      );
    });

    it('simulator operatingMode is in schema enum', () => {
      expect(operatingModeValues).toContain(
        assertProfileProperty(SIMULATOR_PATH, 'operatingMode'),
      );
    });

    it('template transport is in schema enum', () => {
      expect(transportValues).toContain(
        assertProfileProperty(TEMPLATE_PATH, 'transport'),
      );
    });

    it('template operatingMode is in schema enum', () => {
      expect(operatingModeValues).toContain(
        assertProfileProperty(TEMPLATE_PATH, 'operatingMode'),
      );
    });

    it('simulator security.mode is in schema enum', () => {
      expect(securityModeValues).toContain(
        assertProfileProperty(SIMULATOR_PATH, 'connection.security.mode'),
      );
    });

    it('simulator security.policy is in schema enum', () => {
      expect(policyValues).toContain(
        assertProfileProperty(SIMULATOR_PATH, 'connection.security.policy'),
      );
    });

    it('simulator authentication.type is in schema enum', () => {
      expect(authValues).toContain(
        assertProfileProperty(SIMULATOR_PATH, 'connection.authentication.type'),
      );
    });

    it('template security.mode is in schema enum', () => {
      expect(securityModeValues).toContain(
        assertProfileProperty(TEMPLATE_PATH, 'connection.security.mode'),
      );
    });

    it('template security.policy is in schema enum', () => {
      expect(policyValues).toContain(
        assertProfileProperty(TEMPLATE_PATH, 'connection.security.policy'),
      );
    });

    it('template authentication.type is in schema enum', () => {
      expect(authValues).toContain(
        assertProfileProperty(TEMPLATE_PATH, 'connection.authentication.type'),
      );
    });

    it('all simulator signal enums are valid per schema', () => {
      const parsed = parseJsonFile(SIMULATOR_PATH);
      assertRecord(parsed);
      const stations = parsed.stations as unknown[];
      for (const station of stations) {
        assertRecord(station as Record<string, unknown>);
        const signals = (station as Record<string, unknown>)
          .signals as unknown[];
        for (const signal of signals) {
          assertRecord(signal as Record<string, unknown>);
          const s = signal as Record<string, unknown>;
          expect(roleValues).toContain(s.role);
          expect(directionValues).toContain(s.direction);
          expect(dataTypeValues).toContain(s.dataType);
          expect(accessValues).toContain(s.access);
        }
      }
    });

    it('all template signal enums are valid per schema', () => {
      const parsed = parseJsonFile(TEMPLATE_PATH);
      assertRecord(parsed);
      const stations = parsed.stations as unknown[];
      for (const station of stations) {
        assertRecord(station as Record<string, unknown>);
        const signals = (station as Record<string, unknown>)
          .signals as unknown[];
        for (const signal of signals) {
          assertRecord(signal as Record<string, unknown>);
          const s = signal as Record<string, unknown>;
          expect(roleValues).toContain(s.role);
          expect(directionValues).toContain(s.direction);
          expect(dataTypeValues).toContain(s.dataType);
          expect(accessValues).toContain(s.access);
        }
      }
    });
  });

  // ---- 10. Simulator signal scope ----
  describe('Simulator signal scope', () => {
    let profile: Record<string, unknown>;

    beforeAll(() => {
      const parsed = parseJsonFile(SIMULATOR_PATH);
      assertRecord(parsed);
      profile = parsed;
    });

    it('each station contains at least the required integration signals', () => {
      const stations = (profile.stations as unknown[]).filter((station) => {
        assertRecord(station as Record<string, unknown>);
        const candidate = station as Record<string, unknown>;
        return (
          candidate.resourceType === 'production' ||
          candidate.resourceType === 'hybrid' ||
          (Array.isArray(candidate.capabilities) &&
            candidate.capabilities.includes('production'))
        );
      });
      for (const station of stations) {
        assertRecord(station as Record<string, unknown>);
        const signals = (station as Record<string, unknown>).signals as unknown[];
        expect(signals.length).toBeGreaterThanOrEqual(
          EXPECTED_SIMULATOR_ROLES.length,
        );
      }
    });

    it('each station contains all expected roles', () => {
      const stations = (profile.stations as unknown[]).filter((station) => {
        assertRecord(station as Record<string, unknown>);
        const candidate = station as Record<string, unknown>;
        return (
          candidate.resourceType === 'production' ||
          candidate.resourceType === 'hybrid' ||
          (Array.isArray(candidate.capabilities) &&
            candidate.capabilities.includes('production'))
        );
      });
      for (const station of stations) {
        assertRecord(station as Record<string, unknown>);
        const signals = (station as Record<string, unknown>).signals as unknown[];
        const roles = signals.map((s: unknown) => {
          assertRecord(s as Record<string, unknown>);
          return (s as Record<string, unknown>).role;
        });
        for (const expectedRole of EXPECTED_SIMULATOR_ROLES) {
          expect(roles).toContain(expectedRole);
        }
      }
    });
  });
});
