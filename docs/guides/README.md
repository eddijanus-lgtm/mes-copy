# Developer Guides — wara-mes

_Dieser Ordner enthält Erklärungen, Konzepte und technische Hintergründe für die Entwicklung des wara-mes-Projekts._

---

## Inhaltsverzeichnis

| Guide | Thema | Stand |
|-------|-------|-------|
| [00-environment-configuration.md](00-environment-configuration.md) | Sichere `.env`-Konfiguration und dokumentierte Vorlage | verified |
| [01-jwt-rbac.md](01-jwt-rbac.md) | JWT Authentication + Role-Based Access Control | verified |
| [02-websocket-live-telemetry.md](02-websocket-live-telemetry.md) | WebSocket für Echtzeit-Maschinendaten im Frontend | verified |
| [03-rate-limiting-validation.md](03-rate-limiting-validation.md) | Rate Limiting + Request Validation auf allen Endpoints | verified |
| [04-opcua-error-handling.md](04-opcua-error-handling.md) | Robustes OPC UA/MQTT Error Handling | verified |
| [05-timescaledb-migration.md](05-timescaledb-migration.md) | PostgreSQL → TimescaleDB Migration für Time-Series | planned |
| [07-stmes-demo-contract.md](07-stmes-demo-contract.md) | Erfundenes Mehrstations-stMES-Protokoll für lokale Demos | demo only |
| [08-orders-crud.md](08-orders-crud.md) | Vollständige Auftragsverwaltung im Frontend | verified |
| [10-real-machine-commissioning.md](10-real-machine-commissioning.md) | Lesende OPC-UA-Erfassung und Profilprüfung für die echte Anlage | prepared |
| [11-api-lifecycle.md](11-api-lifecycle.md) | API-Versionierung, Breaking Changes und Deprecation Policy | verified |
| [12-frontend-styleguide.md](12-frontend-styleguide.md) | Verbindliches WARA-Designsystem für Seiten, Komponenten und responsive Bedienung | verified |

---

_Jede Datei erklärt ein Konzept, warum es gebraucht wird und wie es umgesetzt wurde — mit Code-Beispielen und Referenzen._
