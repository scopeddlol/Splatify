import assert from "node:assert/strict";
import { test, mock } from "node:test";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import sharp from "sharp";
import { hashToken, token } from "../src/lib/security";

test(
  "media routes and profile uploads authorize against PostgreSQL",
  { skip: !process.env.TEST_DATABASE_URL },
  async (t) => {
    const schema = `splatify_media_${randomUUID().replaceAll("-", "")}`;
    const control = new Pool({
      connectionString: process.env.TEST_DATABASE_URL,
    });
    const db = new Pool({
      connectionString: process.env.TEST_DATABASE_URL,
      options: `-c search_path=${schema}`,
    });
    const globalDb = globalThis as typeof globalThis & { splatifyPool?: Pool };
    const oldPool = globalDb.splatifyPool;
    const oldUrl = process.env.DATABASE_URL,
      oldAppUrl = process.env.APP_URL;
    const jar = new Map<string, string>();
    const require = createRequire(import.meta.url);
    let origin = "http://localhost:3000";
    mock.method(require("next/headers"), "cookies", async () => ({
      get: (name: string) =>
        jar.has(name) ? { name, value: jar.get(name) } : undefined,
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      set: (name: string, value: string) => {
        jar.set(name, value);
      },
    }));
    mock.method(
      require("next/headers"),
      "headers",
      async () => new Headers({ origin, host: "localhost:3000" }),
    );
    mock.method(require("next/server"), "connection", async () => {});
    mock.method(require("next/cache"), "revalidatePath", () => {});
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    process.env.APP_URL = "http://localhost:3000";
    globalDb.splatifyPool = db;
    try {
      await control.query(`CREATE SCHEMA ${schema}`);
      for (const path of [
        "../src/lib/schema.sql",
        "../src/lib/migrations/002-planning.sql",
      ])
        await db.query(await readFile(new URL(path, import.meta.url), "utf8"));
      const users: Record<string, string> = {};
      for (const name of [
        "owner",
        "coorganizer",
        "member",
        "pending",
        "outsider",
      ]) {
        users[name] = (
          await db.query(
            "INSERT INTO users(name,email,password_hash,real_name) VALUES($1,$2,'test',$3) RETURNING id",
            [name, `${name}@media.test`, `${name} private name`],
          )
        ).rows[0].id;
      }
      const privateInvite = token(),
        publicInvite = token();
      const privateDay = (
        await db.query(
          "INSERT INTO events(owner_id,title,invite_token) VALUES($1,'Private day',$2) RETURNING id",
          [users.owner, privateInvite],
        )
      ).rows[0].id;
      const publicDay = (
        await db.query(
          "INSERT INTO events(owner_id,title,invite_token,visibility) VALUES($1,'Public day',$2,'public') RETURNING id",
          [users.owner, publicInvite],
        )
      ).rows[0].id;
      await db.query(
        "INSERT INTO event_organizers(event_id,user_id) VALUES($1,$2)",
        [privateDay, users.coorganizer],
      );
      const memberEdit = token(),
        anonymousEdit = token(),
        pendingEdit = token();
      for (const [id, edit, approval] of [
        [users.member, memberEdit, "approved"],
        [users.pending, pendingEdit, "pending"],
        [null, anonymousEdit, "approved"],
      ]) {
        await db.query(
          "INSERT INTO guests(event_id,user_id,edit_token_hash,name,status,marker,approval) VALUES($1,$2,$3,'Player','going','rental',$4)",
          [privateDay, id, hashToken(edit!), approval],
        );
      }
      await db.query(
        "INSERT INTO guests(event_id,user_id,edit_token_hash,name,status,marker) VALUES($1,$2,$3,'Public player','going','rental')",
        [publicDay, users.member, hashToken(token())],
      );
      const png = await sharp({
        create: { width: 8, height: 6, channels: 3, background: "#aabbcc" },
      })
        .png()
        .toBuffer();
      const webp = await sharp(png).webp().toBuffer();
      const images: Record<string, string> = {};
      for (const [name, userId, eventId, purpose] of [
        ["privateCover", users.owner, privateDay, "cover"],
        ["privateInvitation", users.owner, privateDay, "invitation"],
        ["publicCover", users.owner, publicDay, "cover"],
        ["publicInvitation", users.owner, publicDay, "invitation"],
        ["ownerAvatar", users.owner, null, "avatar"],
        ["memberAvatar", users.member, null, "avatar"],
        ["pendingAvatar", users.pending, null, "avatar"],
        ["outsiderAvatar", users.outsider, null, "avatar"],
      ]) {
        images[name!] = (
          await db.query(
            "INSERT INTO media(owner_id,event_id,purpose,data) VALUES($1,$2,$3,$4) RETURNING id",
            [userId, eventId, purpose, webp],
          )
        ).rows[0].id;
      }
      for (const name of ["owner", "member", "pending", "outsider"])
        await db.query("UPDATE users SET avatar_id=$2 WHERE id=$1", [
          users[name],
          images[`${name}Avatar`],
        ]);
      await db.query(
        "UPDATE events SET cover_id=$2,invitation_cover_id=$3 WHERE id=$1",
        [privateDay, images.privateCover, images.privateInvitation],
      );
      await db.query(
        "UPDATE events SET cover_id=$2,invitation_cover_id=$3 WHERE id=$1",
        [publicDay, images.publicCover, images.publicInvitation],
      );
      const { GET } = await import("../src/app/media/[id]/route");
      const { saveProfileAction, uploadEventImageAction } =
        await import("../src/app/profile/actions");
      const signIn = async (userId: string | null) => {
        jar.clear();
        if (userId) {
          const session = token();
          await db.query(
            "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 day')",
            [hashToken(session), userId],
          );
          jar.set("splatify_session", session);
        }
      };
      const image = async (id: string, expected: number, invite?: string) => {
        const response = await GET(
          new Request(
            `http://localhost:3000/media/${id}${invite ? `?inviteToken=${encodeURIComponent(invite)}` : ""}`,
          ),
          { params: Promise.resolve({ id }) },
        );
        assert.equal(
          response.status,
          expected,
          `media ${id}: expected ${expected}, received ${response.status}`,
        );
        assert.equal(
          response.headers.get("Cache-Control"),
          "private, no-store",
        );
        assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
        if (expected === 200) {
          assert.equal(response.headers.get("Content-Type"), "image/webp");
          const bytes = Buffer.from(await response.arrayBuffer());
          assert.equal(
            Number(response.headers.get("Content-Length")),
            bytes.length,
          );
          assert.equal((await sharp(bytes).metadata()).format, "webp");
        } else assert.equal((await response.arrayBuffer()).byteLength, 0);
      };
      const call = async (
        action: (form: FormData) => Promise<void>,
        fields: Record<string, string | File>,
        error = false,
      ) => {
        const form = new FormData();
        for (const [key, value] of Object.entries(fields)) form.set(key, value);
        await assert.rejects(action(form), (e) => {
          assert.ok(e && typeof e === "object" && "digest" in e, String(e));
          const destination = String(e.digest);
          assert.equal(destination.includes("?error="), error, destination);
          assert.equal(destination.includes("SELECT "), false);
          return true;
        });
      };
      const file = () =>
        new File([new Uint8Array(png)], "untrusted.png", { type: "image/png" });
      const profile = {
        displayName: "Updated self",
        realName: "Self private name",
        bio: "Self biography",
        marker: "electric",
      };

      await t.test(
        "anonymous public images and private invitation previews never authorize avatars",
        async () => {
          await signIn(null);
          await image(images.publicCover, 200);
          await image(images.publicInvitation, 200);
          await image(images.privateCover, 404);
          await image(images.privateInvitation, 404);
          await image(images.privateCover, 200, privateInvite);
          await image(images.privateInvitation, 200, privateInvite);
          await image(images.privateCover, 404, publicInvite);
          await image(images.privateCover, 404, "invalid");
          await image(images.memberAvatar, 404, privateInvite);
          await image(images.memberAvatar, 404, publicInvite);
          await image(images.ownerAvatar, 404, privateInvite);
          await image(randomUUID(), 404);
          await image("invalid-id", 404);
          jar.set(`splatify_guest_${publicDay}`, memberEdit);
          jar.set(`splatify_guest_${privateDay}`, "malformed");
          await image(images.privateCover, 404);
          await db.query("UPDATE events SET invite_token=$2 WHERE id=$1", [
            privateDay,
            token(),
          ]);
          await image(images.privateInvitation, 404, privateInvite);
          await db.query("UPDATE events SET invite_token=$2 WHERE id=$1", [
            privateDay,
            privateInvite,
          ]);
        },
      );

      await t.test(
        "members, pending guests, organizers and outsiders get only their authorized images",
        async () => {
          await signIn(users.member);
          await image(images.privateCover, 200);
          await image(images.ownerAvatar, 200);
          await image(images.pendingAvatar, 404);
          await image(images.outsiderAvatar, 404);
          await signIn(users.pending);
          await image(images.privateInvitation, 200);
          await image(images.pendingAvatar, 200);
          await image(images.memberAvatar, 404);
          for (const organizer of [users.owner, users.coorganizer]) {
            await signIn(organizer);
            await image(images.privateCover, 200);
            await image(images.memberAvatar, 200);
            await image(images.pendingAvatar, 200);
            await image(images.outsiderAvatar, 404);
          }
          await signIn(users.outsider);
          await image(images.outsiderAvatar, 200);
          await image(images.privateCover, 404);
          await image(images.memberAvatar, 404, privateInvite);
          await signIn(null);
          jar.set(`splatify_guest_${privateDay}`, anonymousEdit);
          await image(images.privateCover, 200);
          await image(images.memberAvatar, 200);
          await image(images.pendingAvatar, 404);
        },
      );

      // These are strict regressions, not expected failures: the media owner must
      // align actor_guests with the account-first authorization used by getDay.
      await t.test(
        "a linked RSVP edit cookie cannot authorize media while signed out",
        async () => {
          await signIn(null);
          jar.set(`splatify_guest_${privateDay}`, memberEdit);
          await image(images.memberAvatar, 404);
          await image(images.privateCover, 404);
        },
      );
      await t.test(
        "another account's linked RSVP cookie cannot authorize private media",
        async () => {
          await signIn(users.outsider);
          jar.set(`splatify_guest_${privateDay}`, memberEdit);
          await image(images.memberAvatar, 404);
          await image(images.privateInvitation, 404);
        },
      );
      await t.test(
        "the account's pending RSVP outranks an approved anonymous cookie",
        async () => {
          await signIn(users.pending);
          jar.set(`splatify_guest_${privateDay}`, anonymousEdit);
          await image(images.memberAvatar, 404);
          await image(images.privateCover, 200);
        },
      );

      await t.test(
        "profile writes and avatar uploads target only the authenticated account",
        async () => {
          await signIn(null);
          await call(
            saveProfileAction,
            { ...profile, userId: users.owner, avatar: file() },
            true,
          );
          const ownerBefore = (
            await db.query("SELECT * FROM users WHERE id=$1", [users.owner])
          ).rows[0];
          await signIn(users.outsider);
          await call(saveProfileAction, {
            ...profile,
            userId: users.owner,
            ownerId: users.owner,
            email: "hijack@test.local",
            adminVerified: "true",
            avatar: file(),
          });
          assert.deepEqual(
            (await db.query("SELECT * FROM users WHERE id=$1", [users.owner]))
              .rows[0],
            ownerBefore,
          );
          const saved = (
            await db.query("SELECT * FROM users WHERE id=$1", [users.outsider])
          ).rows[0];
          assert.equal(saved.name, profile.displayName);
          assert.equal(saved.real_name, profile.realName);
          assert.equal(saved.bio, profile.bio);
          assert.equal(saved.default_marker, profile.marker);
          assert.equal(saved.admin_verified, false);
          assert.equal(saved.email, "outsider@media.test");
          assert.notEqual(saved.avatar_id, images.outsiderAvatar);
          const uploaded = (
            await db.query("SELECT * FROM media WHERE id=$1", [saved.avatar_id])
          ).rows[0];
          assert.equal(uploaded.owner_id, users.outsider);
          assert.equal(uploaded.event_id, null);
          assert.equal(uploaded.purpose, "avatar");
          assert.equal((await sharp(uploaded.data).metadata()).format, "webp");
          assert.equal(
            (
              await db.query("SELECT 1 FROM media WHERE id=$1", [
                images.outsiderAvatar,
              ])
            ).rowCount,
            0,
          );
          await image(saved.avatar_id, 200);
          const invalid = new File(
            ["<svg xmlns='http://www.w3.org/2000/svg'/>"],
            "fake.png",
            { type: "image/png" },
          );
          await call(
            saveProfileAction,
            { ...profile, displayName: "Must roll back", avatar: invalid },
            true,
          );
          assert.deepEqual(
            (
              await db.query("SELECT * FROM users WHERE id=$1", [
                users.outsider,
              ])
            ).rows[0],
            saved,
          );
          origin = "https://attacker.test";
          try {
            await call(
              saveProfileAction,
              { ...profile, displayName: "CSRF" },
              true,
            );
          } finally {
            origin = "http://localhost:3000";
          }
          assert.deepEqual(
            (
              await db.query("SELECT * FROM users WHERE id=$1", [
                users.outsider,
              ])
            ).rows[0],
            saved,
          );
          await call(saveProfileAction, {
            ...profile,
            userId: users.owner,
            removeAvatar: "on",
          });
          assert.equal(
            (
              await db.query("SELECT avatar_id FROM users WHERE id=$1", [
                users.outsider,
              ])
            ).rows[0].avatar_id,
            null,
          );
          assert.equal(
            (
              await db.query("SELECT 1 FROM media WHERE id=$1", [
                saved.avatar_id,
              ])
            ).rowCount,
            0,
          );
          assert.deepEqual(
            (await db.query("SELECT * FROM users WHERE id=$1", [users.owner]))
              .rows[0],
            ownerBefore,
          );
        },
      );

      await t.test(
        "only event organizers can upload or remove event images",
        async () => {
          const before = (
            await db.query(
              "SELECT cover_id,invitation_cover_id FROM events WHERE id=$1",
              [privateDay],
            )
          ).rows[0];
          for (const actor of [
            null,
            users.outsider,
            users.member,
            users.pending,
          ]) {
            await signIn(actor);
            jar.set(`splatify_guest_${privateDay}`, memberEdit);
            await call(
              uploadEventImageAction,
              {
                eventId: privateDay,
                inviteToken: privateInvite,
                ownerId: users.owner,
                purpose: "cover",
                file: file(),
              },
              true,
            );
            await call(
              uploadEventImageAction,
              { eventId: privateDay, purpose: "invitation", remove: "on" },
              true,
            );
          }
          assert.deepEqual(
            (
              await db.query(
                "SELECT cover_id,invitation_cover_id FROM events WHERE id=$1",
                [privateDay],
              )
            ).rows[0],
            before,
          );
          await signIn(users.coorganizer);
          for (const purpose of ["cover", "invitation"]) {
            await call(uploadEventImageAction, {
              eventId: privateDay,
              purpose,
              file: file(),
              ownerId: users.owner,
            });
            const column =
              purpose === "cover" ? "cover_id" : "invitation_cover_id";
            const id = (
              await db.query(`SELECT ${column} AS id FROM events WHERE id=$1`, [
                privateDay,
              ])
            ).rows[0].id;
            const row = (
              await db.query("SELECT * FROM media WHERE id=$1", [id])
            ).rows[0];
            assert.equal(row.owner_id, users.coorganizer);
            assert.equal(row.event_id, privateDay);
            assert.equal(row.purpose, purpose);
            await image(id, 200);
            assert.equal(
              (
                await db.query(
                  "SELECT 1 FROM media WHERE event_id=$1 AND purpose=$2",
                  [privateDay, purpose],
                )
              ).rowCount,
              1,
            );
          }
          await call(
            uploadEventImageAction,
            { eventId: privateDay, purpose: "avatar", file: file() },
            true,
          );
          await call(
            uploadEventImageAction,
            { eventId: publicDay, purpose: "cover", file: file() },
            true,
          );
          const current = (
            await db.query(
              "SELECT cover_id,invitation_cover_id FROM events WHERE id=$1",
              [privateDay],
            )
          ).rows[0];
          await call(
            uploadEventImageAction,
            {
              eventId: privateDay,
              purpose: "cover",
              file: new File(["invalid"], "bad.png"),
            },
            true,
          );
          assert.deepEqual(
            (
              await db.query(
                "SELECT cover_id,invitation_cover_id FROM events WHERE id=$1",
                [privateDay],
              )
            ).rows[0],
            current,
          );
          await call(uploadEventImageAction, {
            eventId: privateDay,
            purpose: "cover",
            remove: "on",
          });
          assert.equal(
            (
              await db.query("SELECT cover_id FROM events WHERE id=$1", [
                privateDay,
              ])
            ).rows[0].cover_id,
            null,
          );
          assert.equal(
            (
              await db.query("SELECT 1 FROM media WHERE id=$1", [
                current.cover_id,
              ])
            ).rowCount,
            0,
          );
          await signIn(users.owner);
          await call(uploadEventImageAction, {
            eventId: publicDay,
            purpose: "cover",
            file: file(),
          });
          const newPublicCover = (
            await db.query("SELECT cover_id FROM events WHERE id=$1", [
              publicDay,
            ])
          ).rows[0].cover_id;
          await signIn(null);
          await image(newPublicCover, 200);
        },
      );
    } finally {
      mock.restoreAll();
      globalDb.splatifyPool = oldPool;
      if (oldUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = oldUrl;
      if (oldAppUrl === undefined) delete process.env.APP_URL;
      else process.env.APP_URL = oldAppUrl;
      await db.end();
      await control.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await control.end();
    }
  },
);
