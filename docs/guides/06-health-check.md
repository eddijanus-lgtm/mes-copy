# 06 — Health Check Endpoint (Phase 6, Task 6.3)

_Guide erstellt: 2026-07-22_
_Status: backend_complete_

---

## Konzept-Erklärung

### Was ist ein Health Check?

Ein Health Check ist ein spezieller API-Endpoint (`GET /health`), der prüft ob alle kritischen Abhängigkeiten eines Systems verfügbar und funktionsfaehig sind. Er wird typischerweise eingesetzt für:

- **Docker health checks** → `docker inspect` prüft automatisch
- **Kubernetes liveness/readiness probes** → orchestriert Pods neu bei Ausfall
- **Load Balancer Health Checks** → entfernt kranke Instanzen aus der Rotation
- **Monitoring/Alerting** → Prometheus, Grafana, etc. integrieren sich nativ

---

## Warum brauchen wir das im wara-mes-Projekt?

1. **MES läuft in Docker** → ohne health check weiß man nie ob alles wirklich funktioniert
2. **Multi-Dienst-Architektur** (PostgreSQL, OPC UA, MQTT, Backend) → ein ausgefallener Dienst muss sofort erkennbar sein
3. **Automatische Neustarts** → Kubernetes/Docker starten kranke Instanzen automatisch neu

---

## Geplante Änderungen — Step for Step

### Schritt 1: Dependencies
**Was:** `npm install @nestjs/terminus`
**Warum:** Terminus ist das offizielle NestJS Health Check Modul

### Schritt 2: Health-Module erstellen
**Dateien:**
- `src/health/health.controller.ts` — GET /health Endpoint mit @HealthCheck() Decorator
- `src/health/health.module.ts` — Modul mit TerminusModule import

### Schritt 3: AppGlobal Health-Module registrieren
**Was:** health.module in app.module.ts imports
**Warum:** Damit der Endpoint unter `/api/health` erreichbar ist

### Implementierte Struktur (2026-07-22T12:45+02:00):
```
src/
  health/                    ✅ neu erstellt
    health.controller.ts     ✅ GET /health mit HealthCheckService
    health.module.ts         ✅ TerminusModule import
app.module.ts                ✅ HealthModule registriert
```

---

## Checkliste nach Umsetzung
- [x] `npm install @nestjs/terminus` ausgeführt
- [x] TypeORM-Datenbankindikator korrekt eingebunden
- [x] `HealthModule` in `AppModule` registriert
- [x] `GET /api/health` ist öffentlich und gibt HTTP 200 zurück
- [x] Response meldet `database.status: up`
- [ ] OPC-UA- und MQTT-Status ergänzen

---

_Review Status: verified_
_Prüfer: riegello_
_Letzte Änderung: 2026-07-22T12:45:00+02:00_
