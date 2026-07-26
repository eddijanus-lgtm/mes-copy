# 02 - WebSocket Live Telemetry

_Status: verified - 2026-07-22_

## Ablauf

1. Client verbindet sich mit `/api/v1/shopfloor/ws`.
2. Innerhalb von fünf Sekunden muss eine Auth-Nachricht mit JWT folgen.
3. Das Backend bestätigt mit `auth.ok`.
4. OPC-UA- und MQTT-Ereignisse werden als `shopfloor.telemetry` gesendet.

Die Shopfloor-Seite zeigt MQTT-Nachrichten in einem eigenen Subscribe-Bereich. Der Backend-Prozess haelt die letzten 50 Nachrichten im Speicher, sodass sie ueber `GET /api/v1/shopfloor/mqtt/messages` auch nach einem Browser-Reload sichtbar sind; ein Backend-Neustart leert diesen fluechtigen Verlauf.

```json
{
  "type": "shopfloor.telemetry",
  "timestamp": "2026-07-22T12:00:00.000Z",
  "source": "opcua",
  "payload": {
    "dbNumber": 151,
    "iCarrierID": 128,
    "iStepNo": 2,
    "iResourceID": 2,
    "iPar1": 1,
    "iPar2": 3,
    "iPar3": 5,
    "iPar4": 7,
    "ldtTimeStamp": "2026-07-22T12:00:00.000Z"
  }
}
```

Ungültige Clients werden mit WebSocket-Code 4401 getrennt. Das Frontend verbindet sich mit exponentiellem Backoff neu und zeigt ausschließlich echte Messwerte.

## Testserver

```bash
npm run start:opcua-test
```

Der Server bildet `dbProcessData [DB151]` aus der Siemens-Dokumentation nach. Alle Variablen sind les- und schreibbar.

NodeIds:

- `ns=1;s=DB151.dbProcessData.iCarrierID` (`Int16`, Startwert 128)
- `ns=1;s=DB151.dbProcessData.iStepNo` (`Int16`, Startwert 2)
- `ns=1;s=DB151.dbProcessData.iResourceID` (`Int16`, Startwert 2)
- `ns=1;s=DB151.dbProcessData.iPar1` (`Int16`, Startwert 1, Deckelfarbe)
- `ns=1;s=DB151.dbProcessData.iPar2` (`Int16`, Startwert 3, rote Kugeln)
- `ns=1;s=DB151.dbProcessData.iPar3` (`Int16`, Startwert 5, grüne Kugeln)
- `ns=1;s=DB151.dbProcessData.iPar4` (`Int16`, Startwert 7, blaue Kugeln)
- `ns=1;s=DB151.dbProcessData.ldtTimeStamp` (`DateTime`, Prozessabschluss)
