#!/usr/bin/env bash
set -euo pipefail

DB_NAME=${DB_NAME:-postgres}
DB_HOST=${DB_HOST:-127.0.0.1}
BASELINE_PORT=${BASELINE_PORT:-5432}
VECTORIZED_PORT=${VECTORIZED_PORT:-5433}
OUT_DIR=${OUT_DIR:-/home/vivekvardhank/ACADS/DBIS/stack-exchange/postgres/benchmarks}
OUT_FILE=${OUT_FILE:-$OUT_DIR/results.md}

queries=(
  "SELECT AVG(fare_amount) FROM taxi_trips WHERE trip_distance > 5;"
  "SELECT passenger_count, AVG(fare_amount), COUNT(*) FROM taxi_trips WHERE trip_distance > 5 GROUP BY passenger_count;"
  "SELECT passenger_count, AVG(fare_amount) FROM taxi_trips WHERE trip_distance BETWEEN 2 AND 8 GROUP BY passenger_count;"
  "SELECT passenger_count, COUNT(*) FROM taxi_trips GROUP BY passenger_count;"
)

function run_query() {
  local port=$1
  local sql=$2
  psql -X -q -t -A -h "$DB_HOST" -p "$port" -d "$DB_NAME" \
    -c "EXPLAIN (ANALYZE, TIMING ON, FORMAT TEXT) $sql" \
    | awk -F': ' '/Execution Time/ { print $2 }'
}

mkdir -p "$OUT_DIR"

{
  echo "# Benchmark Results"
  echo
  echo "DB: $DB_NAME"
  echo "Baseline port: $BASELINE_PORT"
  echo "Vectorized port: $VECTORIZED_PORT"
  echo "Host: $DB_HOST"
  echo "Date: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
  echo
  echo "| Query | Baseline (ms) | Vectorized (ms) | Speedup |"
  echo "| --- | ---: | ---: | ---: |"

  for sql in "${queries[@]}"; do
    base_time=$(run_query "$BASELINE_PORT" "$sql" | tr -d ' ms')
    vec_time=$(run_query "$VECTORIZED_PORT" "$sql" | tr -d ' ms')

    if [[ -z "$base_time" || -z "$vec_time" ]]; then
      speedup="-"
    else
      speedup=$(python3 - <<PY
base=${base_time}
vec=${vec_time}
print(f"{base/vec:.2f}x" if vec > 0 else "-")
PY
)
    fi

    echo "| \\$ ${sql} \\$$ | $base_time | $vec_time | $speedup |"
  done
} > "$OUT_FILE"

echo "Wrote $OUT_FILE"
