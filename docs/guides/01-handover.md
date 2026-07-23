# Phase 1 Handover

_Stand: 2026-07-22_

Phase 1 ist lokal implementiert und verifiziert. Es wurde nichts committed oder gepusht.

## Laufende Dienste

| Dienst | Adresse |
|---|---|
| MES Frontend + API | `http://localhost:3000` |
| Vite Dev Server | `http://localhost:5173` |
| PostgreSQL | `localhost:5432` |
| OPC-UA-Testserver | `opc.tcp://localhost:4840/UA/WaraMesTest` |
| MQTT | `mqtt://localhost:1883` |
| Telemetrie-WebSocket | `ws://localhost:3000/api/shopfloor/ws` |

## Entwicklungsbefehle

```bash
npm run start:opcua-test
npm run start:dev
cd frontend && npm run dev
```

## Wichtige Hinweise

- Es gibt keine öffentliche Seed-Route mehr.
- Admins werden mit `npm run create-admin` initial angelegt.
- WebSocket-Clients müssen als erste Nachricht `{ "type": "auth", "token": "..." }` senden.
- OPC-UA-Nodes und MQTT-Topics werden über Umgebungsvariablen begrenzt.
- Der lokale Testserver ist nicht für Produktion vorgesehen.
- Der bestehende lokale Entwicklungsadmin stammt aus der Testphase; Produktionszugänge müssen separat erzeugt werden.

## Verifikation

- Backend- und Frontend-Build erfolgreich
- Produktionsabhängigkeiten: 0 bekannte npm-Sicherheitslücken
- DB, OPC UA und MQTT verbunden
- OPC-UA-Ausfall und automatische Wiederverbindung getestet
- JWT-WebSocket liefert Live-Telemetrie
- RBAC, DTO-Whitelist, Rate Limit und Security Headers getestet
