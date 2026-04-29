# Benchmarking

This folder contains a lightweight benchmark runner that compares baseline and
vectorized PostgreSQL engines using the taxi_trips dataset described in
[postgres/README.md](../README.md).

## Quick start

```bash
bash postgres/benchmarks/run_benchmark.sh
```

## Configuration

The script reads the following environment variables:

- DB_NAME (default: postgres)
- DB_HOST (default: 127.0.0.1)
- BASELINE_PORT (default: 5432)
- VECTORIZED_PORT (default: 5433)
- OUT_DIR (default: postgres/benchmarks)
- OUT_FILE (default: postgres/benchmarks/results.md)

Example:

```bash
DB_NAME=postgres BASELINE_PORT=5432 VECTORIZED_PORT=5434 \
  bash postgres/benchmarks/run_benchmark.sh
```

## Output

The script writes a markdown table to results.md with baseline timing, vectorized
 timing, and speedup for each query.
