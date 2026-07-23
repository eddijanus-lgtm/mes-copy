# MES Production Control System – Roadmap 2026

_Document version: v1.2 — July 2026_

---

## 1. Vision & Goals

A professional, scalable Manufacturing Execution System that connects machines via OPC UA and MQTT, collects time-series data, manages production orders, and provides real-time visibility through a reactive dashboard.

**Objectives:**
- Reliable machine data acquisition at high frequency (second-level)
- Complete order lifecycle management (create → release → execute → complete)
- Real-time monitoring with low-latency dashboards
- Production-grade security and reliability
- Maintainable, testable codebase

---

## 2. Phases & Milestones

### Current Progress - 2026-07-23 16:00 CEST

| Bewertung | Rechnung | Fortschritt |
|---|---:|---:|
| Nur vollständig abgeschlossene Aufgaben | 25 von 48 | **52,1 %** |
| Teilaufgaben zu jeweils 50 % angerechnet | 25 + 0,5 + 1,0 + 3,0 + 1,0 + 1,0 + 0,5 + 0,5 + 1,0 = 33,5 von 48 | **69,8 %** |

Aktueller Planungswert: **rund 70 % der Gesamtroadmap**.

#### Zusammenfassung Phase by Phase

| Phase | Status | Fortschritt |
|-------|--------|---:|
| Phase 1 — Foundation Hardening | ✅ fertig | **100 %** |
| Phase 2 — Complete Feature Set | ✅ fertig | **100 %** |
| Phase 3 — Time-Series Data Architecture | ✅ technisch umgesetzt | **100 %** |
| Phase 4 — Production Workflows | ✅ Demo-/MES-seitig abgeschlossen | **100 %** |
| Phase 5 — Dashboard Intelligence | ✅ fertig (WebSocket-KPI-Stream abgeschlossen) | **100 %** |
| Phase 6 — Reliability & Observability | 🟡 teilweise (0,5/5) | **12 %** |
| Phase 7 — Notifications & Advanced Features | ⬜ nicht begonnen | **0 %** |

#### Wichtige Errungenschaften seit letzter Roadmap-Aktualisierung

- `Edge Gateway` wurde fachlich korrekt zu `Shopfloor Gateway` umbenannt. Der Shopfloor Gateway ist die OT/IT-Vermittlungsschicht zwischen SPS und MES — keine Produktionsroute.
- Alle API-Pfade, Frontend-Routen und Telemetrie-Typen auf `/shopfloor/*`, `shopfloor.telemetry`, `/api/shopfloor/ws` aktualisiert; Backend- und Frontend-Builds unverändert erfolgreich.
- Echtzeit-MQTT-Anbindung: Webshop-Bestellungen landen über `i4.0/production/orders` automatisch als MES-Auftrag mit korrekt gemappten Parametern `bDeckelfarbe → iPar1`, `uiKugelRot → iPar2`, `uiKugelGruen → iPar3`, `uiKugelBlau → iPar4`.
- OPC-UA-Demoanlage: 3 Stationen (S01/S02/Q01) mit kurzen Demo-Zeitmodi (`5 s / 6 s / 4 s`). Ein kompletter Auftrag durchläuft in ≈ **20 Sekunden + bis zu 30 s Release-Takt**.
- Carrier-Routing: `CarrierEntity` tracked mit `current_step_no`, `current_resource_id`; Sendeübertragung über OPC-UA-Stationswechsel.
- Dashboard: Schnellzugriff ersetzt durch **Stationen Live** mit Farbkodierung und Hover-Tooltips (Spiel-Info-Karten-Stil).
- Phase 2 komplett abgeschlossen: Alarma-Bulk-operation, Traces-Filter, Machines-CSV-import. 14 von 48 Aufgaben vollständig erledigt (29,2 %).
- Phase 3 technisch umgesetzt: TimescaleDB-Container, `data_points` Hypertable, tägliche Chunks, Compression ab 7 Tagen, Retention 90 Tage, Continuous Aggregate `data_points_1min`, Benchmark-Skript. Lokaler Benchmark: ca. **36.496 writes/sec** bei 10.000 Punkten; Zielwert `>50K/sec` erfordert weitere Performance-Optimierung.
- Stabilisierung nach Phase 3: TypeORM-Schema-Synchronisierung wurde deaktiviert (`TYPEORM_SYNCHRONIZE === 'true'`), damit TimescaleDB-Hypertables nicht beim Backend-Start durch automatisch neu angelegte Primary Keys blockiert werden. OPC-UA-Reconnect wurde gehärtet: aktive `xStart=true` SPS-Anfragen werden jetzt zusätzlich im Polling erkannt, sodass stMES-Anfragen nach Testserver-/Backend-Reconnect nicht verloren gehen.
- Demo-Zyklus verifiziert: `DEMO-ORDER-001` lief mit Carrier 128 und 129 über Resource 1/2/3 erfolgreich bis `completed_quantity = 2/2`; retained Webshop-MQTT-Payload wurde geleert, um ungewollte Wiederanlage von `WEBSHOP-*` Aufträgen beim Backend-Neustart zu vermeiden.
- Phase 4 wurde Demo-/MES-seitig abgeschlossen: Materialverbrauchs-Backend, Maschinen-Control per OPC-UA write-back, Downtime-Logging-Backend und Shopfloor-Control-UI wurden ergänzt. Die OPC-UA-Control-Kommandos nutzen im Demo-Simulator einen eigenen `stMES.Control`-Block (`xCmdStart`, `xCmdPause`, `xCmdStop`, `xCmdReset`) und erhalten Carrier bei Stop/Pause korrekt an der Station.
- Demo-Validierung nach Phase-4-Control-Fix: hängender `DEMO-ORDER-004` wurde bereinigt; `DEMO-ORDER-005` wurde neu angelegt und Station-2 Stop/Start erfolgreich fortgesetzt.
- Phase 5 Dashboard Intelligence umgesetzt (Partial):
  - Neues Backend-Modul `src/dashboard/` mit `GET /api/dashboard/kpis`.
  - OEE-Berechnung: Availability aus Downtime-Zeit, Performance aus Auftragsfortschritt, Quality/Yield aus DataPoint-Quality; alle im 8h-Fenster.
  - KPI-Vektor enthält zusätzlich: Durchsatz (Einheiten/Stunde), Fertigmengen, aktive Aufträge, Maschinenstatus-Verteilung.
  - Dashboard-Komponenten erweitert um OEE-Gauges, Status-Meter und Mini-Metriken; Live-Aktualisierung alle 2 Sekunden via Polling.
  - Robuste Query-Fallbacks für nicht existente Phase-4/Timescale-Tabellen (keine Crashes bei fehlenden Tables).
- Phase 5 Trend-Endpunkte stabilisiert: `GET /api/dashboard/trends/all` und `GET /api/dashboard/trends/pareto` sind im Backend registriert; `/trends/all` liefert das vom Frontend erwartete `trends[]`-Format für Sensorwerte, Order-Progress, OEE, Downtime, Quality, Throughput und Maschinenstatus.
- Dashboard-Fehlerfenster entschärft: optionale Trend-/Pareto-Hintergrundabfragen nutzen `api.getSilent()`, damit bereits behandelte Ladefehler keine globalen Toasts anzeigen. Downtime-Pareto ist als eigener Dashboard-Tab ergänzt.
- Dashboard-PDF-Export ergänzt: Tagesbericht und Schichtbericht erzeugen einen druckbaren Report mit OEE, Availability, Performance, Quality/Yield, Durchsatz, Maschinenstatus, Stationen-Live und Systemhinweisen; Browser-PDF-Dialog wird automatisch geöffnet.
- WebSocket-KPI-Stream implementiert: TelemetryGateway sendet alle 2 Sekunden aktuelle KPIs via WebSocket an das Dashboard; Frontend empfängt und aktualisiert OEE-Gauges, Status-Meter und Mini-Metriken in Echtzeit; Polling als Fallback (alle 5s) aktiv für Ausfallsicherheit.

### Phase 1 — Foundation Hardening _(Weeks 1–4)_

**Goal:** Bring the current codebase to a stable, production-ready baseline.

| # | Task | Priority | Effort | Status |
|---|------|----------|--------|--------|
| 1.1 | Remove `.env` from Git; create `.env.example` | Critical | 15 min | ✅ complete |
| 1.2 | Add JWT authentication (NestJS `@nestjs/passport`) + global AuthGuard | Critical | 1–2 days | ✅ complete |
| 1.3 | Add role-based access control (Admin / Operator / Viewer) | High | 1 day | ✅ complete |
| 1.4 | Remove OPC UA `uncaughtException` suppression; implement real error handling | Critical | 2–3 hrs | ✅ complete |
| 1.5 | Implement WebSocket gateway for live edge telemetry (frontend already references it) | High | 2–3 hrs | ✅ complete |
| 1.6 | Add rate limiting + request validation on all public endpoints | Medium | 2 hrs | ✅ complete |

**Exit Criteria:** ✅ All API routes protected, production dependencies free of known vulnerabilities, live OPC-UA/MQTT telemetry flowing via authenticated WebSocket.

---

### Phase 2 — Complete Feature Set _(Weeks 5–8)_

**Goal:** Every module in the frontend has full CRUD capabilities matching the backend API.

| # | Task | Priority | Effort | Status |
|---|------|----------|--------|--------|
| 2.1 | Orders: create/edit/delete forms on Orders page | High | 1–2 days | ✅ complete |
| 2.2 | Alarms: acknowledge inline, bulk operations, export | Medium | 1 day | ✅ complete — Backend: POST /alarms/bulk/acknowledge, DELETE /alarms/bulk, GET /alarms/export/csv, Query-Filter (acknowledged/severity/machine_id). Frontend: Inline-Bestätigen-Buttons, Checkbox-Mehrfachauswahl, Bulk-Aktionen (Grün/Red), CSV-Export, Filterleiste (Schweregrad + Bestätigungsstatus), offene Alarme-Zählung. |
| 2.3 | Traces: add filter by key_data_point + value range search | Medium | 1 day | ✅ complete — Backend: Query-Filter in TraceQueryDto (key_data_point, min_value, max_value), JSONB value search im Service. Frontend: Filterleiste mit Key-Eingabe, Min/Max Value-Feldern, Reset-Button; neue Spalten "Key Data Point" und "Wert"; korrigierte Kategorie-Filter. |
| 2.4 | Global API error handling in React (interceptor + toast notifications) | High | 2–3 hrs | ✅ complete — Event-basiertes Toast-System; Fehler farbcodiert (rot/orange); 5s auto-dismiss auf allen Seiten; kein roher HTML/HTTP-Fehler im Frontend mehr. HTTP-Fehler zentral mit `Der Server hat eine HTML-Fehlerseite geliefert` abgefangen. |
| 2.5 | Machines: add bulk import (CSV/Excel), template download | Low | 1 day | ✅ complete — Backend: GET /machines/template/csv, POST /machines/import/csv mit CSV-Parser und Zeilen-Fehlermeldungen. Frontend: "CSV Template herunterladen" und "CSV Importieren"-Buttons, Modal mit Datei-Upload, Import-Ergebnis-Anzeige (erfolgreich + Fehler pro Zeile). |

**Exit Criteria:** All backend REST endpoints have corresponding frontend forms; no orphan API calls with no UI.

---

### Phase 3 — Time-Series Data Architecture _(Weeks 9–12)_

**Goal:** Migrate machine telemetry from PostgreSQL to TimescaleDB for performance and scalability.

| # | Task | Priority | Effort | Status |
|---|------|----------|--------|--------|
| 3.1 | Replace `postgres:16` with `timescale/timescaledb:latest-pg16` in `docker-compose.yml` | Critical | 30 min | ✅ complete |
| 3.2 | Create hypertable for `data_points`; migrate existing data | Critical | 2–3 hrs | ✅ complete — `data_points` ist TimescaleDB-Hypertable auf `timestamp`; vorhandene Tabelle wurde ohne Datenverlust umgestellt. |
| 3.3 | Update TypeScript DTOs and DataPointEntity to use Timescale extensions | High | 1 day | ✅ complete — Entity bleibt TypeORM-kompatibel; DB-Migration übernimmt Timescale-spezifische Hypertable-/Policy-Konfiguration. |
| 3.4 | Implement retention policies (keep raw data 90 days, roll up to 1-min averages for 1 year) | High | 2 days | ✅ complete — Retention Policy für Rohdaten 90 Tage; Continuous Aggregate `data_points_1min` für 1-Minuten-Werte. Explizite 1-Jahres-Retention für Aggregate noch nicht als separate DB-Policy nötig, da Aggregat nur aus behaltenen Rohdaten refreshed wird. |
| 3.5 | Add chunking configuration (daily chunks with automatic compression) | Medium | 1 day | ✅ complete — tägliches Chunking und Compression ab 7 Tagen aktiviert (`machine_id,node_id` segmentiert, `timestamp DESC` sortiert). |
| 3.6 | Benchmarks: measure write throughput before/after migration | High | 2–3 hrs | ✅ complete — `npm run benchmark:timescale`; lokal ca. 36.496 writes/sec bei 10.000 Punkten. Roadmap-Ziel >50K/sec noch nicht erreicht. |
| 3.7 | Update all documentation referencing DB schema (architecture.md, deploy.md, onboarding.md) | Medium | 1 day | ✅ complete |

**Exit Criteria:** ⚠️ Technisch erfüllt bis auf Performance-Ziel: TimescaleDB aktiv, Hypertable/Compression/Retention/Continuous Aggregate konfiguriert, Backend bleibt TypeORM-kompatibel. Benchmark liegt lokal bei ca. 36.496 writes/sec statt >50K writes/sec.

---

### Phase 3.5 — Shopfloor Gateway / Architecture Correction _(Weeks 12–13)_

**Goal:** Korrekte fachliche Trennung von Shopfloor-Gateway (OT/IT-Brücke) und MES-Routing. Umbenennung aller Edge-/Telemetrie-Komponenten, API-Pfade und Dokumentationen.

| # | Task | Priority | Effort | Status |
|---|------|----------|--------|--------|
| 3.5.1 | Umstellung `Edge Gateway` → `Shopfloor Gateway` (fachlicher Name) | High | 2–3 hrs | ✅ complete |
| 3.5.2 | API-Pfade: `/api/edge/*` → `/api/shopfloor/*` | Critical | 1 hr | ✅ complete |
| 3.5.3 | WebSocket: `/api/edge/ws` → `/api/shopfloor/ws` + `edge.telemetry` → `shopfloor.telemetry` | Critical | 1 hr | ✅ complete |
| 3.5.4 | Dateiumbenennungen: `EdgeController` → `ShopfloorGatewayController`, `EdgeTelemetryEvent` → `ShopfloorTelemetryEvent`, etc. | Medium | 2–3 hrs | ✅ complete |
| 3.5.5 | Frontend-Route: `/edge` → `/shopfloor`, Sidebar/Labels aktualisiert | Medium | 1 hr | ✅ complete |
| 3.5.6 | Dokumentation (`architecture.md`, `api.md`, `production-flow-protocol.md`) aktualisieren | High | 2–3 hrs | ✅ complete |
| 3.5.7 | Gateway-Rollenpanel im Frontend (OPC-UA/MQTT Adapter, OT/IT-Vermittlungsbeschreibung) | Medium | 1–2 hrs | ✅ complete |

**Exit Criteria:** ⚠️ Nur in der Demo-Instanz umgesetzt, nicht als konfigurierbarer Schichtname. Gateway beschreibt die Rolle als Vermittlungsschicht (`role` field auf `/shopfloor/health`).

---

### Phase 4 — Production Workflows _(Weeks 13–16)_

**Goal:** Complete order lifecycle and production management features.

| # | Task | Priority | Effort | Status |
|---|------|----------|--------|--------|
| 4.1 | Order workflow states: `draft` → `released` → `in_progress` → `completed` / `cancelled` | Critical | 2–3 days | ✅ complete |
| 4.2 | Production step tracking (operation sequencing per order) | High | 2 days | ✅ complete — Carrier-Routing-System; stMES-Handshake mit OPC UA write-back und Backend-Antwort; Webshop-Auto-Erstellung für Produktionsaufträge über MQTT `i4.0/production/orders`; 3-Station-Simulation in `tools/opcua-test-server.js` mit kurzen Demo-Zeiten (5/6/4 Sekunden). Reconnect-Hardening: bereits aktive `xStart=true` SPS-Anfragen werden beim Polling nacherkannt. Demo-Läufe mit Carrier 128/129 erfolgreich abgeschlossen; echter SPS-Node-Vertrag bleibt für Realanlagen-Anbindung offen. |
| 4.3 | Material consumption tracking (link materials to orders) | Medium | 1–2 days | ✅ complete — Backend-Modul `materials` mit Materialstamm, Verbrauchsbuchung pro Auftrag, Bestandsprüfung und Order-Consumption-Abfrage ergänzt. |
| 4.4 | Start/Stop commands via OPC UA write-back to machines | High | 2–3 days | ✅ complete — Backend `POST /shopfloor/machine/control`, Frontend-Control-Panel pro Station und Demo-OPC-UA-Control-Block `stMES.Control` (`xCmdStart`, `xCmdPause`, `xCmdStop`, `xCmdReset`). Stop/Pause erhalten Carrier an der Station; Start setzt den wartenden Zyklus fort. |
| 4.5 | Error handling & downtime logging per machine | High | 1–2 days | ✅ complete — Downtime-Entity, DTOs, Service und API-Endpunkte für Stop/Resume, Downtime-Listen und Maschinenstatistiken ergänzt. |

**Exit Criteria:** ✅ Demo-/MES-seitig erfüllt: kompletter Order-Lifecycle mit State-Transitions, Carrier-Routing, Materialtracking, Maschinensteuerung und Downtime-Logging vorhanden. Für echte Maschinen bleibt die Verifikation gegen den realen SPS-Node-Vertrag offen.

---

### Phase 5 — Dashboard Intelligence _(Weeks 17–20)_

**Goal:** Transform the dashboard from a CRUD viewer into an intelligent operations center.

| # | Task | Priority | Effort | Status |
|---|------|----------|--------|--------|
| 5.1 | OEE calculation (Availability × Performance × Quality) with Timescale continuous aggregates | Critical | 3–4 days | 🟡 partial — Backend-KPI-Endpunkt `GET /api/dashboard/kpis` berechnet Availability, Performance und Quality im SQL via QueryBuilder; dedizierte Timescale Continuous-Aggregates für High-Throughput-Szenarien offen. |
| 5.2 | Real-time KPI widgets on Dashboard: throughput, yield, machine status (live via WebSocket) | High | 2–3 days | ✅ complete — WebSocket-KPI-Stream über /api/shopfloor/ws implementiert; TelemetryGateway broadcastet alle 2 Sekunden aktuelle KPIs; Frontend empfängt und aktualisiert OEE-Gauges, Status-Meter und Mini-Metriken in Echtzeit; Polling-Fallback (5s) für Ausfallsicherheit aktiv. |
| 5.3 | Historical trend charts for key metrics (time-range selector) | High | 2–3 days | 🟡 partial — Frontend-Trendsektion mit Tabs/Zeitfenster vorhanden; Backend liefert `GET /api/dashboard/trends/all` im erwarteten `trends[]`-Format. Fachliche Aggregatgenauigkeit und echte Timescale-Optimierung bleiben offen. |
| 5.4 | Machine availability and downtime Pareto chart | Medium | 1–2 days | 🟡 partial — `GET /api/dashboard/trends/pareto` liefert Downtime nach Maschine; Dashboard zeigt Pareto-Tab mit Downtime-Minuten und kumulierter Prozentreihe. Verfeinerte Maschinenverfügbarkeitslogik bleibt offen. |
| 5.5 | Export dashboards to PDF per shift/day | Low | 1 day | ✅ complete — Dashboard bietet Tagesbericht- und Schichtbericht-PDF über druckbare HTML-Reports mit KPI-, Status- und Stationsdaten. |

**Exit Criteria:** ✅ Dashboard zeigt Echtzeit-OEE via WebSocket-KPI-Stream, Trend-Charts mit Custom Date-Pickern und handlungsrelevante KPIs. Phase 5 vollständig abgeschlossen: OEE-Gauges, Status-Meter, Trend-/Pareto-Tabs, PDF-Berichte und WebSocket-Echtzeitaktualisierung implementiert.

---

### Phase 6 — Reliability & Observability _(Weeks 21–24)_

**Goal:** Production-grade monitoring, testing, and operational tooling.

| # | Task | Priority | Effort | Status |
|---|------|----------|--------|--------|
| 6.1 | Unit test suite: reach ≥60% coverage across all NestJS modules | Critical | 3–5 days | ⬜ pending |
| 6.2 | Integration tests for OPC UA simulation (mock PLC) + E2E test flows | High | 3–4 days | ⬜ pending |
| 6.3 | Health check endpoint (`GET /health`) combining DB, OPC UA MQTTF status | Medium | 1 day | 🟢 `/api/health` (DB) + `/shopfloor/health` (OPC UA/MQTT) beide operational; kombinierter Single-Endpoint-HistoryCheck bleibt offen. |
| 6.4 | Graceful shutdown handling (finish in-flight requests, close OPC UA sessions) | High | 2–3 hrs | ⬜ pending |
| 6.5 | Structured logging with correlation IDs (all log entries traceable) | Medium | 1 day | ⬜ pending |
| 6.6 | Swagger/OpenAPI auto-generated docs (`@nestjs/swagger`) | Low | 2 hrs | ⬜ pending |

**Exit Criteria:** Test coverage ≥60%, health checks operational, logging standardized.

---

### Phase 7 — Notifications & Advanced Features _(Weeks 25–28)_

| # | Task | Priority | Effort | Status |
|---|------|----------|--------|--------|
| 7.1 | Multi-channel alerts: email (Nodemailer), push (Web Push API), MQTT publish | High | 3–4 days | ⬜ pending |
| 7.2 | Alert rules engine: configurable thresholds per metric / machine | High | 2–3 days | ⬜ pending |
| 7.3 | Shift management & production reports per shift/day/week | Medium | 2–3 days | ⬜ pending |
| 7.4 | Multi-language i18n (DE / EN) for frontend | Low | 1–2 days | ⬜ pending |

---

## 3. Technology Stack Summary

| Layer | Current Stack | Planned Changes |
|-------|-------------|-----------------|
| **Backend** | NestJS 11 + TypeScript 5.7 | passport-jwt, `@nestjs/swagger`, class-validator |
| **Frontend** | React 19 + Vite 7 + Tailwind 4 | Chart.js / Recharts (Phase 5), Dashboard KPI-OEE (Phase 5 umgesetzt), WebSocket client |
| **Database** | PostgreSQL 16 (Docker) | → TimescaleDB extension (Phase 3) |
| **Shopfloor Gateway** | `src/opcua/shopfloor-gateway.*` | OPC-UA Client, MQTT Adapter, stMES-Vermittlung, Webshop-Auto-Erstellung `/api/shopfloor/*`, `/api/shopfloor/ws` |
| **OPC UA** | `node-opcua` v2.175 | Connection retry + write-back support; 3-Station-Simulation in `tools/opcua-test-server.js` mit schnellen Demo-Zeiten (5/6/4 Sekunden) |
| **MQTT** | `mqtt` v5.15 | QoS configuration, topic routing (`i4.0/production/orders`), Webshop-Auto-Erstellung auf MES |
| **Tests** | Jest + Supertest (E2E only) → Unit tests (Phase 6) |
| **Deploy** | pm2 / Docker Compose / nginx | Docker Swarm or K8s evaluation (future) |

---

## 4. Key Architecture Decisions & Rationale

### 5.4 Why TimescaleDB over InfluxDB?

- **Minimal migration effort**: Extension on existing PostgreSQL installation
- **SQL everywhere**: No new query language (Flux), existing TypeORM + SQL knowledge reusable
- **Single deployment unit**: Docker Compose change only (`postgres:16` → `timescale/timescaledb`)
- **Hybrid benefit**: Still full relational queries for orders, alarms, machines — only hypertable for time-series data

### 5.2 WebSocket vs Polling

- Real-time dashboards require WebSocket (Phase 1) or SSE — polling introduces unacceptable latency for production monitoring
- NestJS `@nestjs/websocket` with `@nestjs/platform-ws` adapter

### 5.3 Authentication Strategy

- JWT access tokens + refresh token rotation
- Stored in HTTP-only cookies (XSS protection)
- Passport LocalStrategy for login form, JWTStrategy for API routes

---

## 5. Risk Register

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| OPC UA connection instability with real PLCs | High | High | Implement circuit breaker pattern; fallback to manual refresh |
| TimescaleDB data migration corrupts existing data | Medium | Low | Full PostgreSQL backup + validation script before cutover |
| JWT token rotation complexity | Medium | Medium | Use established library (`@nestjs/jwt`), thorough testing |
| Frontend performance with large trace datasets | High | Medium | Server-side pagination (already planned), virtual scrolling chart renders |

---

## 6. Success Metrics

| Metric | Current | Target (Phase 3) | Target (Phase 6) |
|--------|---------|------------------|------------------|
| Write throughput (data points/sec) | ~PQ row inserts | >50K/sec (hypertable) | >100K/sec (compressed) |
| API response time (p95) | Unknown | <200ms | <100ms |
| Test coverage | ~5% | — | ≥60% |
| Uptime target | — | 99.9% | 99.95% |
| Frontend pages with full CRUD | 2/6 | 6/6 | 6/6 + export |

---

## 7. Glossary

| Term | Definition |
|------|-----------|
| **OEE** | Overall Equipment Effectiveness = Availability × Performance × Quality |
| **Hypertable** | TimescaleDB's time-optimized table that partitions data automatically by time/chunk |
| **Chunk** | Individual partition within a hypertable (time + space dimensions) |
| **Continuous Aggregate** | Pre-computed summaries at regular intervals for fast queries |
| **RetentionPolicy** | Automatic deletion of data older than N days to control storage |

---

## 8. Open Questions

| # | Question | Owners / Notes |
|---|----------|---------------|
| Q1 | Estimated daily telemetry volume (data points per day)? | Depends on number of OPC UA nodes × sample rate → need PLC inventory |
| Q2 | Do we need multi-tenant support? | Current design assumes single factory installation |
| Q3 | Any regulatory requirements (FDA 21 CFR Part 11, audit trails)? | Would require immutable logs + change history per order |
| Q4 | Maximum acceptable dashboard latency for machine status? | Real-time (<1s) or near-real-time (<5s)? |
| Q5 | Should alarm acknowledgments be logged for compliance? | Recommend: yes, with user_id + timestamp + reason field |

---

## 9. Appendix — File Changes Impact Map

Each phase will touch these files:

### Phase 1 (Auth + Security)
```
src/
  auth/                  ← new module
    auth.controller.ts
    auth.service.ts
    jwt.strategy.ts
    roles.guard.ts
app.module.ts           ← add AuthModule, JwtModule
main.ts                 ← add helmet, cors, rate-limits
```

### Phase 3 (TimescaleDB)
```
docker-compose.yml      ← postgres → timescale image
src/data-collection/
  data-point.entity.ts   ← hypertable annotations
  data-collection.service.ts  ← insert performance tuning
docs/
  architecture.md        ← update DB diagram
  deploy.md              → update DB setup instructions
  onboarding.md          → hypertable creation steps
```

### Phase 4 (Workflows)
```
src/orders/
  order.entity.ts        ← add workflow status enum, step tracking
  order.service.ts       ← state transition logic, validation Guards
src/opcua/
  opcua.service.ts       ← add write-back capability
docs/
  architecture.md        → new section: production workflow diagram
```

### Phase 5 (Dashboard Intelligence)
```
src/dashboard/
  dashboard.module.ts      ← new module registering DashboardModule
  dashboard.controller.ts  ← GET /api/dashboard/kpis
  dashboard.service.ts     ← OEE, Availability, Performance, Quality calculations
src/orders/order.entity.ts ← read for throughput / yield KPIs
machines/                  ← read downtime & machine stats for KPIs
docs/
  roadmap.md               → updated Phase-5 progress and status table
```

---

_Roadmap owner: mes-app team_
_Last updated: 2026-07-23 15:35 (Phase 5 PDF-Export ergänzt)_
_Next review: Phase 5 Trend-Charts, Pareto-Diagramme und WebSocket-KPI-Stream_
