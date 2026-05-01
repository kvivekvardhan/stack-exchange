\set ON_ERROR_STOP on
SET max_parallel_workers_per_gather = 0;

\echo 'Vectorized scan checks: plain LIMIT projection'
WITH sample AS (
    SELECT id, posttypeid, score
    FROM posts
    LIMIT 10
)
SELECT COUNT(*) AS rows_seen,
       COUNT(*) FILTER (WHERE id <> 0) AS nonzero_ids,
       COUNT(*) FILTER (WHERE posttypeid <> 0) AS nonzero_posttypes
FROM sample;

DO $$
DECLARE
    bad_rows integer;
BEGIN
    SELECT COUNT(*)
    INTO bad_rows
    FROM (
        SELECT id, posttypeid, score
        FROM posts
        LIMIT 10
    ) s
    WHERE id = 0 OR posttypeid = 0;

    IF bad_rows > 0 THEN
        RAISE EXCEPTION 'plain LIMIT projection returned % zero-valued id/posttypeid rows', bad_rows;
    END IF;
END $$;

\echo 'Vectorized scan checks: filtered COUNT'
DO $$
DECLARE
    question_count bigint;
BEGIN
    SELECT COUNT(*)
    INTO question_count
    FROM posts
    WHERE posttypeid = 1;

    IF question_count <> 414451 THEN
        RAISE EXCEPTION 'expected 414451 question rows, got %', question_count;
    END IF;
END $$;

\echo 'Vectorized scan checks: score predicate'
DO $$
DECLARE
    high_score_count bigint;
BEGIN
    SELECT COUNT(*)
    INTO high_score_count
    FROM posts
    WHERE score > 100;

    IF high_score_count <= 0 THEN
        RAISE EXCEPTION 'score > 100 returned no rows';
    END IF;
END $$;

\echo 'Vectorized scan checks: multiple numeric filters'
DO $$
DECLARE
    filtered_count bigint;
BEGIN
    SELECT COUNT(*)
    INTO filtered_count
    FROM posts
    WHERE posttypeid = 1
      AND score > 25
      AND viewcount > 1000;

    IF filtered_count <= 0 THEN
        RAISE EXCEPTION 'combined posttypeid/score/viewcount filter returned no rows';
    END IF;
END $$;

\echo 'Vectorized scan checks: selected columns from filtered rows'
WITH sample AS (
    SELECT id, posttypeid, score, viewcount
    FROM posts
    WHERE posttypeid = 1
      AND score > 25
      AND viewcount > 1000
    LIMIT 5
)
SELECT id, posttypeid, score, viewcount
FROM sample;

DO $$
DECLARE
    bad_rows integer;
BEGIN
    SELECT COUNT(*)
    INTO bad_rows
    FROM (
        SELECT id, posttypeid, score, viewcount
        FROM posts
        WHERE posttypeid = 1
          AND score > 25
          AND viewcount > 1000
        LIMIT 5
    ) s
    WHERE id = 0
       OR posttypeid <> 1
       OR score <= 25
       OR viewcount <= 1000;

    IF bad_rows > 0 THEN
        RAISE EXCEPTION 'selected filtered columns included % invalid rows', bad_rows;
    END IF;
END $$;

\echo 'Vectorized scan checks: text column predicate/projection'
DO $$
DECLARE
    text_count bigint;
BEGIN
    SELECT COUNT(*)
    INTO text_count
    FROM posts
    WHERE title IS NOT NULL
      AND length(title) > 0
      AND body IS NOT NULL
      AND length(body) > 0;

    IF text_count <= 0 THEN
        RAISE EXCEPTION 'text column predicate returned no rows';
    END IF;
END $$;

WITH sample AS (
    SELECT id, left(title, 60) AS title_prefix
    FROM posts
    WHERE title IS NOT NULL
      AND length(title) > 0
    LIMIT 5
)
SELECT id, title_prefix
FROM sample;

\echo 'Vectorized scan checks: NULL predicate'
DO $$
DECLARE
    null_count bigint;
BEGIN
    SELECT COUNT(*)
    INTO null_count
    FROM posts
    WHERE acceptedanswerid IS NULL;

    IF null_count <= 0 THEN
        RAISE EXCEPTION 'acceptedanswerid IS NULL returned no rows';
    END IF;
END $$;

\echo 'Vectorized scan checks: grouped AVG/COUNT aggregate'
SET vectorized_scan = off;
DROP TABLE IF EXISTS expected_vecagg;
CREATE TEMP TABLE expected_vecagg AS
SELECT posttypeid, AVG(score) AS avg_score, COUNT(*) AS row_count
FROM posts
GROUP BY posttypeid;

SET vectorized_scan = on;
DROP TABLE IF EXISTS actual_vecagg;
CREATE TEMP TABLE actual_vecagg AS
SELECT posttypeid, AVG(score) AS avg_score, COUNT(*) AS row_count
FROM posts
GROUP BY posttypeid;

DO $$
DECLARE
    mismatch_count integer;
BEGIN
    SELECT COUNT(*)
    INTO mismatch_count
    FROM (
        (SELECT * FROM expected_vecagg EXCEPT SELECT * FROM actual_vecagg)
        UNION ALL
        (SELECT * FROM actual_vecagg EXCEPT SELECT * FROM expected_vecagg)
    ) diff;

    IF mismatch_count > 0 THEN
        RAISE EXCEPTION 'vectorized grouped AVG/COUNT aggregate had % mismatched rows', mismatch_count;
    END IF;
END $$;

\echo 'Vectorized scan checks complete.'
