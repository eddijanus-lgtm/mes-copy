import {
  INestApplication,
  VERSION_NEUTRAL,
  VersioningType,
} from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

export const API_PREFIX = 'api';
export const API_VERSION = '1';
export const VERSIONED_API_PREFIX = `${API_PREFIX}/v${API_VERSION}`;
export const LEGACY_API_SUNSET = 'Tue, 01 Dec 2026 00:00:00 GMT';

/**
 * Exposes every HTTP controller under /api/v1 and temporarily keeps the
 * previous unversioned /api route as a compatibility alias.
 */
export function configureApiVersioning(app: INestApplication): void {
  app.setGlobalPrefix(API_PREFIX);
  app.enableVersioning({
    type: VersioningType.URI,
    prefix: 'v',
    defaultVersion: [API_VERSION, VERSION_NEUTRAL],
  });

  app.use(
    `/${API_PREFIX}`,
    (request: Request, response: Response, next: NextFunction) => {
      const isVersioned = /^\/v\d+(?:\/|$)/.test(request.path);
      const isDocumentation = request.path.startsWith('/docs');

      if (!isVersioned && !isDocumentation) {
        response.setHeader('Deprecation', 'true');
        response.setHeader('Sunset', LEGACY_API_SUNSET);
        response.setHeader(
          'Warning',
          '299 - "Unversioned API path is deprecated; use /api/v1"',
        );
        response.setHeader(
          'Link',
          `</${VERSIONED_API_PREFIX}${request.path}>; rel="successor-version"`,
        );
      }
      next();
    },
  );
}
