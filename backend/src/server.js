import cors from "cors";
import express from "express";
import { query, queryWithEngine, withTransactionEngine } from "./db/pool.js";

const app = express();
const port = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

function hrtimeToMs(start) {
  const diffNs = process.hrtime.bigint() - start;
  return Number(diffNs) / 1_000_000;
}

function getEngine(req) {
  const rawEngine = String(req.query.engine || req.headers["x-db-engine"] || "").toLowerCase();
  if (rawEngine === "vectorized") {
    return "vectorized";
  }
  if (rawEngine === "baseline") {
    return "baseline";
  }
  return "baseline";
}

function isInspectorEnabled(req) {
  const raw = String(req.query.inspect || "").toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
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

async function runQuery(engine, sql, params = [], options = {}) {
  const start = process.hrtime.bigint();
  const result = await queryWithEngine(engine, sql, params);
  const timingMs = Number(hrtimeToMs(start).toFixed(3));

  let plan = null;
  if (options.inspect) {
    const explainResult = await queryWithEngine(
      engine,
      `EXPLAIN (FORMAT TEXT) ${sql}`,
      params
    );
    plan = explainResult.rows.map((row) => row["QUERY PLAN"]).join("\n");
  }

  return { result, timingMs, plan };
}

async function questionExists(engine, questionId) {
  const result = await queryWithEngine(engine, "SELECT 1 FROM questions WHERE id = $1", [questionId]);
  return result.rowCount > 0;
}

async function answerBelongsToQuestion(engine, questionId, answerId) {
  const result = await queryWithEngine(
    engine,
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

async function fetchQuestionDetails(engine, questionId, options = {}) {
  const questionQuery = `
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
  `;
  const questionResult = await runQuery(engine, questionQuery, [questionId], {
    inspect: options.inspect
  });

  if (questionResult.result.rowCount === 0) {
    return null;
  }

  const questionRow = questionResult.result.rows[0];

  const answerQuery = `
    SELECT id, question_id, author, score, body, created_at
    FROM answers
    WHERE question_id = $1
    ORDER BY created_at ASC, id ASC
  `;
  const answerResult = await runQuery(engine, answerQuery, [questionId], {
    inspect: options.inspect
  });

  const answerIds = answerResult.result.rows.map((row) => row.id);
  const repliesByAnswer = new Map();

  if (answerIds.length > 0) {
    const replyResult = await queryWithEngine(
      engine,
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
    data: {
      id: questionRow.id,
      title: questionRow.title,
      body: questionRow.body,
      tags: questionRow.tags || [],
      askedBy: normalizeAuthor(questionRow.asked_by),
      score: questionRow.score,
      views: questionRow.views || 0,
      createdAt: questionRow.created_at,
      answers: answerResult.result.rows.map((answer) => ({
        id: answer.id,
        author: normalizeAuthor(answer.author),
        score: answer.score,
        body: answer.body,
        createdAt: answer.created_at,
        replies: repliesByAnswer.get(answer.id) || []
      }))
    },
    timingMs: Number((questionResult.timingMs + answerResult.timingMs).toFixed(3)),
    inspector: options.inspect
      ? [
          {
            name: "question",
            sql: questionQuery.trim(),
            params: [questionId],
            plan: questionResult.plan
          },
          {
            name: "answers",
            sql: answerQuery.trim(),
            params: [questionId],
            plan: answerResult.plan
          }
        ]
      : []
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
    const engine = getEngine(req);
    const inspect = isInspectorEnabled(req);
    const q = String(req.query.q || "").trim().toLowerCase();
    const tag = String(req.query.tag || "").trim().toLowerCase();

    const searchSql = `
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
    `;
    const searchResult = await runQuery(engine, searchSql, [q, tag], { inspect });

    const responseRows = searchResult.result.rows.map(mapSearchQuestion);
    const timingMs = searchResult.timingMs;

    res.json({
      meta: {
        timingMs,
        resultCount: responseRows.length,
        query: { q, tag },
        engine,
        inspector: inspect
          ? [
              {
                name: "search",
                sql: searchSql.trim(),
                params: [q, tag],
                plan: searchResult.plan
              }
            ]
          : []
      },
      data: responseRows
    });
  })
);

app.get(
  "/question/:id",
  asyncHandler(async (req, res) => {
    const engine = getEngine(req);
    const inspect = isInspectorEnabled(req);
    const questionId = toIntegerId(req.params.id);

    if (!questionId) {
      return notFound(res, `Question with id ${req.params.id} was not found`);
    }

    if (shouldCountView(req, questionId)) {
      await queryWithEngine(engine, "UPDATE questions SET views = views + 1 WHERE id = $1", [
        questionId
      ]);
    }

    const question = await fetchQuestionDetails(engine, questionId, { inspect });

    if (!question) {
      return notFound(res, `Question with id ${req.params.id} was not found`);
    }

    return res.json({
      meta: {
        timingMs: question.timingMs,
        engine,
        inspector: question.inspector
      },
      data: question.data
    });
  })
);

app.post(
  "/questions",
  asyncHandler(async (req, res) => {
    const engine = getEngine(req);
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

    const question = await withTransactionEngine(engine, async (client) => {
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
      data: question,
      meta: { engine }
    });
  })
);

app.post(
  "/question/:id/upvote",
  asyncHandler(async (req, res) => {
    const engine = getEngine(req);
    const questionId = toIntegerId(req.params.id);
    if (!questionId) {
      return notFound(res, `Question with id ${req.params.id} was not found`);
    }

    const updated = await queryWithEngine(
      engine,
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
      data: updated.rows[0],
      meta: { engine }
    });
  })
);

app.post(
  "/question/:id/answers",
  asyncHandler(async (req, res) => {
    const engine = getEngine(req);
    const questionId = toIntegerId(req.params.id);
    if (!questionId) {
      return notFound(res, `Question with id ${req.params.id} was not found`);
    }

    if (!(await questionExists(engine, questionId))) {
      return notFound(res, `Question with id ${req.params.id} was not found`);
    }

    const body = String(req.body?.body || "").trim();
    const author = normalizeAuthor(req.body?.author);

    if (!body) {
      return badRequest(res, "Answer body is required");
    }

    const inserted = await queryWithEngine(
      engine,
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
      },
      meta: { engine }
    });
  })
);

app.post(
  "/question/:questionId/answers/:answerId/upvote",
  asyncHandler(async (req, res) => {
    const engine = getEngine(req);
    const questionId = toIntegerId(req.params.questionId);
    const answerId = toIntegerId(req.params.answerId);

    if (!questionId) {
      return notFound(res, `Question with id ${req.params.questionId} was not found`);
    }

    if (!answerId) {
      return notFound(res, `Answer with id ${req.params.answerId} was not found`);
    }

    const updated = await queryWithEngine(
      engine,
      `
      UPDATE answers
      SET score = score + 1
      WHERE id = $1 AND question_id = $2
      RETURNING id, score
      `,
      [answerId, questionId]
    );

    if (updated.rowCount === 0) {
      if (!(await questionExists(engine, questionId))) {
        return notFound(res, `Question with id ${req.params.questionId} was not found`);
      }

      return notFound(res, `Answer with id ${req.params.answerId} was not found`);
    }

    return res.json({
      message: "Answer upvoted",
      data: updated.rows[0],
      meta: { engine }
    });
  })
);

app.post(
  "/question/:questionId/answers/:answerId/replies",
  asyncHandler(async (req, res) => {
    const engine = getEngine(req);
    const questionId = toIntegerId(req.params.questionId);
    const answerId = toIntegerId(req.params.answerId);

    if (!questionId) {
      return notFound(res, `Question with id ${req.params.questionId} was not found`);
    }

    if (!answerId) {
      return notFound(res, `Answer with id ${req.params.answerId} was not found`);
    }

    if (!(await questionExists(engine, questionId))) {
      return notFound(res, `Question with id ${req.params.questionId} was not found`);
    }

    if (!(await answerBelongsToQuestion(engine, questionId, answerId))) {
      return notFound(res, `Answer with id ${req.params.answerId} was not found`);
    }

    const body = String(req.body?.body || "").trim();
    const author = normalizeAuthor(req.body?.author);

    if (!body) {
      return badRequest(res, "Reply body is required");
    }

    const inserted = await queryWithEngine(
      engine,
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
      },
      meta: { engine }
    });
  })
);

app.post(
  "/question/:questionId/answers/:answerId/replies/:replyId/upvote",
  asyncHandler(async (req, res) => {
    const engine = getEngine(req);
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

    const updated = await queryWithEngine(
      engine,
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
      if (!(await questionExists(engine, questionId))) {
        return notFound(res, `Question with id ${req.params.questionId} was not found`);
      }

      if (!(await answerBelongsToQuestion(engine, questionId, answerId))) {
        return notFound(res, `Answer with id ${req.params.answerId} was not found`);
      }

      return notFound(res, `Reply with id ${req.params.replyId} was not found`);
    }

    return res.json({
      message: "Reply upvoted",
      data: updated.rows[0],
      meta: { engine }
    });
  })
);

app.get(
  "/tags",
  asyncHandler(async (req, res) => {
    const engine = getEngine(req);
    const inspect = isInspectorEnabled(req);
    const search = String(req.query.q || "").trim().toLowerCase();

    const tagsSql = `
      SELECT t.id, t.name, t.description, COUNT(qt.question_id)::int AS question_count
      FROM tags t
      LEFT JOIN question_tags qt ON qt.tag_id = t.id
      WHERE ($1 = '' OR LOWER(t.name) LIKE '%' || $1 || '%')
      GROUP BY t.id
      ORDER BY question_count DESC, t.name ASC
      LIMIT 100
    `;

    const tagResult = await runQuery(engine, tagsSql, [search], { inspect });
    const timingMs = tagResult.timingMs;

    res.json({
      meta: {
        timingMs,
        engine,
        query: { q: search },
        inspector: inspect
          ? [
              {
                name: "tags",
                sql: tagsSql.trim(),
                params: [search],
                plan: tagResult.plan
              }
            ]
          : []
      },
      data: tagResult.result.rows.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        questionCount: row.question_count
      }))
    });
  })
);

app.get(
  "/benchmark",
  asyncHandler(async (req, res) => {
    const inspect = isInspectorEnabled(req);
    const searchTerm = String(req.query.q || "postgres").trim().toLowerCase();
    const tagTerm = String(req.query.tag || "sql").trim().toLowerCase();

    const queries = [
      {
        name: "search",
        sql: `
          SELECT q.id
          FROM questions q
          WHERE ($1 = '' OR LOWER(q.title || ' ' || q.body) LIKE '%' || $1 || '%')
          ORDER BY q.score DESC, q.created_at DESC
          LIMIT 25
        `,
        params: [searchTerm]
      },
      {
        name: "tag_filter",
        sql: `
          SELECT q.id
          FROM questions q
          WHERE ($1 = '' OR EXISTS (
            SELECT 1
            FROM question_tags qt
            JOIN tags t ON t.id = qt.tag_id
            WHERE qt.question_id = q.id
              AND LOWER(t.name) LIKE '%' || $1 || '%'
          ))
          ORDER BY q.score DESC, q.created_at DESC
          LIMIT 25
        `,
        params: [tagTerm]
      },
      {
        name: "tag_aggregate",
        sql: `
          SELECT t.name, COUNT(qt.question_id)::int AS question_count
          FROM tags t
          LEFT JOIN question_tags qt ON qt.tag_id = t.id
          GROUP BY t.id
          ORDER BY question_count DESC
          LIMIT 10
        `,
        params: []
      }
    ];

    async function runBenchmark(engine) {
      const results = [];
      for (const item of queries) {
        const outcome = await runQuery(engine, item.sql, item.params, { inspect });
        results.push({
          name: item.name,
          timingMs: outcome.timingMs,
          plan: inspect ? outcome.plan : null
        });
      }
      return results;
    }

    const [baseline, vectorized] = await Promise.all([
      runBenchmark("baseline"),
      runBenchmark("vectorized")
    ]);

    const inspector = inspect
      ? queries.map((item, index) => ({
          name: item.name,
          sql: item.sql.trim(),
          params: item.params,
          plan: [
            "Baseline:",
            baseline[index]?.plan || "(no plan)",
            "",
            "Vectorized:",
            vectorized[index]?.plan || "(no plan)"
          ].join("\n")
        }))
      : [];

    res.json({
      meta: {
        query: { q: searchTerm, tag: tagTerm },
        inspector
      },
      data: {
        baseline,
        vectorized
      }
    });
  })
);

app.post(
  "/inspect",
  asyncHandler(async (req, res) => {
    const sql = String(req.body?.sql || "").trim();

    if (!sql) {
      return badRequest(res, "SQL query is required");
    }

    // Safety: only allow SELECT statements
    if (!/^\s*SELECT\b/i.test(sql)) {
      return badRequest(res, "Only SELECT queries are allowed");
    }

    async function inspectEngine(engine) {
      const start = process.hrtime.bigint();
      let result, error = null;
      try {
        result = await queryWithEngine(engine, sql, []);
      } catch (err) {
        error = err.message;
        result = null;
      }
      const execMs = Number(hrtimeToMs(start).toFixed(3));

      let plan = null, planJson = null;
      try {
        const explainText = await queryWithEngine(
          engine,
          `EXPLAIN (ANALYZE, FORMAT TEXT) ${sql}`,
          []
        );
        plan = explainText.rows.map((r) => r["QUERY PLAN"]).join("\n");
      } catch (_) {}

      try {
        const explainJson = await queryWithEngine(
          engine,
          `EXPLAIN (ANALYZE, FORMAT JSON) ${sql}`,
          []
        );
        planJson = explainJson.rows[0]["QUERY PLAN"];
      } catch (_) {}

      // Parse vectorized scan info from plan text
      const isVectorized = plan ? plan.includes("Vectorized Seq Scan") : false;
      const rowsMatch = plan ? plan.match(/rows=(\d+)/) : null;
      const filterMatch = plan ? plan.match(/Rows Removed by Filter:\s*(\d+)/) : null;

      return {
        engine,
        execMs,
        rowCount: result ? result.rowCount : 0,
        error,
        plan,
        planJson,
        isVectorized,
        estimatedRows: rowsMatch ? parseInt(rowsMatch[1], 10) : null,
        filteredRows: filterMatch ? parseInt(filterMatch[1], 10) : null
      };
    }

    const [baseline, vectorized] = await Promise.all([
      inspectEngine("baseline"),
      inspectEngine("vectorized")
    ]);

    const speedup = baseline.execMs > 0 && vectorized.execMs > 0
      ? Number((baseline.execMs / vectorized.execMs).toFixed(2))
      : null;

    res.json({
      meta: { sql, speedup },
      data: { baseline, vectorized }
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
