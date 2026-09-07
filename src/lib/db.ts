import { Pool, type PoolClient, type QueryResultRow } from "pg";

const globalDb = globalThis as typeof globalThis & { splatifyPool?: Pool };
export function pool(): Pool {
  if (!process.env.DATABASE_URL)
    throw new Error("DATABASE_URL is not configured");
  if (globalDb.splatifyPool) return globalDb.splatifyPool;
  const database = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    statement_timeout: 10000,
  });
  database.on("error", () =>
    console.error("Splatify database connection error"),
  );
  globalDb.splatifyPool = database;
  return database;
}
export async function query<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  values: unknown[] = [],
): Promise<T[]> {
  return (await pool().query<T>(sql, values)).rows;
}
export async function transaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
export async function logActivity(
  client: PoolClient,
  action: string,
  detail: string,
): Promise<void> {
  await client.query("INSERT INTO activity(action, detail) VALUES ($1, $2)", [
    action,
    detail.slice(0, 300),
  ]);
}
