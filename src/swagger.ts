import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, getSchemaPath, SwaggerModule } from '@nestjs/swagger';
import { ApiErrorDto } from './common/api-error.dto';

export function createDocument(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('WARA MES – Shopfloor Gateway API')
    .setDescription(
      'REST API des Manufacturing Execution Systems mit OPC UA- und MQTT-Anbindung. ' +
        'Geschützte Endpunkte erwarten ein JWT als Bearer-Token.',
    )
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT aus dem Login-Endpunkt',
      },
      'JWT-auth',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config, {
    operationIdFactory: (controllerKey, methodKey) =>
      `${controllerKey.replace(/Controller$/, '')}_${methodKey}`,
    extraModels: [ApiErrorDto],
  });

  const errorContent = {
    'application/json': { schema: { $ref: getSchemaPath(ApiErrorDto) } },
  };
  for (const [path, pathItem] of Object.entries(document.paths)) {
    for (const operation of Object.values(pathItem ?? {})) {
      if (!operation || typeof operation !== 'object' || !('responses' in operation)) continue;
      const apiOperation = operation as {
        summary?: string;
        operationId?: string;
        security?: unknown[];
        responses: Record<string, unknown>;
      };
      apiOperation.summary ??= apiOperation.operationId
        ?.replace(/^[^_]+_/, '')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/^./, (letter) => letter.toUpperCase());
      apiOperation.responses['400'] ??= { description: 'Ungültige Anfrage', content: errorContent };
      apiOperation.responses['500'] ??= { description: 'Interner Serverfehler', content: errorContent };
      if (path.includes('{')) {
        apiOperation.responses['404'] ??= { description: 'Ressource nicht gefunden', content: errorContent };
      }
      if (apiOperation.security?.length) {
        apiOperation.responses['401'] ??= { description: 'Authentifizierung erforderlich', content: errorContent };
        apiOperation.responses['403'] ??= { description: 'Keine Berechtigung', content: errorContent };
      }
    }
  }

  SwaggerModule.setup('api/docs', app, document, {
    jsonDocumentUrl: 'api/docs/openapi.json',
    customSiteTitle: 'WARA MES API',
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      filter: true,
      tryItOutEnabled: true,
    },
  });

  return document;
}
