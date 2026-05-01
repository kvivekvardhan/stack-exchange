import "dotenv/config";
import pg from "pg";

const { Pool } = pg;

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function buildPoolConfig(connectionString) {
  const fromConnectionString = connectionString
    ? {
        connectionString
      }
    : {
        host: process.env.PGHOST || "localhost",
        port: toNumber(process.env.PGPORT, 5432),
        user: process.env.PGUSER || "postgres",
        password: process.env.PGPASSWORD || "postgres",
        database: process.env.PGDATABASE || "stackfast"
      };

  const useSsl =
    process.env.DATABASE_SSL === "true" ||
    process.env.PGSSLMODE === "require" ||
    process.env.PGSSL === "true";

  if (!useSsl) {
    return fromConnectionString;
  }

  return {
    ...fromConnectionString,
    ssl: {
      rejectUnauthorized: false
    }
  };
}

const pool = new Pool(buildPoolConfig(process.env.DATABASE_URL));
const baselinePool = new Pool(
  buildPoolConfig(process.env.BASELINE_DATABASE_URL || process.env.DATABASE_URL)
);
const vectorPool = new Pool(
  buildPoolConfig(process.env.VECTOR_DATABASE_URL || process.env.DATABASE_URL)
);

function shouldDisableParallelScans(engine) {
  return engine === "baseline" || engine === "vectorized";
}

function handlePoolError(label) {
  return (error) => {
    console.error(`Unexpected PostgreSQL pool error (${label})`, error);
  };
}

pool.on("error", handlePoolError("default"));
baselinePool.on("error", handlePoolError("baseline"));
vectorPool.on("error", handlePoolError("vectorized"));

function resolvePool(engine) {
  if (engine === "vectorized") {
    return vectorPool;
  }
  if (engine === "baseline") {
    return baselinePool;
  }
  return pool;
}

export async function query(text, params = []) {
  return pool.query(text, params);
}

export async function queryWithEngine(engine, text, params = []) {
  if (shouldDisableParallelScans(engine)) {
    return withTransactionEngine(engine, (client) => client.query(text, params));
  }

  return resolvePool(engine).query(text, params);
}

export async function discardEngineSession(engine) {
  const client = await resolvePool(engine).connect();
  try {
    await client.query("DISCARD ALL");
  } finally {
    client.release();
  }
}

export async function withTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error("Failed to rollback PostgreSQL transaction", rollbackError);
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function withTransactionEngine(engine, work) {
  const client = await resolvePool(engine).connect();
  try {
    await client.query("BEGIN");
    if (shouldDisableParallelScans(engine)) {
      await client.query("SET LOCAL max_parallel_workers_per_gather = 0");
    }
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error(`Failed to rollback PostgreSQL transaction (${engine})`, rollbackError);
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function closePool() {
  await pool.end();
  await baselinePool.end();
  await vectorPool.end();
}
