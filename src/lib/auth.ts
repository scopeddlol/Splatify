import { cookies, headers } from "next/headers";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import type { PoolClient } from "pg";
import { query } from "./db";
import {
  hashToken,
  openCodes,
  sealCodes,
  token,
  isAdminAccount,
  isAllowedOrigin,
} from "./security";
import { PublicError, tokenSchema } from "./validation";
import type { User } from "./types";

export const SESSION_COOKIE = "splatify_session";
const RECOVERY_COOKIE = "splatify_recovery";
export const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};
export function guestCookieName(eventId: string): string {
  return `splatify_guest_${eventId}`;
}
export { isAdminAccount } from "./security";
export async function getUser(): Promise<User | null> {
  await connection();
  const value = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!value || !tokenSchema.safeParse(value).success) return null;
  const [row] = await query(
    "SELECT u.id,u.name,u.email,u.admin_verified FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=$1 AND s.expires_at>now()",
    [hashToken(value)],
  );
  return row
    ? {
        id: row.id,
        name: row.name,
        email: row.email,
        isAdmin: isAdminAccount(row.email, row.admin_verified),
      }
    : null;
}
export async function requireUser(): Promise<User> {
  const user = await getUser();
  if (!user)
    redirect(
      "/login?error=" + encodeURIComponent("Please sign in to continue."),
    );
  return user;
}
export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (!user.isAdmin) throw new PublicError("Administrator access required.");
  return user;
}
export async function createSession(
  client: PoolClient,
  userId: string,
): Promise<string> {
  const raw = token();
  await client.query(
    "DELETE FROM sessions WHERE user_id=$1 AND (expires_at<=now() OR token_hash IN (SELECT token_hash FROM sessions WHERE user_id=$1 ORDER BY created_at DESC OFFSET 9))",
    [userId],
  );
  await client.query(
    "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '30 days')",
    [hashToken(raw), userId],
  );
  return raw;
}
export async function setSession(raw: string, codes?: string[]): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, raw, { ...cookieOptions, maxAge: 30 * 86400 });
  jar.set(RECOVERY_COOKIE, codes ? sealCodes(codes, raw) : "", {
    ...cookieOptions,
    maxAge: codes ? 600 : 0,
  });
}
export async function clearSession(): Promise<void> {
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;
  if (raw)
    await query("DELETE FROM sessions WHERE token_hash=$1", [hashToken(raw)]);
  jar.set(SESSION_COOKIE, "", { ...cookieOptions, maxAge: 0 });
  jar.set(RECOVERY_COOKIE, "", { ...cookieOptions, maxAge: 0 });
}
export async function clearRecovery(): Promise<void> {
  (await cookies()).set(RECOVERY_COOKIE, "", { ...cookieOptions, maxAge: 0 });
}
export async function getRecoveryCodes(): Promise<string[]> {
  if (!(await getUser())) return [];
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;
  const sealed = jar.get(RECOVERY_COOKIE)?.value;
  return raw && sealed ? openCodes(sealed, raw) : [];
}
export async function guestToken(eventId: string): Promise<string | null> {
  const value = (await cookies()).get(guestCookieName(eventId))?.value;
  return value && tokenSchema.safeParse(value).success ? value : null;
}
export async function setGuestToken(
  eventId: string,
  raw: string,
): Promise<void> {
  (await cookies()).set(guestCookieName(eventId), raw, {
    ...cookieOptions,
    maxAge: 365 * 86400,
  });
}
export async function rateLimit(
  key: string,
  limit: number,
  seconds: number,
): Promise<void> {
  const [row] = await query(
    `INSERT INTO rate_limits(key_hash,hits,expires_at) VALUES($1,1,now()+make_interval(secs=>$2))
    ON CONFLICT(key_hash) DO UPDATE SET hits=CASE WHEN rate_limits.expires_at<=now() THEN 1 ELSE rate_limits.hits+1 END,
    expires_at=CASE WHEN rate_limits.expires_at<=now() THEN now()+make_interval(secs=>$2) ELSE rate_limits.expires_at END RETURNING hits`,
    [hashToken(key), seconds],
  );
  if (row.hits > limit)
    throw new PublicError("Too many attempts. Please try again later.");
}
export async function protectAction(): Promise<void> {
  const h = await headers();
  if (!isAllowedOrigin(h.get("origin"), h.get("host"), process.env.APP_URL))
    throw new PublicError(
      "Invalid request origin. Refresh the page and try again.",
    );
  // Only trust a proxy that strips and replaces the incoming client IP header.
  const ip =
    process.env.TRUST_PROXY === "1"
      ? h.get("x-forwarded-for")?.split(",")[0].trim().slice(0, 100) ||
        "unknown"
      : "shared";
  await rateLimit(
    `request:${ip}`,
    process.env.TRUST_PROXY === "1" ? 150 : 600,
    60,
  );
}
