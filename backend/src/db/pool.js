import "dotenv/config";
import pg from "pg";

const { Pool } = pg;

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function buildPoolConfig() {
  const fromConnectionString = process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL
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

const pool = new Pool(buildPoolConfig());

pool.on("error", (error) => {
  console.error("Unexpected PostgreSQL pool error", error);
});

export async function query(text, params = []) {
  return pool.query(text, params);
}

export async function withTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function closePool() {
  await pool.end();
}
