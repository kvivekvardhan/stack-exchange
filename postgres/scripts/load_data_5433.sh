#!/bin/bash
# ============================================================
# load_data_5433.sh
# Dumps the stackfast schema+data from port 5434 (baseline)
# and loads it into port 5433 (vectorized).
# Run AFTER setup_vectorized.sh completes.
# ============================================================

set -e

PG_INSTALL="$HOME/pgsql"
DUMP_FILE="/tmp/stackfast_dump.sql"

echo "[1/3] Dumping stackfast from baseline (port 5434)..."
pg_dump -h localhost -p 5434 -U madhav -d stackfast -F plain -f "$DUMP_FILE"
echo "      Dump written to $DUMP_FILE"
echo ""

echo "[2/3] Loading into vectorized instance (port 5433)..."
"$PG_INSTALL/bin/psql" -p 5433 -U madhav -d stackfast -f "$DUMP_FILE" 2>&1 | tail -10
echo "      Load complete."
echo ""

echo "[3/3] Quick sanity check — row counts..."
"$PG_INSTALL/bin/psql" -p 5433 -U madhav -d stackfast -c \
  "SELECT relname, n_live_tup FROM pg_stat_user_tables ORDER BY n_live_tup DESC LIMIT 5;"

echo ""
echo "Done! stackfast data is now in the vectorized cluster on port 5433."
