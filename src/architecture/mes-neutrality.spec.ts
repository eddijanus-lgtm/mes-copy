import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const projectRoot = process.cwd();
const sourceRoot = resolve(projectRoot, 'src');
const frontendRoot = resolve(projectRoot, 'frontend', 'src');
const testMachineRoot = resolve(
  projectRoot,
  'test-machines',
  'opcua-simulator',
);

function productionSourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return productionSourceFiles(path);
    if (!path.endsWith('.ts') || path.endsWith('.spec.ts')) return [];
    return [path];
  });
}

describe('MES machine neutrality', () => {
  const productionSources = productionSourceFiles(sourceRoot);
  const frontendSources = readdirRecursively(frontendRoot, [
    '.js',
    '.jsx',
    '.ts',
    '.tsx',
  ]);

  it('contains no simulated values or simulator-specific branches in production code', () => {
    const violations = productionSources.flatMap((path) => {
      const source = readFileSync(path, 'utf8');
      const forbiddenPatterns = [
        /\bMath\.random\s*\(/,
        /demo-production/i,
        /OPC_UA_RESOURCE_IDS/,
        /OPC_UA_SERVER_ADDRESS/,
        /OPC_UA_ALLOWED_NODE_PREFIXES/,
        /ns=\d+;s=Station\d+/,
        /Station\$\{resourceId\}/,
      ];

      return forbiddenPatterns.some((pattern) => pattern.test(source))
        ? [relative(projectRoot, path)]
        : [];
    });

    expect(violations).toEqual([]);
  });

  it('does not encode a fixed station count, signal vocabulary, or station artwork in the UI', () => {
    const forbiddenPatterns = [
      /\bStation[123]\b/,
      /\biPar[1-4]\b/,
      /\bRESULT_TEXT\b/,
      /\bSTATION_ASSETS\b/,
      /\[\s*1\s*,\s*2\s*,\s*3\s*\]/,
    ];
    const violations = frontendSources.flatMap((path) => {
      const source = readFileSync(path, 'utf8');
      return forbiddenPatterns.some((pattern) => pattern.test(source))
        ? [relative(projectRoot, path)]
        : [];
    });
    expect(violations).toEqual([]);
  });

  it('selects the OPC UA endpoint only through the machine profile', () => {
    const environmentExample = readFileSync(
      resolve(projectRoot, '.env.example'),
      'utf8',
    );
    const commissioningTool = readFileSync(
      resolve(projectRoot, 'tools', 'opcua-commissioning.js'),
      'utf8',
    );
    expect(environmentExample).not.toContain('OPC_UA_SERVER_ADDRESS');
    expect(commissioningTool).not.toContain('OPC_UA_SERVER_ADDRESS');
  });

  it('always registers the real OPC UA machine adapter', () => {
    const moduleSource = readFileSync(
      resolve(sourceRoot, 'opcua', 'opcua.module.ts'),
      'utf8',
    );
    const adapterSource = readFileSync(
      resolve(sourceRoot, 'opcua', 'opcua-machine.adapter.ts'),
      'utf8',
    );

    expect(moduleSource).toContain(
      '{ provide: MACHINE_ADAPTER, useClass: OpcUaMachineAdapter }',
    );
    expect(moduleSource).not.toMatch(
      /provide:\s*MACHINE_ADAPTER[\s\S]*?use(?:Value|Factory):/,
    );
    expect(adapterSource).toContain('implements MachineAdapter');
    expect(adapterSource).toContain('private readonly opcUa: OpcUaService');
  });

  it('keeps the simulated machine outside the MES runtime', () => {
    expect(existsSync(resolve(testMachineRoot, 'server.js'))).toBe(true);
    expect(existsSync(resolve(testMachineRoot, 'profile.json'))).toBe(true);
    expect(
      productionSources.some((path) =>
        relative(sourceRoot, path).toLowerCase().includes('simulator'),
      ),
    ).toBe(false);
  });

  it('contains no hard-coded PLC result-code enum in routing core', () => {
    const routingSource = readFileSync(
      resolve(sourceRoot, 'orders', 'routing.service.ts'),
      'utf8',
    );
    expect(routingSource).not.toContain('RoutingResultCode');
    expect(routingSource).not.toMatch(/\bresultCode\s*:\s*\d+/);
  });

  it('does not fabricate dashboard OEE components', () => {
    const dashboardSource = readFileSync(
      resolve(sourceRoot, 'dashboard', 'dashboard.service.ts'),
      'utf8',
    );
    expect(dashboardSource).not.toMatch(/performance\s*:\s*1(?:\.0)?/);
    expect(dashboardSource).toContain('getProductionMetricSamples');
    expect(dashboardSource).toContain('counterDelta');
    expect(dashboardSource).toContain('production.total === null');
  });

  it('ships a data-free machine CSV template', () => {
    const machinesSource = readFileSync(
      resolve(sourceRoot, 'machines', 'machines.service.ts'),
      'utf8',
    );
    expect(machinesSource).not.toContain('Station-1,CNC');
    expect(machinesSource).not.toContain('Roboter-A');
  });

  it('does not hard-code the external-order MQTT topic in the gateway', () => {
    const mqttSource = readFileSync(
      resolve(sourceRoot, 'opcua', 'mqtt-gateway.service.ts'),
      'utf8',
    );
    expect(mqttSource).not.toContain('i4.0/production/orders');
  });

  it('keeps equipment hierarchy and execution history vendor-neutral', () => {
    const coreFiles = [
      resolve(sourceRoot, 'machines', 'machine.entity.ts'),
      resolve(sourceRoot, 'machines', 'machines.service.ts'),
      resolve(sourceRoot, 'machines', 'machines.controller.ts'),
      resolve(sourceRoot, 'orders', 'routing.service.ts'),
      resolve(sourceRoot, 'execution-steps', 'execution-step.entity.ts'),
      resolve(sourceRoot, 'execution-steps', 'execution-steps.service.ts'),
      resolve(sourceRoot, 'execution-steps', 'execution-steps.controller.ts'),
    ];
    const forbiddenPatterns = [
      /\bnova(?:press)?\b/i,
      /\bnx[-_]?9000\b/i,
      /\bns=\d+;[isgb]=/i,
      /\b(?:requestBusy|requestAccepted|requestRejected|requestCompleted)\b/,
      /\b(?:controlStart|controlStop|controlReset|controlPause)\b/,
      /\bresultCode\s*:\s*\d+/,
    ];
    const violations = coreFiles.flatMap((path) => {
      const source = readFileSync(path, 'utf8');
      return forbiddenPatterns.some((pattern) => pattern.test(source))
        ? [relative(projectRoot, path)]
        : [];
    });

    expect(violations).toEqual([]);
  });
});

function readdirRecursively(
  directory: string,
  extensions: readonly string[],
): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      return readdirRecursively(path, extensions);
    }
    return extensions.some((extension) => path.endsWith(extension))
      ? [path]
      : [];
  });
}
