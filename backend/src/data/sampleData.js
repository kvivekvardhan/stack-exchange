export const questions = [
  {
    id: 101,
    title: "How to optimize a SQL join on large tables?",
    body: "I have two large PostgreSQL tables and a join query that is slow. Which indexes and execution plan checks should I prioritize?",
    tags: ["postgresql", "sql", "performance"],
    askedBy: "query_newbie",
    score: 24,
    views: 186,
    createdAt: "2026-03-18T09:20:00Z",
    answers: [
      {
        id: 5001,
        author: "db_ninja",
        score: 15,
        createdAt: "2026-03-18T10:03:00Z",
        body: "Start with EXPLAIN ANALYZE, then check join type and missing indexes on filter and join columns.",
        replies: [
          {
            id: 9001,
            author: "ops_helper",
            score: 3,
            createdAt: "2026-03-18T11:10:00Z",
            body: "Also watch for row estimate mismatch in the plan output."
          }
        ]
      },
      {
        id: 5002,
        author: "planner_fan",
        score: 9,
        createdAt: "2026-03-18T11:25:00Z",
        body: "Confirm table statistics are fresh via ANALYZE and avoid broad SELECT * projections.",
        replies: []
      }
    ]
  },
  {
    id: 102,
    title: "React search box with debounce and loading state",
    body: "How can I avoid firing an API request on every key stroke in a React search page?",
    tags: ["reactjs", "javascript", "frontend"],
    askedBy: "student_dev",
    score: 19,
    views: 152,
    createdAt: "2026-03-20T11:42:00Z",
    answers: [
      {
        id: 5003,
        author: "ui_builder",
        score: 12,
        createdAt: "2026-03-20T12:18:00Z",
        body: "Use a debounce utility with useEffect and clearTimeout; also cancel stale requests with AbortController.",
        replies: []
      }
    ]
  },
  {
    id: 103,
    title: "Express API design for paginated search results",
    body: "What is a clean JSON shape for search results with metadata and timing?",
    tags: ["node.js", "express", "api"],
    askedBy: "rest_learner",
    score: 13,
    views: 97,
    createdAt: "2026-03-21T13:05:00Z",
    answers: [
      {
        id: 5004,
        author: "restful_dev",
        score: 11,
        createdAt: "2026-03-21T13:35:00Z",
        body: "Return meta and data separately. Keep totals, pagination, and timing in meta; records in data.",
        replies: []
      }
    ]
  },
  {
    id: 104,
    title: "PostgreSQL full text search for tags and titles",
    body: "Should I use tsvector indexes or trigram indexes for mixed title and tag lookup?",
    tags: ["postgresql", "full-text-search", "indexing"],
    askedBy: "fts_beginner",
    score: 31,
    views: 233,
    createdAt: "2026-03-22T08:30:00Z",
    answers: [
      {
        id: 5005,
        author: "fts_guru",
        score: 23,
        createdAt: "2026-03-22T09:08:00Z",
        body: "For natural language ranking, prefer tsvector and GIN; use trigram when fuzzy matching matters.",
        replies: [
          {
            id: 9002,
            author: "index_tuner",
            score: 2,
            createdAt: "2026-03-22T10:01:00Z",
            body: "For typo tolerance you can combine trigram for fallback search."
          }
        ]
      }
    ]
  },
  {
    id: 105,
    title: "Measuring baseline vs vectorized query execution",
    body: "We are comparing vanilla PostgreSQL with a modified vectorized build. What metrics should we expose in an API?",
    tags: ["benchmarking", "postgresql", "database-engine"],
    askedBy: "perf_researcher",
    score: 27,
    views: 204,
    createdAt: "2026-03-24T16:55:00Z",
    answers: [
      {
        id: 5006,
        author: "perf_ops",
        score: 18,
        createdAt: "2026-03-24T18:20:00Z",
        body: "Track p50/p95 latencies, row counts, CPU usage, and speedup ratio for repeatable query templates.",
        replies: []
      }
    ]
  },
  {
    id: 106,
    title: "Vite dev server proxy not forwarding API requests",
    body: "My React app on Vite runs on port 5173 and backend on 4000. How should I configure proxy for /api routes without CORS issues?",
    tags: ["vite", "reactjs", "api"],
    askedBy: "fullstack_learner",
    score: 16,
    views: 141,
    createdAt: "2026-03-25T09:12:00Z",
    answers: [
      {
        id: 5007,
        author: "vite_helper",
        score: 14,
        createdAt: "2026-03-25T10:00:00Z",
        body: "Set server.proxy in vite.config with target http://localhost:4000 and changeOrigin true for API paths.",
        replies: [
          {
            id: 9003,
            author: "cors_debugger",
            score: 2,
            createdAt: "2026-03-25T10:22:00Z",
            body: "Also confirm your frontend calls /api path instead of hardcoded backend URL."
          }
        ]
      }
    ]
  },
  {
    id: 107,
    title: "Designing JWT refresh token flow in Express",
    body: "What is a practical refresh-token flow in Express for short-lived access tokens and secure logout?",
    tags: ["node.js", "express", "jwt", "auth"],
    askedBy: "secure_login",
    score: 29,
    views: 267,
    createdAt: "2026-03-26T14:48:00Z",
    answers: [
      {
        id: 5008,
        author: "auth_architect",
        score: 21,
        createdAt: "2026-03-26T15:30:00Z",
        body: "Store hashed refresh tokens server-side, rotate on each refresh, and revoke token family on suspicious reuse.",
        replies: []
      },
      {
        id: 5009,
        author: "cookie_guard",
        score: 7,
        createdAt: "2026-03-26T16:10:00Z",
        body: "Use httpOnly + secure cookies for refresh tokens and keep access token short lived in memory.",
        replies: []
      }
    ]
  },
  {
    id: 108,
    title: "React list rendering slows down with 5k rows",
    body: "A plain map over 5000 rows causes jank when filtering. Should I memoize rows or use virtualization first?",
    tags: ["reactjs", "performance", "frontend"],
    askedBy: "ui_perf_noob",
    score: 22,
    views: 198,
    createdAt: "2026-03-27T07:05:00Z",
    answers: [
      {
        id: 5010,
        author: "render_profiler",
        score: 18,
        createdAt: "2026-03-27T07:40:00Z",
        body: "Virtualize first to reduce DOM nodes, then memoize expensive cells based on stable keys and props.",
        replies: [
          {
            id: 9004,
            author: "list_tuner",
            score: 4,
            createdAt: "2026-03-27T08:02:00Z",
            body: "Debounce filter input too, it helps prevent unnecessary re-renders."
          }
        ]
      }
    ]
  },
  {
    id: 109,
    title: "Prisma schema relation for user, question, and vote tables",
    body: "How do I model a unique user vote per question while also allowing answer votes in Prisma?",
    tags: ["prisma", "database-design", "sql"],
    askedBy: "schema_builder",
    score: 14,
    views: 123,
    createdAt: "2026-03-28T18:22:00Z",
    answers: [
      {
        id: 5011,
        author: "orm_guide",
        score: 11,
        createdAt: "2026-03-28T19:01:00Z",
        body: "Use separate vote models with composite unique constraints like @@unique([userId, questionId]).",
        replies: []
      }
    ]
  },
  {
    id: 110,
    title: "Docker compose healthcheck for Node + Postgres startup order",
    body: "My API container starts before Postgres is ready and crashes on boot migrations. What is the clean compose setup?",
    tags: ["docker", "node.js", "postgresql"],
    askedBy: "container_runner",
    score: 26,
    views: 245,
    createdAt: "2026-03-29T06:35:00Z",
    answers: [
      {
        id: 5012,
        author: "infra_ops",
        score: 19,
        createdAt: "2026-03-29T07:12:00Z",
        body: "Add a db healthcheck and use depends_on with condition service_healthy before starting API.",
        replies: []
      },
      {
        id: 5013,
        author: "migration_safe",
        score: 6,
        createdAt: "2026-03-29T08:20:00Z",
        body: "Wrap migrations in retry logic too, since orchestrator ordering alone is not always enough.",
        replies: []
      }
    ]
  },
  {
    id: 111,
    title: "How to cache expensive leaderboard query with Redis",
    body: "I have a leaderboard query that aggregates votes and views. What cache strategy keeps it fresh without overloading DB?",
    tags: ["redis", "performance", "api"],
    askedBy: "cache_beginner",
    score: 18,
    views: 176,
    createdAt: "2026-03-30T13:15:00Z",
    answers: [
      {
        id: 5014,
        author: "cache_master",
        score: 15,
        createdAt: "2026-03-30T14:02:00Z",
        body: "Use cache-aside with short TTL and invalidate keys on vote/write events that affect ranking.",
        replies: [
          {
            id: 9005,
            author: "latency_hacker",
            score: 3,
            createdAt: "2026-03-30T14:18:00Z",
            body: "For heavy traffic, precompute top-N every minute and serve stale-while-revalidate."
          }
        ]
      }
    ]
  },
  {
    id: 112,
    title: "TypeScript type-safe API client for Express endpoints",
    body: "What is a lightweight way to keep frontend API response types in sync with an Express backend?",
    tags: ["typescript", "api", "frontend"],
    askedBy: "typesafe_dev",
    score: 17,
    views: 162,
    createdAt: "2026-03-31T10:41:00Z",
    answers: [
      {
        id: 5015,
        author: "ts_fan",
        score: 13,
        createdAt: "2026-03-31T11:20:00Z",
        body: "Share DTO types in a common package and validate runtime payloads with zod to avoid drift.",
        replies: []
      }
    ]
  },
  {
    id: 113,
    title: "CSS modal closes when clicking inside because of bubbling",
    body: "My popup closes even when typing in the form. How should I handle click events correctly on overlay and modal card?",
    tags: ["css", "javascript", "frontend"],
    askedBy: "modal_debug",
    score: 11,
    views: 109,
    createdAt: "2026-04-01T08:55:00Z",
    answers: [
      {
        id: 5016,
        author: "event_loop",
        score: 10,
        createdAt: "2026-04-01T09:26:00Z",
        body: "Attach close handler to backdrop and stop propagation on modal content container.",
        replies: [
          {
            id: 9006,
            author: "ui_guard",
            score: 2,
            createdAt: "2026-04-01T09:40:00Z",
            body: "Also disable close while submit is in progress to prevent accidental data loss."
          }
        ]
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
  { name: "benchmarking", description: "Performance measurements and comparisons" },
  { name: "api", description: "API design and integration patterns" },
  { name: "frontend", description: "Frontend architecture and UI behavior" },
  { name: "node.js", description: "Node.js runtime and server development" },
  { name: "vite", description: "Vite tooling and dev server setup" },
  { name: "jwt", description: "JSON Web Token authentication patterns" },
  { name: "auth", description: "Authentication and authorization workflows" },
  { name: "prisma", description: "Prisma ORM schema and query design" },
  { name: "database-design", description: "Schema modeling and data relationships" },
  { name: "docker", description: "Containerization and docker-compose setup" },
  { name: "redis", description: "Redis caching and fast data access" },
  { name: "typescript", description: "TypeScript typing and tooling" },
  { name: "css", description: "CSS styling, layout, and interaction" },
  { name: "javascript", description: "JavaScript language and browser behavior" }
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
