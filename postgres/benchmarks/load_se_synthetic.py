#!/usr/bin/env python3
import random
import psycopg2
from psycopg2.extras import execute_values
import os

BASE_DB_URL = os.environ.get("STACKFAST_BASE_URL", "postgresql://localhost:5434/stackfast")
VEC_DB_URL = os.environ.get("STACKFAST_VEC_URL", "postgresql://localhost:5433/stackfast")

print("Connecting to databases...")
conn_base = psycopg2.connect(BASE_DB_URL)
conn_vec = psycopg2.connect(VEC_DB_URL)

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS posts (
  id BIGINT PRIMARY KEY,
  post_type_id INTEGER NOT NULL,
  parent_id BIGINT,
  creation_date TIMESTAMPTZ,
  score INTEGER,
  view_count INTEGER,
  body TEXT,
  title TEXT,
  tags TEXT,
  answer_count INTEGER,
  comment_count INTEGER,
  favorite_count INTEGER
);

CREATE TABLE IF NOT EXISTS se_posts (
  id BIGINT PRIMARY KEY,
  post_type_id INTEGER,
  score INTEGER,
  view_count INTEGER,
  answer_count INTEGER,
  comment_count INTEGER,
  favorite_count INTEGER
);
"""


def setup_schema(conn):
  with conn.cursor() as cur:
    cur.execute(SCHEMA_SQL)
    cur.execute("TRUNCATE posts, se_posts")
  conn.commit()


def refresh_se_posts(conn):
  with conn.cursor() as cur:
    cur.execute("TRUNCATE se_posts")
    cur.execute(
      """
      INSERT INTO se_posts (id, post_type_id, score, view_count, answer_count, comment_count, favorite_count)
      SELECT id, post_type_id, score, view_count, answer_count, comment_count, favorite_count
      FROM posts
      """
    )
  conn.commit()


print("Setting up schemas...")
setup_schema(conn_base)
setup_schema(conn_vec)

print("Generating and loading synthetic Stack Exchange posts...")
base_cur = conn_base.cursor()
vec_cur = conn_vec.cursor()

records = []
count = 0
for i in range(1, 1000001):
  pid = i
  post_type_id = random.randint(1, 2)
  score = int(random.gauss(5, 10))
  view_count = int(abs(random.gauss(100, 500)))
  answer_count = random.randint(0, 5) if post_type_id == 1 else 0
  comment_count = random.randint(0, 10)
  favorite_count = random.randint(0, 20)
  title = f"Synthetic question {pid}" if post_type_id == 1 else None
  body = "Synthetic post body"
  tags = "<synthetic><benchmark>" if post_type_id == 1 else None

  records.append(
    (
      pid,
      post_type_id,
      None,
      None,
      score,
      view_count,
      body,
      title,
      tags,
      answer_count,
      comment_count,
      favorite_count
    )
  )
  count += 1

  if len(records) >= 10000:
    execute_values(
      base_cur,
      "INSERT INTO posts (id, post_type_id, parent_id, creation_date, score, view_count, body, title, tags, answer_count, comment_count, favorite_count) VALUES %s",
      records
    )
    execute_values(
      vec_cur,
      "INSERT INTO posts (id, post_type_id, parent_id, creation_date, score, view_count, body, title, tags, answer_count, comment_count, favorite_count) VALUES %s",
      records
    )
    records = []
    print(f"Loaded {count} rows...", end="\r")

if records:
  execute_values(
    base_cur,
    "INSERT INTO posts (id, post_type_id, parent_id, creation_date, score, view_count, body, title, tags, answer_count, comment_count, favorite_count) VALUES %s",
    records
  )
  execute_values(
    vec_cur,
    "INSERT INTO posts (id, post_type_id, parent_id, creation_date, score, view_count, body, title, tags, answer_count, comment_count, favorite_count) VALUES %s",
    records
  )

conn_base.commit()
conn_vec.commit()

refresh_se_posts(conn_base)
refresh_se_posts(conn_vec)

base_cur.close()
vec_cur.close()
conn_base.close()
conn_vec.close()

print(f"\nLoaded {count} posts into both databases.")
