const { spawn, spawnSync } = require('node:child_process');
const { createServer } = require('node:net');
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { resolve } = require('node:path');

const projectDirectory = resolve(__dirname, '..');
const composeFile = resolve(projectDirectory, 'docker-compose.e2e.yml');
const composeProject = `wara-mes-e2e-${process.pid}`;
let cleaned = false;
let jestProcess;
let temporaryProfileDirectory;

function findFreePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Could not allocate a free TCP port'));
        return;
      }
      server.close((error) =>
        error ? reject(error) : resolvePort(address.port),
      );
    });
  });
}

function compose(args, environment, stdio = 'inherit') {
  const result = spawnSync(
    'docker',
    [
      'compose',
      '--project-name',
      composeProject,
      '--file',
      composeFile,
      ...args,
    ],
    {
      cwd: projectDirectory,
      env: environment,
      stdio,
      encoding: 'utf8',
    },
  );
  if (result.error) {
    throw new Error(
      `Docker Compose could not be executed: ${result.error.message}`,
    );
  }
  return result;
}

function cleanup(environment) {
  if (cleaned) return;
  cleaned = true;
  compose(
    ['down', '--volumes', '--remove-orphans', '--timeout', '10'],
    environment,
  );
  if (temporaryProfileDirectory) {
    rmSync(temporaryProfileDirectory, { recursive: true, force: true });
  }
}

async function main() {
  const databasePort = String(
    process.env.E2E_DB_PORT || (await findFreePort()),
  );
  const mqttPort = String(process.env.E2E_MQTT_PORT || (await findFreePort()));
  const opcUaPort = String(
    process.env.OPC_UA_TEST_SERVER_PORT || (await findFreePort()),
  );
  const sourceProfilePath = resolve(
    projectDirectory,
    'test-machines/opcua-simulator/profile.json',
  );
  const testProfile = JSON.parse(readFileSync(sourceProfilePath, 'utf8'));
  testProfile.connection.endpointUrl =
    `opc.tcp://127.0.0.1:${opcUaPort}/UA/WaraMesTest`;
  temporaryProfileDirectory = mkdtempSync(
    resolve(tmpdir(), 'wara-mes-e2e-profile-'),
  );
  const testProfilePath = resolve(
    temporaryProfileDirectory,
    'machine-profile.json',
  );
  writeFileSync(testProfilePath, JSON.stringify(testProfile, null, 2));
  const infrastructureEnvironment = {
    ...process.env,
    E2E_DB_PORT: databasePort,
    E2E_MQTT_PORT: mqttPort,
  };
  const testEnvironment = {
    ...infrastructureEnvironment,
    NODE_ENV: 'test',
    DB_HOST: '127.0.0.1',
    DB_PORT: databasePort,
    DB_USERNAME: 'mes_e2e',
    DB_PASSWORD: 'mes_e2e_password',
    DB_DATABASE: 'mes_e2e',
    TYPEORM_SYNCHRONIZE: 'true',
    JWT_SECRET: 'wara-mes-e2e-only-secret-at-least-32-characters',
    MQTT_BROKER_URL: `mqtt://127.0.0.1:${mqttPort}`,
    MQTT_ALLOWED_TOPIC_PREFIXES: 'mes/,i4.0/',
    WEBSHOP_MQTT_TOPIC: 'i4.0/production/orders',
    MACHINE_PROFILE_PATH: testProfilePath,
    OPC_UA_TEST_SERVER_PORT: opcUaPort,
    DEMO_CARRIER_REFRESH_MS: '1000',
    E2E_ADMIN_USERNAME: 'e2e-admin',
    E2E_ADMIN_PASSWORD: 'e2e-admin-password',
  };

  const handleSignal = () => {
    if (jestProcess && jestProcess.exitCode === null) {
      jestProcess.kill('SIGTERM');
    }
    cleanup(infrastructureEnvironment);
    process.exitCode = 130;
  };
  process.once('SIGINT', handleSignal);
  process.once('SIGTERM', handleSignal);

  let failed = true;
  try {
    const started = compose(
      ['up', '--detach', '--wait', '--wait-timeout', '60', '--remove-orphans'],
      infrastructureEnvironment,
    );
    if (started.status !== 0) {
      throw new Error(
        `E2E infrastructure failed with exit code ${started.status}`,
      );
    }

    jestProcess = spawn(
      process.execPath,
      [
        resolve(projectDirectory, 'node_modules/jest/bin/jest.js'),
        '--config',
        resolve(projectDirectory, 'test/jest-e2e.json'),
        '--runInBand',
        ...process.argv.slice(2),
      ],
      {
        cwd: projectDirectory,
        env: testEnvironment,
        stdio: 'inherit',
      },
    );
    const result = await new Promise((resolveResult) => {
      jestProcess.once('error', (error) => resolveResult({ code: 1, error }));
      jestProcess.once('exit', (code, signal) =>
        resolveResult({ code: code ?? 1, signal }),
      );
    });
    if (result.error) throw result.error;
    failed = result.code !== 0;
    process.exitCode = result.code;
  } finally {
    if (failed) {
      compose(['logs', '--no-color'], infrastructureEnvironment);
    }
    cleanup(infrastructureEnvironment);
    process.removeListener('SIGINT', handleSignal);
    process.removeListener('SIGTERM', handleSignal);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
