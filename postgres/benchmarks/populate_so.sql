-- Smoke-test fixture for the new Posts schema. Assumes init_schema.sql has
-- been applied (Users, Posts, Comments, Votes, Badges, Tags, PostLinks,
-- PostHistory all exist). Identifiers fold to lowercase: PostTypeId →
-- posttypeid, ViewCount → viewcount, etc. The vectorized engine resolves
-- them by name from pg_attribute, so case-folding is transparent.

TRUNCATE PostHistory, PostLinks, Tags, Badges, Votes, Comments, Posts, Users
  RESTART IDENTITY CASCADE;

INSERT INTO Users (Id, Reputation, CreationDate, DisplayName, LastAccessDate)
VALUES
  (1, 1200, NOW(), 'alice',   NOW()),
  (2,  950, NOW(), 'bob',     NOW()),
  (3,  800, NOW(), 'charlie', NOW());

INSERT INTO Tags (Id, TagName, Count) VALUES
  (1, 'postgres',      2),
  (2, 'vectorization', 1),
  (3, 'react',         1),
  (4, 'sql',           2),
  (5, 'performance',   1);

INSERT INTO Posts (
  Id, PostTypeId, AcceptedAnswerId, ParentId, CreationDate, Score, ViewCount,
  Body, OwnerUserId, OwnerDisplayName, Title, Tags,
  AnswerCount, CommentCount, FavoriteCount, ContentLicense
) VALUES
  (101, 1, 201,  NULL, NOW(), 10, 100, 'I am looking for a way to process rows in batches...', 1, 'alice',   'How to implement vectorization in Postgres?', '<postgres><vectorization>', 1, 0, 0, 'CC BY-SA 4.0'),
  (102, 1, NULL, NULL, NOW(),  5, 250, 'Which one is better for large scale apps?',           2, 'bob',     'React vs Vue in 2026',                       '<react>',                  0, 0, 0, 'CC BY-SA 4.0'),
  (103, 1, 202,  NULL, NOW(), 20, 500, 'What are the best practices for indexing?',           3, 'charlie', 'SQL optimization tips',                      '<sql><performance>',       1, 0, 0, 'CC BY-SA 4.0'),
  (201, 2, NULL, 101,  NOW(), 15,   0, 'You can modify ExecScan to process batches of tuples.', 2, 'bob',   NULL, NULL, 0, 1, 0, 'CC BY-SA 4.0'),
  (202, 2, NULL, 103,  NOW(),  8,   0, 'Use covering indexes and avoid SELECT *.',              1, 'alice', NULL, NULL, 0, 0, 0, 'CC BY-SA 4.0');

INSERT INTO Comments (Id, PostId, Score, Text, CreationDate, UserId, UserDisplayName, ContentLicense)
VALUES (301, 201, 2, 'Also check row estimate mismatches in EXPLAIN.', NOW(), 3, 'charlie', 'CC BY-SA 4.0');
