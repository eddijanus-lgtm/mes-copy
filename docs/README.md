# MES Shopfloor Gateway - Dokumentation

## Übersicht

Das MES Shopfloor Gateway ist die OT/IT-Vermittlungsschicht der Demo. Es verbindet Maschinen bzw. SPS-nahe OPC-UA-Nodes und MQTT mit dem MES, leitet Live-Daten weiter und gibt MES-Antworten an die Stationen zurueck. Produktionsauftraege, Routenentscheidungen, Trace-Daten und Alarme bleiben fachlich im MES.

### Tech-Stack

| Layer | Technologie |
|-------|------------|
| Backend | NestJS 11, TypeORM, PostgreSQL |
| Frontend | React 19, Vite 7, Tailwind CSS 4 |
| Protokolle | OPC UA (`node-opcua`), MQTT (`mqtt` v5) |
| Infrastruktur | Docker Compose, pm2 |

## Qualität und Normen

- [Normen-Gap-Analyse und Nachweismatrix](standards-gap-analysis.md)
- [API-Versionierung und Deprecation Policy](guides/11-api-lifecycle.md)
