#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE_FILE="$PROJECT_DIR/docker-compose.virtual-plc.yml"
PLC_HOST="${PLC_ADVERTISED_HOST:-127.0.0.1}"
PLC_PORT="${PLC_OPCUA_PORT:-4840}"

case "${1:-start}" in
  start)
    docker compose --file "$COMPOSE_FILE" up --detach --build --wait
    echo "Virtuelle SPS: opc.tcp://$PLC_HOST:$PLC_PORT"
    ;;
  stop)
    docker compose --file "$COMPOSE_FILE" down
    ;;
  status)
    docker compose --file "$COMPOSE_FILE" ps
    ;;
  logs)
    docker compose --file "$COMPOSE_FILE" logs --follow virtual-plc
    ;;
  *)
    echo "Verwendung: $0 {start|stop|status|logs}" >&2
    exit 2
    ;;
esac
