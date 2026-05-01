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
const INSPECT_TIMEOUT_MS = Number.parseInt(process.env.INSPECT_TIMEOUT_MS || "3000", 10);
const INSPECT_TIMEOUT = Number.isFinite(INSPECT_TIMEOUT_MS) ? INSPECT_TIMEOUT_MS : 3000;

function normalizeInspectSql(raw) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) {
    return { error: "SQL query is required" };
  }

  if (!/^\s*(SELECT|WITH)\b/i.test(trimmed)) {
    return { error: "Only SELECT or WITH queries are allowed" };
  }

  const withoutTrailing = trimmed.replace(/;\s*$/, "");
  if (withoutTrailing.includes(";")) {
    return { error: "Multiple statements are not allowed" };
  }

  if (/--|\/\*/.test(withoutTrailing)) {
    return { error: "SQL comments are not allowed" };
  }

  return { sql: withoutTrailing };
}

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

function formatPostTags(tags) {
  if (!tags || tags.length === 0) {
    return null;
  }
  return tags.map((tag) => `<${tag}>`).join("");
}

function parsePostTags(rawTags) {
  const raw = String(rawTags || "").trim();
  if (!raw) {
    return [];
  }

  return raw
    .split(/[<>\|,]+/)
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean);
}

function formatTagFilter(rawTag) {
  const tag = String(rawTag || "").trim().toLowerCase();
  if (!tag) {
    return "";
  }
  return tag;
}

function mapSearchQuestion(row) {
  return {
    id: row.id,
    title: row.title,
    tags: parsePostTags(row.tags),
    score: row.score || 0,
    viewCount: row.view_count || 0,
    answerCount: row.answer_count || 0,
    commentCount: row.comment_count || 0,
    creationDate: row.creation_date,
    ownerDisplayName: row.owner_display_name || "anonymous"
  };
}

function median(arr) {
  const sorted = [...arr].sort((a, b) => a - b);
  return Number(sorted[Math.floor(sorted.length / 2)].toFixed(3));
}

async function runQuery(engine, sql, params = [], options = {}) {
  return withTransactionEngine(engine, async (client) => {
    // Always disable parallelism for a fair comparison between engines
    await client.query("SET LOCAL max_parallel_workers_per_gather = 0");
    if (options.disableHashAgg) {
      await client.query("SET LOCAL enable_hashagg = off");
    }

    const start = process.hrtime.bigint();
    const result = await client.query(sql, params);
    const timingMs = Number(hrtimeToMs(start).toFixed(3));

    let plan = null;
    if (options.inspect) {
      const explainResult = await client.query(
        `EXPLAIN (FORMAT TEXT) ${sql}`,
        params
      );
      plan = explainResult.rows.map((row) => row["QUERY PLAN"]).join("\n");
    }

    return { result, timingMs, plan };
  });
}

async function questionExists(engine, questionId) {
  const result = await queryWithEngine(
    engine,
    "SELECT 1 FROM posts WHERE id = $1 AND posttypeid = 1",
    [questionId]
  );
  return result.rowCount > 0;
}

async function answerBelongsToQuestion(engine, questionId, answerId) {
  const result = await queryWithEngine(
    engine,
    "SELECT 1 FROM posts WHERE id = $1 AND parentid = $2 AND posttypeid = 2",
    [answerId, questionId]
  );
  return result.rowCount > 0;
}

async function upsertTag(client, tagName) {
  const inserted = await client.query(
    `
    INSERT INTO tags (id, tagname, count)
    VALUES (
      (SELECT COALESCE(MAX(id), 0) + 1 FROM tags),
      $1, 1
    )
    ON CONFLICT (tagname)
    DO UPDATE SET count = tags.count + 1
    RETURNING id
    `,
    [tagName]
  );

  return inserted.rows[0].id;
}

async function fetchQuestionDetails(engine, questionId, options = {}) {
  const questionQuery = `
    SELECT
      p.id,
      p.title,
      p.body,
      p.score,
      p.viewcount         AS view_count,
      p.answercount       AS answer_count,
      p.commentcount      AS comment_count,
      p.favoritecount     AS favorite_count,
      p.acceptedanswerid  AS accepted_answer_id,
      p.creationdate      AS creation_date,
      p.ownerdisplayname  AS owner_display_name,
      p.owneruserid       AS owner_user_id,
      p.tags
    FROM posts p
    WHERE p.id = $1
      AND p.posttypeid = 1
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
    SELECT
      id,
      parentid          AS parent_id,
      ownerdisplayname  AS owner_display_name,
      owneruserid       AS owner_user_id,
      score,
      body,
      creationdate      AS creation_date,
      commentcount      AS comment_count
    FROM posts
    WHERE parentid = $1
      AND posttypeid = 2
    ORDER BY creationdate ASC, id ASC
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
      SELECT
        id,
        postid             AS post_id,
        userdisplayname    AS user_display_name,
        userid             AS user_id,
        score,
        text,
        creationdate       AS creation_date
      FROM comments
      WHERE postid = ANY($1::bigint[])
      ORDER BY creationdate ASC, id ASC
      `,
      [answerIds]
    );

    replyResult.rows.forEach((reply) => {
      const current = repliesByAnswer.get(reply.post_id) || [];
      current.push({
        id: reply.id,
        postId: reply.post_id,
        userDisplayName: normalizeAuthor(reply.user_display_name),
        userId: reply.user_id,
        score: reply.score,
        text: reply.text,
        creationDate: reply.creation_date
      });
      repliesByAnswer.set(reply.post_id, current);
    });
  }

  return {
    data: {
      id: questionRow.id,
      title: questionRow.title,
      body: questionRow.body,
      tags: parsePostTags(questionRow.tags),
      ownerDisplayName: normalizeAuthor(questionRow.owner_display_name),
      ownerUserId: questionRow.owner_user_id,
      score: questionRow.score || 0,
      viewCount: questionRow.view_count || 0,
      answerCount: questionRow.answer_count || 0,
      commentCount: questionRow.comment_count || 0,
      favoriteCount: questionRow.favorite_count || 0,
      acceptedAnswerId: questionRow.accepted_answer_id,
      creationDate: questionRow.creation_date,
      answers: answerResult.result.rows.map((answer) => ({
        id: answer.id,
        parentId: answer.parent_id,
        ownerDisplayName: normalizeAuthor(answer.owner_display_name),
        ownerUserId: answer.owner_user_id,
        score: answer.score || 0,
        body: answer.body,
        creationDate: answer.creation_date,
        commentCount: answer.comment_count || 0,
        comments: repliesByAnswer.get(answer.id) || []
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
    const tagFilter = formatTagFilter(tag);
    const minViewsRaw = String(req.query.minViews || "").trim();
    const minViewsParsed = Number.parseInt(minViewsRaw, 10);
    const minViews =
      Number.isFinite(minViewsParsed) && minViewsParsed >= 0 ? minViewsParsed : 0;

    const limit = parseInt(req.query.limit, 10) || 25;
    const offset = parseInt(req.query.offset, 10) || 0;
    const sort = String(req.query.sort || "upvotes_desc");

    let orderClause = "ORDER BY p.score DESC, p.creationdate DESC";
    if (sort === "upvotes_asc") orderClause = "ORDER BY p.score ASC, p.creationdate ASC";
    else if (sort === "views_desc") orderClause = "ORDER BY p.viewcount DESC NULLS LAST, p.creationdate DESC";
    else if (sort === "views_asc") orderClause = "ORDER BY COALESCE(p.viewcount, 0) ASC, p.creationdate ASC";
    else if (sort === "time_desc") orderClause = "ORDER BY p.creationdate DESC, p.id DESC";
    else if (sort === "time_asc") orderClause = "ORDER BY p.creationdate ASC, p.id ASC";

    const searchSql = `
      SELECT
        p.id,
        p.title,
        p.score,
        p.viewcount         AS view_count,
        p.answercount       AS answer_count,
        p.commentcount      AS comment_count,
        p.creationdate      AS creation_date,
        p.ownerdisplayname  AS owner_display_name,
        p.tags
      FROM posts p
      WHERE p.posttypeid = 1
        AND ($1 = '' OR LOWER(COALESCE(p.title, '') || ' ' || p.body) LIKE '%' || $1 || '%')
        AND ($2 = '' OR p.tags ILIKE '%<' || $2 || '>%' OR p.tags ILIKE '%|' || $2 || '|%')
        AND COALESCE(p.viewcount, 0) >= $3
      ${orderClause}
      LIMIT $4 OFFSET $5
    `;
    const searchResult = await runQuery(engine, searchSql, [q, tagFilter, minViews, limit, offset], { inspect });

    const responseRows = searchResult.result.rows.map(mapSearchQuestion);
    const timingMs = searchResult.timingMs;

    res.json({
      meta: {
        timingMs,
        resultCount: responseRows.length,
        query: { q, tag, minViews, sort, limit, offset },
        engine,
        inspector: inspect
          ? [
              {
                name: "search",
                sql: searchSql.trim(),
                params: [q, tagFilter, minViews, limit, offset],
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
      await queryWithEngine(engine, "UPDATE posts SET viewcount = COALESCE(viewcount, 0) + 1 WHERE id = $1", [
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
    const ownerDisplayName = normalizeAuthor(req.body?.ownerDisplayName);

    if (!title) {
      return badRequest(res, "Question title is required");
    }

    if (!body) {
      return badRequest(res, "Question body is required");
    }

    const tags = normalizeTags(req.body?.tags);
    const tagString = formatPostTags(tags);

    const question = await withTransactionEngine(engine, async (client) => {
      const inserted = await client.query(
        `
        INSERT INTO posts (
          posttypeid, title, body, ownerdisplayname, tags,
          creationdate, contentlicense
        )
        VALUES (1, $1, $2, $3, $4, NOW(), 'CC BY-SA 4.0')
        RETURNING
          id, title, body,
          ownerdisplayname  AS owner_display_name,
          score,
          viewcount         AS view_count,
          answercount       AS answer_count,
          commentcount      AS comment_count,
          favoritecount     AS favorite_count,
          acceptedanswerid  AS accepted_answer_id,
          creationdate      AS creation_date,
          tags
        `,
        [title, body, ownerDisplayName, tagString]
      );

      const insertedQuestion = inserted.rows[0];

      for (const tagName of tags) {
        await upsertTag(client, tagName);
      }

      return {
        id: insertedQuestion.id,
        title: insertedQuestion.title,
        body: insertedQuestion.body,
        tags: parsePostTags(insertedQuestion.tags),
        ownerDisplayName: normalizeAuthor(insertedQuestion.owner_display_name),
        score: insertedQuestion.score,
        viewCount: insertedQuestion.view_count,
        answerCount: insertedQuestion.answer_count,
        commentCount: insertedQuestion.comment_count,
        favoriteCount: insertedQuestion.favorite_count,
        acceptedAnswerId: insertedQuestion.accepted_answer_id,
        creationDate: insertedQuestion.creation_date,
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
      UPDATE posts
      SET score = score + 1
      WHERE id = $1
      RETURNING id, score
      `,
      [questionId]
    );

    if (updated.rowCount === 0) {
      return notFound(res, `Question with id ${req.params.id} was not found`);
    }

    await queryWithEngine(
      engine,
      `
      INSERT INTO votes (id, postid, votetypeid, creationdate)
      VALUES ((SELECT COALESCE(MAX(id), 0) + 1 FROM votes), $1, 2, NOW())
      `,
      [questionId]
    );

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
    const ownerDisplayName = normalizeAuthor(req.body?.ownerDisplayName);

    if (!body) {
      return badRequest(res, "Answer body is required");
    }

    const answer = await withTransactionEngine(engine, async (client) => {
      const inserted = await client.query(
        `
        INSERT INTO posts (
          posttypeid, parentid, body, ownerdisplayname,
          creationdate, contentlicense
        )
        VALUES (2, $1, $2, $3, NOW(), 'CC BY-SA 4.0')
        RETURNING
          id,
          parentid          AS parent_id,
          ownerdisplayname  AS owner_display_name,
          score,
          body,
          creationdate      AS creation_date,
          commentcount      AS comment_count
        `,
        [questionId, body, ownerDisplayName]
      );

      await client.query(
        `
        UPDATE posts
        SET answercount = COALESCE(answercount, 0) + 1
        WHERE id = $1
        `,
        [questionId]
      );

      return inserted.rows[0];
    });

    return res.status(201).json({
      message: "Answer posted",
      data: {
        id: answer.id,
        parentId: answer.parent_id,
        ownerDisplayName: normalizeAuthor(answer.owner_display_name),
        score: answer.score,
        body: answer.body,
        creationDate: answer.creation_date,
        commentCount: answer.comment_count || 0,
        comments: []
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
      UPDATE posts
      SET score = score + 1
      WHERE id = $1 AND parentid = $2 AND posttypeid = 2
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

    await queryWithEngine(
      engine,
      `
      INSERT INTO votes (id, postid, votetypeid, creationdate)
      VALUES ((SELECT COALESCE(MAX(id), 0) + 1 FROM votes), $1, 2, NOW())
      `,
      [answerId]
    );

    return res.json({
      message: "Answer upvoted",
      data: updated.rows[0],
      meta: { engine }
    });
  })
);

app.post(
  "/question/:questionId/answers/:answerId/comments",
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

    const text = String(req.body?.text || req.body?.body || "").trim();
    const userDisplayName = normalizeAuthor(req.body?.userDisplayName);

    if (!text) {
      return badRequest(res, "Comment text is required");
    }

    const comment = await withTransactionEngine(engine, async (client) => {
      const inserted = await client.query(
        `
        INSERT INTO comments (
          postid, userdisplayname, text,
          creationdate, contentlicense
        )
        VALUES ($1, $2, $3, NOW(), 'CC BY-SA 4.0')
        RETURNING
          id,
          postid             AS post_id,
          userdisplayname    AS user_display_name,
          userid             AS user_id,
          score,
          text,
          creationdate       AS creation_date
        `,
        [answerId, userDisplayName, text]
      );

      await client.query(
        `
        UPDATE posts
        SET commentcount = COALESCE(commentcount, 0) + 1
        WHERE id = $1
        `,
        [answerId]
      );

      return inserted.rows[0];
    });

    return res.status(201).json({
      message: "Comment posted",
      data: {
        id: comment.id,
        postId: comment.post_id,
        userDisplayName: normalizeAuthor(comment.user_display_name),
        userId: comment.user_id,
        score: comment.score,
        text: comment.text,
        creationDate: comment.creation_date
      },
      meta: { engine }
    });
  })
);

app.post(
  "/question/:questionId/answers/:answerId/comments/:commentId/upvote",
  asyncHandler(async (req, res) => {
    const engine = getEngine(req);
    const questionId = toIntegerId(req.params.questionId);
    const answerId = toIntegerId(req.params.answerId);
    const commentId = toIntegerId(req.params.commentId);

    if (!questionId) {
      return notFound(res, `Question with id ${req.params.questionId} was not found`);
    }

    if (!answerId) {
      return notFound(res, `Answer with id ${req.params.answerId} was not found`);
    }

    if (!commentId) {
      return notFound(res, `Comment with id ${req.params.commentId} was not found`);
    }

    const updated = await queryWithEngine(
      engine,
      `
      UPDATE comments AS c
      SET score = c.score + 1
      FROM posts AS p
      WHERE c.id = $1
        AND c.postid = p.id
        AND p.id = $2
        AND p.parentid = $3
        AND p.posttypeid = 2
      RETURNING c.id, c.score
      `,
      [commentId, answerId, questionId]
    );

    if (updated.rowCount === 0) {
      if (!(await questionExists(engine, questionId))) {
        return notFound(res, `Question with id ${req.params.questionId} was not found`);
      }

      if (!(await answerBelongsToQuestion(engine, questionId, answerId))) {
        return notFound(res, `Answer with id ${req.params.answerId} was not found`);
      }

      return notFound(res, `Comment with id ${req.params.commentId} was not found`);
    }

    return res.json({
      message: "Comment upvoted",
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
      SELECT t.id, t.tagname AS tag_name, t.count
      FROM tags t
      WHERE ($1 = '' OR LOWER(t.tagname) LIKE '%' || $1 || '%')
      ORDER BY t.count DESC, t.tagname ASC
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
        name: row.tag_name,
        questionCount: row.count
      }))
    });
  })
);

app.get(
  "/benchmark",
  asyncHandler(async (req, res) => {
    const inspect = isInspectorEnabled(req);
    const searchTerm = String(req.query.q || "").trim().toLowerCase();
    const tagTerm = String(req.query.tag || "").trim().toLowerCase();
    const tagFilter = formatTagFilter(tagTerm);

    const BENCH_RUNS = 3;

    const queries = [
      {
        name: "search",
        sql: `
          SELECT p.id
          FROM posts p
          WHERE p.posttypeid = 1
            AND ($1 = '' OR LOWER(COALESCE(p.title, '') || ' ' || p.body) LIKE '%' || $1 || '%')
          ORDER BY p.score DESC, p.creationdate DESC
          LIMIT 25
        `,
        params: [searchTerm]
      },
      {
        name: "tag_filter",
        sql: `
          SELECT p.id
          FROM posts p
          WHERE p.posttypeid = 1
            AND ($1 = '' OR p.tags ILIKE '%<' || $1 || '>%' OR p.tags ILIKE '%|' || $1 || '|%')
          ORDER BY p.score DESC, p.creationdate DESC
          LIMIT 25
        `,
        params: [tagFilter]
      },
      {
        name: "posttype_score_aggregate",
        sql: `
          SELECT p.posttypeid, AVG(p.score) AS avg_score, COUNT(*) AS post_count
          FROM posts p
          GROUP BY p.posttypeid
          ORDER BY p.posttypeid
          LIMIT 10
        `,
        params: [],
        disableHashAgg: true
      }
    ];

    // Run a single engine sequentially: flush cache before each run, then record median
    async function runBenchmark(engine) {
      const results = [];
      for (const item of queries) {
        const timings = [];
        let lastOutcome;
        for (let i = 0; i < BENCH_RUNS; i++) {
          // Flush PostgreSQL plan cache and temp state between runs for fair measurement
          await withTransactionEngine(engine, async (client) => {
            await client.query("DISCARD ALL");
          });
          lastOutcome = await runQuery(engine, item.sql, item.params, {
            inspect,
            disableHashAgg: item.disableHashAgg
          });
          timings.push(lastOutcome.timingMs);
        }
        results.push({
          name: item.name,
          timingMs: median(timings),
          allRuns: timings,
          plan: inspect ? lastOutcome.plan : null
        });
      }
      return results;
    }

    // Run SEQUENTIALLY: baseline first, then vectorized — never in parallel
    const baseline = await runBenchmark("baseline");
    const vectorized = await runBenchmark("vectorized");

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
        benchRuns: BENCH_RUNS,
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
    const normalized = normalizeInspectSql(req.body?.sql);
    if (normalized.error) {
      return badRequest(res, normalized.error);
    }
    const sql = normalized.sql;

    async function inspectEngine(engine) {
      try {
        return await withTransactionEngine(engine, async (client) => {
          await client.query("SET TRANSACTION READ ONLY");
          await client.query("SET LOCAL statement_timeout = 60000");
          await client.query("SET LOCAL enable_indexscan = off");
          await client.query("SET LOCAL enable_bitmapscan = off");
          await client.query("SET LOCAL enable_hashagg = off");
          await client.query("SET LOCAL max_parallel_workers_per_gather = 0");

          const start = process.hrtime.bigint();
          let result, error = null;
          try {
            result = await client.query(sql, []);
          } catch (err) {
            error = err.message;
            result = null;
          }
          const execMs = Number(hrtimeToMs(start).toFixed(3));

          let plan = null;
          let planJson = null;

          if (!error) {
            const explainTextSql = engine === "vectorized"
              ? `EXPLAIN (FORMAT TEXT) ${sql}`
              : `EXPLAIN (ANALYZE, FORMAT TEXT) ${sql}`;
            const explainJsonSql = engine === "vectorized"
              ? `EXPLAIN (FORMAT JSON) ${sql}`
              : `EXPLAIN (ANALYZE, FORMAT JSON) ${sql}`;

            try {
              const explainText = await client.query(explainTextSql, []);
              plan = explainText.rows.map((r) => r["QUERY PLAN"]).join("\n");
            } catch (_) {}

            try {
              const explainJson = await client.query(explainJsonSql, []);
              planJson = explainJson.rows[0]["QUERY PLAN"];
            } catch (_) {}
          }

          const isVectorized = plan ? plan.includes("Vectorized Seq Scan") : false;

          let estimatedRows = null;
          let filteredRows = null;

          if (plan) {
            const lines = plan.split("\n");
            for (const line of lines) {
              if (/(?:Vectorized Seq Scan|Seq Scan)\s+on\s+\w+/.test(line)) {
                const rowsM = line.match(/actual time[^)]*rows=(\d+)/) ||
                  line.match(/cost=[^)]*rows=(\d+)/);
                if (rowsM) estimatedRows = parseInt(rowsM[1], 10);
              }
              const filterM = line.match(/Rows Removed by Filter:\s*(\d+)/);
              if (filterM) filteredRows = parseInt(filterM[1], 10);
            }
          }

          return {
            engine,
            execMs,
            rowCount: result ? result.rowCount : 0,
            error,
            plan,
            planJson,
            isVectorized,
            estimatedRows: estimatedRows,
            filteredRows: filteredRows
          };
        });
      } catch (err) {
        return {
          engine,
          execMs: 0,
          rowCount: 0,
          error: err.message,
          plan: null,
          planJson: null,
          isVectorized: false,
          estimatedRows: null,
          filteredRows: null
        };
      }
    }

    const baseline = await inspectEngine("baseline");
    const vectorized = await inspectEngine("vectorized");

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

const server = app.listen(port, () => {
  console.log(`StackFast backend listening on http://localhost:${port}`);
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${port} is already in use. Stop the existing backend or set PORT to another value.`);
  } else {
    console.error("Backend server failed to start", error);
  }

  process.exit(1);
});
