TRUNCATE questions, tags, question_tags, answers, replies RESTART IDENTITY CASCADE;

-- Insert Questions
INSERT INTO questions (title, body, asked_by, score, views) VALUES
('How to implement vectorization in Postgres?', 'I am looking for a way to process rows in batches...', 'alice', 10, 100),
('React vs Vue in 2026', 'Which one is better for large scale apps?', 'bob', 5, 250),
('SQL optimization tips', 'What are the best practices for indexing?', 'charlie', 20, 500);

-- Insert Tags
INSERT INTO tags (name) VALUES ('postgres'), ('vectorization'), ('react'), ('sql'), ('performance');

-- Link Questions and Tags
INSERT INTO question_tags (question_id, tag_id) VALUES
(1, 1), (1, 2), (2, 3), (3, 4), (3, 5);

-- Insert Answers
INSERT INTO answers (question_id, body, author, score) VALUES
(1, 'You can modify ExecScan to process batches of tuples.', 'bob', 15),
(3, 'Use covering indexes and avoid SELECT *.', 'alice', 8);

