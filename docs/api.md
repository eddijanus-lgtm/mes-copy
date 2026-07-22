# API-Dokumentation

## Basis-URL
```
http://localhost:3000/api
```

## Authentifizierung

```http
POST /api/auth/login
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
POST /api/auth/register
Authorization: Bearer <admin-token>

{
  "username": "operator-2",
  "password": "another-secure-password",
  "role": "operator"
}
```

Der erste Admin wird lokal mit `npm run create-admin` angelegt. Es gibt keinen HTTP-Seed-Endpoint.

---

## Alarme (`/api/alarms`)

### Alle aktiven Alarme
```
GET /api/alarms
```

### einzelnen Alarm abrufen
```
GET /api/alarms/:id
```

### Alarm erstellen
```
POST /api/alarms
Content-Type: application/json

{
  "machine_id": "machine-uuid",
  "severity": "warning",
  "message": "Überdruck in Druckzone B"
}
```

### Alarm bestätigen
```
POST /api/alarms/:id/acknowledge
```

### Alarm löschen
```
DELETE /api/alarms/:id
```

### Anzahl aktiver Alarme
```
GET /api/alarms/stats/active-count
```

---

## Maschinen (`/api/machines`)

### Alle Maschinen
```
GET /api/machines
```

### Maschine erstellen
```
POST /api/machines
{
  "name": "CNC-Maschine-01",
  "status": "offline",
  "location": "Fertigung A",
  "type": "cnc"
}
```

### Maschinen aktualisieren
```
PATCH /api/machines/:id
```

### Maschinenauftrag löschen
```
DELETE /api/machines/:id
```

---

## Edge und OPC UA

```http
GET /api/edge/health
POST /api/edge/opcua/read

{
  "nodeId": "ns=1;s=Machine1.Temperature"
}
```

OPC-UA-Reads sind Operator/Admin vorbehalten. MQTT-Publish ist Admin-only und auf erlaubte Topic-Präfixe begrenzt.

## Live-Telemetrie WebSocket

Verbindung: `ws://localhost:3000/api/edge/ws`

Erste Nachricht innerhalb von fünf Sekunden:

```json
{ "type": "auth", "token": "<access_token>" }
```

Danach folgen Nachrichten vom Typ `auth.ok` und `edge.telemetry`. Ungültige Verbindungen werden mit Code 4401 geschlossen.

## Health

`GET /api/health` ist öffentlich und liefert den Datenbankstatus. Alle öffentlichen Endpunkte unterliegen Rate Limits.
