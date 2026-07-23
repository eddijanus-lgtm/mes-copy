# Entwickler-Onboarding

## Voraussetzungen

| Tool | Version | Download |
|------|---------|----------|
| Docker Desktop | latest | docker.com |
| Node.js | 20+ | nodejs.org |
| pm2 (optional) | latest | `npm install -g pm2` |

## Schnellstart (5 Minuten)

```bash
# 1. Datenbank hochfahren (TimescaleDB)
docker-compose up -d postgres

# Warten bis DB bereit ist (ca. 10s)

# 2. Abhängigkeiten und Frontend installieren
npm install
cd frontend && npm install && npm run build && cd ..

# 3. OPC-UA-Testserver starten (separates Terminal)
npm run start:opcua-test

# 4. Backend bauen und starten
npm run build
npm run start:prod

# Optional: TimescaleDB-Hypertable/Retention/Compression prüfen oder erneut anwenden
npm run phase3:apply

# 5. Öffnen
http://localhost:3000
```

## Entwickeln

### Backend im Watch-Modus
```bash
# TypeScript-Kompilierung + Server neu starten bei Code-Changes
npm run start:dev
```

### Frontend Dev-Server
```bash
cd frontend
npm run dev
```

## Build-Prozess

```bash
# 1. Frontend bauen
cd frontend
npm run build

# 2. Backend bauen
npm run build

# 3. Starten
npm run start:prod
```

## Ersten Admin anlegen

Die Anwendung besitzt keinen öffentlichen Seed-Endpoint:

```bash
ADMIN_USERNAME=my-admin ADMIN_PASSWORD='a-long-random-password' npm run create-admin
```

## OPC-UA-Testserver

```bash
npm run start:opcua-test
```

Endpoint: `opc.tcp://localhost:4840/UA/WaraMesTest`. Der Testserver bildet `dbProcessData [DB151]` mit Werkstückträger, Workplan-Schritt, Ressource, vier Parametern und Prozesszeitstempel nach und ist nur für Entwicklung vorgesehen.

### Mehrstations-stMES-Demo vorbereiten

```bash
DEMO_ADMIN_USERNAME=<admin> DEMO_ADMIN_PASSWORD=<password> npm run seed:stmes-demo
```

Dieser Befehl erzeugt nur klar benannte Testdaten für zwei Demo-Stationen, Carrier 128/129 und `DEMO-ORDER-001`. Der stMES-Vertrag ist erfunden und darf nicht unverändert an einer realen SPS eingesetzt werden. Siehe `docs/guides/07-stmes-demo-contract.md`.

## TimescaleDB / Phase 3

Die Tabelle `data_points` ist eine TimescaleDB-Hypertable. Für lokale Verifikation:

```bash
npm run phase3:apply
npm run benchmark:timescale
```

Erwartete Datenbankstruktur:

- `data_points`: Hypertable, tägliche Chunks
- `data_points_1min`: Continuous Aggregate für 1-Minuten-Durchschnitte
- Compression Policy: Chunks älter als 7 Tage
- Retention Policy: Rohdaten älter als 90 Tage

## Troubleshooting

### Datenbank-Verbindung fehlschlägt
```bash
docker ps | grep mes_db    # Läuft der Container?
docker logs mes_db         # Fehler im Postgres-Log?
```

### Port-Konflikt
Port 3000 belegt? → `process.env.PORT` setzen oder Port freigeben.

### pm2 Logs anzeigen
```bash
npx pm2 logs mes-gateway
npx pm2 monit           # Live-Monitoring
```

## Code-Struktur

```
mes-app/
├── src/                    # Backend (NestJS)
│   ├── alarms/             # Alarme-Modul
│   ├── machines/           # Maschinen-Modul
│   ├── orders/             # Aufträge-Modul
│   ├── traces/             # Trace-Daten-Modul
│   ├── data-collection/    # Zeitreihendaten
│   ├── opcua/              # OPC UA + MQTT Gateway
│   └── main.ts             # Entry Point
├── frontend/               # React Frontend (Vite)
│   ├── src/pages/          # Seiten
│   ├── src/components/     # UI-Komponenten
│   └── public/             # Statische Dateien (Logo etc.)
├── dist/                   # Kompilierter Code
├── docs/                   # diese Docs
└── docker-compose.yml      # PostgreSQL-Service
```
