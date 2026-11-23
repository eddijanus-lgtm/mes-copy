#!/usr/bin/env bash
set -euo pipefail

cd "${1:?Pfad zum entpackten Release fehlt}"
npm ci --omit=dev

base_url="http://127.0.0.1:${PORT:?PORT fehlt}"
log_file="$PWD/mes-smoke.log"
pid=''

stop_app() {
  if [[ -n "$pid" ]]; then
    # Der Shutdown ist für diesen Test begrenzt, auch wenn eine Integration hängt.
    kill "$pid" 2>/dev/null || true
    for attempt in {1..10}; do
      kill -0 "$pid" 2>/dev/null || break
      sleep 1
    done
    kill -KILL "$pid" 2>/dev/null || true
    wait "$pid" 2>/dev/null || true
    pid=''
  fi
}

cleanup() {
  local status=$?
  stop_app
  if (( status != 0 )); then
    tail -n 100 "$log_file" >&2
  fi
  exit "$status"
}

start_app() {
  TYPEORM_SYNCHRONIZE="$1" node dist/main.js > "$log_file" 2>&1 &
  pid=$!
  for attempt in {1..60}; do
    kill -0 "$pid" 2>/dev/null || return 1
    if curl --fail --silent --max-time 2 "$base_url/api/health" >/dev/null; then
      return 0
    fi
    sleep 1
  done
  return 1
}

trap cleanup EXIT
# Schemaanlage ausschließlich auf der kurzlebigen CI-Datenbank.
start_app true
node tools/create-admin.js
stop_app
start_app false

curl --fail --silent --show-error --max-time 10 "$base_url/" > index.smoke.html
asset=$(node -e 'const html = require("node:fs").readFileSync("index.smoke.html", "utf8"); const asset = html.match(/<script[^>]+src="(\/assets\/[^" ]+)"/); if (!asset) process.exit(1); process.stdout.write(asset[1]);')
curl --fail --silent --show-error --max-time 10 "$base_url$asset" >/dev/null

token=$(node -e 'process.stdout.write(JSON.stringify({username: process.env.ADMIN_USERNAME, password: process.env.ADMIN_PASSWORD}));' |
  curl --fail --silent --show-error --max-time 10 -H 'Content-Type: application/json' --data-binary @- "$base_url/api/auth/login" |
  node -e 'const {access_token} = JSON.parse(require("node:fs").readFileSync(0, "utf8")); if (!access_token) process.exit(1); process.stdout.write(access_token);')
curl --fail --silent --show-error --max-time 10 -H "Authorization: Bearer $token" "$base_url/api/auth/users" >/dev/null
