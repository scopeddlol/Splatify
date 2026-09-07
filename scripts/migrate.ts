import { loadEnvConfig } from "@next/env";
import { readFile } from "node:fs/promises";
import { pool, transaction } from "../src/lib/db";
import {
  AdminProvisioningError,
  readAdminConfig,
  syncAdmin,
} from "../src/lib/provision-admin";

loadEnvConfig(process.cwd());
async function main() {
  const admin = readAdminConfig();
  if (!admin)
    console.warn(
      "Administrator environment is absent; local mode will disable any previously managed administrator.",
    );
  const sql = await readFile(
    new URL("../src/lib/schema.sql", import.meta.url),
    "utf8",
  );
  await transaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(735281946)");
    await client.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    const applied = await client.query(
      "SELECT version FROM schema_migrations WHERE version = 1",
    );
    if (!applied.rowCount) {
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations(version) VALUES (1)");
    }
    await syncAdmin(client, admin);
    await client.query("DELETE FROM sessions WHERE expires_at <= now()");
    await client.query("DELETE FROM rate_limits WHERE expires_at <= now()");
    await client.query(
      "DELETE FROM activity WHERE created_at < now() - interval '180 days'",
    );
  });
  console.info("Database migrations complete.");
}
main()
  .catch((error) => {
    console.error(
      error instanceof AdminProvisioningError
        ? error.message
        : "Migration failed. Check DATABASE_URL, PostgreSQL connectivity and schema compatibility.",
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    if (process.env.DATABASE_URL) await pool().end();
  });
