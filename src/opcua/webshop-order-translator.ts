import type { MachineOrderParameterDefinition } from '../machines/adapters/machine-adapter.types';
import type { WebshopProductionPayload } from '../orders/routing.service';

export function translateWebshopOrder(
  rawPayload: unknown,
  definitions: readonly MachineOrderParameterDefinition[] = [],
): WebshopProductionPayload {
  if (!isRecord(rawPayload)) {
    throw new Error('Webshop payload must be an object');
  }

  const source = isRecord(rawPayload.params) ? rawPayload.params : rawPayload;
  const orderName = optionalString(rawPayload.order_name ?? rawPayload.orderName);
  const productId = optionalString(rawPayload.product_id ?? rawPayload.productId);
  const partNo = optionalString(rawPayload.part_no ?? rawPayload.partNo);
  const parameters =
    definitions.length > 0
      ? mapConfiguredParameters(source, definitions)
      : mapGenericParameters(source);

  return {
    ...(orderName ? { orderName } : {}),
    ...(productId ? { productId } : {}),
    ...(partNo ? { partNo } : {}),
    parameters,
    xAuftragAusstehend: optionalBoolean(
      source.xAuftragAusstehend,
      'xAuftragAusstehend',
    ),
    uiAnzahlAustehenderAuftraege: optionalNonNegativeInteger(
      source.uiAnzahlAustehenderAuftraege,
      'uiAnzahlAustehenderAuftraege',
    ),
  };
}

function mapConfiguredParameters(
  source: Record<string, unknown>,
  definitions: readonly MachineOrderParameterDefinition[],
): Record<string, number> {
  const result: Record<string, number> = {};
  const missing: string[] = [];
  for (const definition of definitions) {
    const sourceKey = definition.sourceKey || definition.key;
    const rawValue = source[sourceKey];
    if (
      rawValue === undefined ||
      rawValue === null ||
      rawValue === ''
    ) {
      if (definition.required) missing.push(sourceKey);
      else if (definition.default_value !== undefined) {
        result[definition.key] = definition.default_value;
      }
      continue;
    }
    result[definition.key] = nonNegativeNumber(rawValue, sourceKey);
  }
  if (missing.length) {
    throw new Error(`Missing required fields: ${missing.join(', ')}`);
  }
  return result;
}

function mapGenericParameters(
  source: Record<string, unknown>,
): Record<string, number> {
  const ignored = new Set([
    'order_name',
    'orderName',
    'product_id',
    'productId',
    'part_no',
    'partNo',
    'xAuftragAusstehend',
    'uiAnzahlAustehenderAuftraege',
  ]);
  return Object.fromEntries(
    Object.entries(source)
      .filter(([key]) => !ignored.has(key))
      .map(([key, value]) => [key, nonNegativeNumber(value, key)]),
  );
}

function optionalString(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('Identifier fields must be non-empty strings');
  }
  if (value.length > 255) {
    throw new Error('Identifier fields must not exceed 255 characters');
  }
  return value.trim();
}

function nonNegativeNumber(value: unknown, field: string): number {
  const numberValue =
    typeof value === 'boolean' ? (value ? 1 : 0) : Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 0) {
    throw new Error(`${field} must be a non-negative number`);
  }
  return numberValue;
}

function optionalBoolean(
  value: unknown,
  field: string,
): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') {
    throw new Error(`${field} must be a boolean`);
  }
  return value;
}

function optionalNonNegativeInteger(
  value: unknown,
  field: string,
): number | undefined {
  if (value === undefined) return undefined;
  const numberValue = Number(value);
  if (!Number.isInteger(numberValue) || numberValue < 0) {
    throw new Error(`${field} must be a non-negative integer`);
  }
  return numberValue;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
