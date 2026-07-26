import { WebshopProductionPayload } from '../orders/routing.service';

const REQUIRED_PARAMETER_FIELDS = [
  'bDeckelfarbe',
  'uiKugelRot',
  'uiKugelGruen',
  'uiKugelBlau',
] as const;

type WebshopParameters = Record<string, unknown>;

export function translateWebshopOrder(
  rawPayload: unknown,
): WebshopProductionPayload {
  if (!isRecord(rawPayload)) {
    throw new Error('Webshop payload must be an object');
  }

  if ('order_name' in rawPayload || 'params' in rawPayload) {
    return translateDocumentedPayload(rawPayload);
  }

  return translateLegacyFlatPayload(rawPayload);
}

function translateDocumentedPayload(
  rawPayload: Record<string, unknown>,
): WebshopProductionPayload {
  const orderName = readOrderName(rawPayload.order_name);
  if (!isRecord(rawPayload.params)) {
    throw new Error('params must be an object');
  }

  return translateParameters(rawPayload.params, orderName);
}

function translateLegacyFlatPayload(
  rawPayload: Record<string, unknown>,
): WebshopProductionPayload {
  return translateParameters(rawPayload);
}

function translateParameters(
  parameters: WebshopParameters,
  orderName?: string,
): WebshopProductionPayload {
  const missing = REQUIRED_PARAMETER_FIELDS.filter(
    (field) =>
      parameters[field] === undefined ||
      parameters[field] === null ||
      parameters[field] === '',
  );
  if (missing.length) {
    throw new Error(`Missing required fields: ${missing.join(', ')}`);
  }

  return {
    ...(orderName ? { orderName } : {}),
    bDeckelfarbe: readLidColor(parameters.bDeckelfarbe),
    uiKugelRot: readNonNegativeInteger(parameters.uiKugelRot, 'uiKugelRot'),
    uiKugelGruen: readNonNegativeInteger(
      parameters.uiKugelGruen,
      'uiKugelGruen',
    ),
    uiKugelBlau: readNonNegativeInteger(parameters.uiKugelBlau, 'uiKugelBlau'),
    xAuftragAusstehend: readOptionalBoolean(
      parameters.xAuftragAusstehend,
      'xAuftragAusstehend',
      false,
    ),
    uiAnzahlAustehenderAuftraege: readNonNegativeInteger(
      parameters.uiAnzahlAustehenderAuftraege ?? 0,
      'uiAnzahlAustehenderAuftraege',
    ),
  };
}

function readOrderName(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('order_name must be a non-empty string');
  }
  if (value.length > 255) {
    throw new Error('order_name must not exceed 255 characters');
  }
  return value;
}

function readLidColor(value: unknown): number {
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }
  return readNonNegativeInteger(value, 'bDeckelfarbe');
}

function readNonNegativeInteger(value: unknown, field: string): number {
  const numberValue = Number(value);
  if (!Number.isInteger(numberValue) || numberValue < 0) {
    throw new Error(`${field} must be a non-negative integer`);
  }
  return numberValue;
}

function readOptionalBoolean(
  value: unknown,
  field: string,
  fallback: boolean,
): boolean {
  if (value === undefined) {
    return fallback;
  }
  if (typeof value !== 'boolean') {
    throw new Error(`${field} must be a boolean`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
