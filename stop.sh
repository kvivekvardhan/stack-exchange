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

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║       StackFast — Stopping Services      ║"
echo "╚══════════════════════════════════════════╝"

step "Stopping frontend (port 5173)..."
PID=$(lsof -ti tcp:5173 2>/dev/null)
[ -n "$PID" ] && kill "$PID" && ok "Frontend stopped" || ok "Already stopped"

step "Stopping backend (port 4000)..."
PID=$(lsof -ti tcp:4000 2>/dev/null)
[ -n "$PID" ] && kill "$PID" && ok "Backend stopped" || ok "Already stopped"

step "Stopping Vectorized PG15 (port 5433)..."
if [ -f "$PG_CUSTOM" ] && "$PG_CUSTOM" -D "$PG_DATA_VEC" status &>/dev/null; then
  "$PG_CUSTOM" -D "$PG_DATA_VEC" stop -m fast
  ok "Vectorized PG15 stopped"
else
  PID=$(lsof -ti tcp:5433 2>/dev/null)
  [ -n "$PID" ] && kill "$PID" && ok "Vectorized PG15 stopped" || ok "Already stopped"
fi

echo ""
echo "  All services stopped."
echo ""
