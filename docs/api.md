# API-Dokumentation

## Basis-URL
```
http://localhost:3000/api/v1
```

## Authentifizierung

```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "username": "operator-1",
  "password": "a-secure-password"
}
```

Geschützte Requests senden:

```http
Authorization: Bearer <access_token>
```

Rollen: `viewer` liest, `operator` liest und bearbeitet Produktionsdaten, `admin` besitzt Vollzugriff. Benutzeranlage ist Admin-only:

```http
POST /api/v1/auth/register
Authorization: Bearer <admin-token>

{
  "username": "operator-2",
  "password": "another-secure-password",
  "role": "operator"
}
```

Der erste Admin wird lokal mit `npm run create-admin` angelegt. Es gibt keinen HTTP-Seed-Endpoint.

---

## Alarme (`/api/v1/alarms`)

### Alle aktiven Alarme
```
GET /api/v1/alarms
```

### einzelnen Alarm abrufen
```
GET /api/v1/alarms/:id
```

### Alarm erstellen
```
POST /api/v1/alarms
Content-Type: application/json

{
  "machine_id": "machine-uuid",
  "severity": "warning",
  "message": "Überdruck in Druckzone B"
}
```

### Alarm bestätigen
```
POST /api/v1/alarms/:id/acknowledge
```

### Alarm löschen
```
DELETE /api/v1/alarms/:id
```

### Anzahl aktiver Alarme
```
GET /api/v1/alarms/stats/active-count
```

---

## Maschinen (`/api/v1/machines`)

### Alle Maschinen
```
GET /api/v1/machines
```

### Maschine erstellen
```
POST /api/v1/machines
{
  "name": "CNC-Maschine-01",
  "status": "offline",
  "location": "Fertigung A",
  "type": "cnc"
}
```

### Maschinen aktualisieren
```
PATCH /api/v1/machines/:id
```

### Maschinenauftrag löschen
```
DELETE /api/v1/machines/:id
```

---

## Shopfloor Gateway und OPC UA

```http
GET /api/v1/shopfloor/health
GET /api/v1/shopfloor/stmes/handshakes
GET /api/v1/shopfloor/mqtt/messages
GET /api/v1/shopfloor/webshop/orders
POST /api/v1/shopfloor/opcua/read

{
  "nodeId": "ns=1;s=DB151.dbProcessData.iCarrierID"
}
```

OPC-UA-Reads sind Operator/Admin vorbehalten. MQTT-Publish ist Admin-only und auf erlaubte Topic-Präfixe begrenzt.

## Live-Telemetrie WebSocket

Verbindung: `ws://localhost:3000/api/v1/shopfloor/ws`

Erste Nachricht innerhalb von fünf Sekunden:

```json
{ "type": "auth", "token": "<access_token>" }
```

Danach folgen Nachrichten vom Typ `auth.ok` und `shopfloor.telemetry`. Ungültige Verbindungen werden mit Code 4401 geschlossen.

OPC-UA-Nachrichten enthalten entweder einen sekündlichen `station.snapshot` mit DB151- und aktuellen Query-Signalen oder ein ereignisgetriebenes `stmes.handshake` fuer Anfrage, Verarbeitung, Antwort, Quittierung und Prozessabschluss. `GET /api/v1/shopfloor/stmes/handshakes` liefert das persistierte Journal fuer die Anzeige nach einem Seiten-Reload.

MQTT-Nachrichten auf den konfigurierten Subscribe-Topics werden ebenfalls als `shopfloor.telemetry` mit `source: "mqtt"` uebertragen. `GET /api/v1/shopfloor/mqtt/messages` liefert die letzten 50 seit dem Backend-Start empfangenen Nachrichten fuer die initiale Browseranzeige.

## Health

`GET /api/v1/health` ist öffentlich und liefert den Datenbankstatus. Alle öffentlichen Endpunkte unterliegen Rate Limits.

---

## Aufträge

```http
GET    /api/v1/orders
POST   /api/v1/orders
GET    /api/v1/orders/:id
PATCH  /api/v1/orders/:id
DELETE /api/v1/orders/:id
GET    /api/v1/orders/:id/production-log
GET    /api/v1/orders/:id/production-log.csv
GET    /api/v1/orders/production-logs.csv
```

Viewer dürfen Aufträge lesen, Operatoren und Admins dürfen sie anlegen und bearbeiten, nur Admins dürfen löschen. `PATCH` unterstützt Stammdaten, Planung, Status und Fertigmenge. Aufträge mit zugeordneten Carriern können nicht gelöscht werden.

Die CSV-Endpunkte stehen für abgeschlossene Aufträge allen drei Rollen zur Verfügung. Der Bulk-Endpunkt kombiniert alle abgeschlossenen Produktionsläufe in einer Datei. Beide liefern einen RFC-4180-konformen UTF-8-Export mit ISA-95-orientierten Auftrags-, Carrier-, Ressourcen-, Stationszeit- und Ergebnisfeldern. Das genaue Schema und seine Abgrenzung beschreibt `docs/guides/13-production-run-csv.md`.

## Carrier und Routing (Demo-Grundmodell)

```http
GET  /api/v1/carriers
POST /api/v1/carriers
POST /api/v1/carriers/:id/assignment
GET  /api/v1/orders/:id/route
PATCH /api/v1/orders/:id/route
```

Carrier anlegen:

```json
{ "carrier_number": 128 }
```

Route ersetzen:

```json
{
  "steps": [
    {
      "step_no": 1,
      "resource_id": 1,
      "operation_no": 10,
      "operation": "Deckel montieren",
      "parameters": { "iPar1": 1, "iPar2": 3, "iPar3": 5, "iPar4": 7 }
    }
  ]
}
```

Der aktuelle stMES-Handshake ist ein ausdrücklich erfundener Demo-Vertrag. Details und später zu ersetzende Annahmen stehen in `docs/guides/07-stmes-demo-contract.md`.
