import assert from "node:assert/strict";
import { test, mock } from "node:test";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { hashToken, token } from "../src/lib/security";
import { TEAM_ICON_KEYS } from "../src/lib/team-icons";
import {
  teamIconSchema,
  sponsorSchema,
  planningEventSchema,
} from "../src/lib/validation";

test("community validation has 24 stable badges and HTTPS-only optional sponsors", () => {
  assert.equal(TEAM_ICON_KEYS.length, 24);
  assert.equal(new Set(TEAM_ICON_KEYS).size, 24);
  for (const key of TEAM_ICON_KEYS)
    assert.equal(teamIconSchema.parse(key), key);
  for (const key of ["Shield", "", "<svg>", "unknown"])
    assert.equal(teamIconSchema.safeParse(key).success, false);
  assert.equal(planningEventSchema.parse({}).sponsorsEnabled, false);
  for (const url of ["", "https://example.com/sponsor?a=1"])
    assert.ok(sponsorSchema.safeParse({ name: "Sponsor", url }).success);
  for (const url of [
    "http://example.com",
    "javascript:alert(1)",
    "//example.com",
    "https://user:secret@example.com",
    "https://",
    "https:example.com",
    "https://example.com/" + "x".repeat(500),
  ])
    assert.equal(
      sponsorSchema.safeParse({ name: "Sponsor", url }).success,
      false,
      url,
    );
  assert.equal(
    sponsorSchema.safeParse({ name: "x".repeat(101) }).success,
    false,
  );
});

test(
  "v2 upgrade, atomic teams, withdrawal, attendance and community DTO boundaries",
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    const schema = `splatify_community_${randomUUID().replaceAll("-", "")}`;
    const control = new Pool({
      connectionString: process.env.TEST_DATABASE_URL,
    });
    const db = new Pool({
      connectionString: process.env.TEST_DATABASE_URL,
      options: `-c search_path=${schema}`,
    });
    const globalDb = globalThis as typeof globalThis & { splatifyPool?: Pool };
    const oldPool = globalDb.splatifyPool,
      oldUrl = process.env.DATABASE_URL,
      oldAppUrl = process.env.APP_URL;
    const require = createRequire(import.meta.url);
    const jar = new Map<string, string>();
    mock.method(require("next/headers"), "cookies", async () => ({
      get: (key: string) =>
        jar.has(key) ? { value: jar.get(key) } : undefined,
      set: (key: string, value: string) => {
        jar.set(key, value);
      },
    }));
    mock.method(
      require("next/headers"),
      "headers",
      async () =>
        new Headers({
          origin: "http://localhost:3000",
          host: "localhost:3000",
        }),
    );
    mock.method(require("next/server"), "connection", async () => {});
    mock.method(require("next/cache"), "revalidatePath", () => {});
    process.env.APP_URL = "http://localhost:3000";
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    globalDb.splatifyPool = db;
    try {
      await control.query(`CREATE SCHEMA ${schema}`);
      for (const path of ["schema.sql", "migrations/002-planning.sql"])
        await db.query(
          await readFile(
            new URL(`../src/lib/${path}`, import.meta.url),
            "utf8",
          ),
        );
      const owner = (
        await db.query(
          "INSERT INTO users(name,email,password_hash) VALUES('Owner','owner@test.local','test') RETURNING id",
        )
      ).rows[0].id;
      const invite = token();
      const eventId = (
        await db.query(
          "INSERT INTO events(owner_id,title,invite_token) VALUES($1,'Private legacy',$2) RETURNING id",
          [owner, invite],
        )
      ).rows[0].id;
      await db.query(
        await readFile(
          new URL("../src/lib/migrations/003-community.sql", import.meta.url),
          "utf8",
        ),
      );
      assert.deepEqual(
        (
          await db.query(
            "SELECT visibility,sponsors_enabled FROM events WHERE id=$1",
            [eventId],
          )
        ).rows[0],
        { visibility: "private", sponsors_enabled: false },
      );
      assert.deepEqual(
        (
          await db.query(
            "SELECT first_name,profile_slug,public_profile_enabled FROM users WHERE id=$1",
            [owner],
          )
        ).rows[0],
        { first_name: "", profile_slug: null, public_profile_enabled: false },
      );
      assert.equal(
        (await db.query("SELECT sponsors_enabled FROM settings")).rows[0]
          .sponsors_enabled,
        true,
      );
      await assert.rejects(
        db.query("UPDATE users SET profile_slug='MixedCase' WHERE id=$1", [
          owner,
        ]),
      );
      const actions = await import("../src/app/actions");
      const data = await import("../src/lib/data");
      const signIn = async (id: string | null) => {
        jar.delete("splatify_session");
        if (id) {
          const raw = token();
          await db.query(
            "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 day')",
            [hashToken(raw), id],
          );
          jar.set("splatify_session", raw);
        }
      };
      const call = async (
        action: (f: FormData) => Promise<void>,
        values: Record<string, string | string[]> = {},
        error = false,
      ) => {
        const form = new FormData();
        for (const [key, value] of Object.entries({
          eventId,
          returnSection: "teams",
          ...values,
        }))
          for (const item of Array.isArray(value) ? value : [value])
            form.append(key, item);
        await assert.rejects(action(form), (e) => {
          assert.ok(e && typeof e === "object" && "digest" in e, String(e));
          assert.equal(
            String(e.digest).includes("?error="),
            error,
            String(e.digest),
          );
          assert.ok(String(e.digest).includes(`/days/${eventId}/teams`));
          return true;
        });
      };
      const captain = (
        await db.query(
          "INSERT INTO users(name,email,password_hash,real_name,first_name,profile_slug,public_profile_enabled) VALUES('Alias','captain@test.local','test','SECRET LEGAL NAME','Sam','sam',true) RETURNING id",
        )
      ).rows[0].id;
      await db.query(
        "INSERT INTO loadout_items(user_id,category,name,notes) VALUES($1,'marker','Primary marker','PRIVATE LOADOUT NOTE')",
        [captain],
      );
      const cookie = token();
      const captainGuest = (
        await db.query(
          "INSERT INTO guests(event_id,user_id,edit_token_hash,name,status,marker) VALUES($1,$2,$3,'Alias','going','rental') RETURNING id",
          [eventId, captain, hashToken(cookie)],
        )
      ).rows[0].id;
      const players = (
        await db.query(
          "INSERT INTO guests(event_id,edit_token_hash,name,status,marker) SELECT $1,md5(random()::text)||n,'Player '||n,'maybe','rental' FROM generate_series(1,25) n RETURNING id",
          [eventId],
        )
      ).rows.map((r) => r.id);
      await signIn(owner);
      await call(actions.createTeamAction, {
        name: "Alpha",
        logoIcon: "swords",
      });
      await call(actions.createTeamAction, { name: "Beta" });
      await call(
        actions.createTeamAction,
        { name: "Invalid", logoIcon: "not-a-badge" },
        true,
      );
      const teams = (
        await db.query("SELECT * FROM teams WHERE event_id=$1 ORDER BY name", [
          eventId,
        ])
      ).rows;
      assert.equal(teams[1].logo_icon, "shield");
      const alpha = teams[0].id,
        beta = teams[1].id;
      await call(actions.updateTeamAction, {
        teamId: alpha,
        name: "Alpha",
        color: "#123456",
        captainUserId: captain,
      });
      assert.equal(
        (await db.query("SELECT logo_icon FROM teams WHERE id=$1", [alpha]))
          .rows[0].logo_icon,
        "swords",
      );
      const foreignEvent = (
        await db.query(
          "INSERT INTO events(owner_id,title,invite_token) VALUES($1,'Foreign',$2) RETURNING id",
          [owner, token()],
        )
      ).rows[0].id;
      const foreignGuest = (
        await db.query(
          "INSERT INTO guests(event_id,edit_token_hash,name,status,marker) VALUES($1,$2,'Foreign','going','rental') RETURNING id",
          [foreignEvent, hashToken(token())],
        )
      ).rows[0].id;
      const foreignTeam = (
        await db.query(
          "INSERT INTO teams(event_id,name) VALUES($1,'Foreign') RETURNING id",
          [foreignEvent],
        )
      ).rows[0].id;
      await call(
        actions.batchAssignTeamAction,
        { teamId: alpha, guestIds: [players[0], foreignGuest] },
        true,
      );
      assert.equal(
        (await db.query("SELECT team_id FROM guests WHERE id=$1", [players[0]]))
          .rows[0].team_id,
        null,
      );
      await call(
        actions.batchAssignTeamAction,
        { teamId: foreignTeam, guestIds: [players[0]] },
        true,
      );
      await call(
        actions.batchAssignTeamAction,
        { teamId: alpha, guestIds: [] },
        true,
      );
      await call(
        actions.batchAssignTeamAction,
        {
          teamId: alpha,
          guestIds: Array.from({ length: 101 }, () => randomUUID()),
        },
        true,
      );
      await call(actions.batchAssignTeamAction, {
        teamId: beta,
        guestIds: [players[1]],
      });
      await signIn(captain);
      await call(
        actions.batchAssignTeamAction,
        { teamId: alpha, guestIds: [players[0], players[1]] },
        true,
      );
      assert.equal(
        (await db.query("SELECT team_id FROM guests WHERE id=$1", [players[0]]))
          .rows[0].team_id,
        null,
      );
      await call(
        actions.batchAssignTeamAction,
        { teamId: beta, guestIds: [players[0]] },
        true,
      );
      await call(
        actions.batchAssignTeamAction,
        { teamId: "", guestIds: [players[1]] },
        true,
      );
      await call(actions.batchAssignTeamAction, {
        teamId: alpha,
        guestIds: [players[0], players[0], captainGuest],
      });
      await call(actions.batchAssignTeamAction, {
        teamId: "",
        guestIds: [players[0]],
      });
      await call(actions.updateTeamAction, {
        teamId: alpha,
        name: "Alpha",
        color: "#123456",
        logoIcon: "shield-check",
      });
      await call(
        actions.updateTeamAction,
        { teamId: alpha, name: "Alpha", color: "#123456", captainUserId: "" },
        true,
      );
      await call(
        actions.setAttendanceAction,
        { guestId: captainGuest, attended: "on" },
        true,
      );
      await call(actions.addSponsorAction, { name: "Unauthorized" }, true);
      await signIn(owner);
      await call(
        actions.setAttendanceAction,
        { guestId: captainGuest, attended: "on" },
        true,
      );
      await db.query("UPDATE events SET date=CURRENT_DATE+1 WHERE id=$1", [
        eventId,
      ]);
      await call(
        actions.setAttendanceAction,
        { guestId: captainGuest, attended: "on" },
        true,
      );
      await db.query("UPDATE events SET date=CURRENT_DATE WHERE id=$1", [
        eventId,
      ]);
      await call(actions.setAttendanceAction, {
        guestId: captainGuest,
        attended: "on",
      });
      await call(actions.setAttendanceAction, {
        guestId: players[0],
        attended: "on",
      });
      await db.query("UPDATE events SET date=NULL WHERE id=$1", [eventId]);
      await call(actions.setAttendanceAction, { guestId: players[0] });
      let day = (await data.getDay(eventId))!;
      assert.equal(day.guests.length, 20);
      assert.equal(day.teamPlayers.length, 26);
      assert.equal(
        day.teamPlayers.find((g) => g.id === captainGuest)!.profileSlug,
        "sam",
      );
      assert.equal(
        day.teamPlayers.find((g) => g.id === captainGuest)!.firstName,
        "Sam",
      );
      assert.equal(
        day.teamPlayers.find((g) => g.id === captainGuest)!.loadoutPreview,
        "Primary marker",
      );
      assert.equal(JSON.stringify(day).includes("SECRET LEGAL NAME"), false);
      assert.equal(JSON.stringify(day).includes("PRIVATE LOADOUT NOTE"), false);
      await db.query("UPDATE settings SET public_profiles_enabled=false");
      assert.equal(
        (await data.getDay(eventId))!.teamPlayers.find(
          (g) => g.id === captainGuest,
        )!.profileSlug,
        null,
      );
      await db.query("UPDATE settings SET public_profiles_enabled=true");
      await db.query(
        "UPDATE users SET public_profile_enabled=false WHERE id=$1",
        [captain],
      );
      assert.equal(
        (await data.getDay(eventId))!.teamPlayers.find(
          (g) => g.id === captainGuest,
        )!.profileSlug,
        null,
      );
      await call(actions.addSponsorAction, {
        name: "Hidden sponsor",
        url: "https://example.com",
      });
      assert.deepEqual((await data.getDay(eventId))!.sponsors, []);
      const eventFields = {
        title: "Community day",
        description: "",
        date: "",
        time: "",
        timezone: "UTC",
        venue: "",
        address: "",
        capacity: "0",
        currency: "USD",
        theme: "forest",
      };
      await call(actions.updateEventAction, {
        ...eventFields,
        sponsorsEnabledPresent: "1",
        sponsorsEnabled: "on",
      });
      assert.equal((await data.getDay(eventId))!.sponsors.length, 1);
      await call(actions.updateEventAction, eventFields);
      assert.equal(
        (await data.getDay(eventId))!.event.sponsorsEnabled,
        true,
        "omitted checkbox preserves the current setting",
      );
      await call(actions.updateEventAction, {
        ...eventFields,
        sponsorsEnabledPresent: "1",
      });
      assert.deepEqual((await data.getDay(eventId))!.sponsors, []);
      await db.query("UPDATE settings SET sponsors_enabled=false");
      await call(
        actions.updateEventAction,
        { ...eventFields, sponsorsEnabledPresent: "1", sponsorsEnabled: "on" },
        true,
      );
      await db.query("UPDATE settings SET sponsors_enabled=true");
      await call(actions.updateEventAction, {
        ...eventFields,
        sponsorsEnabledPresent: "1",
        sponsorsEnabled: "on",
      });
      await db.query("UPDATE events SET visibility='public' WHERE id=$1", [
        eventId,
      ]);
      await signIn(null);
      day = (await data.getDay(eventId))!;
      assert.equal(day.sponsors[0].name, "Hidden sponsor");
      assert.deepEqual(day.teamPlayers, []);
      assert.equal(JSON.stringify(day).includes("Primary marker"), false);
      await db.query(
        "UPDATE settings SET sponsors_enabled=false,discovery_enabled=false",
      );
      assert.deepEqual((await data.getDay(eventId))!.sponsors, []);
      assert.deepEqual((await data.getPublicEvents()).events, []);
      assert.ok(
        await data.getDay(eventId),
        "discovery switch does not disable direct URLs",
      );
      await signIn(owner);
      await call(actions.addSponsorAction, { name: "Disabled" }, true);
      const sponsorId = (
        await db.query("SELECT id FROM event_sponsors WHERE event_id=$1", [
          eventId,
        ])
      ).rows[0].id;
      await call(actions.deleteSponsorAction, { sponsorId }, true);
      await db.query("UPDATE settings SET sponsors_enabled=true");
      for (let i = 1; i < 12; i++)
        await call(actions.addSponsorAction, { name: `Sponsor ${i}` });
      await call(actions.addSponsorAction, { name: "Too many" }, true);
      await call(
        actions.deleteSponsorAction,
        { sponsorId: randomUUID() },
        true,
      );
      await call(actions.deleteSponsorAction, { sponsorId });
      const poll = (
        await db.query(
          "INSERT INTO polls(event_id,question) VALUES($1,'Map?') RETURNING id",
          [eventId],
        )
      ).rows[0].id;
      const option = (
        await db.query(
          "INSERT INTO poll_options(poll_id,label,position) VALUES($1,'Woods',0) RETURNING id",
          [poll],
        )
      ).rows[0].id;
      await db.query(
        "INSERT INTO poll_votes(poll_id,guest_id,option_id) VALUES($1,$2,$3)",
        [poll, captainGuest, option],
      );
      await signIn(captain);
      await call(actions.withdrawRsvpAction);
      day = (await data.getDay(eventId))!;
      assert.equal(day.canViewRoster, false);
      assert.deepEqual(day.teamPlayers, []);
      assert.equal(
        day.currentGuest!.attended,
        true,
        "withdrawal retains actual attendance history",
      );
      assert.equal(day.currentGuest!.teamId, null);
      assert.equal(
        (
          await db.query("SELECT captain_user_id FROM teams WHERE id=$1", [
            alpha,
          ])
        ).rows[0].captain_user_id,
        null,
      );
      assert.equal(
        (
          await db.query("SELECT * FROM poll_votes WHERE guest_id=$1", [
            captainGuest,
          ])
        ).rowCount,
        1,
      );
      await call(
        actions.batchAssignTeamAction,
        { teamId: alpha, guestIds: [players[0]] },
        true,
      );
      await signIn(owner);
      day = (await data.getDay(eventId))!;
      assert.equal(day.guestTotal, 25);
      assert.equal(day.teamPlayers.length, 25);
      assert.equal(day.polls[0].options[0].votes, 0);
      await call(
        actions.batchAssignTeamAction,
        { teamId: alpha, guestIds: [players[0], captainGuest] },
        true,
      );
      await signIn(null);
      jar.set(`splatify_guest_${eventId}`, cookie);
      await call(actions.withdrawRsvpAction, {}, true);
      const anonymousCookie = token();
      await db.query("UPDATE guests SET edit_token_hash=$2 WHERE id=$1", [
        players[0],
        hashToken(anonymousCookie),
      ]);
      jar.set(`splatify_guest_${eventId}`, anonymousCookie);
      await call(actions.withdrawRsvpAction);
      assert.equal(
        (await data.getDay(eventId))!.currentGuest!.status,
        "declined",
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
