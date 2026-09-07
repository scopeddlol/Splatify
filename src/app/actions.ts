"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { PoolClient } from "pg";
import { query, transaction, logActivity } from "@/lib/db";
import {
  getUser,
  protectAction,
  rateLimit,
  isAdminAccount,
  createSession,
  setSession,
  clearSession,
  clearRecovery,
  guestToken,
  setGuestToken,
} from "@/lib/auth";
import {
  hashPassword,
  verifyPassword,
  token,
  hashToken,
  recoveryCodes,
  normalizeRecoveryCode,
  canUsePublicRecovery,
} from "@/lib/security";
import {
  PublicError,
  idSchema,
  tokenSchema,
  emailSchema,
  passwordSchema,
  nameSchema,
  eventSchema,
  rsvpSchema,
  scheduleSchema,
  gearSchema,
  pollSchema,
  field,
  fields,
} from "@/lib/validation";
import type { User } from "@/lib/types";

async function run(
  fallback: string,
  work: () => Promise<string>,
): Promise<void> {
  let destination: string;
  try {
    await protectAction();
    destination = await work();
  } catch (error) {
    const message =
      error instanceof PublicError
        ? error.message
        : error instanceof z.ZodError
          ? "Check your entries and try again. Some fields are missing or invalid."
          : "Unable to complete this request. Please try again.";
    if (!(error instanceof PublicError) && !(error instanceof z.ZodError))
      console.error(
        "Splatify action failed",
        error instanceof Error ? error.name : "UnknownError",
      );
    redirect(`${fallback}?error=${encodeURIComponent(message)}`);
  }
  revalidatePath("/", "layout");
  redirect(destination);
}
function eventPath(form: FormData): string {
  const id = field(form, "eventId");
  return idSchema.safeParse(id).success ? `/events/${id}` : "/dashboard";
}
function invitePath(form: FormData): string {
  const invite = field(form, "inviteToken");
  return tokenSchema.safeParse(invite).success ? `/invite/${invite}` : "/";
}
function success(path: string, message = "Changes saved."): string {
  return `${path}?success=${encodeURIComponent(message)}`;
}
async function actor(admin = false): Promise<User> {
  const user = await getUser();
  if (!user) throw new PublicError("Please sign in to continue.");
  if (admin && !user.isAdmin)
    throw new PublicError("Administrator access required.");
  await rateLimit(`user:${user.id}`, 120, 60);
  return user;
}
async function adminLock(client: PoolClient, user: User): Promise<void> {
  const {
    rows: [row],
  } = await client.query(
    "SELECT email,admin_verified FROM users WHERE id=$1 FOR UPDATE",
    [user.id],
  );
  if (!row || !isAdminAccount(row.email, row.admin_verified))
    throw new PublicError("Administrator access required.");
}
async function owned(
  form: FormData,
  work: (
    client: PoolClient,
    eventId: string,
    event: Record<string, unknown>,
  ) => Promise<void>,
): Promise<string> {
  const user = await actor();
  const eventId = idSchema.parse(field(form, "eventId"));
  await transaction(async (client) => {
    const {
      rows: [event],
    } = await client.query(
      "SELECT * FROM events WHERE id=$1 AND owner_id=$2 FOR UPDATE",
      [eventId, user.id],
    );
    if (!event) throw new PublicError("Event not found or access denied.");
    await work(client, eventId, event);
    await logActivity(
      client,
      "event.updated",
      `Event ${eventId} updated by ${user.id}`,
    );
  });
  return success(`/events/${eventId}`);
}
async function itemLimit(
  client: PoolClient,
  table: "schedule_items" | "gear_items" | "announcements" | "polls",
  eventId: string,
): Promise<void> {
  const {
    rows: [row],
  } = await client.query(
    `SELECT count(*)::int AS count FROM ${table} WHERE event_id=$1`,
    [eventId],
  );
  if (row.count >= (table === "polls" ? 50 : 100))
    throw new PublicError("This event has reached the limit for these items.");
}
async function deleteItem(
  form: FormData,
  table: "schedule_items" | "gear_items" | "announcements" | "polls",
): Promise<string> {
  return owned(form, async (client, eventId) => {
    const result = await client.query(
      `DELETE FROM ${table} WHERE event_id=$1 AND id=$2`,
      [eventId, idSchema.parse(field(form, "itemId"))],
    );
    if (!result.rowCount) throw new PublicError("Item not found.");
  });
}

export async function signupAction(form: FormData): Promise<void> {
  await run("/signup", async () => {
    const email = emailSchema.parse(field(form, "email"));
    const name = nameSchema.parse(field(form, "name"));
    const password = passwordSchema.parse(field(form, "password"));
    await rateLimit(`signup:${email}`, 5, 3600);
    await rateLimit("signup:global", 100, 3600);
    const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    if (adminEmail === email)
      throw new PublicError(
        "This account is managed by the server environment and cannot be registered publicly.",
      );
    const passwordHash = await hashPassword(password);
    const codes = recoveryCodes();
    const raw = await transaction(async (client) => {
      const {
        rows: [settings],
      } = await client.query(
        "SELECT registration_enabled FROM settings WHERE id=1 FOR SHARE",
      );
      if (!settings?.registration_enabled)
        throw new PublicError("Registration is currently disabled.");
      const result = await client.query(
        "INSERT INTO users(name,email,password_hash) VALUES($1,$2,$3) ON CONFLICT(email) DO NOTHING RETURNING id",
        [name, email, passwordHash],
      );
      if (!result.rowCount)
        throw new PublicError(
          "Unable to create this account. Try signing in or recovering your account.",
        );
      const userId = result.rows[0].id;
      for (const code of codes)
        await client.query(
          "INSERT INTO recovery_codes(user_id,code_hash) VALUES($1,$2)",
          [userId, hashToken(normalizeRecoveryCode(code))],
        );
      await logActivity(client, "user.created", `Account ${userId} created`);
      return createSession(client, userId);
    });
    await setSession(raw, codes);
    return "/recovery-codes";
  });
}
export async function loginAction(form: FormData): Promise<void> {
  await run("/login", async () => {
    const email = emailSchema.parse(field(form, "email"));
    const password = z.string().min(1).max(128).parse(field(form, "password"));
    await rateLimit(`login:${email}`, 10, 900);
    await rateLimit("auth:global", 300, 900);
    const raw = await transaction(async (client) => {
      const {
        rows: [user],
      } = await client.query(
        "SELECT id,password_hash FROM users WHERE email=$1 FOR UPDATE",
        [email],
      );
      const dummy = `scrypt$32768$8$1$${"0".repeat(32)}$${"0".repeat(128)}`;
      const valid = await verifyPassword(
        password,
        user?.password_hash ?? dummy,
      );
      if (!user || !valid)
        throw new PublicError("Email or password is incorrect.");
      await logActivity(client, "user.login", `Account ${user.id} signed in`);
      return createSession(client, user.id);
    });
    await setSession(raw);
    return "/dashboard";
  });
}
export async function logoutAction(): Promise<void> {
  await run("/dashboard", async () => {
    await clearSession();
    return "/login";
  });
}
export async function recoverAction(form: FormData): Promise<void> {
  await run("/recover", async () => {
    const email = emailSchema.parse(field(form, "email"));
    const code = z.string().min(1).max(100).parse(field(form, "recoveryCode"));
    const password = passwordSchema.parse(field(form, "password"));
    await rateLimit(`recover:${email}`, 6, 900);
    await rateLimit("auth:global", 300, 900);
    const passwordHash = await hashPassword(password);
    const raw = await transaction(async (client) => {
      const {
        rows: [user],
      } = await client.query(
        "SELECT id,admin_verified FROM users WHERE email=$1 FOR UPDATE",
        [email],
      );
      if (!user || !canUsePublicRecovery(email, user.admin_verified))
        throw new PublicError("Email or recovery code is incorrect.");
      const used = await client.query(
        "DELETE FROM recovery_codes WHERE user_id=$1 AND code_hash=$2 RETURNING user_id",
        [user.id, hashToken(normalizeRecoveryCode(code))],
      );
      if (!used.rowCount)
        throw new PublicError("Email or recovery code is incorrect.");
      await client.query("UPDATE users SET password_hash=$1 WHERE id=$2", [
        passwordHash,
        user.id,
      ]);
      await client.query("DELETE FROM sessions WHERE user_id=$1", [user.id]);
      await logActivity(
        client,
        "user.recovered",
        `Account ${user.id} recovered; all previous sessions revoked`,
      );
      return createSession(client, user.id);
    });
    await setSession(raw);
    return success(
      "/dashboard",
      "Password reset. Your recovery code has been used.",
    );
  });
}
export async function acknowledgeRecoveryAction(): Promise<void> {
  await run("/recovery-codes", async () => {
    await actor();
    await clearRecovery();
    return "/dashboard";
  });
}

export async function createEventAction(form: FormData): Promise<void> {
  await run("/events/new", async () => {
    const user = await actor();
    const e = eventSchema.parse(fields(form));
    const id = await transaction(async (client) => {
      await client.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [
        user.id,
      ]);
      const {
        rows: [settings],
      } = await client.query(
        "SELECT event_creation_enabled FROM settings WHERE id=1 FOR SHARE",
      );
      if (!settings?.event_creation_enabled)
        throw new PublicError("Event creation is currently disabled.");
      const {
        rows: [count],
      } = await client.query(
        "SELECT count(*)::int AS count FROM events WHERE owner_id=$1",
        [user.id],
      );
      if (count.count >= 100)
        throw new PublicError("You have reached the 100 event limit.");
      const {
        rows: [event],
      } = await client.query(
        "INSERT INTO events(owner_id,title,description,date,time,timezone,venue,address,capacity,currency,theme,invite_token) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id",
        [
          user.id,
          e.title,
          e.description,
          e.date || null,
          e.time,
          e.timezone,
          e.venue,
          e.address,
          e.capacity,
          e.currency,
          e.theme,
          token(),
        ],
      );
      await logActivity(
        client,
        "event.created",
        `Event ${event.id} created by ${user.id}`,
      );
      return event.id;
    });
    return `/events/${id}`;
  });
}
export async function updateEventAction(form: FormData): Promise<void> {
  await run(eventPath(form), () =>
    owned(form, async (client, eventId) => {
      const e = eventSchema.parse(fields(form));
      const {
        rows: [count],
      } = await client.query(
        "SELECT count(*)::int AS count FROM guests WHERE event_id=$1 AND status='going'",
        [eventId],
      );
      if (e.capacity && e.capacity < count.count)
        throw new PublicError(
          "Capacity cannot be lower than the number of confirmed players.",
        );
      await client.query(
        "UPDATE events SET title=$2,description=$3,date=$4,time=$5,timezone=$6,venue=$7,address=$8,capacity=$9,currency=$10,theme=$11 WHERE id=$1",
        [
          eventId,
          e.title,
          e.description,
          e.date || null,
          e.time,
          e.timezone,
          e.venue,
          e.address,
          e.capacity,
          e.currency,
          e.theme,
        ],
      );
    }),
  );
}
export async function deleteEventAction(form: FormData): Promise<void> {
  await run(eventPath(form), async () => {
    await owned(form, async (client, eventId) => {
      await client.query("DELETE FROM events WHERE id=$1", [eventId]);
      await logActivity(client, "event.deleted", `Event ${eventId} deleted`);
    });
    return success("/dashboard", "Event deleted.");
  });
}
export async function rotateInviteAction(form: FormData): Promise<void> {
  await run(eventPath(form), () =>
    owned(form, async (client, eventId) => {
      await client.query("UPDATE events SET invite_token=$2 WHERE id=$1", [
        eventId,
        token(),
      ]);
    }),
  );
}
export async function addScheduleAction(form: FormData): Promise<void> {
  await run(eventPath(form), () =>
    owned(form, async (client, eventId) => {
      const item = scheduleSchema.parse(fields(form));
      await itemLimit(client, "schedule_items", eventId);
      await client.query(
        "INSERT INTO schedule_items(event_id,time,title,description) VALUES($1,$2,$3,$4)",
        [eventId, item.time, item.title, item.description],
      );
    }),
  );
}
export async function deleteScheduleAction(form: FormData): Promise<void> {
  await run(eventPath(form), () => deleteItem(form, "schedule_items"));
}
export async function addGearAction(form: FormData): Promise<void> {
  await run(eventPath(form), () =>
    owned(form, async (client, eventId) => {
      const item = gearSchema.parse(fields(form));
      await itemLimit(client, "gear_items", eventId);
      await client.query(
        "INSERT INTO gear_items(event_id,name,quantity,cost,category) VALUES($1,$2,$3,$4,$5)",
        [eventId, item.name, item.quantity, item.cost, item.category],
      );
    }),
  );
}
export async function deleteGearAction(form: FormData): Promise<void> {
  await run(eventPath(form), () => deleteItem(form, "gear_items"));
}
export async function addAnnouncementAction(form: FormData): Promise<void> {
  await run(eventPath(form), () =>
    owned(form, async (client, eventId) => {
      const body = z
        .string()
        .trim()
        .min(1)
        .max(3000)
        .parse(field(form, "body"));
      await itemLimit(client, "announcements", eventId);
      await client.query(
        "INSERT INTO announcements(event_id,body) VALUES($1,$2)",
        [eventId, body],
      );
    }),
  );
}
export async function deleteAnnouncementAction(form: FormData): Promise<void> {
  await run(eventPath(form), () => deleteItem(form, "announcements"));
}
export async function assignTeamAction(form: FormData): Promise<void> {
  await run(eventPath(form), () =>
    owned(form, async (client, eventId) => {
      const team = z.string().trim().max(60).parse(field(form, "team"));
      const result = await client.query(
        "UPDATE guests SET team=$3 WHERE event_id=$1 AND id=$2",
        [eventId, idSchema.parse(field(form, "guestId")), team],
      );
      if (!result.rowCount) throw new PublicError("Guest not found.");
    }),
  );
}
export async function addPollAction(form: FormData): Promise<void> {
  await run(eventPath(form), () =>
    owned(form, async (client, eventId) => {
      const poll = pollSchema.parse(fields(form));
      await itemLimit(client, "polls", eventId);
      const {
        rows: [row],
      } = await client.query(
        "INSERT INTO polls(event_id,question) VALUES($1,$2) RETURNING id",
        [eventId, poll.question],
      );
      for (const [position, label] of poll.options.entries())
        await client.query(
          "INSERT INTO poll_options(poll_id,label,position) VALUES($1,$2,$3)",
          [row.id, label, position],
        );
    }),
  );
}
export async function deletePollAction(form: FormData): Promise<void> {
  await run(eventPath(form), () => deleteItem(form, "polls"));
}

export async function submitRsvpAction(form: FormData): Promise<void> {
  await run(invitePath(form), async () => {
    const invite = tokenSchema.parse(field(form, "inviteToken"));
    const rsvp = rsvpSchema.parse(fields(form));
    const user = await getUser();
    await rateLimit(`rsvp:event:${invite}`, 200, 3600);
    const result = await transaction(async (client) => {
      // Every RSVP and capacity edit locks the same event row to prevent oversubscription.
      const {
        rows: [event],
      } = await client.query(
        "SELECT id,capacity FROM events WHERE invite_token=$1 FOR UPDATE",
        [invite],
      );
      if (!event)
        throw new PublicError("This invitation is no longer available.");
      let raw = await guestToken(event.id);
      let guest = raw
        ? (
            await client.query(
              "SELECT id,status,user_id FROM guests WHERE event_id=$1 AND edit_token_hash=$2",
              [event.id, hashToken(raw)],
            )
          ).rows[0]
        : undefined;
      // A signed-in account can reclaim only its own linked RSVP, never one matched by name.
      if (!guest && user) {
        guest = (
          await client.query(
            "SELECT id,status,user_id FROM guests WHERE event_id=$1 AND user_id=$2",
            [event.id, user.id],
          )
        ).rows[0];
        raw = null;
      }
      if (guest?.user_id && user && guest.user_id !== user.id)
        throw new PublicError(
          "This RSVP belongs to another signed-in account. Sign out before editing it.",
        );
      const {
        rows: [counts],
      } = await client.query(
        "SELECT count(*)::int AS total,count(*) FILTER(WHERE status='going')::int AS going FROM guests WHERE event_id=$1",
        [event.id],
      );
      if (!guest && counts.total >= 1000)
        throw new PublicError("This event has reached its guest limit.");
      if (
        rsvp.status === "going" &&
        guest?.status !== "going" &&
        event.capacity > 0 &&
        counts.going >= event.capacity
      )
        throw new PublicError(
          "This event is full. You can still RSVP as maybe.",
        );
      raw ??= token();
      if (guest) {
        if (user && !guest.user_id) {
          const linked = await client.query(
            "SELECT id FROM guests WHERE event_id=$1 AND user_id=$2 AND id<>$3",
            [event.id, user.id, guest.id],
          );
          if (linked.rowCount)
            throw new PublicError(
              "Your account already has an RSVP for this event.",
            );
        }
        await client.query(
          "UPDATE guests SET name=$3,status=$4,marker=$5,notes=$6,edit_token_hash=$7,user_id=COALESCE(user_id,$8) WHERE id=$1 AND event_id=$2",
          [
            guest.id,
            event.id,
            rsvp.name,
            rsvp.status,
            rsvp.marker,
            rsvp.notes,
            hashToken(raw),
            user?.id ?? null,
          ],
        );
      } else {
        // Do not reuse an invalid cookie value when creating a new identity.
        raw = token();
        await client.query(
          "INSERT INTO guests(event_id,user_id,edit_token_hash,name,status,marker,notes) VALUES($1,$2,$3,$4,$5,$6,$7)",
          [
            event.id,
            user?.id ?? null,
            hashToken(raw),
            rsvp.name,
            rsvp.status,
            rsvp.marker,
            rsvp.notes,
          ],
        );
      }
      await logActivity(
        client,
        "guest.rsvp",
        `RSVP ${guest ? "updated" : "created"} for event ${event.id}`,
      );
      return { eventId: event.id as string, raw };
    });
    await setGuestToken(result.eventId, result.raw);
    return success(`/invite/${invite}`, "Your RSVP is saved.");
  });
}
export async function claimGuestAction(form: FormData): Promise<void> {
  await run(invitePath(form), async () => {
    const invite = tokenSchema.parse(field(form, "inviteToken"));
    const edit = tokenSchema.parse(field(form, "editToken"));
    await rateLimit(`claim:${invite}`, 30, 900);
    const [guest] = await query(
      "SELECT g.event_id FROM guests g JOIN events e ON e.id=g.event_id WHERE e.invite_token=$1 AND g.edit_token_hash=$2",
      [invite, hashToken(edit)],
    );
    if (!guest)
      throw new PublicError("This personal edit link is invalid or expired.");
    await setGuestToken(guest.event_id, edit);
    return `/invite/${invite}`;
  });
}
export async function voteAction(form: FormData): Promise<void> {
  await run(invitePath(form), async () => {
    const invite = tokenSchema.parse(field(form, "inviteToken"));
    const pollId = idSchema.parse(field(form, "pollId"));
    const optionId = idSchema.parse(field(form, "optionId"));
    await rateLimit(`vote:event:${invite}`, 120, 60);
    await transaction(async (client) => {
      const {
        rows: [event],
      } = await client.query(
        "SELECT id FROM events WHERE invite_token=$1 FOR UPDATE",
        [invite],
      );
      if (!event) throw new PublicError("Invitation not found.");
      const raw = await guestToken(event.id);
      const guest = raw
        ? (
            await client.query(
              "SELECT id FROM guests WHERE event_id=$1 AND edit_token_hash=$2",
              [event.id, hashToken(raw)],
            )
          ).rows[0]
        : null;
      if (!guest)
        throw new PublicError(
          "RSVP or use your personal edit link before voting.",
        );
      const option = await client.query(
        "SELECT o.id FROM poll_options o JOIN polls p ON p.id=o.poll_id WHERE p.event_id=$1 AND p.id=$2 AND o.id=$3",
        [event.id, pollId, optionId],
      );
      if (!option.rowCount) throw new PublicError("Poll option not found.");
      await client.query(
        "INSERT INTO poll_votes(poll_id,guest_id,option_id) VALUES($1,$2,$3) ON CONFLICT(poll_id,guest_id) DO UPDATE SET option_id=excluded.option_id",
        [pollId, guest.id, optionId],
      );
    });
    return success(`/invite/${invite}`, "Vote saved.");
  });
}

export async function updateSettingsAction(form: FormData): Promise<void> {
  await run("/admin", async () => {
    const user = await actor(true);
    const notice = z.string().trim().max(1000).parse(field(form, "siteNotice"));
    await transaction(async (client) => {
      await adminLock(client, user);
      await client.query(
        "UPDATE settings SET registration_enabled=$1,event_creation_enabled=$2,site_notice=$3 WHERE id=1",
        [
          form.has("registrationEnabled"),
          form.has("eventCreationEnabled"),
          notice,
        ],
      );
      await logActivity(
        client,
        "settings.updated",
        `Site settings updated by ${user.id}`,
      );
    });
    return success("/admin");
  });
}
export async function deleteUserAction(form: FormData): Promise<void> {
  await run("/admin", async () => {
    const user = await actor(true);
    const userId = idSchema.parse(field(form, "userId"));
    if (userId === user.id)
      throw new PublicError(
        "You cannot delete your own administrator account.",
      );
    await transaction(async (client) => {
      await adminLock(client, user);
      const result = await client.query("DELETE FROM users WHERE id=$1", [
        userId,
      ]);
      if (!result.rowCount) throw new PublicError("Account not found.");
      await logActivity(
        client,
        "admin.user_deleted",
        `Account ${userId} deleted by ${user.id}`,
      );
    });
    return success("/admin", "Account and owned events deleted.");
  });
}
export async function adminDeleteEventAction(form: FormData): Promise<void> {
  await run("/admin", async () => {
    const user = await actor(true);
    const eventId = idSchema.parse(field(form, "eventId"));
    await transaction(async (client) => {
      await adminLock(client, user);
      const result = await client.query("DELETE FROM events WHERE id=$1", [
        eventId,
      ]);
      if (!result.rowCount) throw new PublicError("Event not found.");
      await logActivity(
        client,
        "admin.event_deleted",
        `Event ${eventId} deleted by ${user.id}`,
      );
    });
    return success("/admin", "Event deleted.");
  });
}
