-- Drop old schema
DROP TABLE IF EXISTS votes, comments, tags, posts, users CASCADE;

-- Create correct schema matching Stack Exchange XML
CREATE TABLE IF NOT EXISTS posts (
  id BIGINT PRIMARY KEY,
  posttypeid INTEGER NOT NULL,
  acceptedanswerid BIGINT,
  parentid BIGINT,
  creationdate TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  score INTEGER NOT NULL DEFAULT 0,
  viewcount INTEGER NOT NULL DEFAULT 0,
  body TEXT NOT NULL DEFAULT '',
  owneruserid BIGINT,
  ownerdisplayname TEXT,
  lasteditdate TIMESTAMPTZ,
  lastactivitydate TIMESTAMPTZ,
  title TEXT,
  tags TEXT,
  answercount INTEGER NOT NULL DEFAULT 0,
  commentcount INTEGER NOT NULL DEFAULT 0,
  favoritecount INTEGER NOT NULL DEFAULT 0,
  contentlicense TEXT DEFAULT 'CC BY-SA 4.0'
);

CREATE TABLE IF NOT EXISTS comments (
  id BIGINT PRIMARY KEY,
  postid BIGINT NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  text TEXT NOT NULL DEFAULT '',
  creationdate TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  userdisplayname TEXT,
  userid BIGINT
);

CREATE TABLE IF NOT EXISTS tags (
  id BIGINT PRIMARY KEY,
  tagname TEXT NOT NULL UNIQUE,
  count INTEGER NOT NULL DEFAULT 0,
  excerptpostid BIGINT,
  wikipostid BIGINT
);

CREATE INDEX IF NOT EXISTS idx_posts_type ON posts(posttypeid);
CREATE INDEX IF NOT EXISTS idx_posts_parent ON posts(parentid);
CREATE INDEX IF NOT EXISTS idx_posts_score ON posts(score DESC, creationdate DESC);
CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(creationdate DESC);
CREATE INDEX IF NOT EXISTS idx_posts_viewcount ON posts(viewcount DESC);
CREATE INDEX IF NOT EXISTS idx_comments_postid ON comments(postid);
CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(tagname);
