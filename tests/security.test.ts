import assert from "node:assert/strict";
import { test } from "node:test";
import {
  hashPassword,
  verifyPassword,
  token,
  hashToken,
  recoveryCodes,
  normalizeRecoveryCode,
  sealCodes,
  openCodes,
  isAdminAccount,
  isAllowedOrigin,
  canUsePublicRecovery,
} from "../src/lib/security";

test("password hashes are salted, scrypt-based, and verify only the correct password", async () => {
  const password = "a long and unique password";
  const first = await hashPassword(password);
  const second = await hashPassword(password);
  assert.notEqual(first, second);
  assert.match(first, /^scrypt\$32768\$8\$1\$/);
  assert.equal(await verifyPassword(password, first), true);
  assert.equal(await verifyPassword("wrong password", first), false);
  assert.equal(await verifyPassword(password, "malformed"), false);
  assert.equal(
    await verifyPassword(password, first.replace("32768", "1073741824")),
    false,
  );
});
test("bearer tokens have 256 bits of entropy and database hashes are deterministic", () => {
  const values = Array.from({ length: 100 }, token);
  assert.equal(new Set(values).size, 100);
  for (const value of values) {
    assert.match(value, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(Buffer.from(value, "base64url").length, 32);
    assert.match(hashToken(value), /^[a-f0-9]{64}$/);
    assert.notEqual(hashToken(value), value);
  }
  assert.equal(hashToken("example"), hashToken("example"));
});
test("recovery codes are unique 96-bit secrets with forgiving formatting", () => {
  const codes = recoveryCodes();
  assert.equal(codes.length, 8);
  assert.equal(new Set(codes).size, 8);
  for (const code of codes) {
    assert.match(code, /^[a-f0-9]{6}(-[a-f0-9]{6}){3}$/);
    assert.equal(
      normalizeRecoveryCode(` ${code.toUpperCase()} `),
      code.replaceAll("-", ""),
    );
  }
});
test("recovery display is encrypted, authenticated and session-bound", () => {
  const codes = recoveryCodes();
  const session = token();
  const sealed = sealCodes(codes, session);
  assert.deepEqual(openCodes(sealed, session), codes);
  assert.deepEqual(openCodes(sealed, token()), []);
  const bytes = Buffer.from(sealed, "base64url");
  bytes[30] ^= 1;
  assert.deepEqual(openCodes(bytes.toString("base64url"), session), []);
  assert.deepEqual(openCodes("invalid", session), []);
  assert.equal(sealed.includes(codes[0]), false);
});
test("recovery display expires even if a browser retains the cookie", () => {
  const now = Date.now;
  try {
    const session = token();
    const sealed = sealCodes(recoveryCodes(), session);
    Date.now = () => now() + 601000;
    assert.deepEqual(openCodes(sealed, session), []);
  } finally {
    Date.now = now;
  }
});
test("email matching alone never promotes an unverified account to administrator", () => {
  const previous = process.env.ADMIN_EMAIL;
  try {
    process.env.ADMIN_EMAIL = " OWNER@example.com ";
    assert.equal(isAdminAccount("owner@example.com", false), false);
    assert.equal(isAdminAccount("owner@example.com", true), true);
    assert.equal(isAdminAccount("other@example.com", true), false);
    delete process.env.ADMIN_EMAIL;
    assert.equal(isAdminAccount("owner@example.com", true), false);
  } finally {
    if (previous === undefined) delete process.env.ADMIN_EMAIL;
    else process.env.ADMIN_EMAIL = previous;
  }
});
test("CSRF origin validation rejects cross-origin, opaque and missing origins", () => {
  assert.equal(
    isAllowedOrigin("http://localhost:3000", "localhost:3000"),
    true,
  );
  assert.equal(
    isAllowedOrigin(
      "https://splatify.example",
      "internal:3000",
      "https://splatify.example",
    ),
    true,
  );
  for (const origin of [
    null,
    "null",
    "malformed",
    "https://attacker.example",
    "https://splatify.example.attacker.example",
    "http://splatify.example",
    "https://splatify.example:444",
  ]) {
    assert.equal(
      isAllowedOrigin(origin, "splatify.example", "https://splatify.example"),
      false,
      String(origin),
    );
  }
  assert.equal(
    isAllowedOrigin(
      "https://attacker.example",
      "attacker.example",
      "https://splatify.example",
    ),
    false,
  );
  assert.equal(isAllowedOrigin("file:///tmp", ""), false);
});
test("public recovery rejects persisted managed accounts even after environment changes", () => {
  const previous = process.env.ADMIN_EMAIL;
  try {
    process.env.ADMIN_EMAIL = " NEW@example.com ";
    assert.equal(canUsePublicRecovery("new@example.com", false), false);
    assert.equal(canUsePublicRecovery("old@example.com", true), false);
    assert.equal(canUsePublicRecovery("ordinary@example.com", false), true);
    delete process.env.ADMIN_EMAIL;
    assert.equal(canUsePublicRecovery("old@example.com", true), false);
  } finally {
    if (previous === undefined) delete process.env.ADMIN_EMAIL;
    else process.env.ADMIN_EMAIL = previous;
  }
});
