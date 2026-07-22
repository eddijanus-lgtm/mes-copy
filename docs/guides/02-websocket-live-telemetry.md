# 02 - WebSocket Live Telemetry

_Status: verified - 2026-07-22_

## Ablauf

1. Client verbindet sich mit `/api/edge/ws`.
2. Innerhalb von fünf Sekunden muss eine Auth-Nachricht mit JWT folgen.
3. Das Backend bestätigt mit `auth.ok`.
4. OPC-UA- und MQTT-Ereignisse werden als `edge.telemetry` gesendet.

```json
{
  "type": "edge.telemetry",
  "timestamp": "2026-07-22T12:00:00.000Z",
  "source": "opcua",
  "payload": {
    "machineId": "Machine1",
    "temperature": 42.5,
    "pressure": 5.1,
    "running": true,
    "producedCount": 120
  }
}
```

Ungültige Clients werden mit WebSocket-Code 4401 getrennt. Das Frontend verbindet sich mit exponentiellem Backoff neu und zeigt ausschließlich echte Messwerte.

## Testserver

```bash
npm run start:opcua-test
```

NodeIds:

- `ns=1;s=Machine1.Temperature`
- `ns=1;s=Machine1.Pressure`
- `ns=1;s=Machine1.Running`
- `ns=1;s=Machine1.ProducedCount`
