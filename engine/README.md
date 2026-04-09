# PostgreSQL Engine Modifications

These are the 4 files we modified in PostgreSQL 15.17 source to implement vectorized batch execution.

## Files
- tuptable.h — VectorTupleSlot struct and VECTOR_BATCH_SIZE constant
- execnodes.h — batch tracking fields in SeqScanState
- nodeSeqscan.c — modified ExecSeqScan with batch logging
- explain.c — EXPLAIN shows "Vectorized Seq Scan"

## Setup
1. Clone PostgreSQL 15: git clone https://github.com/postgres/postgres.git
2. git checkout REL_15_STABLE
3. Replace the above files with the ones in this folder
4. ./configure --prefix=$HOME/pgsql --enable-debug --enable-cassert
5. make install
