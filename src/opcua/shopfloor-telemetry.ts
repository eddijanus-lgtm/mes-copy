export interface ShopfloorTelemetryEvent {
  type: 'shopfloor.telemetry';
  timestamp: string;
  source: 'opcua' | 'mqtt';
  topic?: string;
  payload: Record<string, unknown>;
}
