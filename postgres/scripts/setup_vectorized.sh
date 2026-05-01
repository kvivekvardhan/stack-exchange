#!/bin/bash
# ============================================================
# StackFast — Vectorized PostgreSQL 15 Setup Script
# Run this from the project root:
#   bash postgres/scripts/setup_vectorized.sh
# ============================================================

set -euo pipefail  # Exit immediately on errors, including failed pipelines

PROJECT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
CHANGES_DIR="$PROJECT_DIR/postgres/changes"
PG_SRC_DIR="$HOME/pgbuild/postgres"
PG_INSTALL="$HOME/pgsql"
PG_DATA="$HOME/pgdata_vec"

echo "============================================="
echo " StackFast Vectorized PostgreSQL 15 Builder"
echo "============================================="
echo "Project dir : $PROJECT_DIR"
echo "PG source   : $PG_SRC_DIR"
echo "PG install  : $PG_INSTALL"
echo "PG data dir : $PG_DATA"
echo ""

# -------------------------------------------------------
# STEP 1 — Dependencies
# -------------------------------------------------------
echo "[1/8] Installing build dependencies..."
sudo apt-get install -y \
  build-essential \
  libreadline-dev \
  zlib1g-dev \
  flex \
  bison \
  libxml2-dev \
  libxslt-dev \
  libssl-dev \
  python3-dev \
  git
echo "      Done."
echo ""

# -------------------------------------------------------
# STEP 2 — Clone PostgreSQL 15 source
# -------------------------------------------------------
if [ -d "$PG_SRC_DIR" ]; then
  echo "[2/8] Using existing PG source at $PG_SRC_DIR"
else
  echo "[2/8] Cloning PostgreSQL source (this may take a few minutes)..."
  mkdir -p "$(dirname "$PG_SRC_DIR")"
  git clone --depth=1 --branch REL_15_STABLE https://github.com/postgres/postgres.git "$PG_SRC_DIR"
fi
echo "      Done."
echo ""

# -------------------------------------------------------
# STEP 3 — Copy our modified files into the PG source
# -------------------------------------------------------
echo "[3/8] Copying vectorized engine patches..."

cp "$CHANGES_DIR/tuptable.h"    "$PG_SRC_DIR/src/include/executor/tuptable.h"
echo "      Copied tuptable.h"

cp "$CHANGES_DIR/execnodes.h"   "$PG_SRC_DIR/src/include/nodes/execnodes.h"
echo "      Copied execnodes.h"

cp "$CHANGES_DIR/execScan.c"    "$PG_SRC_DIR/src/backend/executor/execScan.c"
echo "      Copied execScan.c"

cp "$CHANGES_DIR/nodeSeqscan.c" "$PG_SRC_DIR/src/backend/executor/nodeSeqscan.c"
echo "      Copied nodeSeqscan.c"

cp "$CHANGES_DIR/nodeAgg.c"     "$PG_SRC_DIR/src/backend/executor/nodeAgg.c"
echo "      Copied nodeAgg.c"

cp "$CHANGES_DIR/explain.c"     "$PG_SRC_DIR/src/backend/commands/explain.c"
echo "      Copied explain.c"

cp "$CHANGES_DIR/vecScan.c"     "$PG_SRC_DIR/src/backend/executor/vecScan.c"
echo "      Copied vecScan.c"

cp "$CHANGES_DIR/vecPlanner.c"  "$PG_SRC_DIR/src/backend/executor/vecPlanner.c"
echo "      Copied vecPlanner.c"

EXECUTOR_MAKEFILE="$PG_SRC_DIR/src/backend/executor/Makefile"
wire_executor_obj() {
  local obj="$1"

  if ! grep -q "$obj" "$EXECUTOR_MAKEFILE"; then
    sed -i "/nodeCustom\\.o/a\\	$obj \\\\" "$EXECUTOR_MAKEFILE"
    if grep -q "$obj" "$EXECUTOR_MAKEFILE"; then
      echo "      Wired $obj into executor Makefile"
    else
      echo "      ERROR: could not find nodeCustom.o anchor in executor Makefile"
      exit 1
    fi
  else
    echo "      Makefile has $obj"
  fi
}

wire_executor_obj "vecScan.o"
wire_executor_obj "vecPlanner.o"

POSTGRES_C="$PG_SRC_DIR/src/backend/tcop/postgres.c"

if ! grep -q "extern void VecInstallPlannerHook(void);" "$POSTGRES_C"; then
  sed -i '/int[[:space:]]*log_statement = LOGSTMT_NONE;/a\\nextern void VecInstallPlannerHook(void);' "$POSTGRES_C"
  echo "      Added VecInstallPlannerHook declaration to postgres.c"
else
  echo "      postgres.c has VecInstallPlannerHook declaration"
fi

if ! grep -q "VecInstallPlannerHook();" "$POSTGRES_C"; then
  sed -i '/BaseInit();/a\\n\t/* VECTORIZED: install experimental CustomScan planner hook for this backend. */\n\tVecInstallPlannerHook();' "$POSTGRES_C"
  echo "      Added VecInstallPlannerHook call to postgres.c"
else
  echo "      postgres.c has VecInstallPlannerHook call"
fi

rm -f "$PG_SRC_DIR/src/backend/executor/vecScan.o" \
      "$PG_SRC_DIR/src/backend/executor/vecPlanner.o" \
      "$PG_SRC_DIR/src/backend/executor/execScan.o" \
      "$PG_SRC_DIR/src/backend/executor/nodeAgg.o"
echo "      Cleared vector executor objects for rebuild"

cd "$PG_SRC_DIR"
echo ""

# -------------------------------------------------------
# STEP 4 — Configure
# -------------------------------------------------------
echo "[4/8] Configuring PostgreSQL build..."
cd "$PG_SRC_DIR"
./configure --prefix="$PG_INSTALL" --enable-debug 2>&1 | tail -5
echo "      Done."
echo ""

# -------------------------------------------------------
# STEP 5 — Compile (uses all CPU cores)
# -------------------------------------------------------
echo "[5/8] Compiling PostgreSQL (this takes 5-15 minutes)..."
cd "$PG_SRC_DIR"
make -j"$(nproc)" 2>&1 | tail -5
echo "      Done."
echo ""

# -------------------------------------------------------
# STEP 6 — Install
# -------------------------------------------------------
echo "[6/8] Installing into $PG_INSTALL..."
cd "$PG_SRC_DIR"
make install 2>&1 | tail -3
echo "      Done."
echo ""

# -------------------------------------------------------
# STEP 7 — Set up the vectorized data cluster
# -------------------------------------------------------
echo "[7/8] Setting up vectorized data cluster at $PG_DATA..."

if [ -d "$PG_DATA" ]; then
  echo "      Data dir already exists — stopping any running instance..."
  "$PG_INSTALL/bin/pg_ctl" -D "$PG_DATA" stop 2>/dev/null || true
  sleep 2
else
  "$PG_INSTALL/bin/initdb" -D "$PG_DATA" -U vivekvardhank
  echo "      initdb complete."
fi

# Start the vectorized instance on port 5433.  The planner hook checks this
# environment variable inside the server backend, so it must be set when the
# postmaster starts, not only when psql starts.
PG_VECTORIZED=1 "$PG_INSTALL/bin/pg_ctl" -D "$PG_DATA" -l "$PG_DATA/logfile" -o "-p 5433" start
sleep 2

# Create the 'stackfast' database if it doesn't exist
"$PG_INSTALL/bin/psql" -p 5433 -U vivekvardhank -d postgres -tc \
  "SELECT 1 FROM pg_database WHERE datname='stackfast'" \
  | grep -q 1 || \
  "$PG_INSTALL/bin/psql" -p 5433 -U vivekvardhank -d postgres -c "CREATE DATABASE stackfast;"

echo "      Done."
echo ""

# -------------------------------------------------------
# STEP 8 — Verify
# -------------------------------------------------------
echo "[8/8] Verifying vectorized engine..."
EXPLAIN_OUT=$("$PG_INSTALL/bin/psql" -p 5433 -U vivekvardhank -d stackfast -c \
  "EXPLAIN SELECT * FROM posts LIMIT 1;" 2>&1 || \
  "$PG_INSTALL/bin/psql" -p 5433 -U vivekvardhank -d postgres -c \
  "EXPLAIN SELECT 1;")
echo "$EXPLAIN_OUT"

echo ""
echo "============================================="
echo " DONE! Vectorized PostgreSQL 15 is running"
echo " on port 5433."
echo ""
echo " Next steps:"
echo "  1. Load the stackfast schema into it:"
echo "     bash postgres/scripts/load_data_5433.sh"
echo "  2. Restart your Node backend (nodemon will auto-restart)."
echo "  3. Switch the UI toggle to 'Vectorized'."
echo "============================================="
