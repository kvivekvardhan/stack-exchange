import cors from "cors";
import express from "express";
import { query, withTransaction } from "./db/pool.js";

const app = express();
const port = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

function hrtimeToMs(start) {
  const diffNs = process.hrtime.bigint() - start;
  return Number(diffNs) / 1_000_000;
}

const recentViewEvents = new Map();
const VIEW_DEBOUNCE_MS = 4000;

function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function toIntegerId(rawValue) {
  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function badRequest(res, message) {
  return res.status(400).json({
    error: {
      code: "INVALID_REQUEST",
      message
    }
  });
}

function notFound(res, message) {
  return res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message
    }
  });
}

function getViewerFingerprint(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }

  if (Array.isArray(forwarded) && forwarded[0]) {
    return String(forwarded[0]).trim();
  }

  return req.ip || req.socket?.remoteAddress || "unknown";
}

function shouldCountView(req, questionId) {
  const now = Date.now();
  const key = `${questionId}:${getViewerFingerprint(req)}`;
  const lastSeenAt = recentViewEvents.get(key) || 0;

  if (now - lastSeenAt <= VIEW_DEBOUNCE_MS) {
    return false;
  }

  recentViewEvents.set(key, now);

  if (recentViewEvents.size > 4000) {
    const cutoff = now - VIEW_DEBOUNCE_MS * 3;
    for (const [eventKey, eventTime] of recentViewEvents.entries()) {
      if (eventTime < cutoff) {
        recentViewEvents.delete(eventKey);
      }
    }
  }

  return true;
}

function normalizeAuthor(value) {
  return String(value || "anonymous").trim() || "anonymous";
}

function normalizeTags(rawTags) {
  const tags = String(rawTags || "")
    .split(",")
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean);

  return [...new Set(tags)].slice(0, 5);
}

function mapSearchQuestion(row) {
  return {
    id: row.id,
    title: row.title,
    tags: row.tags || [],
    score: row.score,
    views: row.views || 0,
    answerCount: row.answer_count || 0,
    createdAt: row.created_at,
    askedBy: row.asked_by || "anonymous"
  };
}

async function questionExists(questionId) {
  const result = await query("SELECT 1 FROM questions WHERE id = $1", [questionId]);
  return result.rowCount > 0;
}

async function answerBelongsToQuestion(questionId, answerId) {
  const result = await query(
    "SELECT 1 FROM answers WHERE id = $1 AND question_id = $2",
    [answerId, questionId]
  );
  return result.rowCount > 0;
}

async function getOrCreateTagId(client, tagName) {
  const description = `Community tag for ${tagName}`;
  const inserted = await client.query(
    `
    INSERT INTO tags (name, description)
    VALUES ($1, $2)
    ON CONFLICT (name) DO NOTHING
    RETURNING id
    `,
    [tagName, description]
  );

  if (inserted.rowCount > 0) {
    return inserted.rows[0].id;
  }

  const existing = await client.query("SELECT id FROM tags WHERE name = $1", [tagName]);
  return existing.rows[0].id;
}

async function fetchQuestionDetails(questionId) {
  const questionResult = await query(
    `
    SELECT
      q.id,
      q.title,
      q.body,
      q.score,
      q.views,
      q.created_at,
      q.asked_by,
      COALESCE(ARRAY_REMOVE(ARRAY_AGG(t.name ORDER BY t.name), NULL), '{}'::text[]) AS tags
    FROM questions q
    LEFT JOIN question_tags qt ON qt.question_id = q.id
    LEFT JOIN tags t ON t.id = qt.tag_id
    WHERE q.id = $1
    GROUP BY q.id
    LIMIT 1
    `,
    [questionId]
  );

  if (questionResult.rowCount === 0) {
    return null;
  }

  const questionRow = questionResult.rows[0];

  const answerResult = await query(
    `
    SELECT id, question_id, author, score, body, created_at
    FROM answers
    WHERE question_id = $1
    ORDER BY created_at ASC, id ASC
    `,
    [questionId]
  );

  const answerIds = answerResult.rows.map((row) => row.id);
  const repliesByAnswer = new Map();

  if (answerIds.length > 0) {
    const replyResult = await query(
      `
      SELECT id, answer_id, author, score, body, created_at
      FROM replies
      WHERE answer_id = ANY($1::int[])
      ORDER BY created_at ASC, id ASC
      `,
      [answerIds]
    );

    replyResult.rows.forEach((reply) => {
      const current = repliesByAnswer.get(reply.answer_id) || [];
      current.push({
        id: reply.id,
        author: normalizeAuthor(reply.author),
        score: reply.score,
        body: reply.body,
        createdAt: reply.created_at
      });
      repliesByAnswer.set(reply.answer_id, current);
    });
  }

  return {
    id: questionRow.id,
    title: questionRow.title,
    body: questionRow.body,
    tags: questionRow.tags || [],
    askedBy: normalizeAuthor(questionRow.asked_by),
    score: questionRow.score,
    views: questionRow.views || 0,
    createdAt: questionRow.created_at,
    answers: answerResult.rows.map((answer) => ({
      id: answer.id,
      author: normalizeAuthor(answer.author),
      score: answer.score,
      body: answer.body,
      createdAt: answer.created_at,
      replies: repliesByAnswer.get(answer.id) || []
    }))
  };
}

app.get("/health", async (_req, res) => {
  try {
    await query("SELECT 1");
    res.json({ status: "ok", service: "stackfast-backend", database: "connected" });
  } catch (_error) {
    res.status(503).json({ status: "degraded", service: "stackfast-backend", database: "down" });
  }
});

app.get(
  "/search",
  asyncHandler(async (req, res) => {
    const start = process.hrtime.bigint();
    const q = String(req.query.q || "").trim().toLowerCase();
    const tag = String(req.query.tag || "").trim().toLowerCase();

    const searchResult = await query(
      `
      SELECT
        q.id,
        q.title,
        q.score,
        q.views,
        q.created_at,
        q.asked_by,
        COALESCE(ARRAY_REMOVE(ARRAY_AGG(t.name ORDER BY t.name), NULL), '{}'::text[]) AS tags,
        COALESCE(answer_counts.answer_count, 0)::int AS answer_count
      FROM questions q
      LEFT JOIN question_tags qt ON qt.question_id = q.id
      LEFT JOIN tags t ON t.id = qt.tag_id
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS answer_count
        FROM answers a
        WHERE a.question_id = q.id
      ) AS answer_counts ON TRUE
      WHERE ($1 = '' OR LOWER(q.title || ' ' || q.body) LIKE '%' || $1 || '%')
        AND (
          $2 = '' OR EXISTS (
            SELECT 1
            FROM question_tags qtf
            JOIN tags tf ON tf.id = qtf.tag_id
            WHERE qtf.question_id = q.id
              AND LOWER(tf.name) LIKE '%' || $2 || '%'
          )
        )
      GROUP BY q.id, answer_counts.answer_count
      ORDER BY q.score DESC, q.created_at DESC
      `,
      [q, tag]
    );

    const responseRows = searchResult.rows.map(mapSearchQuestion);
    const timingMs = Number(hrtimeToMs(start).toFixed(3));

    res.json({
      meta: {
        timingMs,
        resultCount: responseRows.length,
        query: { q, tag }
      },
      data: responseRows
    });
  })
);

app.get(
  "/question/:id",
  asyncHandler(async (req, res) => {
    const start = process.hrtime.bigint();
    const questionId = toIntegerId(req.params.id);

    if (!questionId) {
      return notFound(res, `Question with id ${req.params.id} was not found`);
    }

    if (shouldCountView(req, questionId)) {
      await query("UPDATE questions SET views = views + 1 WHERE id = $1", [questionId]);
    }

    const question = await fetchQuestionDetails(questionId);

    if (!question) {
      return notFound(res, `Question with id ${req.params.id} was not found`);
    }

    const timingMs = Number(hrtimeToMs(start).toFixed(3));

    return res.json({
      meta: {
        timingMs
      },
      data: question
    });
  })
);

app.post(
  "/questions",
  asyncHandler(async (req, res) => {
    const title = String(req.body?.title || "").trim();
    const body = String(req.body?.body || "").trim();
    const author = normalizeAuthor(req.body?.author);

    if (!title) {
      return badRequest(res, "Question title is required");
    }

    if (!body) {
      return badRequest(res, "Question body is required");
    }

    const tags = normalizeTags(req.body?.tags);

    const question = await withTransaction(async (client) => {
      const inserted = await client.query(
        `
        INSERT INTO questions (title, body, asked_by)
        VALUES ($1, $2, $3)
        RETURNING id, title, body, asked_by, score, views, created_at
        `,
        [title, body, author]
      );

      const insertedQuestion = inserted.rows[0];

      for (const tagName of tags) {
        const tagId = await getOrCreateTagId(client, tagName);
        await client.query(
          `
          INSERT INTO question_tags (question_id, tag_id)
          VALUES ($1, $2)
          ON CONFLICT (question_id, tag_id) DO NOTHING
          `,
          [insertedQuestion.id, tagId]
        );
      }

      return {
        id: insertedQuestion.id,
        title: insertedQuestion.title,
        body: insertedQuestion.body,
        tags,
        askedBy: normalizeAuthor(insertedQuestion.asked_by),
        score: insertedQuestion.score,
        views: insertedQuestion.views,
        createdAt: insertedQuestion.created_at,
        answers: []
      };
    });

    return res.status(201).json({
      message: "Question posted",
      data: question
    });
  })
);

app.post(
  "/question/:id/upvote",
  asyncHandler(async (req, res) => {
    const questionId = toIntegerId(req.params.id);
    if (!questionId) {
      return notFound(res, `Question with id ${req.params.id} was not found`);
    }

    const updated = await query(
      `
      UPDATE questions
      SET score = score + 1
      WHERE id = $1
      RETURNING id, score
      `,
      [questionId]
    );

    if (updated.rowCount === 0) {
      return notFound(res, `Question with id ${req.params.id} was not found`);
    }

    return res.json({
      message: "Question upvoted",
      data: updated.rows[0]
    });
  })
);

app.post(
  "/question/:id/answers",
  asyncHandler(async (req, res) => {
    const questionId = toIntegerId(req.params.id);
    if (!questionId) {
      return notFound(res, `Question with id ${req.params.id} was not found`);
    }

    if (!(await questionExists(questionId))) {
      return notFound(res, `Question with id ${req.params.id} was not found`);
    }

    const body = String(req.body?.body || "").trim();
    const author = normalizeAuthor(req.body?.author);

    if (!body) {
      return badRequest(res, "Answer body is required");
    }

    const inserted = await query(
      `
      INSERT INTO answers (question_id, author, body)
      VALUES ($1, $2, $3)
      RETURNING id, author, score, body, created_at
      `,
      [questionId, author, body]
    );

    const answer = inserted.rows[0];

    return res.status(201).json({
      message: "Answer posted",
      data: {
        id: answer.id,
        author: normalizeAuthor(answer.author),
        score: answer.score,
        body: answer.body,
        createdAt: answer.created_at,
        replies: []
      }
    });
  })
);

app.post(
  "/question/:questionId/answers/:answerId/upvote",
  asyncHandler(async (req, res) => {
    const questionId = toIntegerId(req.params.questionId);
    const answerId = toIntegerId(req.params.answerId);

    if (!questionId) {
      return notFound(res, `Question with id ${req.params.questionId} was not found`);
    }

    if (!answerId) {
      return notFound(res, `Answer with id ${req.params.answerId} was not found`);
    }

    const updated = await query(
      `
      UPDATE answers
      SET score = score + 1
      WHERE id = $1 AND question_id = $2
      RETURNING id, score
      `,
      [answerId, questionId]
    );

    if (updated.rowCount === 0) {
      if (!(await questionExists(questionId))) {
        return notFound(res, `Question with id ${req.params.questionId} was not found`);
      }

      return notFound(res, `Answer with id ${req.params.answerId} was not found`);
    }

    return res.json({
      message: "Answer upvoted",
      data: updated.rows[0]
    });
  })
);

app.post(
  "/question/:questionId/answers/:answerId/replies",
  asyncHandler(async (req, res) => {
    const questionId = toIntegerId(req.params.questionId);
    const answerId = toIntegerId(req.params.answerId);

    if (!questionId) {
      return notFound(res, `Question with id ${req.params.questionId} was not found`);
    }

    if (!answerId) {
      return notFound(res, `Answer with id ${req.params.answerId} was not found`);
    }

    if (!(await questionExists(questionId))) {
      return notFound(res, `Question with id ${req.params.questionId} was not found`);
    }

    if (!(await answerBelongsToQuestion(questionId, answerId))) {
      return notFound(res, `Answer with id ${req.params.answerId} was not found`);
    }

    const body = String(req.body?.body || "").trim();
    const author = normalizeAuthor(req.body?.author);

    if (!body) {
      return badRequest(res, "Reply body is required");
    }

    const inserted = await query(
      `
      INSERT INTO replies (answer_id, author, body)
      VALUES ($1, $2, $3)
      RETURNING id, author, score, body, created_at
      `,
      [answerId, author, body]
    );

    const reply = inserted.rows[0];

    return res.status(201).json({
      message: "Reply posted",
      data: {
        id: reply.id,
        author: normalizeAuthor(reply.author),
        score: reply.score,
        body: reply.body,
        createdAt: reply.created_at
      }
    });
  })
);

app.post(
  "/question/:questionId/answers/:answerId/replies/:replyId/upvote",
  asyncHandler(async (req, res) => {
    const questionId = toIntegerId(req.params.questionId);
    const answerId = toIntegerId(req.params.answerId);
    const replyId = toIntegerId(req.params.replyId);

    if (!questionId) {
      return notFound(res, `Question with id ${req.params.questionId} was not found`);
    }

    if (!answerId) {
      return notFound(res, `Answer with id ${req.params.answerId} was not found`);
    }

    if (!replyId) {
      return notFound(res, `Reply with id ${req.params.replyId} was not found`);
    }

    const updated = await query(
      `
      UPDATE replies AS r
      SET score = r.score + 1
      FROM answers AS a
      WHERE r.id = $1
        AND r.answer_id = a.id
        AND a.id = $2
        AND a.question_id = $3
      RETURNING r.id, r.score
      `,
      [replyId, answerId, questionId]
    );

    if (updated.rowCount === 0) {
      if (!(await questionExists(questionId))) {
        return notFound(res, `Question with id ${req.params.questionId} was not found`);
      }

      if (!(await answerBelongsToQuestion(questionId, answerId))) {
        return notFound(res, `Answer with id ${req.params.answerId} was not found`);
      }

      return notFound(res, `Reply with id ${req.params.replyId} was not found`);
    }

    return res.json({
      message: "Reply upvoted",
      data: updated.rows[0]
    });
  })
);

app.use((req, res) => {
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: `No route found for ${req.method} ${req.path}`
    }
  });
});

app.use((error, _req, res, _next) => {
  console.error("Unhandled backend error", error);

  res.status(500).json({
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "Unexpected server error"
    }
  });
});

app.listen(port, () => {
  console.log(`StackFast backend listening on http://localhost:${port}`);
});
