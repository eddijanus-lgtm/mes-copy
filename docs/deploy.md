# Deploy-Anleitung

## Production-Deployment mit pm2

### pm2 Cluster-Mode (horizontal scaling)
```bash
npx pm2 start dist/main.js -i 4 --name mes-gateway
npx pm2 save
npx pm2 startup   # Autostart bei Server-Neustart
```

### pm2 ecosystem config (empfohlen)

Datei `ecosystem.config.js` erstellen:

```js
module.exports = {
  apps: [{
    name: 'mes-gateway',
    script: 'dist/main.js',
    instances: 2,
    exec_mode: 'cluster',
    max_memory_restart: '1G',
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000,
    },
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    error_file: './logs/error.log',
    out_file: './logs/out.log',
    merge_logs: true,
  }],
};
```

Start mit:
```bash
npx pm2 start ecosystem.config.js --env production
```

## Docker Compose (Entwicklung)

```yaml
# docker-compose.yml
services:
  postgres:
    image: timescale/timescaledb:latest-pg16
    container_name: mes_db
    environment:
      POSTGRES_USER: mes_admin
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: mes_production
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

## SSL / Reverse Proxy (Nginx)

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate     /etc/ssl/certs/mes.crt;
    ssl_certificate_key /etc/ssl/private/mes.key;

    location /api/ {
        proxy_pass http://localhost:3000/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Host $host;
    }

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
    }
}
```

## Environment-Variablen (Production)

| Variable | Beschreibung | Beispiel |
|----------|-------------|----------|
| `DB_HOST` | Datenbank-Host | `db.internal.corp` |
| `DB_PORT` | Datenbank-Port | `5432` |
| `DB_USERNAME` | DB User | `mes_admin` |
| `DB_PASSWORD` | DB Password | *(geheim)* |
| `DB_DATABASE` | Datenbankname | `mes_production` |
| `NODE_ENV` | Environment | `production` |
| `MQTT_BROKER_URL` | MQTT Broker | `mqtt://internal.corp:1883` |
| `OPCUA_ENDPOINT_URL` | OPC UA Server | `opc.tcp://plc.internal:4840` |

## TimescaleDB Setup

Phase 3 nutzt TimescaleDB als PostgreSQL-kompatible Zeitreihen-Datenbank. Nach dem Start des Containers muss die Migration einmal ausgeführt werden:

```bash
npm run phase3:apply
```

Das Skript macht folgende Schritte idempotent:

- `CREATE EXTENSION IF NOT EXISTS timescaledb`
- `data_points` zu einer Hypertable auf `timestamp` machen
- tägliches Chunking konfigurieren
- Compression ab 7 Tagen aktivieren
- Retention Policy: Rohdaten 90 Tage behalten
- Continuous Aggregate `data_points_1min` erstellen und aktualisieren

Benchmark:

```bash
npm run benchmark:timescale
```

Aktueller lokaler Messwert: `10000` Testpunkte in `0.27s`, ungefähr `36496 writes/sec`. Das ist funktional, liegt aber noch unter dem Roadmap-Ziel `>50K writes/sec`; weitere Optimierung ist für Produktionslast empfohlen.

## Health-Check Endpoint

```bash
curl http://localhost:3000/api/v1/shopfloor/health
```
