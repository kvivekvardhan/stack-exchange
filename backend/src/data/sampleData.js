export const questions = [
  {
    id: 101,
    title: "How to optimize a SQL join on large tables?",
    body: "I have two large PostgreSQL tables and a join query that is slow. Which indexes and execution plan checks should I prioritize?",
    tags: ["postgresql", "sql", "performance"],
    score: 24,
    createdAt: "2026-03-18T09:20:00Z",
    answers: [
      {
        id: 5001,
        author: "db_ninja",
        score: 15,
        body: "Start with EXPLAIN ANALYZE, then check join type and missing indexes on filter and join columns."
      },
      {
        id: 5002,
        author: "planner_fan",
        score: 9,
        body: "Confirm table statistics are fresh via ANALYZE and avoid broad SELECT * projections."
      }
    ]
  },
  {
    id: 102,
    title: "React search box with debounce and loading state",
    body: "How can I avoid firing an API request on every key stroke in a React search page?",
    tags: ["reactjs", "javascript", "frontend"],
    score: 19,
    createdAt: "2026-03-20T11:42:00Z",
    answers: [
      {
        id: 5003,
        author: "ui_builder",
        score: 12,
        body: "Use a debounce utility with useEffect and clearTimeout; also cancel stale requests with AbortController."
      }
    ]
  },
  {
    id: 103,
    title: "Express API design for paginated search results",
    body: "What is a clean JSON shape for search results with metadata and timing?",
    tags: ["node.js", "express", "api"],
    score: 13,
    createdAt: "2026-03-21T13:05:00Z",
    answers: [
      {
        id: 5004,
        author: "restful_dev",
        score: 11,
        body: "Return meta and data separately. Keep totals, pagination, and timing in meta; records in data."
      }
    ]
  },
  {
    id: 104,
    title: "PostgreSQL full text search for tags and titles",
    body: "Should I use tsvector indexes or trigram indexes for mixed title and tag lookup?",
    tags: ["postgresql", "full-text-search", "indexing"],
    score: 31,
    createdAt: "2026-03-22T08:30:00Z",
    answers: [
      {
        id: 5005,
        author: "fts_guru",
        score: 23,
        body: "For natural language ranking, prefer tsvector and GIN; use trigram when fuzzy matching matters."
      }
    ]
  },
  {
    id: 105,
    title: "Measuring baseline vs vectorized query execution",
    body: "We are comparing vanilla PostgreSQL with a modified vectorized build. What metrics should we expose in an API?",
    tags: ["benchmarking", "postgresql", "database-engine"],
    score: 27,
    createdAt: "2026-03-24T16:55:00Z",
    answers: [
      {
        id: 5006,
        author: "perf_ops",
        score: 18,
        body: "Track p50/p95 latencies, row counts, CPU usage, and speedup ratio for repeatable query templates."
      }
    ]
  }
];

export const tagCatalog = [
  { name: "postgresql", description: "PostgreSQL database usage and tuning" },
  { name: "sql", description: "Structured query language" },
  { name: "performance", description: "Query and runtime optimization" },
  { name: "reactjs", description: "React front-end development" },
  { name: "express", description: "Express server framework" },
  { name: "benchmarking", description: "Performance measurements and comparisons" }
];

export const benchmarkSamples = [
  {
    id: "q-template-1",
    label: "Top questions by tag and score",
    baselineMs: 42.8,
    vectorizedMs: 28.1
  },
  {
    id: "q-template-2",
    label: "Recent questions with answer counts",
    baselineMs: 57.6,
    vectorizedMs: 36.4
  },
  {
    id: "q-template-3",
    label: "Keyword search in title/body",
    baselineMs: 63.9,
    vectorizedMs: 41.2
  }
];
