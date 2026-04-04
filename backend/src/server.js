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

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "stackfast-backend" });
});

app.get("/search", (req, res) => {
  const start = process.hrtime.bigint();
  const engine = req.query.engine || "baseline";
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
      item.tags.some((itemTag) => itemTag.toLowerCase() === tag)
    );
  }

  results.sort((a, b) => b.score - a.score);

  const responseRows = results.map((item) => ({
    id: item.id,
    title: item.title,
    tags: item.tags,
    score: item.score,
    answerCount: item.answers.length,
    createdAt: item.createdAt
  }));

  const timingMs = Number(hrtimeToMs(start).toFixed(3));

  res.json({
    meta: {
      engine,
      timingMs,
      resultCount: responseRows.length,
      query: { q, tag }
    },
    queryInspector: {
      sql: "SELECT id, title, tags, score FROM posts WHERE title_body @@ $1 AND tag = $2 ORDER BY score DESC LIMIT 50",
      note: "Placeholder SQL template for checkpoint demo"
    },
    data: responseRows
  });
});

app.get("/question/:id", (req, res) => {
  const start = process.hrtime.bigint();
  const engine = req.query.engine || "baseline";
  const id = Number(req.params.id);
  const question = questions.find((item) => item.id === id);

  if (!question) {
    return res.status(404).json({
      error: {
        code: "QUESTION_NOT_FOUND",
        message: `Question with id ${req.params.id} was not found`
      }
    });
  }

  const timingMs = Number(hrtimeToMs(start).toFixed(3));

  return res.json({
    meta: {
      engine,
      timingMs
    },
    queryInspector: {
      sql: "SELECT * FROM posts LEFT JOIN answers ON answers.parent_id = posts.id WHERE posts.id = $1",
      note: "Placeholder detail query"
    },
    data: question
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
