import { ConfigService } from '@nestjs/config';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { MachineProfileService } from './machine-profile.service';

describe('machine routing result-code mapping', () => {
  const directories: string[] = [];

  afterEach(() => {
    for (const directory of directories.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  function simulatorProfile(): Record<string, any> {
    return JSON.parse(
      readFileSync(
        resolve('test-machines/opcua-simulator/profile.json'),
        'utf8',
      ),
    );
  }

  function writeProfile(profile: unknown): string {
    const directory = mkdtempSync(join(tmpdir(), 'mes-result-codes-'));
    directories.push(directory);
    const path = join(directory, 'profile.json');
    writeFileSync(path, JSON.stringify(profile));
    return path;
  }

  it('rejects a control profile without an explicit mapping', () => {
    const profile = simulatorProfile();
    delete profile.routingResultCodes;

    expect(() =>
      new MachineProfileService(new ConfigService()).loadProfile({
        profilePath: writeProfile(profile),
      }),
    ).toThrow(/require routingResultCodes/);
  });

  it('rejects duplicate wire codes', () => {
    const profile = simulatorProfile();
    profile.routingResultCodes.internal_error =
      profile.routingResultCodes.accepted;

    expect(() =>
      new MachineProfileService(new ConfigService()).loadProfile({
        profilePath: writeProfile(profile),
      }),
    ).toThrow(/values must be unique/);
  });
});
