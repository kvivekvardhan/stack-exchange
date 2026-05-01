#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
PG_INSTALL="${PG_INSTALL:-$HOME/pgsql}"
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-5433}"
DB_USER="${DB_USER:-vivekvardhank}"
DB_NAME="${DB_NAME:-stackfast}"
CHECK_SQL="$PROJECT_DIR/postgres/sql/vectorized_scan_checks.sql"

PSQL=("$PG_INSTALL/bin/psql" -X -v ON_ERROR_STOP=1 -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME")

echo "[1/3] Checking vectorized_scan toggle..."
DEFAULT_SETTING="$("${PSQL[@]}" -t -A -c "SHOW vectorized_scan;")"
echo "vectorized_scan default: $DEFAULT_SETTING"

OFF_PLAN="$("${PSQL[@]}" -t -A -c "SET vectorized_scan = off; EXPLAIN SELECT id, posttypeid, score FROM posts WHERE posttypeid = 1 LIMIT 5;")"
echo "$OFF_PLAN"

if grep -q "Vectorized Seq Scan" <<<"$OFF_PLAN"; then
  echo "ERROR: vectorized_scan=off still produced a vectorized scan plan." >&2
  exit 1
fi

echo ""
echo "[2/3] Checking planner uses Vectorized Seq Scan..."
PLAN="$("${PSQL[@]}" -t -A -c "EXPLAIN SELECT id, posttypeid, score FROM posts WHERE posttypeid = 1 LIMIT 5;")"
echo "$PLAN"

if ! grep -q "Custom Scan (Vectorized Seq Scan)" <<<"$PLAN"; then
  echo "ERROR: expected Custom Scan (Vectorized Seq Scan) in plan." >&2
  exit 1
fi

AGG_PLAN="$("${PSQL[@]}" -t -A -c "SET vectorized_scan = on; EXPLAIN SELECT posttypeid, AVG(score), COUNT(*) FROM posts GROUP BY posttypeid;")"
echo "$AGG_PLAN"

if ! grep -q "Custom Scan (Vectorized Seq Scan)" <<<"$AGG_PLAN"; then
  echo "ERROR: expected vectorized aggregate input to use Custom Scan (Vectorized Seq Scan)." >&2
  exit 1
fi

echo ""
echo "[3/3] Running SQL correctness checks..."
"${PSQL[@]}" -f "$CHECK_SQL"

echo ""
echo "Vectorized scan checks passed."
