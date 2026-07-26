# 11 – API-Versionierung und Deprecation Policy

_Status: v1 aktiv – unversionierte Übergangspfade veraltet_

## Aktueller Vertrag

Die aktuelle HTTP-API ist unter folgendem Präfix erreichbar:

```text
/api/v1
```

Beispiele:

```text
POST /api/v1/auth/login
GET  /api/v1/machines
GET  /api/v1/orders
GET  /api/v1/shopfloor/health
```

Swagger UI und OpenAPI-Vertrag:

```text
/api/docs
/api/docs/openapi.json
```

Nur die aktuelle Version wird im OpenAPI-Vertrag veröffentlicht. Dadurch
generieren Frontends und andere Clients keine neuen Aufrufe gegen veraltete
Pfade.

## Übergang für bestehende Clients

Die bisherigen unversionierten Pfade unter `/api/*` bleiben vorübergehend als
Kompatibilitätsalias aktiv. Antworten dieser Pfade enthalten:

```text
Deprecation: true
Sunset: Tue, 01 Dec 2026 00:00:00 GMT
Warning: 299 - "Unversioned API path is deprecated; use /api/v1"
Link: </api/v1/...>; rel="successor-version"
```

Der 1. Dezember 2026 ist der **früheste** Abschaltzeitpunkt. Eine Entfernung
erfolgt nur, wenn Frontend, Werkzeuge und dokumentierte Integrationen auf v1
umgestellt und erneut getestet sind.

## Breaking und Non-Breaking Changes

Folgende Änderungen benötigen eine neue Hauptversion, beispielsweise `/api/v2`:

- Entfernen oder Umbenennen eines Endpoints;
- Entfernen oder Umbenennen eines Request- oder Response-Feldes;
- Ändern eines Datentyps oder einer Feldbedeutung;
- Verschärfen eines Pflichtfeldes;
- Ändern von Statuscodes oder Authentifizierungsanforderungen;
- Ändern fachlicher Zustandsübergänge.

Innerhalb von v1 erlaubt sind:

- neue optionale Request-Felder;
- neue Response-Felder;
- neue Endpoints;
- zusätzliche Enum-Werte, wenn Clients unbekannte Werte tolerieren;
- Dokumentations- und Fehlerkorrekturen ohne Vertragsänderung.

## Deprecation eines einzelnen Endpoints

Ein veralteter Endpoint muss:

1. in OpenAPI mit `deprecated: true` markiert sein;
2. die konkrete Nachfolgeoperation nennen;
3. einen frühesten Abschaltzeitpunkt dokumentieren;
4. mindestens bis nach der Hausmesse funktionsfähig bleiben;
5. einen automatisierten Test für Alt- und Nachfolgepfad besitzen.

Aktuelles Beispiel:

```text
PATCH /api/v1/orders/{id}/progress/{completedQty}
```

Nachfolgeoperation:

```text
PATCH /api/v1/orders/{id}
```

mit `completed_quantity` im Request-Body.

## Ablauf einer API-Änderung

1. fachliche Änderung und betroffene Clients beschreiben;
2. DTO, Validierung und Response-Vertrag aktualisieren;
3. Swagger-Beschreibung und Beispiele aktualisieren;
4. OpenAPI-Vertragstest ausführen;
5. Frontend und Werkzeuge gegen die neue Version testen;
6. Breaking Change nur in einer neuen API-Version veröffentlichen;
7. Deprecation und geplanten Abschalttermin dokumentieren.

## Frontend und Codex

Das Frontend verwendet ausschließlich `/api/v1`. Codex kann den Vertrag unter
`/api/docs/openapi.json` verwenden, um:

- API-Clientfunktionen und TypeScript-Typen abzuleiten;
- Formulare passend zu Request-DTOs zu erstellen;
- Tabellen und Detailansichten passend zu Responses aufzubauen;
- Statuscodes und standardisierte Fehler korrekt zu behandeln;
- bei Änderungen betroffene Seiten gezielt zu finden.

Der WebSocket-Pfad `/api/shopfloor/ws` bleibt zunächst unverändert. Sein
Nachrichtenformat wird separat über das Feld `type` versioniert, damit bestehende
Live-Dashboard-Verbindungen nicht durch die HTTP-Versionierung unterbrochen
werden.
