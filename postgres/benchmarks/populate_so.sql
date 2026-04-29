TRUNCATE comments, votes, posts, tags, users RESTART IDENTITY CASCADE;

-- Insert Users
INSERT INTO users (id, display_name, reputation, creation_date, last_access_date)
VALUES
(1, 'alice', 1200, NOW(), NOW()),
(2, 'bob', 950, NOW(), NOW()),
(3, 'charlie', 800, NOW(), NOW());

-- Insert Tags
INSERT INTO tags (id, tag_name, count)
VALUES
(1, 'postgres', 2),
(2, 'vectorization', 1),
(3, 'react', 1),
(4, 'sql', 2),
(5, 'performance', 1);

-- Insert Posts (questions + answers)
INSERT INTO posts (id, post_type_id, title, body, owner_display_name, owner_user_id, tags, score, view_count)
VALUES
(101, 1, 'How to implement vectorization in Postgres?', 'I am looking for a way to process rows in batches...', 'alice', 1, '<postgres><vectorization>', 10, 100),
(102, 1, 'React vs Vue in 2026', 'Which one is better for large scale apps?', 'bob', 2, '<react>', 5, 250),
(103, 1, 'SQL optimization tips', 'What are the best practices for indexing?', 'charlie', 3, '<sql><performance>', 20, 500),
(201, 2, NULL, 'You can modify ExecScan to process batches of tuples.', 'bob', 2, NULL, 15, 0),
(202, 2, NULL, 'Use covering indexes and avoid SELECT *.', 'alice', 1, NULL, 8, 0);

-- Link answers to their parent questions
UPDATE posts SET parent_id = 101 WHERE id = 201;
UPDATE posts SET parent_id = 103 WHERE id = 202;

-- Insert Comments (as post replies)
INSERT INTO comments (id, post_id, user_display_name, text, score)
VALUES
(301, 201, 'charlie', 'Also check row estimate mismatches in EXPLAIN.', 2);
