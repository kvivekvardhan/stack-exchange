# Benchmark Results

DB: postgres
Baseline port: 5432
Vectorized port: 5433
Host: 127.0.0.1
Date: 2026-04-29 00:00:00 UTC

| Query | Baseline (ms) | Vectorized (ms) | Speedup |
| --- | ---: | ---: | ---: |
| $ SELECT AVG(fare_amount) FROM taxi_trips WHERE trip_distance > 5; $ | - | - | - |
| $ SELECT passenger_count, AVG(fare_amount), COUNT(*) FROM taxi_trips WHERE trip_distance > 5 GROUP BY passenger_count; $ | - | - | - |
| $ SELECT passenger_count, AVG(fare_amount) FROM taxi_trips WHERE trip_distance BETWEEN 2 AND 8 GROUP BY passenger_count; $ | - | - | - |
| $ SELECT passenger_count, COUNT(*) FROM taxi_trips GROUP BY passenger_count; $ | - | - | - |
