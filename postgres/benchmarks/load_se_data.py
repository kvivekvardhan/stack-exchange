#!/usr/bin/env python3
import xml.etree.ElementTree as ET
from psycopg2.extras import execute_values
import psycopg2
import os

URL = "https://archive.org/download/stackexchange/cs.stackexchange.com.7z"
ARCHIVE_NAME = "cs.7z"
EXTRACT_DIR = "."

BASE_DB_URL = os.environ.get("STACKFAST_BASE_URL", "postgresql://postgres@localhost:5434/stackfast")
VEC_DB_URL = os.environ.get("STACKFAST_VEC_URL", "postgresql://postgres@localhost:5433/stackfast")

print("Downloading dataset...")
os.system(f"wget -nc {URL} -O {ARCHIVE_NAME}")
print("Extracting dataset...")
os.system(f"7z x {ARCHIVE_NAME} -y -o{EXTRACT_DIR}")

print("Connecting to databases...")
conn_base = psycopg2.connect(BASE_DB_URL)
conn_vec = psycopg2.connect(VEC_DB_URL)

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS users (
  id BIGINT PRIMARY KEY,
  reputation INTEGER,
  creation_date TIMESTAMPTZ,
  display_name TEXT NOT NULL,
  last_access_date TIMESTAMPTZ,
  website_url TEXT,
  location TEXT,
  about_me TEXT,
  views INTEGER,
  upvotes INTEGER,
  downvotes INTEGER,
  profile_image_url TEXT,
  email_hash TEXT,
  account_id BIGINT
);

CREATE TABLE IF NOT EXISTS posts (
  id BIGINT PRIMARY KEY,
  post_type_id INTEGER NOT NULL,
  accepted_answer_id BIGINT,
  parent_id BIGINT,
  creation_date TIMESTAMPTZ,
  deletion_date TIMESTAMPTZ,
  score INTEGER,
  view_count INTEGER,
  body TEXT,
  owner_user_id BIGINT,
  owner_display_name TEXT,
  last_editor_user_id BIGINT,
  last_editor_display_name TEXT,
  last_edit_date TIMESTAMPTZ,
  last_activity_date TIMESTAMPTZ,
  title TEXT,
  tags TEXT,
  answer_count INTEGER,
  comment_count INTEGER,
  favorite_count INTEGER,
  closed_date TIMESTAMPTZ,
  community_owned_date TIMESTAMPTZ,
  content_license TEXT
);

CREATE TABLE IF NOT EXISTS comments (
  id BIGINT PRIMARY KEY,
  post_id BIGINT,
  score INTEGER,
  text TEXT,
  creation_date TIMESTAMPTZ,
  user_display_name TEXT,
  user_id BIGINT,
  content_license TEXT
);

CREATE TABLE IF NOT EXISTS votes (
  id BIGINT PRIMARY KEY,
  post_id BIGINT,
  vote_type_id INTEGER,
  user_id BIGINT,
  creation_date TIMESTAMPTZ,
  bounty_amount INTEGER
);

CREATE TABLE IF NOT EXISTS tags (
  id BIGINT PRIMARY KEY,
  tag_name TEXT,
  count INTEGER,
  excerpt_post_id BIGINT,
  wiki_post_id BIGINT,
  is_moderator_only BOOLEAN,
  is_required BOOLEAN
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

CREATE TABLE IF NOT EXISTS posts_with_deleted (
  id BIGINT PRIMARY KEY,
  post_type_id INTEGER NOT NULL,
  accepted_answer_id BIGINT,
  parent_id BIGINT,
  creation_date TIMESTAMPTZ,
  deletion_date TIMESTAMPTZ,
  score INTEGER,
  view_count INTEGER,
  body TEXT,
  owner_user_id BIGINT,
  owner_display_name TEXT,
  last_editor_user_id BIGINT,
  last_editor_display_name TEXT,
  last_edit_date TIMESTAMPTZ,
  last_activity_date TIMESTAMPTZ,
  title TEXT,
  tags TEXT,
  answer_count INTEGER,
  comment_count INTEGER,
  favorite_count INTEGER,
  closed_date TIMESTAMPTZ,
  community_owned_date TIMESTAMPTZ,
  content_license TEXT
);

CREATE TABLE IF NOT EXISTS badges (
  id BIGINT PRIMARY KEY,
  user_id BIGINT,
  name TEXT,
  date TIMESTAMPTZ,
  class INTEGER,
  tag_based BOOLEAN
);

CREATE TABLE IF NOT EXISTS post_history (
  id BIGINT PRIMARY KEY,
  post_history_type_id INTEGER,
  post_id BIGINT,
  revision_guid TEXT,
  creation_date TIMESTAMPTZ,
  user_id BIGINT,
  user_display_name TEXT,
  comment TEXT,
  text TEXT,
  content_license TEXT
);

CREATE TABLE IF NOT EXISTS post_links (
  id BIGINT PRIMARY KEY,
  creation_date TIMESTAMPTZ,
  post_id BIGINT,
  related_post_id BIGINT,
  link_type_id INTEGER
);

CREATE TABLE IF NOT EXISTS close_as_off_topic_reason_types (
  id BIGINT PRIMARY KEY,
  is_universal BOOLEAN,
  input_title TEXT,
  markdown_input_guidance TEXT,
  markdown_post_owner_guidance TEXT,
  markdown_public_guidance TEXT,
  markdown_concensus_description TEXT,
  creation_date TIMESTAMPTZ,
  creation_moderator_id BIGINT,
  approval_date TIMESTAMPTZ,
  approval_moderator_id BIGINT,
  deactivation_date TIMESTAMPTZ,
  deactivation_moderator_id BIGINT
);

CREATE TABLE IF NOT EXISTS pending_flags (
  id BIGINT PRIMARY KEY,
  flag_type_id INTEGER,
  post_id BIGINT,
  creation_date TIMESTAMPTZ,
  close_reason_type_id INTEGER,
  close_as_off_topic_reason_type_id BIGINT,
  duplicate_of_question_id BIGINT,
  belongs_on_base_host_address TEXT
);

CREATE TABLE IF NOT EXISTS post_feedback (
  id BIGINT PRIMARY KEY,
  post_id BIGINT,
  is_anonymous BOOLEAN,
  vote_type_id INTEGER,
  creation_date TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS related_questions (
  post_id BIGINT,
  related_post_id BIGINT,
  position INTEGER,
  score INTEGER,
  PRIMARY KEY (post_id, related_post_id)
);

CREATE TABLE IF NOT EXISTS post_notices (
  id BIGINT PRIMARY KEY,
  post_id BIGINT,
  post_notice_type_id INTEGER,
  creation_date TIMESTAMPTZ,
  deletion_date TIMESTAMPTZ,
  expiry_date TIMESTAMPTZ,
  body TEXT,
  owner_user_id BIGINT,
  deletion_user_id BIGINT
);

CREATE TABLE IF NOT EXISTS suggested_edits (
  id BIGINT PRIMARY KEY,
  post_id BIGINT,
  creation_date TIMESTAMPTZ,
  approval_date TIMESTAMPTZ,
  rejection_date TIMESTAMPTZ,
  owner_user_id BIGINT,
  comment TEXT,
  text TEXT,
  title TEXT,
  tags TEXT,
  revision_guid TEXT
);

CREATE TABLE IF NOT EXISTS suggested_edit_votes (
  id BIGINT PRIMARY KEY,
  suggested_edit_id BIGINT,
  user_id BIGINT,
  vote_type_id INTEGER,
  creation_date TIMESTAMPTZ,
  target_user_id BIGINT,
  target_rep_change INTEGER
);

CREATE TABLE IF NOT EXISTS review_tasks (
  id BIGINT PRIMARY KEY,
  review_task_type_id INTEGER,
  creation_date TIMESTAMPTZ,
  deletion_date TIMESTAMPTZ,
  review_task_state_id INTEGER,
  post_id BIGINT,
  suggested_edit_id BIGINT,
  completed_by_review_task_result_id BIGINT,
  rejection_reason_id INTEGER
);

CREATE TABLE IF NOT EXISTS review_task_results (
  id BIGINT PRIMARY KEY,
  review_task_id BIGINT,
  review_task_result_type_id INTEGER,
  creation_date TIMESTAMPTZ,
  rejection_reason_id INTEGER,
  comment TEXT
);

CREATE TABLE IF NOT EXISTS review_rejection_reasons (
  id BIGINT PRIMARY KEY,
  name TEXT,
  description TEXT,
  post_type_id INTEGER
);

CREATE TABLE IF NOT EXISTS tag_synonyms (
  id BIGINT PRIMARY KEY,
  source_tag_name TEXT,
  target_tag_name TEXT,
  creation_date TIMESTAMPTZ,
  owner_user_id BIGINT,
  auto_rename_count INTEGER,
  last_auto_rename TIMESTAMPTZ,
  score INTEGER,
  approved_by_user_id BIGINT,
  approval_date TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS sede_sites (
  id BIGINT PRIMARY KEY,
  url TEXT,
  name TEXT,
  long_name TEXT,
  parent_id BIGINT,
  tagline TEXT
);

CREATE TABLE IF NOT EXISTS sede_databases (
  id BIGINT PRIMARY KEY,
  site_id BIGINT,
  name TEXT
);

CREATE TABLE IF NOT EXISTS sede_tables (
  id BIGINT PRIMARY KEY,
  database_id BIGINT,
  name TEXT,
  description TEXT
);

CREATE TABLE IF NOT EXISTS sede_users (
  id BIGINT PRIMARY KEY,
  account_id BIGINT,
  display_name TEXT,
  email TEXT
);
"""


def setup_schema(conn):
  with conn.cursor() as cur:
    cur.execute(SCHEMA_SQL)
    cur.execute(
      "TRUNCATE comments, votes, posts, tags, users, se_posts, "
      "posts_with_deleted, badges, post_history, post_links, "
      "close_as_off_topic_reason_types, pending_flags, post_feedback, "
      "related_questions, post_notices, suggested_edits, suggested_edit_votes, "
      "review_tasks, review_task_results, review_rejection_reasons, "
      "tag_synonyms, sede_sites, sede_databases, sede_tables, sede_users"
    )
  conn.commit()


def to_int(value):
  if value is None or value == "":
    return None
  try:
    return int(value)
  except Exception:
    return None


def to_bool(value):
  if value is None or value == "":
    return None
  return value.lower() == "true"


def load_xml(file_name, table, columns, row_builder, batch_size=2000):
  if not os.path.exists(file_name):
    print(f"Skipping {file_name} (not found)")
    return

  print(f"Loading {file_name} into {table}...")
  base_cur = conn_base.cursor()
  vec_cur = conn_vec.cursor()
  records = []
  count = 0

  for event, elem in ET.iterparse(file_name, events=("end",)):
    if elem.tag != "row":
      continue
    row = row_builder(elem)
    if row is not None:
      records.append(row)
      count += 1

    if len(records) >= batch_size:
      cols = ",".join(columns)
      execute_values(base_cur, f"INSERT INTO {table} ({cols}) VALUES %s", records)
      execute_values(vec_cur, f"INSERT INTO {table} ({cols}) VALUES %s", records)
      records = []

    elem.clear()

  if records:
    cols = ",".join(columns)
    execute_values(base_cur, f"INSERT INTO {table} ({cols}) VALUES %s", records)
    execute_values(vec_cur, f"INSERT INTO {table} ({cols}) VALUES %s", records)

  conn_base.commit()
  conn_vec.commit()
  base_cur.close()
  vec_cur.close()
  print(f"Loaded {count} rows into {table}.")


def build_user(elem):
  return (
    to_int(elem.get("Id")),
    to_int(elem.get("Reputation")),
    elem.get("CreationDate"),
    elem.get("DisplayName"),
    elem.get("LastAccessDate"),
    elem.get("WebsiteUrl"),
    elem.get("Location"),
    elem.get("AboutMe"),
    to_int(elem.get("Views")),
    to_int(elem.get("UpVotes")),
    to_int(elem.get("DownVotes")),
    elem.get("ProfileImageUrl"),
    elem.get("EmailHash"),
    to_int(elem.get("AccountId"))
  )


def build_post(elem):
  return (
    to_int(elem.get("Id")),
    to_int(elem.get("PostTypeId")),
    to_int(elem.get("AcceptedAnswerId")),
    to_int(elem.get("ParentId")),
    elem.get("CreationDate"),
    elem.get("DeletionDate"),
    to_int(elem.get("Score")),
    to_int(elem.get("ViewCount")),
    elem.get("Body"),
    to_int(elem.get("OwnerUserId")),
    elem.get("OwnerDisplayName"),
    to_int(elem.get("LastEditorUserId")),
    elem.get("LastEditorDisplayName"),
    elem.get("LastEditDate"),
    elem.get("LastActivityDate"),
    elem.get("Title"),
    elem.get("Tags"),
    to_int(elem.get("AnswerCount")),
    to_int(elem.get("CommentCount")),
    to_int(elem.get("FavoriteCount")),
    elem.get("ClosedDate"),
    elem.get("CommunityOwnedDate"),
    elem.get("ContentLicense")
  )


def build_comment(elem):
  return (
    to_int(elem.get("Id")),
    to_int(elem.get("PostId")),
    to_int(elem.get("Score")),
    elem.get("Text"),
    elem.get("CreationDate"),
    elem.get("UserDisplayName"),
    to_int(elem.get("UserId")),
    elem.get("ContentLicense")
  )


def build_vote(elem):
  return (
    to_int(elem.get("Id")),
    to_int(elem.get("PostId")),
    to_int(elem.get("VoteTypeId")),
    to_int(elem.get("UserId")),
    elem.get("CreationDate"),
    to_int(elem.get("BountyAmount"))
  )


def build_tag(elem):
  return (
    to_int(elem.get("Id")),
    elem.get("TagName"),
    to_int(elem.get("Count")),
    to_int(elem.get("ExcerptPostId")),
    to_int(elem.get("WikiPostId")),
    to_bool(elem.get("IsModeratorOnly")),
    to_bool(elem.get("IsRequired"))
  )


def build_badge(elem):
  return (
    to_int(elem.get("Id")),
    to_int(elem.get("UserId")),
    elem.get("Name"),
    elem.get("Date"),
    to_int(elem.get("Class")),
    to_bool(elem.get("TagBased"))
  )


def build_post_history(elem):
  return (
    to_int(elem.get("Id")),
    to_int(elem.get("PostHistoryTypeId")),
    to_int(elem.get("PostId")),
    elem.get("RevisionGUID"),
    elem.get("CreationDate"),
    to_int(elem.get("UserId")),
    elem.get("UserDisplayName"),
    elem.get("Comment"),
    elem.get("Text"),
    elem.get("ContentLicense")
  )


def build_post_link(elem):
  return (
    to_int(elem.get("Id")),
    elem.get("CreationDate"),
    to_int(elem.get("PostId")),
    to_int(elem.get("RelatedPostId")),
    to_int(elem.get("LinkTypeId"))
  )


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

load_xml(
  "Users.xml",
  "users",
  [
    "id",
    "reputation",
    "creation_date",
    "display_name",
    "last_access_date",
    "website_url",
    "location",
    "about_me",
    "views",
    "upvotes",
    "downvotes",
    "profile_image_url",
    "email_hash",
    "account_id"
  ],
  build_user
)

load_xml(
  "Posts.xml",
  "posts",
  [
    "id",
    "post_type_id",
    "accepted_answer_id",
    "parent_id",
    "creation_date",
    "deletion_date",
    "score",
    "view_count",
    "body",
    "owner_user_id",
    "owner_display_name",
    "last_editor_user_id",
    "last_editor_display_name",
    "last_edit_date",
    "last_activity_date",
    "title",
    "tags",
    "answer_count",
    "comment_count",
    "favorite_count",
    "closed_date",
    "community_owned_date",
    "content_license"
  ],
  build_post
)

load_xml(
  "Comments.xml",
  "comments",
  [
    "id",
    "post_id",
    "score",
    "text",
    "creation_date",
    "user_display_name",
    "user_id",
    "content_license"
  ],
  build_comment
)

load_xml(
  "Votes.xml",
  "votes",
  [
    "id",
    "post_id",
    "vote_type_id",
    "user_id",
    "creation_date",
    "bounty_amount"
  ],
  build_vote
)

load_xml(
  "Tags.xml",
  "tags",
  [
    "id",
    "tag_name",
    "count",
    "excerpt_post_id",
    "wiki_post_id",
    "is_moderator_only",
    "is_required"
  ],
  build_tag
)

load_xml(
  "Badges.xml",
  "badges",
  [
    "id",
    "user_id",
    "name",
    "date",
    "class",
    "tag_based"
  ],
  build_badge
)

load_xml(
  "PostHistory.xml",
  "post_history",
  [
    "id",
    "post_history_type_id",
    "post_id",
    "revision_guid",
    "creation_date",
    "user_id",
    "user_display_name",
    "comment",
    "text",
    "content_license"
  ],
  build_post_history
)

load_xml(
  "PostLinks.xml",
  "post_links",
  [
    "id",
    "creation_date",
    "post_id",
    "related_post_id",
    "link_type_id"
  ],
  build_post_link
)


def mirror_posts_with_deleted(conn):
  with conn.cursor() as cur:
    cur.execute("TRUNCATE posts_with_deleted")
    cur.execute(
      """
      INSERT INTO posts_with_deleted
      SELECT * FROM posts
      """
    )
  conn.commit()


print("Mirroring posts into posts_with_deleted...")
mirror_posts_with_deleted(conn_base)
mirror_posts_with_deleted(conn_vec)

print("Refreshing se_posts for vectorized benchmarks...")
refresh_se_posts(conn_base)
refresh_se_posts(conn_vec)

conn_base.close()
conn_vec.close()
print("Done.")
