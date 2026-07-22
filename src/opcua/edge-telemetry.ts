export interface EdgeTelemetryEvent {
  type: 'edge.telemetry';
  timestamp: string;
  source: 'opcua' | 'mqtt';
  topic?: string;
  payload: Record<string, unknown>;
}
