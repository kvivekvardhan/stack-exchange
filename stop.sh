#!/bin/bash
# ============================================================
# stop.sh — Gracefully stop all StackFast services
# ============================================================

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
PG_CUSTOM="$HOME/pgsql/bin/pg_ctl"
PG_DATA_VEC="$HOME/pgdata_vec"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ok()   { echo -e "${GREEN}  ✓ $*${NC}"; }
step() { echo -e "\n${YELLOW}▶ $*${NC}"; }

kill_matches() {
  local label="$1"
  local pattern="$2"
  local pids

  pids=$(pgrep -f "$pattern" 2>/dev/null || true)
  if [ -n "$pids" ]; then
    kill $pids 2>/dev/null || true
    sleep 1
    pids=$(pgrep -f "$pattern" 2>/dev/null || true)
    [ -n "$pids" ] && kill -9 $pids 2>/dev/null || true
    ok "$label stopped"
  fi
}

kill_port() {
  local label="$1"
  local port="$2"
  local pid

  pid=$(lsof -ti tcp:"$port" -sTCP:LISTEN 2>/dev/null)
  if [ -n "$pid" ]; then
    kill $pid 2>/dev/null || true
    sleep 1
    pid=$(lsof -ti tcp:"$port" -sTCP:LISTEN 2>/dev/null)
    [ -n "$pid" ] && kill -9 $pid 2>/dev/null || true
    ok "$label stopped"
  else
    ok "Already stopped"
  fi
}

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║       StackFast — Stopping Services      ║"
echo "╚══════════════════════════════════════════╝"

step "Stopping frontend (port 5173)..."
kill_port "Frontend" 5173
kill_matches "Stale Vite watchers" "$PROJECT_DIR/frontend/node_modules/.bin/vite"

step "Stopping backend (port 4000)..."
kill_port "Backend" 4000
kill_matches "Stale nodemon watchers" "$PROJECT_DIR/backend/node_modules/.bin/nodemon"

step "Stopping Vectorized PG15 (port 5433)..."
if [ -f "$PG_CUSTOM" ] && "$PG_CUSTOM" -D "$PG_DATA_VEC" status &>/dev/null; then
  "$PG_CUSTOM" -D "$PG_DATA_VEC" stop -m fast
  ok "Vectorized PG15 stopped"
else
  kill_port "Vectorized PG15" 5433
fi

echo ""
echo "  All services stopped."
echo ""
