import type { PoolClient } from "pg";
import { emailSchema, nameSchema, passwordSchema } from "./validation";
import { hashPassword, verifyPassword } from "./security";
import { logActivity } from "./db";

export type AdminConfig = { email: string; name: string; password: string };
export class AdminProvisioningError extends Error {}

export function readAdminConfig(
  env: Record<string, string | undefined> = process.env,
): AdminConfig | null {
  const values = [env.ADMIN_EMAIL, env.ADMIN_NAME, env.ADMIN_PASSWORD];
  if (values.every((value) => value === undefined || value === "")) {
    if (env.NODE_ENV === "production")
      throw new AdminProvisioningError(
        "Production requires ADMIN_EMAIL, ADMIN_NAME and ADMIN_PASSWORD.",
      );
    return null;
  }
  const email = emailSchema.safeParse(env.ADMIN_EMAIL);
  const name = nameSchema.safeParse(env.ADMIN_NAME);
  const password = passwordSchema.safeParse(env.ADMIN_PASSWORD);
  if (
    !email.success ||
    !name.success ||
    !password.success ||
    !password.data.trim()
  ) {
    throw new AdminProvisioningError(
      "Set all of ADMIN_EMAIL, ADMIN_NAME and ADMIN_PASSWORD to valid values; the password must contain 12-128 characters.",
    );
  }
  return { email: email.data, name: name.data, password: password.data };
}

// The caller must hold a transaction. The shared advisory lock serializes provisioning
// across migration/startup processes; row locks serialize it with login and recovery.
export async function syncAdmin(
  client: PoolClient,
  config: AdminConfig | null,
): Promise<void> {
  await client.query("SELECT pg_advisory_xact_lock(735281946)");
  if (config) {
    const inserted = await client.query(
      "INSERT INTO users(name,email,password_hash,admin_verified) VALUES($1,$2,$3,true) ON CONFLICT(email) DO NOTHING RETURNING id",
      [config.name, config.email, await hashPassword(config.password)],
    );
    if (inserted.rowCount)
      await logActivity(
        client,
        "admin.provisioned",
        `Environment administrator ${inserted.rows[0].id} created`,
      );
  }
  const { rows } = await client.query<{
    id: string;
    email: string;
    name: string;
    password_hash: string;
    admin_verified: boolean;
  }>(
    "SELECT id,email,name,password_hash,admin_verified FROM users WHERE admin_verified OR email=$1 ORDER BY id FOR UPDATE",
    [config?.email ?? null],
  );
  const target = config
    ? rows.find((row) => row.email === config.email)
    : undefined;
  if (config && (!target || !target.admin_verified)) {
    throw new AdminProvisioningError(
      "Admin provisioning refused: ADMIN_EMAIL belongs to an ordinary account. Choose an unused email; ordinary accounts are never promoted automatically.",
    );
  }
  for (const row of rows) {
    if (row.id === target?.id) continue;
    await client.query("UPDATE users SET admin_verified=false WHERE id=$1", [
      row.id,
    ]);
    await client.query("DELETE FROM sessions WHERE user_id=$1", [row.id]);
    await client.query("DELETE FROM recovery_codes WHERE user_id=$1", [row.id]);
    await logActivity(
      client,
      "admin.demoted",
      `Environment administrator ${row.id} demoted; sessions and recovery codes revoked`,
    );
  }
  if (config && target) {
    const passwordChanged = !(await verifyPassword(
      config.password,
      target.password_hash,
    ));
    if (passwordChanged) {
      await client.query("UPDATE users SET password_hash=$2 WHERE id=$1", [
        target.id,
        await hashPassword(config.password),
      ]);
      await client.query("DELETE FROM sessions WHERE user_id=$1", [target.id]);
      await logActivity(
        client,
        "admin.password_changed",
        `Environment administrator ${target.id} password updated; sessions revoked`,
      );
    }
    // Also remove any legacy codes issued before admin management moved to the environment.
    await client.query("DELETE FROM recovery_codes WHERE user_id=$1", [
      target.id,
    ]);
    if (target.name !== config.name)
      await client.query("UPDATE users SET name=$2 WHERE id=$1", [
        target.id,
        config.name,
      ]);
  }
}
