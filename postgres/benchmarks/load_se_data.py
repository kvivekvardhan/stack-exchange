#!/usr/bin/env python3
import xml.etree.ElementTree as ET
import psycopg2
import sys
import os

URL = "https://archive.org/download/stackexchange/cs.stackexchange.com.7z"

print("Downloading dataset...")
os.system(f"wget -nc {URL} -O cs.7z")
print("Extracting dataset...")
os.system("7z x cs.7z -y")

print("Connecting to databases...")
conn_base = psycopg2.connect("postgresql://postgres@localhost:5434/stackfast")
conn_vec = psycopg2.connect("postgresql://postgres@localhost:5433/stackfast")

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

def load_posts():
    print("Parsing Posts.xml and loading data...")
    base_cur = conn_base.cursor()
    vec_cur = conn_vec.cursor()
    
    count = 0
    base_records = []
    
    for event, elem in ET.iterparse("Posts.xml", events=("end",)):
        if elem.tag == "row":
            try:
                pid = int(elem.get("Id", 0))
                ptid = int(elem.get("PostTypeId", 0))
                score = int(elem.get("Score", 0))
                views = int(elem.get("ViewCount", 0))
                answers = int(elem.get("AnswerCount", 0))
                comments = int(elem.get("CommentCount", 0))
                favs = int(elem.get("FavoriteCount", 0))
                
                base_records.append((pid, ptid, score, views, answers, comments, favs))
                count += 1
                
                if len(base_records) >= 2000:
                    args_str = ','.join(base_cur.mogrify("(%s,%s,%s,%s,%s,%s,%s)", x).decode("utf-8") for x in base_records)
                    query = "INSERT INTO se_posts (Id, PostTypeId, Score, ViewCount, AnswerCount, CommentCount, FavoriteCount) VALUES " + args_str
                    base_cur.execute(query)
                    vec_cur.execute(query)
                    base_records = []
            except Exception as e:
                pass
            elem.clear()
            
    if base_records:
        args_str = ','.join(base_cur.mogrify("(%s,%s,%s,%s,%s,%s,%s)", x).decode("utf-8") for x in base_records)
        query = "INSERT INTO se_posts (Id, PostTypeId, Score, ViewCount, AnswerCount, CommentCount, FavoriteCount) VALUES " + args_str
        base_cur.execute(query)
        vec_cur.execute(query)
        
    conn_base.commit()
    conn_vec.commit()
    print(f"Loaded {count} posts into both databases.")

load_posts()
