import assert from "node:assert/strict";
import { test, mock } from "node:test";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import {
  hashPassword,
  hashToken,
  token,
  verifyPassword,
  openCodes,
  normalizeRecoveryCode,
} from "../src/lib/security";

test(
  "v3 account security PostgreSQL permission matrix",
  { skip: !process.env.TEST_DATABASE_URL },
  async (t) => {
    const schema = `splatify_account_${randomUUID().replaceAll("-", "")}`;
    const control = new Pool({
      connectionString: process.env.TEST_DATABASE_URL,
    });
    const db = new Pool({
      connectionString: process.env.TEST_DATABASE_URL,
      application_name: schema,
      options: `-c search_path=${schema}`,
    });
    const globalDb = globalThis as typeof globalThis & { splatifyPool?: Pool };
    const oldPool = globalDb.splatifyPool;
    const old = {
      DATABASE_URL: process.env.DATABASE_URL,
      APP_URL: process.env.APP_URL,
      ADMIN_EMAIL: process.env.ADMIN_EMAIL,
    };
    const jar = new Map<string, string>();
    const require = createRequire(import.meta.url);
    let origin = "http://localhost:3000";
    mock.method(require("next/headers"), "cookies", async () => ({
      get: (name: string) =>
        jar.has(name) ? { value: jar.get(name) } : undefined,
      set: (name: string, value: string) => jar.set(name, value),
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    }));
    mock.method(
      require("next/headers"),
      "headers",
      async () => new Headers({ origin, host: "localhost:3000" }),
    );
    mock.method(require("next/server"), "connection", async () => {});
    mock.method(require("next/cache"), "revalidatePath", () => {});
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    process.env.APP_URL = origin;
    process.env.ADMIN_EMAIL = "owner@account.test";
    globalDb.splatifyPool = db;
    try {
      await control.query(`CREATE SCHEMA ${schema}`);
      for (const path of [
        "schema.sql",
        "migrations/002-planning.sql",
        "migrations/003-community.sql",
      ])
        await db.query(
          await readFile(
            new URL(`../src/lib/${path}`, import.meta.url),
            "utf8",
          ),
        );
      const password = "Original secure password";
      const passwordHash = await hashPassword(password);
      const ids: Record<string, string> = {};
      for (const name of ["owner", "member", "other", "managed"]) {
        ids[name] = (
          await db.query(
            "INSERT INTO users(name,email,password_hash,admin_verified,real_name) VALUES($1,$2,$3,$4,'PRIVATE LEGAL NAME') RETURNING id",
            [
              name,
              `${name}@account.test`,
              passwordHash,
              ["owner", "managed"].includes(name),
            ],
          )
        ).rows[0].id;
      }
      const { issueResetLinkAction, updateSiteAction } =
        await import("../src/app/admin/actions");
      const { consumeResetLinkAction } =
        await import("../src/app/reset/actions");
      const {
        saveProfileAction,
        addLoadoutAction,
        deleteLoadoutAction,
        changePasswordAction,
      } = await import("../src/app/profile/actions");
      const { getPublicProfile } = await import("../src/lib/public-profiles");
      const { getOwnerAccounts } = await import("../src/lib/owner");
      const form = (values: Record<string, string>) => {
        const result = new FormData();
        for (const [key, value] of Object.entries(values))
          result.set(key, value);
        return result;
      };
      const signIn = async (id: string | null) => {
        jar.clear();
        if (id) {
          const raw = token();
          await db.query(
            "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 day')",
            [hashToken(raw), id],
          );
          jar.set("splatify_session", raw);
        }
      };
      const redirected = async (action: Promise<unknown>, path: string) => {
        await assert.rejects(action, (error) => {
          assert.ok(error && typeof error === "object" && "digest" in error);
          assert.ok(String(error.digest).includes(path), String(error.digest));
          return true;
        });
      };
      const issue = (userId = ids.member, currentPassword = password) =>
        issueResetLinkAction(
          { link: "", error: "" },
          form({ userId, currentPassword }),
        );
      const clearLimits = () => db.query("DELETE FROM rate_limits");
      const profile = {
        displayName: "Public display",
        realName: "PRIVATE LEGAL NAME",
        bio: "Public biography",
        marker: "rental",
      };

      await t.test(
        "owner issuance requires current owner identity, reauthentication and trusted origin",
        async () => {
          for (const actor of [null, ids.member, ids.managed]) {
            await signIn(actor);
            assert.equal((await issue()).link, "");
            await assert.rejects(getOwnerAccounts());
          }
          await signIn(ids.owner);
          assert.equal((await issue(ids.member, "incorrect")).link, "");
          await clearLimits();
          for (const target of [ids.owner, ids.managed])
            assert.equal((await issue(target)).link, "");
          origin = "https://attacker.test";
          assert.equal((await issue()).link, "");
          origin = "http://localhost:3000";
          await db.query("UPDATE users SET admin_verified=false WHERE id=$1", [
            ids.owner,
          ]);
          assert.equal((await issue()).link, "");
          await db.query("UPDATE users SET admin_verified=true WHERE id=$1", [
            ids.owner,
          ]);
          await clearLimits();
          const issued = await issue();
          assert.ok(issued.link, issued.error);
          const raw = issued.link.split("/").at(-1)!;
          const rows = (
            await db.query(
              "SELECT * FROM password_reset_links WHERE user_id=$1",
              [ids.member],
            )
          ).rows;
          assert.equal(rows.length, 1);
          assert.equal(rows[0].token_hash, hashToken(raw));
          assert.ok(
            rows[0].expires_at.valueOf() - rows[0].created_at.valueOf() <=
              30 * 60 * 1000,
          );
          assert.equal(JSON.stringify(rows).includes(raw), false);
          assert.equal(
            JSON.stringify(
              (await db.query("SELECT * FROM activity")).rows,
            ).includes(raw),
            false,
          );
          const second = await issue();
          assert.ok(second.link);
          assert.equal(
            (
              await db.query(
                "SELECT 1 FROM password_reset_links WHERE token_hash=$1",
                [hashToken(raw)],
              )
            ).rowCount,
            0,
          );
          const accounts = await getOwnerAccounts("MEMBER", 1);
          assert.equal(accounts.total, 1);
          assert.equal(accounts.accounts[0].isManaged, false);
          for (let index = 0; index < 21; index++)
            await db.query(
              "INSERT INTO users(name,email,password_hash) VALUES('Page player',$1,'test')",
              [`page${index}@account.test`],
            );
          assert.equal(
            (await getOwnerAccounts("Page player", 1)).accounts.length,
            20,
          );
          assert.equal(
            (await getOwnerAccounts("Page player", 2)).accounts.length,
            1,
          );
          assert.equal((await getOwnerAccounts("Page player", 2)).total, 21);
          await clearLimits();
          for (let i = 0; i < 3; i++) assert.ok((await issue()).link);
          assert.equal((await issue()).link, "");
        },
      );

      await t.test(
        "reset GET is inert; consumption is single-use and rotates every credential",
        async () => {
          await clearLimits();
          await signIn(ids.owner);
          const issued = await issue();
          const raw = issued.link.split("/").at(-1)!;
          const { default: ResetPage } =
            await import("../src/app/reset/[token]/page");
          await ResetPage({ params: Promise.resolve({ token: raw }) });
          await ResetPage({ params: Promise.resolve({ token: raw }) });
          assert.equal(
            (
              await db.query(
                "SELECT 1 FROM password_reset_links WHERE token_hash=$1",
                [hashToken(raw)],
              )
            ).rowCount,
            1,
          );
          await signIn(ids.member);
          const oldSession = jar.get("splatify_session")!;
          await db.query(
            "INSERT INTO recovery_codes(user_id,code_hash) VALUES($1,$2)",
            [ids.member, hashToken("old-code")],
          );
          await signIn(null);
          const resetForm = form({
            token: raw,
            password: "Replacement secure password",
            confirmPassword: "Replacement secure password",
          });
          const results = await Promise.allSettled([
            consumeResetLinkAction({ error: "" }, resetForm),
            consumeResetLinkAction({ error: "" }, resetForm),
          ]);
          assert.equal(
            results.filter(
              (result) =>
                result.status === "rejected" &&
                String((result.reason as { digest: string }).digest).includes(
                  "/recovery-codes",
                ),
            ).length,
            1,
          );
          assert.equal(
            results.filter(
              (result) =>
                result.status === "fulfilled" &&
                result.value.error === "Invalid or expired reset link.",
            ).length,
            1,
          );
          assert.equal(
            (
              await db.query("SELECT 1 FROM sessions WHERE token_hash=$1", [
                hashToken(oldSession),
              ])
            ).rowCount,
            0,
          );
          assert.equal(
            (
              await db.query(
                "SELECT 1 FROM password_reset_links WHERE user_id=$1",
                [ids.member],
              )
            ).rowCount,
            0,
          );
          const codes = openCodes(
            jar.get("splatify_recovery")!,
            jar.get("splatify_session")!,
          );
          assert.equal(codes.length, 8);
          const hashes = (
            await db.query(
              "SELECT code_hash FROM recovery_codes WHERE user_id=$1",
              [ids.member],
            )
          ).rows
            .map((row) => row.code_hash)
            .sort();
          assert.deepEqual(
            hashes,
            codes.map((code) => hashToken(normalizeRecoveryCode(code))).sort(),
          );
          assert.equal(
            (
              await db.query("SELECT 1 FROM sessions WHERE user_id=$1", [
                ids.member,
              ])
            ).rowCount,
            1,
          );
          assert.deepEqual(
            openCodes(jar.get("splatify_next")!, jar.get("splatify_session")!),
            ["/profile"],
          );
          assert.equal(
            await verifyPassword(
              "Replacement secure password",
              (
                await db.query("SELECT password_hash FROM users WHERE id=$1", [
                  ids.member,
                ])
              ).rows[0].password_hash,
            ),
            true,
          );
        },
      );

      await t.test(
        "invalid, expired and managed-target reset links do not mutate accounts",
        async () => {
          await clearLimits();
          await db.query("UPDATE users SET admin_verified=false WHERE id=$1", [
            ids.owner,
          ]);
          for (const [target, expiry] of [
            [ids.managed, "1 day"],
            [ids.owner, "1 day"],
            [ids.other, "-1 day"],
          ]) {
            const raw = token();
            await db.query(
              "INSERT INTO password_reset_links(token_hash,user_id,issuer_id,expires_at) VALUES($1,$2,$3,now()+$4::interval)",
              [hashToken(raw), target, ids.owner, expiry],
            );
            const result = await consumeResetLinkAction(
              { error: "" },
              form({ token: raw, password, confirmPassword: password }),
            );
            assert.equal(result.error, "Invalid or expired reset link.");
          }
          await db.query("UPDATE users SET admin_verified=true WHERE id=$1", [
            ids.owner,
          ]);
          const unknown = await consumeResetLinkAction(
            { error: "" },
            form({ token: token(), password, confirmPassword: password }),
          );
          assert.equal(unknown.error, "Invalid or expired reset link.");
          await signIn(ids.owner);
          const issued = await issue(ids.other);
          const raw = issued.link.split("/").at(-1)!;
          origin = "https://attacker.test";
          assert.ok(
            (
              await consumeResetLinkAction(
                { error: "" },
                form({ token: raw, password, confirmPassword: password }),
              )
            ).error,
          );
          origin = "http://localhost:3000";
          assert.ok(
            (
              await consumeResetLinkAction(
                { error: "" },
                form({ token: raw, password, confirmPassword: "different" }),
              )
            ).error,
          );
          assert.equal(
            (
              await db.query(
                "SELECT 1 FROM password_reset_links WHERE token_hash=$1",
                [hashToken(raw)],
              )
            ).rowCount,
            1,
          );
        },
      );

      await t.test(
        "password changes require own current password and reject both managed account signals",
        async () => {
          await clearLimits();
          for (const actor of [ids.owner, ids.managed]) {
            await signIn(actor);
            await redirected(
              changePasswordAction(
                form({
                  currentPassword: password,
                  password,
                  confirmPassword: password,
                }),
              ),
              "/profile?error=",
            );
          }
          await db.query("UPDATE users SET admin_verified=false WHERE id=$1", [
            ids.owner,
          ]);
          await signIn(ids.owner);
          await redirected(
            changePasswordAction(
              form({
                currentPassword: password,
                password,
                confirmPassword: password,
              }),
            ),
            "/profile?error=",
          );
          await db.query("UPDATE users SET admin_verified=true WHERE id=$1", [
            ids.owner,
          ]);
          await signIn(ids.other);
          await redirected(
            changePasswordAction(
              form({
                currentPassword: "incorrect",
                password,
                confirmPassword: password,
              }),
            ),
            "/profile?error=",
          );
          const oldSession = jar.get("splatify_session")!;
          await redirected(
            changePasswordAction(
              form({
                currentPassword: password,
                password: "Changed secure password",
                confirmPassword: "Changed secure password",
                userId: ids.owner,
              }),
            ),
            "/recovery-codes",
          );
          assert.equal(
            (
              await db.query("SELECT 1 FROM sessions WHERE token_hash=$1", [
                hashToken(oldSession),
              ])
            ).rowCount,
            0,
          );
          assert.equal(
            (
              await db.query(
                "SELECT 1 FROM password_reset_links WHERE user_id=$1",
                [ids.other],
              )
            ).rowCount,
            0,
          );
          assert.equal(
            (
              await db.query("SELECT 1 FROM recovery_codes WHERE user_id=$1", [
                ids.other,
              ])
            ).rowCount,
            8,
          );
          assert.equal(
            (
              await db.query("SELECT password_hash FROM users WHERE id=$1", [
                ids.owner,
              ])
            ).rows[0].password_hash,
            passwordHash,
          );
          await clearLimits();
          for (let index = 0; index < 7; index++)
            await redirected(
              changePasswordAction(
                form({
                  currentPassword: "incorrect",
                  password,
                  confirmPassword: password,
                }),
              ),
              "/profile?error=",
            );
          assert.ok(
            (
              await db.query("SELECT hits FROM rate_limits WHERE key_hash=$1", [
                hashToken(`password:${ids.other}`),
              ])
            ).rows[0].hits > 6,
          );
        },
      );

      await t.test(
        "profile consent, unique slugs and public DTO never expose private account or event data",
        async () => {
          await clearLimits();
          await signIn(ids.member);
          await redirected(
            saveProfileAction(
              form({
                ...profile,
                firstName: "First",
                profileSlug: "public-player",
                publicProfilePresent: "1",
              }),
            ),
            "/profile?success=",
          );
          assert.equal(await getPublicProfile("public-player"), null);
          await redirected(
            saveProfileAction(form({ ...profile, publicProfileEnabled: "on" })),
            "/profile?success=",
          );
          await redirected(
            saveProfileAction(form(profile)),
            "/profile?success=",
          );
          const saved = (
            await db.query("SELECT * FROM users WHERE id=$1", [ids.member])
          ).rows[0];
          assert.equal(saved.first_name, "First");
          assert.equal(saved.profile_slug, "public-player");
          assert.equal(saved.public_profile_enabled, true);
          for (const slug of ["admin", "a_b", "ab"])
            await redirected(
              saveProfileAction(form({ ...profile, profileSlug: slug })),
              "/profile?error=",
            );
          await signIn(ids.other);
          await redirected(
            saveProfileAction(
              form({ ...profile, profileSlug: "PUBLIC-PLAYER" }),
            ),
            "/profile?error=",
          );
          const competing = await Promise.allSettled(
            [ids.owner, ids.managed].map((id) =>
              db.query(
                "UPDATE users SET profile_slug='concurrent-slug' WHERE id=$1",
                [id],
              ),
            ),
          );
          assert.equal(
            competing.filter((result) => result.status === "fulfilled").length,
            1,
          );
          assert.equal(
            competing.filter(
              (result) =>
                result.status === "rejected" && result.reason.code === "23505",
            ).length,
            1,
          );
          const privateIds: string[] = [];
          for (let index = 0; index < 23; index++) {
            const event = (
              await db.query(
                "INSERT INTO events(owner_id,title,invite_token,visibility,date,address) VALUES($1,$2,$3,$4,'2026-01-01','SECRET ADDRESS') RETURNING id",
                [
                  ids.owner,
                  index === 0 ? "Public event" : "SECRET TITLE",
                  token(),
                  index === 0 ? "public" : "private",
                ],
              )
            ).rows[0].id;
            if (index) privateIds.push(event);
            await db.query(
              "INSERT INTO guests(event_id,user_id,edit_token_hash,name,status,marker,attended,attended_at) VALUES($1,$2,$3,'Guest','going','rental',$4,now())",
              [event, ids.member, hashToken(token()), index !== 22],
            );
          }
          const publicProfile = await getPublicProfile("public-player");
          assert.ok(publicProfile);
          assert.deepEqual(
            Object.keys(publicProfile).sort(),
            [
              "name",
              "firstName",
              "bio",
              "avatarId",
              "defaultMarker",
              "slug",
              "loadout",
              "attendance",
              "attendanceCount",
              "page",
            ].sort(),
          );
          assert.equal(publicProfile.attendanceCount, 22);
          assert.equal(publicProfile.attendance.length, 20);
          assert.equal(
            (await getPublicProfile("public-player", 2))!.attendance.length,
            2,
          );
          const all = [
            ...publicProfile.attendance,
            ...(await getPublicProfile("public-player", 2))!.attendance,
          ];
          for (const entry of all.filter((entry) => !("id" in entry)))
            assert.deepEqual(entry, { title: "Private event" });
          const serialized = JSON.stringify(publicProfile);
          for (const secret of [
            "PRIVATE LEGAL NAME",
            "SECRET TITLE",
            "SECRET ADDRESS",
            "@account.test",
            ...privateIds,
          ])
            assert.equal(serialized.includes(secret), false);
          await db.query(
            "UPDATE settings SET public_profiles_enabled=false WHERE id=1",
          );
          assert.equal(await getPublicProfile("public-player"), null);
          await db.query(
            "UPDATE settings SET public_profiles_enabled=true WHERE id=1",
          );
        },
      );

      await t.test(
        "loadout writes enforce ownership, field limits and the concurrent ten-item cap",
        async () => {
          await clearLimits();
          await signIn(ids.member);
          for (const values of [
            { category: "invalid", name: "Marker", notes: "" },
            { category: "marker", name: "x".repeat(101), notes: "" },
            { category: "marker", name: "Marker", notes: "x".repeat(251) },
          ])
            await redirected(addLoadoutAction(form(values)), "/profile?error=");
          const results = await Promise.allSettled(
            Array.from({ length: 11 }, (_, index) =>
              addLoadoutAction(
                form({
                  category: "marker",
                  name: `Marker ${index}`,
                  notes: "Note",
                  userId: ids.other,
                }),
              ),
            ),
          );
          assert.equal(
            results.filter(
              (result) =>
                result.status === "rejected" &&
                String(result.reason.digest).includes("?success="),
            ).length,
            10,
          );
          const items = (
            await db.query("SELECT id FROM loadout_items WHERE user_id=$1", [
              ids.member,
            ])
          ).rows;
          assert.equal(items.length, 10);
          await signIn(ids.other);
          await redirected(
            deleteLoadoutAction(
              form({ itemId: items[0].id, userId: ids.member }),
            ),
            "/profile?success=",
          );
          assert.equal(
            (
              await db.query("SELECT 1 FROM loadout_items WHERE id=$1", [
                items[0].id,
              ])
            ).rowCount,
            1,
          );
          await signIn(ids.member);
          await redirected(
            deleteLoadoutAction(form({ itemId: items[0].id })),
            "/profile?success=",
          );
          assert.equal(
            (
              await db.query("SELECT 1 FROM loadout_items WHERE id=$1", [
                items[0].id,
              ])
            ).rowCount,
            0,
          );
        },
      );

      await t.test(
        "site updates require owner reauth and ignore role, URL and unlisted fields",
        async () => {
          await clearLimits();
          const values = {
            landingTitle: "New title",
            landingSubtitle: "Subtitle",
            landingCta: "Play",
            siteNotice: "Notice",
            accentColor: "#123abc",
            registrationEnabled: "on",
            eventCreationEnabled: "on",
            discoveryEnabled: "on",
            publicProfilesEnabled: "on",
            sponsorsEnabled: "on",
            currentPassword: password,
            ADMIN_EMAIL: "attacker@test.local",
            APP_URL: "https://attacker.test",
            adminVerified: "true",
          };
          await signIn(ids.member);
          await redirected(
            updateSiteAction(form(values)),
            "/admin/site?error=",
          );
          await signIn(ids.owner);
          await redirected(
            updateSiteAction(form({ ...values, currentPassword: "wrong" })),
            "/admin/site?error=",
          );
          await redirected(
            updateSiteAction(
              form({ ...values, accentColor: "red;display:none" }),
            ),
            "/admin/site?error=",
          );
          await redirected(
            updateSiteAction(form(values)),
            "/admin/site?success=",
          );
          assert.equal(
            (await db.query("SELECT landing_title FROM settings WHERE id=1"))
              .rows[0].landing_title,
            "New title",
          );
          assert.equal(process.env.APP_URL, "http://localhost:3000");
          assert.equal(
            (
              await db.query("SELECT admin_verified FROM users WHERE id=$1", [
                ids.member,
              ])
            ).rows[0].admin_verified,
            false,
          );
        },
      );
      await t.test(
        "queued profile and owner deletion requests cannot outlive session revocation",
        async () => {
          const { deleteUserAction, adminDeleteEventAction } =
            await import("../src/app/actions");
          await clearLimits();
          await signIn(ids.owner);
          await redirected(
            deleteUserAction(form({ userId: ids.other })),
            "/admin?error=",
          );
          assert.equal(
            (await db.query("SELECT 1 FROM users WHERE id=$1", [ids.other]))
              .rowCount,
            1,
          );
          const targetEvent = (
            await db.query(
              "INSERT INTO events(owner_id,title,invite_token) VALUES($1,'Protected',$2) RETURNING id",
              [ids.other, token()],
            )
          ).rows[0].id;
          await redirected(
            adminDeleteEventAction(form({ eventId: targetEvent })),
            "/admin?error=",
          );
          assert.equal(
            (await db.query("SELECT 1 FROM events WHERE id=$1", [targetEvent]))
              .rowCount,
            1,
          );
          for (const scenario of ["profile", "delete"] as const) {
            const userId = scenario === "profile" ? ids.other : ids.owner;
            await signIn(userId);
            await db.query(
              "UPDATE users SET public_profile_enabled=false WHERE id=$1",
              [ids.other],
            );
            const blocker = await db.connect();
            await blocker.query("BEGIN");
            await blocker.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [
              userId,
            ]);
            const work =
              scenario === "profile"
                ? saveProfileAction(
                    form({
                      ...profile,
                      profileSlug: "revocation-test",
                      publicProfileEnabled: "on",
                      publicProfilePresent: "on",
                    }),
                  )
                : deleteUserAction(
                    form({ userId: ids.other, currentPassword: password }),
                  );
            const result = redirected(
              work,
              scenario === "profile" ? "/profile?error=" : "/admin?error=",
            );
            try {
              let waiting = false;
              for (let attempt = 0; attempt < 100; attempt++) {
                waiting = !!(
                  await db.query(
                    "SELECT 1 FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock'",
                    [schema],
                  )
                ).rowCount;
                if (waiting) break;
                await new Promise((resolve) => setTimeout(resolve, 10));
              }
              assert.ok(
                waiting,
                "Action must reach the locked authorization boundary",
              );
              await blocker.query("DELETE FROM sessions WHERE user_id=$1", [
                userId,
              ]);
              await blocker.query("COMMIT");
              await result;
            } finally {
              await blocker.query("ROLLBACK");
              blocker.release();
            }
            assert.equal(
              (
                await db.query(
                  "SELECT public_profile_enabled FROM users WHERE id=$1",
                  [ids.other],
                )
              ).rows[0].public_profile_enabled,
              false,
            );
          }
        },
      );
      await t.test(
        "recovery-code reset replaces the entire old recovery set and reset links",
        async () => {
          const { recoverAction } = await import("../src/app/actions");
          const id = (
            await db.query(
              "INSERT INTO users(name,email,password_hash) VALUES('Recover','recover@account.test',$1) RETURNING id",
              [passwordHash],
            )
          ).rows[0].id;
          const codes = [token(), token()];
          for (const code of codes)
            await db.query(
              "INSERT INTO recovery_codes(user_id,code_hash) VALUES($1,$2)",
              [id, hashToken(normalizeRecoveryCode(code))],
            );
          await db.query(
            "INSERT INTO password_reset_links(token_hash,user_id,issuer_id,expires_at) VALUES($1,$2,$3,now()+interval '30 minutes')",
            [hashToken(token()), id, ids.owner],
          );
          await signIn(null);
          await redirected(
            recoverAction(
              form({
                email: "recover@account.test",
                recoveryCode: codes[0],
                password: "Replacement password secure",
              }),
            ),
            "/recovery-codes",
          );
          assert.equal(
            (
              await db.query(
                "SELECT 1 FROM password_reset_links WHERE user_id=$1",
                [id],
              )
            ).rowCount,
            0,
          );
          const saved = (
            await db.query(
              "SELECT code_hash FROM recovery_codes WHERE user_id=$1",
              [id],
            )
          ).rows.map((row) => row.code_hash);
          assert.equal(saved.length, 8);
          for (const code of codes)
            assert.ok(!saved.includes(hashToken(normalizeRecoveryCode(code))));
          await redirected(
            recoverAction(
              form({
                email: "recover@account.test",
                recoveryCode: codes[1],
                password: "Attacker replacement password",
              }),
            ),
            "/recover?next=%2Fdashboard&error=",
          );
          assert.ok(
            await verifyPassword(
              "Replacement password secure",
              (
                await db.query("SELECT password_hash FROM users WHERE id=$1", [
                  id,
                ])
              ).rows[0].password_hash,
            ),
          );
        },
      );
    } finally {
      mock.restoreAll();
      globalDb.splatifyPool = oldPool;
      for (const [key, value] of Object.entries(old)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      await db.end();
      await control.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await control.end();
    }
  },
);
