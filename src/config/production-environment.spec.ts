import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateProductionEnvironment } from './production-environment';

function productionEnvironment(profilePath: string): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'production',
    DB_PASSWORD: 'database-secret',
    JWT_SECRET: 'jwt-secret-with-sufficient-length',
    MQTT_BROKER_URL: 'mqtt://broker:1883',
    MACHINE_PROFILE_PATH: profilePath,
  };
}

describe('validateProductionEnvironment', () => {
  it('does nothing outside production', () => {
    expect(() =>
      validateProductionEnvironment({
        NODE_ENV: 'development',
        MACHINE_PROFILE_PATH: 'test-machines/profile.json',
      }),
    ).not.toThrow();
  });

  it('rejects test-machine profiles in production', () => {
    expect(() =>
      validateProductionEnvironment(
        productionEnvironment('test-machines/opcua-simulator/profile.json'),
      ),
    ).toThrow(/test-machines/);
  });

  it('rejects profile placeholders in production', () => {
    const directory = mkdtempSync(join(tmpdir(), 'mes-profile-'));
    const profilePath = join(directory, 'profile.json');
    writeFileSync(
      profilePath,
      JSON.stringify({
        machineId: 'production-line',
        description: 'YOUR_DESCRIPTION',
      }),
    );

    expect(() =>
      validateProductionEnvironment(productionEnvironment(profilePath)),
    ).toThrow(/placeholders/);
  });

  it('accepts a concrete production profile and required secrets', () => {
    const directory = mkdtempSync(join(tmpdir(), 'mes-profile-'));
    const profilePath = join(directory, 'profile.json');
    writeFileSync(
      profilePath,
      JSON.stringify({
        machineId: 'line-a',
        description: 'Assembly line A',
        metadata: { environment: 'production' },
      }),
    );

    expect(() =>
      validateProductionEnvironment(productionEnvironment(profilePath)),
    ).not.toThrow();
  });
});
