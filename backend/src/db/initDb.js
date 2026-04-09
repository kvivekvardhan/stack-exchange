import { closePool, query } from "./pool.js";

const schemaSql = `
CREATE TABLE IF NOT EXISTS questions (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  asked_by TEXT NOT NULL DEFAULT 'anonymous',
  score INTEGER NOT NULL DEFAULT 0,
  views INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tags (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT 'No description available'
);

CREATE TABLE IF NOT EXISTS question_tags (
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (question_id, tag_id)
);

CREATE TABLE IF NOT EXISTS answers (
  id SERIAL PRIMARY KEY,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  author TEXT NOT NULL DEFAULT 'anonymous',
  score INTEGER NOT NULL DEFAULT 0,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS replies (
  id SERIAL PRIMARY KEY,
  answer_id INTEGER NOT NULL REFERENCES answers(id) ON DELETE CASCADE,
  author TEXT NOT NULL DEFAULT 'anonymous',
  score INTEGER NOT NULL DEFAULT 0,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_questions_score_created_at ON questions(score DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_questions_created_at ON questions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_answers_question_id ON answers(question_id);
CREATE INDEX IF NOT EXISTS idx_replies_answer_id ON replies(answer_id);
CREATE INDEX IF NOT EXISTS idx_question_tags_question_id ON question_tags(question_id);
CREATE INDEX IF NOT EXISTS idx_question_tags_tag_id ON question_tags(tag_id);
`;

async function initDb() {
  await query(schemaSql);
  console.log("Database schema initialized.");
}

initDb()
  .catch((error) => {
    console.error("Failed to initialize database schema", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });
