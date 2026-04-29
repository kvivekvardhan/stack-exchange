# Benchmark Results

DB: stackfast
Baseline port: 5434
Vectorized port: 5433
Host: 127.0.0.1
Date: 2026-04-29 17:39:03 UTC

| Query | Baseline (ms) | Vectorized (ms) | Speedup |
| --- | ---: | ---: | ---: |
| `SELECT COUNT(*) FROM se_posts WHERE ViewCount > 100;` | 45.060 | 40.344 | 1.12x |
| `SELECT PostTypeId, AVG(Score) FROM se_posts WHERE ViewCount > 100 GROUP BY PostTypeId;` | 65.477 | 62.134 | 1.05x |
| `SELECT PostTypeId, AVG(Score), COUNT(*) FROM se_posts WHERE ViewCount > 500 GROUP BY PostTypeId;` | 46.709 | 41.655 | 1.12x |
| `SELECT AVG(Score) FROM se_posts WHERE ViewCount > 1000;` | 26.753 | 19.092 | 1.40x |
