#!/usr/bin/env python3
import psycopg2
import sys
import random

print("Connecting to databases...")
conn_base = psycopg2.connect("postgresql://localhost:5434/stackfast")
conn_vec = psycopg2.connect("postgresql://localhost:5433/stackfast")

def setup_schema(conn):
    with conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS se_posts (
                Id INTEGER PRIMARY KEY,
                PostTypeId INTEGER,
                Score INTEGER,
                ViewCount INTEGER,
                AnswerCount INTEGER,
                CommentCount INTEGER,
                FavoriteCount INTEGER
            );
            TRUNCATE se_posts;
        """)
    conn.commit()

print("Setting up schemas...")
setup_schema(conn_base)
setup_schema(conn_vec)

def load_synthetic_posts():
    print("Generating and loading synthetic Stack Overflow data...")
    base_cur = conn_base.cursor()
    vec_cur = conn_vec.cursor()
    
    count = 0
    records = []
    
    # Generate 1,000,000 rows
    for i in range(1, 1000001):
        pid = i
        ptid = random.randint(1, 2)
        score = int(random.gauss(5, 10))
        views = int(abs(random.gauss(100, 500)))
        answers = random.randint(0, 5) if ptid == 1 else 0
        comments = random.randint(0, 10)
        favs = random.randint(0, 20)
        
        records.append((pid, ptid, score, views, answers, comments, favs))
        count += 1
        
        if len(records) >= 10000:
            args_str = ','.join(base_cur.mogrify("(%s,%s,%s,%s,%s,%s,%s)", x).decode("utf-8") for x in records)
            query = "INSERT INTO se_posts (Id, PostTypeId, Score, ViewCount, AnswerCount, CommentCount, FavoriteCount) VALUES " + args_str
            base_cur.execute(query)
            vec_cur.execute(query)
            records = []
            print(f"Loaded {count} rows...", end="\r")
            
    if records:
        args_str = ','.join(base_cur.mogrify("(%s,%s,%s,%s,%s,%s,%s)", x).decode("utf-8") for x in records)
        query = "INSERT INTO se_posts (Id, PostTypeId, Score, ViewCount, AnswerCount, CommentCount, FavoriteCount) VALUES " + args_str
        base_cur.execute(query)
        vec_cur.execute(query)
        
    conn_base.commit()
    conn_vec.commit()
    print(f"\nLoaded {count} posts into both databases.")

load_synthetic_posts()
