# Benchmark Results

DB: stackfast
Baseline port: 5434
Vectorized port: 5433
Host: 127.0.0.1
Date: 2026-04-29 15:45:59 UTC

| Query | Baseline (ms) | Vectorized (ms) | Speedup |
| --- | ---: | ---: | ---: |
| \$ SELECT AVG(fare_amount) FROM taxi_trips WHERE trip_distance > 5; \92144 | 53.965 | 48.751 | 1.11x |
| \$ SELECT passenger_count, AVG(fare_amount), COUNT(*) FROM taxi_trips WHERE trip_distance > 5 GROUP BY passenger_count; \92144 | 79.011 | 124.775 | 0.63x |
| \$ SELECT passenger_count, AVG(fare_amount) FROM taxi_trips WHERE trip_distance BETWEEN 2 AND 8 GROUP BY passenger_count; \92144 | 39.212 | 57.054 | 0.69x |
| \$ SELECT passenger_count, COUNT(*) FROM taxi_trips GROUP BY passenger_count; \92144 | 59.990 | 62.573 | 0.96x |
