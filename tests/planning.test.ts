import assert from "node:assert/strict";
import { test, mock } from "node:test";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { hashToken, token } from "../src/lib/security";

test(
  "v1 upgrade and planning actions enforce privacy, identity, roles, approval and pagination",
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    const schema = `splatify_planning_${randomUUID().replaceAll("-", "")}`;
    const control = new Pool({
      connectionString: process.env.TEST_DATABASE_URL,
    });
    const db = new Pool({
      connectionString: process.env.TEST_DATABASE_URL,
      options: `-c search_path=${schema}`,
      max: 10,
    });
    const oldUrl = process.env.DATABASE_URL;
    const globalDb = globalThis as typeof globalThis & { splatifyPool?: Pool };
    const oldPool = globalDb.splatifyPool;
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
    const oldAppUrl = process.env.APP_URL;
    process.env.APP_URL = "http://localhost:3000";
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    globalDb.splatifyPool = db;
    try {
      await control.query(`CREATE SCHEMA ${schema}`);
      await db.query(
        await readFile(
          new URL("../src/lib/schema.sql", import.meta.url),
          "utf8",
        ),
      );
      const owner = (
        await db.query(
          "INSERT INTO users(name,email,password_hash) VALUES('Owner','owner@test.local','test') RETURNING id",
        )
      ).rows[0].id;
      const invite = token(),
        edit = token();
      const eventId = (
        await db.query(
          "INSERT INTO events(owner_id,title,invite_token,capacity) VALUES($1,'Legacy',$2,2) RETURNING id",
          [owner, invite],
        )
      ).rows[0].id;
      const legacy = (
        await db.query(
          "INSERT INTO guests(event_id,edit_token_hash,name,status,marker,team,notes) VALUES($1,$2,'Legacy Player','going','rental','Old free text','private notes') RETURNING id",
          [eventId, hashToken(edit)],
        )
      ).rows[0].id;
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
        [poll, legacy, option],
      );
      await db.query(
        "CREATE TABLE schema_migrations(version integer PRIMARY KEY); INSERT INTO schema_migrations VALUES(1)",
      );
      await db.query("BEGIN");
      await db.query(
        await readFile(
          new URL("../src/lib/migrations/002-planning.sql", import.meta.url),
          "utf8",
        ),
      );
      await db.query("INSERT INTO schema_migrations VALUES(2); COMMIT");
      const migrated = (
        await db.query(
          "SELECT g.*,t.name AS team_name FROM guests g JOIN teams t ON t.id=g.team_id WHERE g.id=$1",
          [legacy],
        )
      ).rows[0];
      assert.equal(migrated.team_name, "Old free text");
      assert.equal(migrated.team, "Old free text");
      assert.equal(migrated.approval, "approved");
      assert.equal(migrated.edit_token_hash, hashToken(edit));
      assert.equal(
        (await db.query("SELECT * FROM poll_votes WHERE guest_id=$1", [legacy]))
          .rowCount,
        1,
      );
      assert.equal(
        (await db.query("SELECT visibility FROM events WHERE id=$1", [eventId]))
          .rows[0].visibility,
        "private",
      );
      assert.deepEqual(
        (
          await db.query(
            "SELECT real_name,bio,avatar_id,default_marker FROM users WHERE id=$1",
            [owner],
          )
        ).rows[0],
        { real_name: "", bio: "", avatar_id: null, default_marker: "rental" },
      );
      const actions = await import("../src/app/actions");
      const data = await import("../src/lib/data");
      const form = (values: Record<string, string>) => {
        const f = new FormData();
        for (const [k, v] of Object.entries(values)) f.set(k, v);
        return f;
      };
      const call = async (
        action: (f: FormData) => Promise<void>,
        values: Record<string, string>,
        error = false,
      ) => {
        let destination = "";
        try {
          await action(form({ eventId, ...values }));
          assert.fail("Action did not redirect");
        } catch (e) {
          assert.ok(e && typeof e === "object" && "digest" in e, String(e));
          destination = String(e.digest);
        }
        assert.equal(destination.includes("?error="), error, destination);
        return destination;
      };
      const signIn = async (id: string | null) => {
        jar.delete("splatify_session");
        if (id) {
          const session = token();
          await db.query(
            "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 day')",
            [hashToken(session), id],
          );
          jar.set("splatify_session", session);
        }
      };
      const member = (
        await db.query(
          "INSERT INTO users(name,email,password_hash,real_name,bio,default_marker) VALUES('Display','member@test.local','test','SECRET LEGAL NAME','Member bio','electric') RETURNING id",
        )
      ).rows[0].id;
      const other = (
        await db.query(
          "INSERT INTO users(name,email,password_hash) VALUES('Other','other@test.local','test') RETURNING id",
        )
      ).rows[0].id;
      assert.equal(await data.getDay(eventId), null);
      const preview = (await data.getSharedEvent(invite))!;
      assert.equal(preview.canViewRoster, false);
      assert.deepEqual(preview.guests, []);
      assert.equal(preview.event.inviteToken, "");
      assert.deepEqual(preview.polls, []);
      assert.equal(preview.estimatedCost, 0);
      await db.query(
        "INSERT INTO gear_items(event_id,name,quantity,cost,category) VALUES($1,'Private rental detail',3,12.50,'rental'),($1,'Private shared detail',8,7.25,'shared')",
        [eventId],
      );
      const costPreview = (await data.getSharedEvent(invite))!;
      assert.equal(
        costPreview.estimatedCost,
        19.75,
        "costs are per-player amounts, not multiplied by quantities",
      );
      assert.deepEqual(costPreview.gear, []);
      assert.equal(
        JSON.stringify(costPreview).includes("Private rental detail"),
        false,
      );
      await db.query(
        "INSERT INTO messages(event_id,user_id,body) VALUES($1,$2,'Account-only board')",
        [eventId, owner],
      );
      jar.set(`splatify_guest_${eventId}`, edit);
      assert.equal((await data.getDay(eventId))!.currentGuest!.id, legacy);
      for (const anonymousDay of [
        (await data.getDay(eventId))!,
        (await data.getSharedEvent(invite))!,
      ]) {
        assert.equal(anonymousDay.canViewRoster, true);
        assert.equal(anonymousDay.isMember, true);
        assert.equal(anonymousDay.canMessage, false);
        assert.deepEqual(anonymousDay.messages, []);
        assert.equal(anonymousDay.messageTotal, 0);
        assert.equal(anonymousDay.estimatedCost, 19.75);
      }
      await signIn(member);
      const unlinkedAccount = (await data.getDay(eventId))!;
      assert.equal(unlinkedAccount.isMember, true);
      assert.equal(unlinkedAccount.canMessage, false);
      assert.deepEqual(unlinkedAccount.messages, []);
      assert.equal(unlinkedAccount.messageTotal, 0);
      await call(actions.submitRsvpAction, { status: "going" });
      const linkedAccount = (await data.getDay(eventId))!;
      assert.equal(linkedAccount.canMessage, true);
      assert.equal(linkedAccount.messages[0].body, "Account-only board");
      assert.equal(linkedAccount.messageTotal, 1);
      await db.query("DELETE FROM messages WHERE event_id=$1", [eventId]);
      const linked = (
        await db.query("SELECT * FROM guests WHERE id=$1", [legacy])
      ).rows[0];
      assert.equal(linked.user_id, member);
      assert.equal(linked.marker, "rental");
      assert.equal(linked.name, "Legacy Player");
      assert.equal(
        (await db.query("SELECT * FROM poll_votes WHERE guest_id=$1", [legacy]))
          .rowCount,
        1,
      );
      assert.equal((await data.getDay(eventId))!.guestEditToken, null);
      await signIn(null);
      assert.equal(
        await data.getDay(eventId),
        null,
        "linked edit cookie alone no longer grants access",
      );
      await call(
        actions.claimGuestAction,
        { inviteToken: invite, editToken: edit },
        true,
      );
      await signIn(other);
      assert.equal(
        await data.getDay(eventId),
        null,
        "foreign linked cookie is ignored",
      );
      await signIn(owner);
      await db.query(
        "UPDATE events SET visibility='public',city='Austin',state='TX',member_invites_enabled=false WHERE id=$1",
        [eventId],
      );
      await signIn(other);
      await call(actions.submitRsvpAction, { status: "going" });
      const pending = (
        await db.query(
          "SELECT * FROM guests WHERE event_id=$1 AND user_id=$2",
          [eventId, other],
        )
      ).rows[0];
      assert.equal(pending.approval, "pending");
      assert.equal(pending.name, "Other");
      assert.equal(pending.marker, "rental");
      let day = (await data.getDay(eventId))!;
      assert.equal(day.canViewRoster, false);
      assert.equal(day.goingCount, 1);
      assert.equal(day.estimatedCost, 19.75);
      assert.deepEqual(day.gear, []);
      assert.deepEqual(day.messages, []);
      await call(actions.voteAction, { pollId: poll, optionId: option }, true);
      await call(actions.addMessageAction, { body: "Not yet" }, true);
      assert.equal((await data.getMyInvitations())[0].inviteToken, "");
      await db.query("UPDATE events SET visibility='private' WHERE id=$1", [
        eventId,
      ]);
      assert.equal(
        (await data.getDay(eventId))!.currentGuest!.approval,
        "pending",
      );
      await signIn(owner);
      assert.equal((await data.getDay(eventId))!.pendingGuests.length, 1);
      await call(actions.approveGuestAction, {
        guestId: pending.id,
        decision: "approved",
      });
      await call(actions.createTeamAction, { name: "Blue", color: "#123456" });
      const team = (
        await db.query(
          "SELECT id FROM teams WHERE event_id=$1 AND name='Blue'",
          [eventId],
        )
      ).rows[0].id;
      await call(actions.updateTeamAction, {
        teamId: team,
        name: "Blue",
        color: "#123456",
        captainUserId: other,
      });
      await call(actions.addOrganizerAction, { userId: member });
      await signIn(other);
      await call(
        actions.assignTeamAction,
        { guestId: legacy, teamId: team },
        true,
      );
      await call(actions.assignTeamAction, {
        guestId: pending.id,
        teamId: team,
      });
      await call(
        actions.updateTeamAction,
        {
          teamId: team,
          name: "Azure",
          color: "#123456",
          captainUserId: member,
        },
        true,
      );
      await call(actions.updateTeamAction, {
        teamId: team,
        name: "Azure",
        color: "#123456",
      });
      assert.equal(
        (await db.query("SELECT team FROM guests WHERE id=$1", [pending.id]))
          .rows[0].team,
        "Azure",
      );
      await call(actions.addMessageAction, { body: "Participant message" });
      await call(actions.addMessageAction, { body: "x".repeat(2001) }, true);
      const message = (
        await db.query("SELECT id FROM messages WHERE event_id=$1", [eventId])
      ).rows[0].id;
      await signIn(member);
      assert.ok(await data.getEvent(eventId));
      assert.equal((await data.getMyEvents()).length, 1);
      await call(actions.deleteEventAction, {}, true);
      await call(actions.addOrganizerAction, { userId: other }, true);
      await call(actions.rotateInviteAction, {});
      assert.equal(await data.getSharedEvent(invite), null);
      assert.ok(
        await data.getDay(eventId),
        "account membership survives token rotation",
      );
      await call(actions.deleteMessageAction, { messageId: message });
      await call(actions.deleteTeamAction, { teamId: team });
      assert.equal(
        (await db.query("SELECT team_id FROM guests WHERE id=$1", [pending.id]))
          .rows[0].team_id,
        null,
      );
      await db.query(
        "INSERT INTO guests(event_id,edit_token_hash,name,status,marker) SELECT $1,md5(random()::text)||n,'Page '||n,'maybe','rental' FROM generate_series(1,25) n",
        [eventId],
      );
      await db.query(
        "INSERT INTO messages(event_id,user_id,body) SELECT $1,$2,'Message '||n FROM generate_series(1,25) n",
        [eventId, other],
      );
      day = (await data.getDay(eventId, { guestPage: 2, messagePage: 2 }))!;
      assert.equal(day.guests.length, 7);
      assert.equal(day.guestTotal, 27);
      assert.equal(day.messages.length, 5);
      assert.equal(day.messageTotal, 25);
      await signIn(other);
      assert.equal(
        JSON.stringify(await data.getDay(eventId)).includes(
          "SECRET LEGAL NAME",
        ),
        false,
      );
      await call(actions.submitRsvpAction, { status: "declined" });
      day = (await data.getDay(eventId))!;
      assert.equal(day.canViewRoster, true);
      assert.equal(day.isMember, false);
      assert.deepEqual(day.messages, []);
      await call(actions.addMessageAction, { body: "Declined" }, true);
      await signIn(null);
      jar.clear();
      await db.query("UPDATE events SET visibility='public' WHERE id=$1", [
        eventId,
      ]);
      const discovery = await data.getPublicEvents({
        city: "austin",
        state: "tx",
      });
      assert.equal(discovery.total, 1);
      assert.equal(discovery.events[0].inviteToken, "");
      assert.equal(discovery.pageSize, 12);
      assert.equal(
        (await data.getPublicEvents({ query: "' OR 1=1 --" })).total,
        0,
      );
      day = (await data.getDay(eventId))!;
      assert.deepEqual(day.guests, []);
      assert.deepEqual(day.teams, []);
      assert.deepEqual(day.messages, []);
      assert.deepEqual(day.memberCandidates, []);
      assert.equal(day.estimatedCost, 19.75);
      assert.deepEqual(day.gear, []);
      assert.equal(
        JSON.stringify(day).includes("Private shared detail"),
        false,
      );
      assert.equal(JSON.stringify(day).includes("private notes"), false);
      await call(actions.submitRsvpAction, { status: "maybe" }, true);
      await call(actions.submitRsvpAction, {
        status: "maybe",
        name: "Anonymous",
        marker: "mechanical",
      });
      assert.equal(
        (await data.getDay(eventId))!.currentGuest!.approval,
        "pending",
      );
      jar.clear();
      await signIn(owner);
      const concurrentId = (
        await db.query(
          "INSERT INTO events(owner_id,title,invite_token,capacity,member_invites_enabled) VALUES($1,'Capacity',$2,1,false) RETURNING id",
          [owner, token()],
        )
      ).rows[0].id;
      const requests = (
        await db.query(
          "INSERT INTO guests(event_id,edit_token_hash,name,status,marker,approval) SELECT $1,md5(random()::text)||n,'Request '||n,'going','rental','pending' FROM generate_series(1,2) n RETURNING id",
          [concurrentId],
        )
      ).rows;
      const approvals = await Promise.all(
        requests.map(async (request) => {
          try {
            await actions.approveGuestAction(
              form({
                eventId: concurrentId,
                guestId: request.id,
                decision: "approved",
              }),
            );
            return false;
          } catch (e) {
            assert.ok(e && typeof e === "object" && "digest" in e);
            return !String(e.digest).includes("?error=");
          }
        }),
      );
      assert.equal(
        approvals.filter(Boolean).length,
        1,
        "concurrent approvals reserve only one slot",
      );
      assert.equal(
        (
          await db.query(
            "SELECT * FROM guests WHERE event_id=$1 AND approval='approved'",
            [concurrentId],
          )
        ).rowCount,
        1,
      );
      await db.query("DELETE FROM events WHERE id=$1", [concurrentId]);
      await call(actions.createEventAction, {
        title: "New public day",
        description: "",
        date: "",
        time: "",
        timezone: "UTC",
        venue: "Field",
        address: "",
        capacity: "0",
        currency: "USD",
        theme: "forest",
        city: "Dallas",
        state: "TX",
        visibility: "public",
        memberInvitesEnabled: "false",
        invitationHeading: "Join us",
        invitationMessage: "Request a spot",
        accentColor: "#123456",
      });
      const created = (
        await db.query("SELECT * FROM events WHERE title='New public day'")
      ).rows[0];
      await assert.rejects(
        actions.createTeamAction(created.id, "Positional team", "#abcdef"),
        (e) =>
          !!e &&
          typeof e === "object" &&
          "digest" in e &&
          !String(e.digest).includes("?error="),
      );
      assert.equal(created.visibility, "public");
      assert.equal(created.member_invites_enabled, false);
      assert.equal(created.invitation_heading, "Join us");
      await call(actions.updateEventAction, {
        eventId: created.id,
        title: "Updated day",
        description: "",
        date: "",
        time: "",
        timezone: "UTC",
        venue: "Field",
        address: "",
        capacity: "0",
        currency: "USD",
        theme: "forest",
      });
      const updated = (
        await db.query("SELECT * FROM events WHERE id=$1", [created.id])
      ).rows[0];
      assert.equal(updated.city, "Dallas");
      assert.equal(updated.member_invites_enabled, false);
      assert.equal(updated.accent_color, "#123456");
      await db.query("DELETE FROM events WHERE id=$1", [created.id]);
      await db.query(
        "INSERT INTO media(owner_id,event_id,purpose,data) VALUES($1,$2,'cover',$3)",
        [owner, eventId, Buffer.from("test")],
      );
      await db.query("DELETE FROM events WHERE id=$1", [eventId]);
      for (const table of [
        "guests",
        "teams",
        "messages",
        "event_organizers",
        "media",
        "poll_votes",
      ])
        assert.equal(
          (await db.query(`SELECT * FROM ${table}`)).rowCount,
          0,
          table,
        );
      await db.query(
        "INSERT INTO events(owner_id,title,invite_token,visibility) SELECT $1,'Discovery '||n,md5(random()::text)||n,'public' FROM generate_series(1,14) n",
        [owner],
      );
      const firstPage = await data.getPublicEvents(),
        secondPage = await data.getPublicEvents({ page: 2 });
      assert.equal(firstPage.events.length, 12);
      assert.equal(secondPage.events.length, 2);
      assert.equal(secondPage.total, 14);
      assert.equal(
        firstPage.events.some((a) =>
          secondPage.events.some((b) => a.id === b.id),
        ),
        false,
      );
      await signIn(null);
      jar.clear();
      await call(actions.signupAction, {
        name: "New member",
        email: "new@test.local",
        password: "a strong unique password",
        next: "/profile",
      });
      assert.ok(jar.get("splatify_next"));
      await assert.rejects(
        actions.acknowledgeRecoveryAction(),
        (e) =>
          !!e &&
          typeof e === "object" &&
          "digest" in e &&
          String(e.digest).includes(";/profile;"),
      );
      assert.equal(jar.get("splatify_next"), "");
      await call(actions.loginAction, {
        email: "new@test.local",
        password: "a strong unique password",
        next: "//evil.test",
      });
      const auth = await import("../src/lib/auth");
      await auth.setAuthReturn("/profile", jar.get("splatify_session")!);
      jar.set(
        "splatify_next",
        jar.get("splatify_next")!.slice(0, -5) + "XXXXX",
      );
      assert.equal(await auth.consumeAuthReturn(), "/dashboard");
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
