#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_LOG="${MES_BACKEND_LOG:-/tmp/wara-mes-backend.log}"
FRONTEND_LOG="${MES_FRONTEND_LOG:-/tmp/wara-mes-frontend.log}"

env_value() {
  node -e "require('dotenv').config({ quiet: true }); process.stdout.write(process.env[process.argv[1]] || process.argv[2] || '')" "$1" "$2"
}

BACKEND_PORT="$(env_value PORT 3000)"
FRONTEND_PORT="$(env_value FRONTEND_PORT 5173)"
DB_PORT="$(env_value DB_PORT 5432)"
MES_BASE_URL="$(env_value MES_BASE_URL "http://localhost:${BACKEND_PORT}/api/v1")"
DASHBOARD_URL="$(env_value DASHBOARD_URL "http://localhost:${FRONTEND_PORT}")"

cd "$PROJECT_DIR"

echo "WARA MES wird mit den Werten aus .env gestartet."

npm run opcua:validate-profile -- "$(env_value MACHINE_PROFILE_PATH '')"

echo "[*] Starte die konfigurierte PostgreSQL-Instanz ..."
docker compose up --detach --wait postgres

if lsof -i ":${BACKEND_PORT}" >/dev/null 2>&1; then
  echo "[OK] Backend läuft bereits auf Port ${BACKEND_PORT}."
else
  echo "[*] Starte Backend ..."
  nohup npm run start:dev >"$BACKEND_LOG" 2>&1 &
fi

if lsof -i ":${FRONTEND_PORT}" >/dev/null 2>&1; then
  echo "[OK] Frontend läuft bereits auf Port ${FRONTEND_PORT}."
else
  echo "[*] Starte Frontend ..."
  (
    cd "$PROJECT_DIR/frontend"
    nohup npm run dev -- --host 127.0.0.1 --port "$FRONTEND_PORT" >"$FRONTEND_LOG" 2>&1 &
  )
fi

for _ in $(seq 1 30); do
  if curl -fsS --max-time 2 "${MES_BASE_URL}/health" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

echo "PostgreSQL : localhost:${DB_PORT}"
echo "Backend    : ${MES_BASE_URL}"
echo "Dashboard  : ${DASHBOARD_URL}"
echo "Logs       : ${BACKEND_LOG} / ${FRONTEND_LOG}"

if curl -fsS --max-time 5 "${MES_BASE_URL}/health" >/dev/null 2>&1; then
  echo "Health     : OK"
else
  echo "Health     : FEHLER (siehe ${BACKEND_LOG})"
  exit 1
fi

if command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$DASHBOARD_URL" >/dev/null 2>&1 &
fi
