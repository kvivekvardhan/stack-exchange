#!/bin/bash
# ============================================================
# StackFast — Vectorized PostgreSQL 15 Setup Script
# Run this from the project root:
#   bash postgres/scripts/setup_vectorized.sh
# ============================================================

set -e  # Exit immediately on error

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
  echo "[2/8] PG source already exists at $PG_SRC_DIR — pulling latest..."
  git -C "$PG_SRC_DIR" pull --ff-only
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

cp "$CHANGES_DIR/nodeSeqscan.c" "$PG_SRC_DIR/src/backend/executor/nodeSeqscan.c"
echo "      Copied nodeSeqscan.c"

cp "$CHANGES_DIR/explain.c"     "$PG_SRC_DIR/src/backend/commands/explain.c"
echo "      Copied explain.c"

# Apply nodeAgg patch (best-effort — may already be applied)
cd "$PG_SRC_DIR"
if git apply --check "$CHANGES_DIR/nodeAgg.c.patch" 2>/dev/null; then
  git apply "$CHANGES_DIR/nodeAgg.c.patch"
  echo "      Applied nodeAgg.c.patch"
else
  echo "      nodeAgg.c.patch already applied or not applicable — skipping."
fi
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
  "$PG_INSTALL/bin/initdb" -D "$PG_DATA" -U madhav
  echo "      initdb complete."
fi

# Start the vectorized instance on port 5433
"$PG_INSTALL/bin/pg_ctl" -D "$PG_DATA" -l "$PG_DATA/logfile" -o "-p 5433" start
sleep 2

# Create the 'stackfast' database if it doesn't exist
"$PG_INSTALL/bin/psql" -p 5433 -U madhav -d postgres -tc \
  "SELECT 1 FROM pg_database WHERE datname='stackfast'" \
  | grep -q 1 || \
  "$PG_INSTALL/bin/psql" -p 5433 -U madhav -d postgres -c "CREATE DATABASE stackfast;"

echo "      Done."
echo ""

# -------------------------------------------------------
# STEP 8 — Verify
# -------------------------------------------------------
echo "[8/8] Verifying vectorized engine..."
EXPLAIN_OUT=$("$PG_INSTALL/bin/psql" -p 5433 -U madhav -d stackfast -c \
  "EXPLAIN SELECT * FROM posts LIMIT 1;" 2>&1 || \
  "$PG_INSTALL/bin/psql" -p 5433 -U madhav -d postgres -c \
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
