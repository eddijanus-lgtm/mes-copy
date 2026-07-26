import type { INestApplication } from '@nestjs/common';
import {
  DocumentBuilder,
  getSchemaPath,
  SwaggerModule,
} from '@nestjs/swagger';
import type { OpenAPIObject } from '@nestjs/swagger';
import { ApiInfoDto } from './app.dto';
import { API_VERSION } from './api-versioning';
import {
  AccessTokenDto,
  UserCreatedDto,
} from './auth/dto/auth-response.dto';
import { ApiErrorDto } from './common/api-error.dto';

const HTTP_METHODS = new Set([
  'get',
  'post',
  'put',
  'patch',
  'delete',
  'options',
  'head',
]);

const RESOURCE_NAMES: Record<string, { singular: string; plural: string }> = {
  Alarms: { singular: 'Alarm', plural: 'Alarme' },
  Authentication: { singular: 'Benutzer', plural: 'Authentifizierung' },
  Carriers: { singular: 'Carrier', plural: 'Carrier' },
  Dashboard: { singular: 'Dashboard-Wert', plural: 'Dashboard-Daten' },
  'Data Collection': { singular: 'Messwert', plural: 'Messwerte' },
  Health: { singular: 'Systemzustand', plural: 'Systemzustände' },
  Machines: { singular: 'Maschine', plural: 'Maschinen' },
  Materials: { singular: 'Material', plural: 'Materialien' },
  Notifications: { singular: 'Benachrichtigung', plural: 'Benachrichtigungen' },
  Orders: { singular: 'Auftrag', plural: 'Aufträge' },
  Products: { singular: 'Produkt', plural: 'Produkte' },
  Shifts: { singular: 'Schicht', plural: 'Schichten' },
  'Shopfloor Gateway': {
    singular: 'Shopfloor-Funktion',
    plural: 'Shopfloor-Daten',
  },
  System: { singular: 'API-Information', plural: 'API-Informationen' },
  Traces: { singular: 'Trace', plural: 'Traces' },
};

const CUSTOM_SUMMARIES: Record<string, string> = {
  acknowledge: 'Alarm quittieren',
  bulkAcknowledge: 'Mehrere Alarme quittieren',
  bulkRemove: 'Mehrere Ressourcen löschen',
  closeShift: 'Schicht schließen',
  completeBatch: 'Produktionslos abschließen',
  createDemoProductionOrder: 'Demo-Produktionsauftrag starten',
  executeControlCommand: 'Freigegebenen Maschinenbefehl ausführen',
  executeLegacyControlCommand: 'Veralteten Maschinenbefehl ausführen',
  exportCsv: 'Daten als CSV exportieren',
  finalizeReport: 'Schichtbericht finalisieren',
  generateReport: 'Schichtbericht erzeugen',
  getActiveAlarmCount: 'Anzahl aktiver Alarme abrufen',
  getActiveOrders: 'Aktive Aufträge abrufen',
  getAllTrends: 'Dashboard-Trends abrufen',
  getConnectionStatus: 'OPC-UA-Verbindungsstatus abrufen',
  getDeliveryRate: 'Zustellrate der Benachrichtigungen abrufen',
  getDowntimePareto: 'Stillstands-Pareto abrufen',
  getKpis: 'Produktions-KPIs abrufen',
  getMachineDowntimeStats: 'Stillstandsstatistik einer Maschine abrufen',
  getOrderParameterDefinitions: 'Auftragsparameter der Maschine abrufen',
  getPendingByLine: 'Ausstehende Aufträge einer Linie abrufen',
  getPeriodStats: 'Stillstandsstatistik für einen Zeitraum abrufen',
  getRoute: 'Auftragsroute abrufen',
  getServerStatus: 'OPC-UA-Serverstatus abrufen',
  initializeAggregates: 'Dashboard-Aggregate initialisieren',
  publishMqtt: 'MQTT-Nachricht veröffentlichen',
  readOpcUa: 'OPC-UA-Node lesen',
  replaceRoute: 'Auftragsroute ersetzen',
  resumeMachine: 'Maschine nach Stillstand freigeben',
  stopMachine: 'Maschinenstillstand erfassen',
  updateProgress: 'Auftragsfortschritt aktualisieren',
  writeOpcUa: 'OPC-UA-Nodes schreiben',
};

function operationMethod(operationId?: string): string {
  return operationId?.replace(/^[^_]+_/, '') || '';
}

function humanize(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/^./, (letter) => letter.toUpperCase());
}

function operationSummary(
  operationId: string | undefined,
  httpMethod: string,
  tags: string[] | undefined,
): string {
  const method = operationMethod(operationId);
  if (CUSTOM_SUMMARIES[method]) return CUSTOM_SUMMARIES[method];

  const resource = RESOURCE_NAMES[tags?.[0] || ''] || {
    singular: 'Ressource',
    plural: 'Ressourcen',
  };

  if (/^(findAll|getAll|list)/.test(method)) {
    return `${resource.plural} abrufen`;
  }
  if (/^(findOne|getOne|getBy)/.test(method)) {
    return `${resource.singular} abrufen`;
  }
  if (/^(create|register)/.test(method)) {
    return `${resource.singular} erstellen`;
  }
  if (/^(update|patch|toggle)/.test(method)) {
    return `${resource.singular} aktualisieren`;
  }
  if (/^(remove|delete)/.test(method)) {
    return `${resource.singular} löschen`;
  }

  const action = humanize(method || httpMethod);
  return `${action} – ${resource.singular}`;
}

function successContent(path: string) {
  if (path.endsWith('/csv')) {
    return {
      'text/csv': {
        schema: { type: 'string' },
        example: 'id,name,status\n00000000-0000-0000-0000-000000000000,Demo,active',
      },
    };
  }

  return {
    'application/json': {
      schema: {
        oneOf: [
          { type: 'object', additionalProperties: true },
          {
            type: 'array',
            items: { type: 'object', additionalProperties: true },
          },
        ],
      },
      examples: {
        success: {
          summary: 'Erfolgreiche Antwort',
          value: {},
        },
      },
    },
  };
}

function addSuccessContract(
  operation: Record<string, any>,
  httpMethod: string,
  path: string,
): void {
  const responses = operation.responses as Record<string, any>;
  let successCodes = Object.keys(responses).filter((code) => /^2\d\d$/.test(code));

  if (successCodes.length === 0) {
    const defaultCode =
      httpMethod === 'post' ? '201' : httpMethod === 'delete' ? '204' : '200';
    responses[defaultCode] = {
      description:
        defaultCode === '204'
          ? 'Anfrage erfolgreich; kein Antwortinhalt.'
          : 'Anfrage erfolgreich.',
    };
    successCodes = [defaultCode];
  }

  for (const code of successCodes) {
    const response = responses[code] as Record<string, any>;
    response.description ||= 'Anfrage erfolgreich.';
    if (code !== '204' && !response.content) {
      response.content = successContent(path);
    }
  }
}

function addDeprecationContract(operation: Record<string, any>): void {
  if (!operation.deprecated) return;

  operation.description = `${operation.description || ''}\n\nDieser Endpoint ist veraltet. Die Nachfolgeoperation ist in der Beschreibung genannt.`.trim();
}

export function enhanceOpenApiDocument(document: OpenAPIObject): OpenAPIObject {
  const errorContent = {
    'application/json': { schema: { $ref: getSchemaPath(ApiErrorDto) } },
  };

  for (const [path, pathItem] of Object.entries(document.paths)) {
    for (const [httpMethod, rawOperation] of Object.entries(pathItem ?? {})) {
      if (
        !HTTP_METHODS.has(httpMethod) ||
        !rawOperation ||
        typeof rawOperation !== 'object'
      ) {
        continue;
      }

      const operation = rawOperation as Record<string, any>;
      operation.summary ||= operationSummary(
        operation.operationId,
        httpMethod,
        operation.tags,
      );
      operation.description ||= `${operation.summary}.`;
      operation['x-api-version'] = `v${API_VERSION}`;
      operation.responses ||= {};

      addSuccessContract(operation, httpMethod, path);
      operation.responses['400'] ||= {
        description: 'Ungültige Anfrage',
        content: errorContent,
      };
      operation.responses['500'] ||= {
        description: 'Interner Serverfehler',
        content: errorContent,
      };
      if (path.includes('{')) {
        operation.responses['404'] ||= {
          description: 'Ressource nicht gefunden',
          content: errorContent,
        };
      }
      if (operation.security?.length) {
        operation.responses['401'] ||= {
          description: 'Authentifizierung erforderlich',
          content: errorContent,
        };
        operation.responses['403'] ||= {
          description: 'Keine Berechtigung',
          content: errorContent,
        };
      }
      addDeprecationContract(operation);
    }
  }

  (document as OpenAPIObject & Record<string, unknown>)['x-api-lifecycle'] = {
    currentVersion: `v${API_VERSION}`,
    unversionedPathsSupported: false,
    policy: '/docs/guides/11-api-lifecycle.md',
  };
  return document;
}

export function createDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('WARA MES – Shopfloor Gateway API')
    .setDescription(
      'Versionierte REST API des Manufacturing Execution Systems mit OPC UA- und MQTT-Anbindung. ' +
        'Der aktuelle Vertrag liegt unter /api/v1. Geschützte Endpunkte erwarten ein JWT als Bearer-Token.',
    )
    .setVersion(`${API_VERSION}.0.0`)
    .addTag('System', 'API-Metadaten und Einstiegspunkte')
    .addTag('Authentication', 'Anmeldung und Benutzerregistrierung')
    .addTag('Machines', 'Maschinen, Zustände und Stillstände')
    .addTag('Orders', 'Produktionsaufträge und Routen')
    .addTag('Shopfloor Gateway', 'OPC-UA-, MQTT- und Maschinenintegration')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT aus POST /api/v1/auth/login',
      },
      'JWT-auth',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config, {
    operationIdFactory: (controllerKey, methodKey) =>
      `${controllerKey.replace(/Controller$/, '')}_${methodKey}`,
    extraModels: [
      ApiErrorDto,
      ApiInfoDto,
      AccessTokenDto,
      UserCreatedDto,
    ],
  });
  enhanceOpenApiDocument(document);

  SwaggerModule.setup('api/docs', app, document, {
    jsonDocumentUrl: 'api/docs/openapi.json',
    customSiteTitle: 'WARA MES API v1',
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      filter: true,
      tryItOutEnabled: true,
    },
  });

  return document;
}
