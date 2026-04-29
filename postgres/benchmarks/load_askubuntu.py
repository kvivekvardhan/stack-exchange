#!/usr/bin/env python3
"""
Load a Stack Exchange data dump (e.g. askubuntu) into the StackFast
baseline (5434) and vectorized (5433) databases.

Targets the schema in ../sql/init_schema.sql. SQL identifiers are
case-folded to lowercase, so PostTypeId/Score/ViewCount are stored as
posttypeid/score/viewcount in pg_attribute -- which is exactly what the
vectorized engine looks up by name.

Prereq (run once on each cluster):
  psql -h 127.0.0.1 -p 5434 -d stackfast -f ../sql/init_schema.sql
  psql -h 127.0.0.1 -p 5433 -d stackfast -f ../sql/init_schema.sql

Run:
  STACKFAST_XML_DIR=~/Downloads/askubuntu python3 load_askubuntu.py
"""
import os
import sys
import xml.etree.ElementTree as ET

import psycopg2
from psycopg2.extras import execute_values

XML_DIR = os.environ.get(
    "STACKFAST_XML_DIR",
    os.path.expanduser("~/Downloads/askubuntu"),
)
BASE_DB_URL = os.environ.get(
    "STACKFAST_BASE_URL",
    "postgresql://postgres@localhost:5434/stackfast",
)
VEC_DB_URL = os.environ.get(
    "STACKFAST_VEC_URL",
    "postgresql://postgres@localhost:5433/stackfast",
)
BATCH = int(os.environ.get("STACKFAST_BATCH", "2000"))

print(f"XML dir   : {XML_DIR}")
print(f"Baseline  : {BASE_DB_URL}")
print(f"Vectorized: {VEC_DB_URL}")

if not os.path.isdir(XML_DIR):
    print(f"ERROR: {XML_DIR} not found", file=sys.stderr)
    sys.exit(1)

conn_base = psycopg2.connect(BASE_DB_URL)
conn_vec = psycopg2.connect(VEC_DB_URL)


def to_int(v):
    if v is None or v == "":
        return None
    try:
        return int(v)
    except ValueError:
        return None


def to_bool(v):
    if v is None or v == "":
        return None
    return v.strip().lower() == "true"


def load_xml(file_name, table, columns, build_row):
    path = os.path.join(XML_DIR, file_name)
    if not os.path.exists(path):
        print(f"[skip] {file_name} not found")
        return

    print(f"[load] {file_name} -> {table}")
    base_cur = conn_base.cursor()
    vec_cur = conn_vec.cursor()
    base_cur.execute(f"TRUNCATE {table} RESTART IDENTITY CASCADE")
    vec_cur.execute(f"TRUNCATE {table} RESTART IDENTITY CASCADE")

    sql = f"INSERT INTO {table} ({','.join(columns)}) VALUES %s"
    records = []
    n = 0
    for _evt, elem in ET.iterparse(path, events=("end",)):
        if elem.tag != "row":
            elem.clear()
            continue
        row = build_row(elem)
        if row is not None:
            records.append(row)
            n += 1
        if len(records) >= BATCH:
            execute_values(base_cur, sql, records)
            execute_values(vec_cur, sql, records)
            records.clear()
            if n % 100000 == 0:
                print(f"   ... {n:>10,}", end="\r")
        elem.clear()

    if records:
        execute_values(base_cur, sql, records)
        execute_values(vec_cur, sql, records)

    conn_base.commit()
    conn_vec.commit()
    base_cur.close()
    vec_cur.close()
    print(f"[done] {n:,} rows -> {table}")


# Row builders. Tuple order MUST match the columns list passed to load_xml.

def b_user(e):
    return (
        to_int(e.get("Id")),
        to_int(e.get("Reputation")) or 0,
        e.get("CreationDate"),
        e.get("DisplayName") or "anon",
        e.get("LastAccessDate") or e.get("CreationDate"),
        e.get("WebsiteUrl"),
        e.get("Location"),
        e.get("AboutMe"),
        to_int(e.get("Views")),
        to_int(e.get("UpVotes")),
        to_int(e.get("DownVotes")),
        to_int(e.get("AccountId")),
        e.get("ProfileImageUrl"),
    )


def b_post(e):
    return (
        to_int(e.get("Id")),
        to_int(e.get("PostTypeId")),
        to_int(e.get("AcceptedAnswerId")),
        to_int(e.get("ParentId")),
        e.get("CreationDate"),
        to_int(e.get("Score")) or 0,
        to_int(e.get("ViewCount")),
        e.get("Body") or "",
        to_int(e.get("OwnerUserId")),
        e.get("OwnerDisplayName"),
        to_int(e.get("LastEditorUserId")),
        e.get("LastEditorDisplayName"),
        e.get("LastEditDate"),
        e.get("LastActivityDate"),
        e.get("Title"),
        e.get("Tags"),
        to_int(e.get("AnswerCount")),
        to_int(e.get("CommentCount")),
        to_int(e.get("FavoriteCount")),
        e.get("ClosedDate"),
        e.get("CommunityOwnedDate"),
        e.get("ContentLicense") or "CC BY-SA 4.0",
    )


def b_comment(e):
    return (
        to_int(e.get("Id")),
        to_int(e.get("PostId")),
        to_int(e.get("Score")) or 0,
        e.get("Text") or "",
        e.get("CreationDate"),
        to_int(e.get("UserId")),
        e.get("UserDisplayName"),
        e.get("ContentLicense") or "CC BY-SA 4.0",
    )


def b_vote(e):
    return (
        to_int(e.get("Id")),
        to_int(e.get("PostId")),
        to_int(e.get("VoteTypeId")),
        to_int(e.get("UserId")),
        e.get("CreationDate"),
        to_int(e.get("BountyAmount")),
    )


def b_badge(e):
    return (
        to_int(e.get("Id")),
        to_int(e.get("UserId")),
        e.get("Name") or "",
        e.get("Date"),
        to_int(e.get("Class")) or 3,
        to_bool(e.get("TagBased")),
    )


def b_tag(e):
    return (
        to_int(e.get("Id")),
        e.get("TagName") or "",
        to_int(e.get("Count")) or 0,
        to_int(e.get("ExcerptPostId")),
        to_int(e.get("WikiPostId")),
    )


def b_post_link(e):
    return (
        to_int(e.get("Id")),
        e.get("CreationDate"),
        to_int(e.get("PostId")),
        to_int(e.get("RelatedPostId")),
        to_int(e.get("LinkTypeId")),
    )


def b_post_history(e):
    return (
        to_int(e.get("Id")),
        to_int(e.get("PostHistoryTypeId")),
        to_int(e.get("PostId")),
        e.get("RevisionGUID"),
        e.get("CreationDate"),
        to_int(e.get("UserId")),
        e.get("UserDisplayName"),
        e.get("Comment"),
        e.get("Text"),
        e.get("ContentLicense"),
    )


# Order: parents before children. The init schema doesn't declare FK
# constraints, so order is only a logical preference, not a hard
# requirement.

load_xml("Users.xml", "users",
         ["id", "reputation", "creationdate", "displayname", "lastaccessdate",
          "websiteurl", "location", "aboutme", "views", "upvotes", "downvotes",
          "accountid", "profileimageurl"],
         b_user)

load_xml("Posts.xml", "posts",
         ["id", "posttypeid", "acceptedanswerid", "parentid", "creationdate",
          "score", "viewcount", "body", "owneruserid", "ownerdisplayname",
          "lasteditoruserid", "lasteditordisplayname", "lasteditdate",
          "lastactivitydate", "title", "tags", "answercount", "commentcount",
          "favoritecount", "closeddate", "communityowneddate", "contentlicense"],
         b_post)

load_xml("Comments.xml", "comments",
         ["id", "postid", "score", "text", "creationdate", "userid",
          "userdisplayname", "contentlicense"],
         b_comment)

load_xml("Votes.xml", "votes",
         ["id", "postid", "votetypeid", "userid", "creationdate", "bountyamount"],
         b_vote)

load_xml("Badges.xml", "badges",
         ["id", "userid", "name", "date", "class", "tagbased"],
         b_badge)

load_xml("Tags.xml", "tags",
         ["id", "tagname", "count", "excerptpostid", "wikipostid"],
         b_tag)

load_xml("PostLinks.xml", "postlinks",
         ["id", "creationdate", "postid", "relatedpostid", "linktypeid"],
         b_post_link)

load_xml("PostHistory.xml", "posthistory",
         ["id", "posthistorytypeid", "postid", "revisionguid", "creationdate",
          "userid", "userdisplayname", "comment", "text", "contentlicense"],
         b_post_history)

conn_base.close()
conn_vec.close()
print("All done.")
