import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { hashToken, token, verifyPassword } from "../src/lib/security";
import {
  syncAdmin,
  type AdminConfig,
  AdminProvisioningError,
} from "../src/lib/provision-admin";

// Explicit opt-in only; each run creates and drops its own isolated schema.
test(
  "PostgreSQL schema, recovery consumption, voting constraints and capacity locking",
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    const schema = `splatify_test_${randomUUID().replaceAll("-", "")}`;
    const control = new Pool({
      connectionString: process.env.TEST_DATABASE_URL,
    });
    const db = new Pool({
      connectionString: process.env.TEST_DATABASE_URL,
      options: `-c search_path=${schema}`,
      max: 5,
    });
    try {
      await control.query(`CREATE SCHEMA ${schema}`);
      const sql = await readFile(
        new URL("../src/lib/schema.sql", import.meta.url),
        "utf8",
      );
      await db.query(sql);
      await db.query(sql);
      const {
        rows: [user],
      } = await db.query(
        "INSERT INTO users(name,email,password_hash) VALUES('Owner','owner@example.com','test') RETURNING id",
      );
      const {
        rows: [event],
      } = await db.query(
        "INSERT INTO events(owner_id,title,capacity,invite_token) VALUES($1,'Test',1,$2) RETURNING id",
        [user.id, token()],
      );
      const reserve = async () => {
        const client = await db.connect();
        try {
          await client.query("BEGIN");
          const {
            rows: [locked],
          } = await client.query(
            "SELECT capacity FROM events WHERE id=$1 FOR UPDATE",
            [event.id],
          );
          const {
            rows: [count],
          } = await client.query(
            "SELECT count(*)::int AS n FROM guests WHERE event_id=$1 AND status='going'",
            [event.id],
          );
          if (count.n >= locked.capacity) {
            await client.query("ROLLBACK");
            return false;
          }
          await client.query(
            "INSERT INTO guests(event_id,edit_token_hash,name,status,marker) VALUES($1,$2,'Guest','going','rental')",
            [event.id, hashToken(token())],
          );
          await client.query("COMMIT");
          return true;
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally {
          client.release();
        }
      };
      const reservations = await Promise.all([reserve(), reserve(), reserve()]);
      assert.equal(reservations.filter(Boolean).length, 1);
      const codeHash = hashToken(token());
      await db.query(
        "INSERT INTO recovery_codes(user_id,code_hash) VALUES($1,$2)",
        [user.id, codeHash],
      );
      const consumes = await Promise.all(
        Array.from({ length: 3 }, () =>
          db.query(
            "DELETE FROM recovery_codes WHERE user_id=$1 AND code_hash=$2 RETURNING user_id",
            [user.id, codeHash],
          ),
        ),
      );
      assert.equal(
        consumes.reduce((sum, result) => sum + (result.rowCount ?? 0), 0),
        1,
      );
      const {
        rows: [guest],
      } = await db.query("SELECT id FROM guests WHERE event_id=$1", [event.id]);
      const {
        rows: [poll1],
      } = await db.query(
        "INSERT INTO polls(event_id,question) VALUES($1,'First?') RETURNING id",
        [event.id],
      );
      const {
        rows: [poll2],
      } = await db.query(
        "INSERT INTO polls(event_id,question) VALUES($1,'Second?') RETURNING id",
        [event.id],
      );
      const {
        rows: [option],
      } = await db.query(
        "INSERT INTO poll_options(poll_id,label,position) VALUES($1,'Yes',0) RETURNING id",
        [poll1.id],
      );
      await assert.rejects(
        db.query(
          "INSERT INTO poll_votes(poll_id,guest_id,option_id) VALUES($1,$2,$3)",
          [poll2.id, guest.id, option.id],
        ),
        { code: "23503" },
      );
      await db.query(
        "INSERT INTO poll_votes(poll_id,guest_id,option_id) VALUES($1,$2,$3)",
        [poll1.id, guest.id, option.id],
      );
      await assert.rejects(
        db.query(
          "INSERT INTO poll_votes(poll_id,guest_id,option_id) VALUES($1,$2,$3)",
          [poll1.id, guest.id, option.id],
        ),
        { code: "23505" },
      );
      await db.query(
        "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 day')",
        [hashToken(token()), user.id],
      );
      await db.query("DELETE FROM users WHERE id=$1", [user.id]);
      for (const table of [
        "events",
        "guests",
        "polls",
        "poll_options",
        "poll_votes",
        "sessions",
        "recovery_codes",
      ]) {
        const {
          rows: [count],
        } = await db.query(`SELECT count(*)::int AS n FROM ${table}`);
        assert.equal(count.n, 0, `${table} cascades on owner deletion`);
      }
      const provision = async (config: AdminConfig | null) => {
        const client = await db.connect();
        try {
          await client.query("BEGIN");
          await syncAdmin(client, config);
          await client.query("COMMIT");
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally {
          client.release();
        }
      };
      const admin = {
        email: "admin@example.com",
        name: "Admin",
        password: "original admin password",
      };
      await Promise.all([provision(admin), provision(admin)]);
      const {
        rows: [first],
      } = await db.query("SELECT * FROM users WHERE email=$1", [admin.email]);
      assert.equal(first.admin_verified, true);
      assert.equal(
        await verifyPassword(admin.password, first.password_hash),
        true,
      );
      const addCredentials = async (id: string) => {
        await db.query(
          "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 day')",
          [hashToken(token()), id],
        );
        await db.query(
          "INSERT INTO recovery_codes(user_id,code_hash) VALUES($1,$2)",
          [id, hashToken(token())],
        );
      };
      await addCredentials(first.id);
      await provision({ ...admin, name: "Renamed Admin" });
      assert.equal(
        (
          await db.query("SELECT password_hash,name FROM users WHERE id=$1", [
            first.id,
          ])
        ).rows[0].password_hash,
        first.password_hash,
      );
      assert.equal(
        (await db.query("SELECT name FROM users WHERE id=$1", [first.id]))
          .rows[0].name,
        "Renamed Admin",
      );
      assert.equal(
        (await db.query("SELECT * FROM sessions WHERE user_id=$1", [first.id]))
          .rowCount,
        1,
      );
      assert.equal(
        (
          await db.query("SELECT * FROM recovery_codes WHERE user_id=$1", [
            first.id,
          ])
        ).rowCount,
        0,
      );
      await provision({ ...admin, password: "changed admin password" });
      assert.equal(
        (await db.query("SELECT * FROM sessions WHERE user_id=$1", [first.id]))
          .rowCount,
        0,
      );
      assert.equal(
        await verifyPassword(
          "changed admin password",
          (
            await db.query("SELECT password_hash FROM users WHERE id=$1", [
              first.id,
            ])
          ).rows[0].password_hash,
        ),
        true,
      );
      await addCredentials(first.id);
      await db.query(
        "INSERT INTO users(name,email,password_hash) VALUES('Ordinary','ordinary@example.com','unchanged')",
      );
      await assert.rejects(
        provision({ ...admin, email: "ordinary@example.com" }),
        AdminProvisioningError,
      );
      assert.equal(
        (
          await db.query("SELECT admin_verified FROM users WHERE id=$1", [
            first.id,
          ])
        ).rows[0].admin_verified,
        true,
      );
      assert.equal(
        (await db.query("SELECT * FROM sessions WHERE user_id=$1", [first.id]))
          .rowCount,
        1,
      );
      assert.deepEqual(
        (
          await db.query(
            "SELECT admin_verified,password_hash FROM users WHERE email='ordinary@example.com'",
          )
        ).rows[0],
        { admin_verified: false, password_hash: "unchanged" },
      );
      await provision({ ...admin, email: "new-admin@example.com" });
      assert.equal(
        (
          await db.query("SELECT admin_verified FROM users WHERE id=$1", [
            first.id,
          ])
        ).rows[0].admin_verified,
        false,
      );
      assert.equal(
        (await db.query("SELECT * FROM sessions WHERE user_id=$1", [first.id]))
          .rowCount,
        0,
      );
      assert.equal(
        (
          await db.query("SELECT * FROM recovery_codes WHERE user_id=$1", [
            first.id,
          ])
        ).rowCount,
        0,
      );
      assert.equal(
        (await db.query("SELECT * FROM users WHERE admin_verified")).rowCount,
        1,
      );
      await provision(null);
      assert.equal(
        (await db.query("SELECT * FROM users WHERE admin_verified")).rowCount,
        0,
      );
    } finally {
      await db.end();
      await control.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await control.end();
    }
  },
);
