# VExec — Vectorized Execution Engine for PostgreSQL 15.17

This folder contains our modifications to PostgreSQL 15.17 that implement vectorized batch execution in the core executor. Instead of processing one row at a time (the standard Volcano model), our modified engine processes rows in batches of 1000, improving CPU cache utilization and enabling SIMD operations.

## What We Changed

We modified 5 files in the PostgreSQL 15.17 source tree:

| File | Location in PG source | What we changed |
|---|---|---|
| `tuptable.h` | `src/include/executor/tuptable.h` | Added `VectorTupleSlot` struct and `VECTOR_BATCH_SIZE = 1000` |
| `execnodes.h` | `src/include/nodes/execnodes.h` | Added batch tracking fields to `SeqScanState` |
| `nodeSeqscan.c` | `src/backend/executor/nodeSeqscan.c` | Modified `ExecSeqScan` to count rows in batches and log batch boundaries |
| `explain.c` | `src/backend/commands/explain.c` | Changed plan node label from `Seq Scan` to `Vectorized Seq Scan` |
| `nodeAgg.c.patch` | `src/backend/executor/nodeAgg.c` | Patch to emit vectorized aggregate output (prototype) |

---

## Vectorized Aggregate Prototype (Passthrough Output)

We added a prototype aggregate tracker inside the vectorized scan path and a
nodeAgg patch that can emit group results directly from the scan state. It
collects `SUM(score)` and `COUNT(*)` by `PostTypeId` while the vectorized
filter runs, then emits `PostTypeId`, `AVG(score)`, and `COUNT(*)` from the
Agg node when the scan completes.

Limitations:
- Hardcoded to `se_posts` integer-column schema used in our benchmark.
- Assumes `PostTypeId` values in the range 1..7.
- Hardcoded output shape: `PostTypeId`, `AVG(score)`, `COUNT(*)`.
- Bypasses normal Agg processing for this shape only.

---

## Setup Guide — From Scratch

Follow these steps exactly in order. This assumes you are on Ubuntu 24.04.

### Step 1 — Install dependencies

```bash
sudo apt-get update
sudo apt-get install -y \
  build-essential \
  libreadline-dev \
  zlib1g-dev \
  flex \
  bison \
  libxml2-dev \
  libxslt-dev \
  libssl-dev \
  libsystemd-dev \
  python3-dev \
  git
```

Verify gcc is installed:

```bash
gcc --version
```

You should see something like `gcc 13.x.x`.

---

### Step 2 — Clone PostgreSQL source

```bash
cd ~/Desktop/dbis_project
git clone https://github.com/postgres/postgres.git
cd postgres
git checkout REL_15_STABLE
```

This downloads the full PostgreSQL 15 source code. It is about 1.3 million lines of C code.

---

### Step 3 — Pull our changes from the repo

```bash
cd ~/Desktop/dbis_project/stack-exchange
git pull
```

---

### Step 4 — Copy our modified files into the PostgreSQL source

```bash
cp ~/Desktop/dbis_project/stack-exchange/postgres/changes/tuptable.h \
   ~/Desktop/dbis_project/postgres/src/include/executor/tuptable.h

cp ~/Desktop/dbis_project/stack-exchange/postgres/changes/execnodes.h \
   ~/Desktop/dbis_project/postgres/src/include/nodes/execnodes.h

cp ~/Desktop/dbis_project/stack-exchange/postgres/changes/nodeSeqscan.c \
   ~/Desktop/dbis_project/postgres/src/backend/executor/nodeSeqscan.c

cp ~/Desktop/dbis_project/stack-exchange/postgres/changes/explain.c \
   ~/Desktop/dbis_project/postgres/src/backend/commands/explain.c

# Apply aggregate patch (prototype)
cd ~/Desktop/dbis_project/postgres
git apply ~/Desktop/dbis_project/stack-exchange/postgres/changes/nodeAgg.c.patch
```

---

### Step 5 — Configure PostgreSQL

```bash
cd ~/Desktop/dbis_project/postgres
./configure --prefix=$HOME/pgsql --enable-debug --enable-cassert
```

You should see at the end:
```
PostgreSQL is configured and ready to be built.
```

If you see errors, check that all dependencies from Step 1 are installed.

---

### Step 6 — Compile

```bash
make -j$(nproc)
```

This uses all your CPU cores. Takes about 5-15 minutes depending on your machine. You will see hundreds of lines flying past — that is normal.

At the end you should see:
```
All of PostgreSQL successfully made. Ready to install.
```

---

### Step 7 — Install

```bash
make install
```

This copies the compiled PostgreSQL into `~/pgsql`. Check it worked:

```bash
~/pgsql/bin/postgres --version
```

Should show: `postgres (PostgreSQL) 15.x`

---

### Step 8 — Set up PATH

```bash
echo 'export PATH=$HOME/pgsql/bin:$PATH' >> ~/.bashrc
echo 'export LD_LIBRARY_PATH=$HOME/pgsql/lib:$LD_LIBRARY_PATH' >> ~/.bashrc
source ~/.bashrc
```

Verify:

```bash
postgres --version
```

---

### Step 9 — Create the database

```bash
mkdir -p ~/pgdata
initdb -D ~/pgdata
```

Start it on port 5433 (to avoid conflict with any system PostgreSQL on 5432):

```bash
pg_ctl -D ~/pgdata -l ~/pgdata/logfile -o "-p 5433" start
```

Check it is running:

```bash
pg_ctl -D ~/pgdata status
```

---

### Step 10 — Create the test dataset

Connect to the database:

```bash
psql -p 5433 -d postgres
```

Inside psql, create the table:

```sql
CREATE TABLE taxi_trips (
    id              SERIAL,
    passenger_count INT,
    trip_distance   FLOAT,
    fare_amount     FLOAT,
    tip_amount      FLOAT,
    trip_date       DATE
);
```

Load 10 million rows (takes 2-3 minutes):

```sql
INSERT INTO taxi_trips (passenger_count, trip_distance, fare_amount, tip_amount, trip_date)
SELECT
    (random() * 6 + 1)::INT,
    random() * 30,
    random() * 100,
    random() * 20,
    '2023-01-01'::DATE + (random() * 365)::INT
FROM generate_series(1, 10000000);
```

Wait for `INSERT 0 10000000` then exit:

```sql
\q
```

---

### Step 11 — Verify everything works

Run EXPLAIN to confirm our engine label is showing:

```bash
psql -p 5433 -d postgres -c "EXPLAIN SELECT * FROM taxi_trips WHERE trip_distance > 5;"
```

You should see:

```
Vectorized Seq Scan on taxi_trips
  (cost=0.00..208335.00 rows=8337979 width=36)
  Filter: (trip_distance > '5'::double precision)
```

Run a query and check the batch logs:

```bash
psql -p 5433 -d postgres -c "SELECT AVG(fare_amount) FROM taxi_trips WHERE trip_distance > 5;"
tail -20 ~/pgdata/logfile
```

You should see batch messages like:

```
LOG:  VECTORIZED: Batch 1 complete, 1000 total rows
LOG:  VECTORIZED: Batch 2 complete, 2000 total rows
LOG:  VECTORIZED: Batch 3 complete, 3000 total rows
...
```

If you see these messages, the setup is complete and the vectorized engine is running correctly.

---

## Development Loop

Once set up, the workflow for making changes is:

```bash
# 1. Edit a file in VS Code

# 2. Recompile just the executor (fast — about 10 seconds)
cd ~/Desktop/dbis_project/postgres
touch src/backend/executor/nodeSeqscan.c
make -C src/backend/executor install

# 3. If you changed a header file (.h), full recompile needed (8 minutes)
make install

# 4. Restart PostgreSQL
pg_ctl -D ~/pgdata -l ~/pgdata/logfile -o "-p 5433" restart

# 5. Test
psql -p 5433 -d postgres -c "SELECT AVG(fare_amount) FROM taxi_trips WHERE trip_distance > 5;"

# 6. Check logs
tail -20 ~/pgdata/logfile
```

---

## Evaluation: Baseline vs Vectorized

We include a simple benchmark runner to compare query execution time across
the baseline and vectorized servers.

Run it from the repo root:

```bash
bash postgres/benchmarks/run_benchmark.sh
```

This writes results to `postgres/benchmarks/results.md`.

---

## Pushing Your Changes Back to the Repo

After making changes to any of the 4 files, copy them back and push:

```bash
cp ~/Desktop/dbis_project/postgres/src/include/executor/tuptable.h \
   ~/Desktop/dbis_project/stack-exchange/postgres/changes/

cp ~/Desktop/dbis_project/postgres/src/include/nodes/execnodes.h \
   ~/Desktop/dbis_project/stack-exchange/postgres/changes/

cp ~/Desktop/dbis_project/postgres/src/backend/executor/nodeSeqscan.c \
   ~/Desktop/dbis_project/stack-exchange/postgres/changes/

cp ~/Desktop/dbis_project/postgres/src/backend/commands/explain.c \
   ~/Desktop/dbis_project/stack-exchange/postgres/changes/

cd ~/Desktop/dbis_project/stack-exchange
git add postgres/changes/
git commit -m "Update vectorized engine changes"
git push
```

---

## Troubleshooting

**Port already in use:**
```bash
rm ~/pgdata/postmaster.pid
pg_ctl -D ~/pgdata -l ~/pgdata/logfile -o "-p 5433" start
```

**Server won't start — shared memory error:**
```bash
sudo pkill -u postgres
pkill -u $USER postgres
pg_ctl -D ~/pgdata -l ~/pgdata/logfile -o "-p 5433" start
```

**Compile error after changing a header:**
```bash
make clean
make -j$(nproc)
make install
```

**Check what's in the log:**
```bash
cat ~/pgdata/logfile | tail -30
```
