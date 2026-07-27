import { readFileSync } from 'node:fs';
import { isAbsolute, normalize, resolve, sep } from 'node:path';

const REQUIRED_PRODUCTION_VALUES = [
  'DB_PASSWORD',
  'JWT_SECRET',
  'MQTT_BROKER_URL',
  'MACHINE_PROFILE_PATH',
] as const;

export function validateProductionEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
  baseDirectory = process.cwd(),
): void {
  if (environment.NODE_ENV !== 'production') return;

  const errors: string[] = [];
  for (const name of REQUIRED_PRODUCTION_VALUES) {
    if (!environment[name]?.trim()) errors.push(`${name} is required`);
  }

  const profilePath = environment.MACHINE_PROFILE_PATH?.trim();
  if (profilePath) {
    const resolvedPath = normalize(
      isAbsolute(profilePath)
        ? profilePath
        : resolve(baseDirectory, profilePath),
    );
    const normalizedForComparison = resolvedPath.toLowerCase();
    const testMachineSegment = `${sep}test-machines${sep}`.toLowerCase();
    if (normalizedForComparison.includes(testMachineSegment)) {
      errors.push('MACHINE_PROFILE_PATH must not reference test-machines');
    }

    try {
      const profileSource = readFileSync(resolvedPath, 'utf8');
      if (/\bYOUR_[A-Z0-9_]+\b/.test(profileSource)) {
        errors.push('Machine profile still contains YOUR_* placeholders');
      }
      const profile = JSON.parse(profileSource) as {
        machineId?: unknown;
        description?: unknown;
        metadata?: Record<string, unknown>;
      };
      const identity = [
        profile.machineId,
        profile.description,
        profile.metadata?.environment,
      ]
        .filter((value): value is string => typeof value === 'string')
        .join(' ')
        .toLowerCase();
      if (/\b(?:demo|simulator|test machine|test-machine)\b/.test(identity)) {
        errors.push('Machine profile identifies itself as demo or simulator');
      }
    } catch (error) {
      errors.push(
        `Machine profile cannot be validated: ${(error as Error).message}`,
      );
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `Unsafe production configuration: ${errors.join('; ')}`,
    );
  }
}
