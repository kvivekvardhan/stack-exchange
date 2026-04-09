import cors from "cors";
import express from "express";
import { benchmarkSamples, questions, tagCatalog } from "./data/sampleData.js";

const app = express();
const port = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

function hrtimeToMs(start) {
  const diffNs = process.hrtime.bigint() - start;
  return Number(diffNs) / 1_000_000;
}

let nextQuestionId = Math.max(...questions.map((item) => item.id)) + 1;
let nextAnswerId = Math.max(...questions.flatMap((item) => item.answers.map((answer) => answer.id))) + 1;
let nextReplyId =
  Math.max(
    0,
    ...questions.flatMap((item) =>
      item.answers.flatMap((answer) => (answer.replies || []).map((reply) => reply.id))
    )
  ) + 1;
const recentViewEvents = new Map();
const VIEW_DEBOUNCE_MS = 4000;

function findQuestionById(rawId) {
  const id = Number(rawId);
  if (!Number.isInteger(id)) {
    return null;
  }
  return questions.find((item) => item.id === id) || null;
}

function findAnswerById(question, rawId) {
  const id = Number(rawId);
  if (!Number.isInteger(id)) {
    return null;
  }
  return question.answers.find((answer) => answer.id === id) || null;
}

function findReplyById(answer, rawId) {
  const id = Number(rawId);
  if (!Number.isInteger(id)) {
    return null;
  }
  return (answer.replies || []).find((reply) => reply.id === id) || null;
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

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "stackfast-backend" });
});

app.get("/search", (req, res) => {
  const start = process.hrtime.bigint();
  const q = (req.query.q || "").trim().toLowerCase();
  const tag = (req.query.tag || "").trim().toLowerCase();

  let results = [...questions];

  if (q) {
    results = results.filter((item) => {
      const haystack = `${item.title} ${item.body}`.toLowerCase();
      return haystack.includes(q);
    });
  }

  if (tag) {
    results = results.filter((item) =>
      item.tags.some((itemTag) => itemTag.toLowerCase().includes(tag))
    );
  }

  results.sort((a, b) => b.score - a.score);

  const responseRows = results.map((item) => ({
    id: item.id,
    title: item.title,
    tags: item.tags,
    score: item.score,
    views: item.views || 0,
    answerCount: item.answers.length,
    createdAt: item.createdAt,
    askedBy: item.askedBy || "anonymous"
  }));

  const timingMs = Number(hrtimeToMs(start).toFixed(3));

  res.json({
    meta: {
      timingMs,
      resultCount: responseRows.length,
      query: { q, tag }
    },
    data: responseRows
  });
});

app.get("/question/:id", (req, res) => {
  const start = process.hrtime.bigint();
  const question = findQuestionById(req.params.id);

  if (!question) {
    return notFound(res, `Question with id ${req.params.id} was not found`);
  }

  if (shouldCountView(req, question.id)) {
    question.views = (question.views || 0) + 1;
  }
  const timingMs = Number(hrtimeToMs(start).toFixed(3));

  return res.json({
    meta: {
      timingMs
    },
    data: question
  });
});

app.post("/questions", (req, res) => {
  const title = String(req.body?.title || "").trim();
  const body = String(req.body?.body || "").trim();
  const rawTags = String(req.body?.tags || "");
  const author = String(req.body?.author || "anonymous").trim() || "anonymous";

  if (!title) {
    return badRequest(res, "Question title is required");
  }

  if (!body) {
    return badRequest(res, "Question body is required");
  }

  const tags = rawTags
    .split(",")
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 5);

  const question = {
    id: nextQuestionId++,
    title,
    body,
    tags,
    askedBy: author,
    score: 0,
    views: 0,
    createdAt: new Date().toISOString(),
    answers: []
  };

  questions.unshift(question);

  return res.status(201).json({
    message: "Question posted",
    data: question
  });
});

app.post("/question/:id/upvote", (req, res) => {
  const question = findQuestionById(req.params.id);
  if (!question) {
    return notFound(res, `Question with id ${req.params.id} was not found`);
  }

  question.score += 1;

  return res.json({
    message: "Question upvoted",
    data: {
      id: question.id,
      score: question.score
    }
  });
});

app.post("/question/:id/answers", (req, res) => {
  const question = findQuestionById(req.params.id);
  if (!question) {
    return notFound(res, `Question with id ${req.params.id} was not found`);
  }

  const body = String(req.body?.body || "").trim();
  const author = String(req.body?.author || "anonymous").trim() || "anonymous";

  if (!body) {
    return badRequest(res, "Answer body is required");
  }

  const answer = {
    id: nextAnswerId++,
    author,
    score: 0,
    body,
    createdAt: new Date().toISOString(),
    replies: []
  };

  question.answers.push(answer);

  return res.status(201).json({
    message: "Answer posted",
    data: answer
  });
});

app.post("/question/:questionId/answers/:answerId/upvote", (req, res) => {
  const question = findQuestionById(req.params.questionId);
  if (!question) {
    return notFound(res, `Question with id ${req.params.questionId} was not found`);
  }

  const answer = findAnswerById(question, req.params.answerId);
  if (!answer) {
    return notFound(res, `Answer with id ${req.params.answerId} was not found`);
  }

  answer.score += 1;

  return res.json({
    message: "Answer upvoted",
    data: {
      id: answer.id,
      score: answer.score
    }
  });
});

app.post("/question/:questionId/answers/:answerId/replies", (req, res) => {
  const question = findQuestionById(req.params.questionId);
  if (!question) {
    return notFound(res, `Question with id ${req.params.questionId} was not found`);
  }

  const answer = findAnswerById(question, req.params.answerId);
  if (!answer) {
    return notFound(res, `Answer with id ${req.params.answerId} was not found`);
  }

  const body = String(req.body?.body || "").trim();
  const author = String(req.body?.author || "anonymous").trim() || "anonymous";

  if (!body) {
    return badRequest(res, "Reply body is required");
  }

  const reply = {
    id: nextReplyId++,
    author,
    score: 0,
    body,
    createdAt: new Date().toISOString()
  };

  if (!answer.replies) {
    answer.replies = [];
  }
  answer.replies.push(reply);

  return res.status(201).json({
    message: "Reply posted",
    data: reply
  });
});

app.post("/question/:questionId/answers/:answerId/replies/:replyId/upvote", (req, res) => {
  const question = findQuestionById(req.params.questionId);
  if (!question) {
    return notFound(res, `Question with id ${req.params.questionId} was not found`);
  }

  const answer = findAnswerById(question, req.params.answerId);
  if (!answer) {
    return notFound(res, `Answer with id ${req.params.answerId} was not found`);
  }

  const reply = findReplyById(answer, req.params.replyId);
  if (!reply) {
    return notFound(res, `Reply with id ${req.params.replyId} was not found`);
  }

  reply.score += 1;

  return res.json({
    message: "Reply upvoted",
    data: {
      id: reply.id,
      score: reply.score
    }
  });
});

app.get("/tags", (_req, res) => {
  const start = process.hrtime.bigint();

  const counts = questions.reduce((acc, item) => {
    item.tags.forEach((tag) => {
      acc[tag] = (acc[tag] || 0) + 1;
    });
    return acc;
  }, {});

  const data = Object.entries(counts)
    .map(([name, questionCount]) => {
      const catalog = tagCatalog.find((tag) => tag.name === name);
      return {
        name,
        questionCount,
        description: catalog?.description || "No description available"
      };
    })
    .sort((a, b) => b.questionCount - a.questionCount || a.name.localeCompare(b.name));

  const timingMs = Number(hrtimeToMs(start).toFixed(3));

  res.json({
    meta: {
      timingMs,
      totalTags: data.length
    },
    data
  });
});

app.get("/benchmark", (_req, res) => {
  const start = process.hrtime.bigint();

  const data = benchmarkSamples.map((sample) => {
    const speedup = Number((sample.baselineMs / sample.vectorizedMs).toFixed(2));
    return {
      ...sample,
      speedup
    };
  });

  const timingMs = Number(hrtimeToMs(start).toFixed(3));

  res.json({
    meta: {
      timingMs,
      queryCount: data.length
    },
    queryInspector: {
      sql: "EXPLAIN ANALYZE <query-template>",
      note: "Benchmark endpoint currently returns seeded timings"
    },
    data
  });
});

app.use((req, res) => {
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: `No route found for ${req.method} ${req.path}`
    }
  });
});

app.listen(port, () => {
  console.log(`StackFast backend listening on http://localhost:${port}`);
});
