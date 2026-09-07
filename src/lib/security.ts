import {
  createHash,
  randomBytes,
  scrypt,
  timingSafeEqual,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";

export function token(): string {
  return randomBytes(32).toString("base64url");
}
export function hashToken(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
export function isAdminAccount(email: string, verified: boolean): boolean {
  return (
    verified &&
    !!process.env.ADMIN_EMAIL &&
    email === process.env.ADMIN_EMAIL.trim().toLowerCase()
  );
}
export function canUsePublicRecovery(email: string, managed: boolean): boolean {
  return !managed && email !== process.env.ADMIN_EMAIL?.trim().toLowerCase();
}
export function isAllowedOrigin(
  origin: string | null,
  host: string | null,
  appUrl?: string,
): boolean {
  try {
    const parsed = new URL(origin ?? "");
    return (
      ["https:", "http:"].includes(parsed.protocol) &&
      (appUrl ? parsed.origin === new URL(appUrl).origin : parsed.host === host)
    );
  } catch {
    return false;
  }
}
function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(
      password,
      salt,
      64,
      { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
      (error, key) => (error ? reject(error) : resolve(key)),
    ),
  );
}
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  return `scrypt$32768$8$1$${salt}$${(await derive(password, salt)).toString("hex")}`;
}
export async function verifyPassword(
  password: string,
  encoded: string,
): Promise<boolean> {
  const parts = encoded.split("$");
  if (
    parts.length !== 6 ||
    parts.slice(0, 4).join("$") !== "scrypt$32768$8$1" ||
    !/^[a-f0-9]{32}$/.test(parts[4]) ||
    !/^[a-f0-9]{128}$/.test(parts[5])
  )
    return false;
  return timingSafeEqual(
    await derive(password, parts[4]),
    Buffer.from(parts[5], "hex"),
  );
}
export function recoveryCodes(): string[] {
  return Array.from({ length: 8 }, () =>
    randomBytes(12).toString("hex").match(/.{6}/g)!.join("-"),
  );
}
export function normalizeRecoveryCode(code: string): string {
  return code.trim().toLowerCase().replace(/[\s-]/g, "");
}
export function sealCodes(codes: string[], sessionToken: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(
    "aes-256-gcm",
    Buffer.from(hashToken(sessionToken), "hex"),
    iv,
  );
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify({ codes, expires: Date.now() + 600000 })),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString(
    "base64url",
  );
}
export function openCodes(value: string, sessionToken: string): string[] {
  try {
    const bytes = Buffer.from(value, "base64url");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      Buffer.from(hashToken(sessionToken), "hex"),
      bytes.subarray(0, 12),
    );
    decipher.setAuthTag(bytes.subarray(12, 28));
    const result = JSON.parse(
      Buffer.concat([
        decipher.update(bytes.subarray(28)),
        decipher.final(),
      ]).toString(),
    );
    return result.expires > Date.now() &&
      Array.isArray(result.codes) &&
      result.codes.every((code: unknown) => typeof code === "string")
      ? result.codes
      : [];
  } catch {
    return [];
  }
}
