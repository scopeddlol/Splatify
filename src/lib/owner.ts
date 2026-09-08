import type { PoolClient } from "pg";
import { requireAdmin, requireActiveSession } from "./auth";
import { query } from "./db";
import { isAdminAccount, verifyPassword } from "./security";
import { PublicError } from "./validation";

export async function lockOwner(
  client: PoolClient,
  id: string,
  password: string,
): Promise<void> {
  const {
    rows: [owner],
  } = await client.query(
    "SELECT email,admin_verified,password_hash FROM users WHERE id=$1 FOR UPDATE",
    [id],
  );
  await requireActiveSession(client, id);
  if (!owner || !isAdminAccount(owner.email, owner.admin_verified))
    throw new PublicError("Owner access required.");
  if (
    !password ||
    password.length > 128 ||
    !(await verifyPassword(password, owner.password_hash))
  )
    throw new PublicError("Current owner password is incorrect.");
}

export async function getOwnerAccounts(search = "", requestedPage = 1) {
  await requireAdmin();
  const term = search.trim().slice(0, 100);
  const page = Number.isSafeInteger(requestedPage)
    ? Math.max(1, Math.min(100000, requestedPage))
    : 1;
  const where =
    "($1='' OR strpos(lower(u.name),lower($1))>0 OR strpos(lower(u.email),lower($1))>0)";
  const [count] = await query<{ total: number }>(
    `SELECT count(*)::int AS total FROM users u WHERE ${where}`,
    [term],
  );
  const accounts = await query<{
    id: string;
    name: string;
    email: string;
    createdAt: string;
    isManaged: boolean;
    eventCount: number;
  }>(
    `SELECT u.id,u.name,u.email,to_char(u.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "createdAt",(u.admin_verified OR u.email=$3) AS "isManaged",(SELECT count(*)::int FROM events e WHERE e.owner_id=u.id) AS "eventCount" FROM users u WHERE ${where} ORDER BY u.created_at DESC,u.id LIMIT 20 OFFSET $2`,
    [
      term,
      (page - 1) * 20,
      process.env.ADMIN_EMAIL?.trim().toLowerCase() ?? "",
    ],
  );
  return { accounts, total: count.total, page, pageSize: 20 };
}
