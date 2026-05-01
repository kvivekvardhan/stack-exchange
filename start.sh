#!/bin/bash
# ============================================================
# start.sh — StackFast full-stack launcher
# Starts: vectorized PG15 (5433), baseline PG17 (5434),
#         Node.js backend (4000), Vite frontend (5173)
#
# Usage:  bash start.sh
# Stop:   bash stop.sh
# ============================================================

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
PG_CUSTOM="$HOME/pgsql/bin/pg_ctl"
PG_DATA_VEC="$HOME/pgdata_vec"
LOG_DIR="$PROJECT_DIR/.logs"
mkdir -p "$LOG_DIR"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

ok()   { echo -e "${GREEN}  ✓ $*${NC}"; }
warn() { echo -e "${YELLOW}  ⚠ $*${NC}"; }
err()  { echo -e "${RED}  ✗ $*${NC}"; }
step() { echo -e "\n${YELLOW}▶ $*${NC}"; }

kill_matches() {
  local label="$1"
  local pattern="$2"
  local pids

  pids=$(pgrep -f "$pattern" 2>/dev/null || true)
  if [ -n "$pids" ]; then
    warn "Stopping stale $label processes..."
    kill $pids 2>/dev/null || true
    sleep 1
    pids=$(pgrep -f "$pattern" 2>/dev/null || true)
    [ -n "$pids" ] && kill -9 $pids 2>/dev/null || true
  fi
}

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║       StackFast — Starting Services      ║"
echo "╚══════════════════════════════════════════╝"

# ─────────────────────────────────────────────
# 1. VECTORIZED PostgreSQL 15 on port 5433
# ─────────────────────────────────────────────
step "Starting Vectorized PostgreSQL 15 (port 5433)..."

if ! [ -f "$PG_CUSTOM" ]; then
  err "Custom PG15 binary not found at $PG_CUSTOM"
  err "Run 'bash postgres/scripts/setup_vectorized.sh' first."
  exit 1
fi

# Kill any existing process on 5433
PID_5433=$(lsof -ti tcp:5433 -sTCP:LISTEN 2>/dev/null)
if [ -n "$PID_5433" ]; then
  warn "Port 5433 in use by PID $PID_5433 — stopping it..."
  kill $PID_5433 2>/dev/null
  sleep 2
fi

"$PG_CUSTOM" -D "$PG_DATA_VEC" -l "$PG_DATA_VEC/logfile" \
  -o "-p 5433 -h 127.0.0.1 -k /tmp" start 2>&1 | tail -1
sleep 2

if "$PG_CUSTOM" -D "$PG_DATA_VEC" status &>/dev/null; then
  ok "Vectorized PG15 running on port 5433"
else
  err "Vectorized PG15 failed to start — check $PG_DATA_VEC/logfile"
  exit 1
fi

# ─────────────────────────────────────────────
# 2. BASELINE PostgreSQL 17 on port 5434
# ─────────────────────────────────────────────
step "Checking Baseline PostgreSQL (port 5434)..."

# Kill any ghost processes secretly holding port 5434
PID_5434=$(lsof -ti tcp:5434 -sTCP:LISTEN 2>/dev/null)
if [ -n "$PID_5434" ]; then
  warn "Port 5434 in use by PID $PID_5434 — stopping it..."
  kill -9 $PID_5434 2>/dev/null
  sleep 2
fi

if pg_isready -h 127.0.0.1 -p 5434 -q 2>/dev/null; then
  ok "Baseline PG already running on port 5434"
else
  warn "Baseline PG not running — starting it..."
  
  # Try the main system wrapper to start the baseline cluster safely
  PG17_VERSION=$(ls /etc/postgresql/ | head -1)
  if [ -n "$PG17_VERSION" ]; then
    sudo pg_ctlcluster $PG17_VERSION baseline start
    START_STATUS=$?
    if [ $START_STATUS -ne 0 ]; then
       err "pg_ctlcluster failed to start 17 baseline!"
       err "Run 'cat /var/log/postgresql/postgresql-$PG17_VERSION-baseline.log' to see why."
    fi
  else
    err "Could not find a PostgreSQL configuration in /etc/postgresql/"
  fi

  sleep 2
  if pg_isready -h 127.0.0.1 -p 5434 -q 2>/dev/null; then
    ok "Baseline PG successfully started on port 5434"
  else
    err "Baseline PG is STILL not responding. Database is offline!"
    exit 1
  fi
fi

# ─────────────────────────────────────────────
# 3. NODE.JS BACKEND on port 4000
# ─────────────────────────────────────────────
step "Starting Node.js backend (port 4000)..."

kill_matches "backend watcher" "$PROJECT_DIR/backend/node_modules/.bin/nodemon"

PID_4000=$(lsof -ti tcp:4000 -sTCP:LISTEN 2>/dev/null)
if [ -n "$PID_4000" ]; then
  warn "Port 4000 in use by PID $PID_4000 — stopping it..."
  kill $PID_4000 2>/dev/null
  sleep 1
fi

cd "$PROJECT_DIR/backend"

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
nvm install 20 # Vite 8 requires Node 20.19+; installs if missing, switches if present

setsid nohup npm start > "$LOG_DIR/backend.log" 2>&1 &
BACKEND_PID=$!
sleep 3

if kill -0 "$BACKEND_PID" 2>/dev/null; then
  ok "Backend running (PID $BACKEND_PID) — logs: .logs/backend.log"
else
  err "Backend failed to start — check .logs/backend.log"
  cat "$LOG_DIR/backend.log" | tail -10
  exit 1
fi

# ─────────────────────────────────────────────
# 4. VITE FRONTEND on port 5173
# ─────────────────────────────────────────────
step "Starting Vite frontend (port 5173)..."

kill_matches "frontend watcher" "$PROJECT_DIR/frontend/node_modules/.bin/vite"

PID_5173=$(lsof -ti tcp:5173 -sTCP:LISTEN 2>/dev/null)
if [ -n "$PID_5173" ]; then
  warn "Port 5173 in use by PID $PID_5173 — stopping it..."
  kill $PID_5173 2>/dev/null
  sleep 1
fi

cd "$PROJECT_DIR/frontend"
setsid nohup npm run dev > "$LOG_DIR/frontend.log" 2>&1 &
FRONTEND_PID=$!
sleep 3

if kill -0 "$FRONTEND_PID" 2>/dev/null; then
  ok "Frontend running (PID $FRONTEND_PID) — logs: .logs/frontend.log"
else
  err "Frontend failed to start — check .logs/frontend.log"
  exit 1
fi

# ─────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════╗"
echo "║         StackFast is LIVE! 🚀            ║"
echo "╠══════════════════════════════════════════╣"
echo "║  Frontend  → http://localhost:5173       ║"
echo "║  Backend   → http://localhost:4000       ║"
echo "║  Baseline  → localhost:5434 (PG17)       ║"
echo "║  Vectorized→ localhost:5433 (PG15 custom)║"
echo "╠══════════════════════════════════════════╣"
echo "║  Logs: .logs/backend.log                 ║"
echo "║        .logs/frontend.log                ║"
echo "║  Stop: bash stop.sh                      ║"
echo "╚══════════════════════════════════════════╝"
echo ""
