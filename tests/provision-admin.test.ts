import assert from "node:assert/strict";
import { test } from "node:test";
import type { PoolClient } from "pg";
import {
  AdminProvisioningError,
  readAdminConfig,
  syncAdmin,
} from "../src/lib/provision-admin";
import { hashPassword, verifyPassword } from "../src/lib/security";

const config = {
  email: "admin@example.com",
  name: "Owner",
  password: "long admin password",
};
test("admin environment is optional locally but required in production", () => {
  assert.equal(readAdminConfig({ NODE_ENV: "development" }), null);
  assert.equal(
    readAdminConfig({ ADMIN_EMAIL: "", ADMIN_NAME: "", ADMIN_PASSWORD: "" }),
    null,
  );
  assert.throws(
    () => readAdminConfig({ NODE_ENV: "production" }),
    AdminProvisioningError,
  );
});
test("admin environment requires all fields and normalizes only name and email", () => {
  assert.deepEqual(
    readAdminConfig({
      ADMIN_EMAIL: " ADMIN@Example.com ",
      ADMIN_NAME: " Owner ",
      ADMIN_PASSWORD: " password with spaces ",
    }),
    {
      email: config.email,
      name: config.name,
      password: " password with spaces ",
    },
  );
  for (const env of [
    { ADMIN_EMAIL: config.email },
    { ADMIN_EMAIL: config.email, ADMIN_NAME: config.name },
    {
      ADMIN_EMAIL: "bad-email",
      ADMIN_NAME: config.name,
      ADMIN_PASSWORD: config.password,
    },
    {
      ADMIN_EMAIL: config.email,
      ADMIN_NAME: " ",
      ADMIN_PASSWORD: config.password,
    },
    {
      ADMIN_EMAIL: config.email,
      ADMIN_NAME: config.name,
      ADMIN_PASSWORD: "short",
    },
    {
      ADMIN_EMAIL: config.email,
      ADMIN_NAME: config.name,
      ADMIN_PASSWORD: " ".repeat(20),
    },
    {
      ADMIN_EMAIL: config.email,
      ADMIN_NAME: config.name,
      ADMIN_PASSWORD: "x".repeat(129),
    },
  ])
    assert.throws(() => readAdminConfig(env), AdminProvisioningError);
});
test("invalid admin configuration errors do not expose supplied credentials", () => {
  const secret = "private";
  assert.throws(
    () =>
      readAdminConfig({
        ADMIN_EMAIL: config.email,
        ADMIN_NAME: config.name,
        ADMIN_PASSWORD: secret,
      }),
    (error) =>
      error instanceof AdminProvisioningError &&
      !error.message.includes(secret) &&
      !error.message.includes(config.email),
  );
});

type Row = {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  admin_verified: boolean;
};
function clientFor(rows: Row[]) {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const client = {
    query: async (sql: string, values: unknown[] = []) => {
      calls.push({ sql, values });
      return {
        rows: sql.startsWith("SELECT id,email") ? rows : [],
        rowCount: 0,
      };
    },
  } as unknown as PoolClient;
  return { client, calls };
}
test("unchanged admin password and name preserve hash and sessions but remove legacy recovery", async () => {
  const row = {
    ...config,
    id: "admin",
    admin_verified: true,
    password_hash: await hashPassword(config.password),
  };
  const { client, calls } = clientFor([row]);
  await syncAdmin(client, config);
  assert.equal(
    calls.some((call) => call.sql.startsWith("DELETE FROM sessions")),
    false,
  );
  assert.equal(
    calls.some((call) => call.sql.startsWith("UPDATE users")),
    false,
  );
  assert.equal(
    calls.some((call) => call.sql.startsWith("DELETE FROM recovery_codes")),
    true,
  );
  assert.equal(
    calls.some((call) => call.values.includes(config.password)),
    false,
  );
});
test("password changes rehash securely and revoke sessions and recovery codes", async () => {
  const { client, calls } = clientFor([
    {
      ...config,
      id: "admin",
      admin_verified: true,
      password_hash: await hashPassword("the old admin password"),
    },
  ]);
  await syncAdmin(client, config);
  const update = calls.find((call) =>
    call.sql.startsWith("UPDATE users SET password_hash"),
  );
  assert.ok(update);
  assert.equal(
    await verifyPassword(config.password, update.values[1] as string),
    true,
  );
  assert.ok(
    calls.some(
      (call) =>
        call.sql.startsWith("DELETE FROM sessions") &&
        call.values[0] === "admin",
    ),
  );
  assert.ok(
    calls.some(
      (call) =>
        call.sql.startsWith("DELETE FROM recovery_codes") &&
        call.values[0] === "admin",
    ),
  );
});
test("name-only changes preserve sessions", async () => {
  const { client, calls } = clientFor([
    {
      ...config,
      name: "Old name",
      id: "admin",
      admin_verified: true,
      password_hash: await hashPassword(config.password),
    },
  ]);
  await syncAdmin(client, config);
  assert.ok(
    calls.some(
      (call) =>
        call.sql.startsWith("UPDATE users SET name") &&
        call.values[1] === config.name,
    ),
  );
  assert.equal(
    calls.some((call) => call.sql.startsWith("DELETE FROM sessions")),
    false,
  );
});
test("matching ordinary account is refused before any demotion or credential updates", async () => {
  const { client, calls } = clientFor([
    {
      ...config,
      id: "ordinary",
      admin_verified: false,
      password_hash: "irrelevant",
    },
  ]);
  await assert.rejects(syncAdmin(client, config), AdminProvisioningError);
  assert.equal(
    calls.some((call) => /^(UPDATE|DELETE)/.test(call.sql)),
    false,
  );
});
test("removing local admin configuration demotes managed users and revokes credentials", async () => {
  const { client, calls } = clientFor([
    {
      ...config,
      id: "old-admin",
      admin_verified: true,
      password_hash: "irrelevant",
    },
  ]);
  await syncAdmin(client, null);
  for (const prefix of [
    "UPDATE users SET admin_verified=false",
    "DELETE FROM sessions",
    "DELETE FROM recovery_codes",
  ]) {
    assert.ok(
      calls.some(
        (call) => call.sql.startsWith(prefix) && call.values[0] === "old-admin",
      ),
    );
  }
});
