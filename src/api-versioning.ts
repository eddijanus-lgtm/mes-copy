import { INestApplication, VersioningType } from '@nestjs/common';

export const API_PREFIX = 'api';
export const API_VERSION = '1';

/**
 * Exposes every HTTP controller exclusively under /api/v1.
 */
export function configureApiVersioning(app: INestApplication): void {
  app.setGlobalPrefix(API_PREFIX);
  app.enableVersioning({
    type: VersioningType.URI,
    prefix: 'v',
    defaultVersion: API_VERSION,
  });
}
