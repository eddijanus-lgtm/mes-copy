#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR"

echo "========================================"
echo " WARA MES Edge Gateway – Start Script"
echo "========================================"

# ---------- 1. OPC UA Test Server ----------
if pgrep -f "opcua-test-server.js" > /dev/null; then
  echo "[OK] OPC UA-Testserver lauscht bereits."
else
  echo "[*] Starte OPC UA-Testserver …"
  nohup npm run start:opcua-test > >(tee /tmp/wara-mes-opcua.log) 2>&1 &
  sleep 3
  if pgrep -f "opcua-test-server.js" > /dev/null; then
    echo "[OK] OPC UA-Testserver läuft."
  else
    echo "[WARN] OPC UA konnte nicht gestartet werden. Log: /tmp/wara-mes-opcua.log"
    cat /tmp/wara-mes-opcua.log || true
  fi
fi

# ---------- 2. PostgreSQL (separater Container) ----------
CONTAINER_ID="mes_db_wara"

if docker inspect "$CONTAINER_ID" > /dev/null 2>&1; then
  state=$(docker inspect -f '{{.State.Status}}' "$CONTAINER_ID")
  if [ "$state" = "running" ]; then
    echo "[OK] PostgreSQL-Container ($CONTAINER_ID) lauscht bereits."
  else
    echo "[*] Starte PostgreSQL-Container …"
    docker start "$CONTAINER_ID"
    sleep 3
    echo "[OK] PostgreSQL-Container gestartet."
  fi
else
  if docker ps -a --format '{{.Names}}' | grep -q "^mes_db\$"; then
    echo "[*] Beende älteren Container 'mes_db', um Port-Konflikt zu vermeiden …"
    docker stop mes_db > /dev/null 2>&1 || true
    docker rm mes_db > /dev/null 2>&1 || true
  fi

  if ! docker volume inspect wara-mes_postgres_data > /dev/null 2>&1; then
    echo "[*] Erstelle Docker Volume …"
    docker volume create wara-mes_postgres_data > /dev/null 2>&1 || true
  fi

  echo "[*] Starte PostgreSQL-Container '$CONTAINER_ID' auf Port 5433 …"
  docker run -d \
    --name "$CONTAINER_ID" \
    -e POSTGRES_USER=mes_admin \
    -e POSTGRES_PASSWORD=change_me_in_production \
    -e POSTGRES_DB=mes_production \
    -p 5433:5432 \
    -v wara-mes_postgres_data:/var/lib/postgresql/data \
    postgres:16-alpine > /dev/null 2>&1

  echo "[OK] PostgreSQL-Container gestartet."
fi

# ---------- 3. Backend (NestJS) ----------
if lsof -i :3000 > /dev/null 2>&1; then
  echo "[OK] Backend-API auf Port 3000 lauscht bereits."
else
  echo "[*] Starte Backend-API …"
  export DB_PORT=5433
  nohup env DB_PORT=5433 npm run start:dev > >(tee /tmp/wara-mes-backend.log) 2>&1 &
  sleep 6

  if lsof -i :3000 > /dev/null 2>&1; then
    echo "[OK] Backend-API läuft auf Port 3000."
  else
    echo "[WARN] Backend konnte nicht starten. Log: /tmp/wara-mes-backend.log"
    tail -n 30 /tmp/wara-mes-backend.log || true
  fi
fi

# ---------- 4. Frontend Vite Dev Server ----------
if lsof -i :5173 > /dev/null 2>&1; then
  echo "[OK] Frontend-Dev-Server auf Port 5173 lauscht bereits."
else
  echo "[*] Starte Frontend (Vite) …"
  cd "$PROJECT_DIR/frontend"
  nohup npm run dev -- --host 0.0.0.0 > >(tee /tmp/wara-mes-frontend.log) 2>&1 &
  sleep 3

  if lsof -i :5173 > /dev/null 2>&1; then
    echo "[OK] Frontend läuft auf Port 5173."
  else
    echo "[WARN] Frontend konnte nicht starten. Log: /tmp/wara-mes-frontend.log"
    tail -n 30 /tmp/wara-mes-frontend.log || true
  fi
  cd "$PROJECT_DIR"
fi

# ---------- 5. Übersicht ----------
echo ""
echo "========================================"
echo " Status"
echo "========================================"
echo " OPC UA Testserver : opc.tcp://localhost:4840/UA/WaraMesTest"
echo " PostgreSQL        : localhost:5433"
echo " Backend-Api       : http://localhost:3000/api"
echo " Dashboard         : http://localhost:5173"
echo "========================================"

# Health-Check aufrufen
health_status=$(curl -sS --max-time 5 http://localhost:3000/api/health 2>/dev/null || echo "(nicht erreichbar)")
if echo "$health_status" | grep -q '"ok"'; then
  echo " Health-Check      : OK"
else
  echo " Health-Check      : FAILED – $health_status"
fi

echo ""
echo "Logs:"
echo " OPC UA    : /tmp/wara-mes-opcua.log"
echo " Backend   : /tmp/wara-mes-backend.log"
echo " Frontend  : /tmp/wara-mes-frontend.log"
echo "========================================"

# ---------- Start im Browser ----------
xdg-open http://localhost:5173 &>/dev/null &

