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
  setAuthReturn,
  consumeAuthReturn,
} from "@/lib/auth";
import {
  hashPassword,
  verifyPassword,
  token,
  hashToken,
  recoveryCodes,
  normalizeRecoveryCode,
  canUsePublicRecovery,
  safeReturnPath,
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
  planningEventSchema,
  colorSchema,
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
    redirect(
      `${fallback}${fallback.includes("?") ? "&" : "?"}error=${encodeURIComponent(message)}`,
    );
  }
  revalidatePath("/", "layout");
  redirect(destination);
}
function eventPath(form: FormData): string {
  const id = field(form, "eventId");
  const section = field(form, "returnSection");
  return idSchema.safeParse(id).success
    ? `/days/${id}${["overview", "players", "schedule", "gear", "messages", "settings"].includes(section) ? `/${section}` : ""}`
    : "/dashboard";
}
function invitePath(form: FormData): string {
  if (idSchema.safeParse(field(form, "eventId")).success)
    return eventPath(form);
  const invite = field(form, "inviteToken");
  return tokenSchema.safeParse(invite).success ? `/invite/${invite}` : "/";
}
function success(path: string, message = "Changes saved."): string {
  return `${path}?success=${encodeURIComponent(message)}`;
}
function planningForm(
  input: FormData | string,
  values: Record<string, string | null | undefined>,
): FormData {
  if (input instanceof FormData) return input;
  const form = new FormData();
  form.set("eventId", input);
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) form.set(key, value ?? "");
  }
  return form;
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
      "SELECT e.* FROM events e WHERE e.id=$1 AND (e.owner_id=$2 OR EXISTS(SELECT 1 FROM event_organizers o WHERE o.event_id=e.id AND o.user_id=$2)) FOR UPDATE OF e",
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
  return success(eventPath(form));
}
async function planningFields(
  client: PoolClient,
  eventId: string,
  form: FormData,
  existing: Record<string, unknown> = {},
): Promise<void> {
  const e = planningEventSchema.parse({
    city: existing.city,
    state: existing.state,
    country: existing.country,
    visibility: existing.visibility,
    accentColor: existing.accent_color,
    invitationHeading: existing.invitation_heading,
    invitationMessage: existing.invitation_message,
    memberInvitesEnabled: existing.member_invites_enabled,
    ...fields(form),
    ...(form.has("memberInvitesEnabledPresent")
      ? { memberInvitesEnabled: form.has("memberInvitesEnabled") }
      : {}),
  });
  if (e.visibility === "public" && (!e.city || !e.state))
    throw new PublicError(
      "Add a city and state or region so players can find your public day.",
    );
  await client.query(
    "UPDATE events SET city=$2,state=$3,country=$4,visibility=$5,accent_color=$6,invitation_heading=$7,invitation_message=$8,member_invites_enabled=$9 WHERE id=$1",
    [
      eventId,
      e.city,
      e.state,
      e.country,
      e.visibility,
      e.accentColor,
      e.invitationHeading,
      e.invitationMessage,
      e.memberInvitesEnabled,
    ],
  );
}
// All membership mutations lock the event first; account identity always outranks an edit cookie.
async function attendance(
  client: PoolClient,
  eventId: string,
  user: User | null,
) {
  const raw = await guestToken(eventId);
  const { rows } = await client.query(
    "SELECT * FROM guests WHERE event_id=$1 AND (user_id=$2 OR (user_id IS NULL AND edit_token_hash=$3)) ORDER BY (user_id IS NOT NULL) DESC LIMIT 1",
    [eventId, user?.id ?? null, raw ? hashToken(raw) : null],
  );
  return { guest: rows[0], raw };
}
async function eventAccess(
  client: PoolClient,
  form: FormData,
  user: User | null,
) {
  const id = field(form, "eventId"),
    invite = field(form, "inviteToken");
  const {
    rows: [event],
  } = await client.query(
    "SELECT * FROM events WHERE " +
      (id ? "id=$1" : "invite_token=$1") +
      " FOR UPDATE",
    [id ? idSchema.parse(id) : tokenSchema.parse(invite)],
  );
  if (!event) throw new PublicError("Day not found or access denied.");
  const isOrganizer =
    user?.id === event.owner_id ||
    !!(
      user &&
      (
        await client.query(
          "SELECT 1 FROM event_organizers WHERE event_id=$1 AND user_id=$2",
          [event.id, user.id],
        )
      ).rowCount
    );
  const { guest, raw } = await attendance(client, event.id, user);
  if (
    !isOrganizer &&
    !guest &&
    event.visibility !== "public" &&
    invite !== event.invite_token
  )
    throw new PublicError("Day not found or access denied.");
  return { event, isOrganizer, guest, raw };
}
async function checkCapacity(
  client: PoolClient,
  event: Record<string, unknown>,
  excludeId: string | null = null,
) {
  const {
    rows: [count],
  } = await client.query(
    "SELECT count(*)::int AS n FROM guests WHERE event_id=$1 AND approval='approved' AND status='going' AND ($2::uuid IS NULL OR id<>$2)",
    [event.id, excludeId],
  );
  if (Number(event.capacity) > 0 && count.n >= Number(event.capacity))
    throw new PublicError("This day is full. You can still RSVP as maybe.");
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
  await run(
    `/signup?next=${encodeURIComponent(safeReturnPath(field(form, "next")))}`,
    async () => {
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
      await setAuthReturn(field(form, "next"), raw);
      return "/recovery-codes";
    },
  );
}
export async function loginAction(form: FormData): Promise<void> {
  await run(
    `/login?next=${encodeURIComponent(safeReturnPath(field(form, "next")))}`,
    async () => {
      const email = emailSchema.parse(field(form, "email"));
      const password = z
        .string()
        .min(1)
        .max(128)
        .parse(field(form, "password"));
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
      return safeReturnPath(field(form, "next"));
    },
  );
}
export async function logoutAction(): Promise<void> {
  await run("/dashboard", async () => {
    await clearSession();
    return "/login";
  });
}
export async function recoverAction(form: FormData): Promise<void> {
  await run(
    `/recover?next=${encodeURIComponent(safeReturnPath(field(form, "next")))}`,
    async () => {
      const email = emailSchema.parse(field(form, "email"));
      const code = z
        .string()
        .min(1)
        .max(100)
        .parse(field(form, "recoveryCode"));
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
        safeReturnPath(field(form, "next")),
        "Password reset. Your recovery code has been used.",
      );
    },
  );
}
export async function acknowledgeRecoveryAction(): Promise<void> {
  await run("/recovery-codes", async () => {
    await actor();
    await clearRecovery();
    return consumeAuthReturn();
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
      await planningFields(client, event.id, form);
      return event.id;
    });
    return `/days/${id}`;
  });
}
export async function updateEventAction(form: FormData): Promise<void> {
  await run(eventPath(form), () =>
    owned(form, async (client, eventId, existing) => {
      const e = eventSchema.parse(fields(form));
      const {
        rows: [count],
      } = await client.query(
        "SELECT count(*)::int AS count FROM guests WHERE event_id=$1 AND status='going' AND approval='approved'",
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
      await planningFields(client, eventId, form, existing);
    }),
  );
}
export async function deleteEventAction(form: FormData): Promise<void> {
  await run(eventPath(form), async () => {
    const user = await actor();
    await owned(form, async (client, eventId, event) => {
      if (event.owner_id !== user.id)
        throw new PublicError(
          "Only the original organizer can delete this day.",
        );
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
export async function assignTeamAction(
  input: FormData | string,
  guestId?: string,
  teamId?: string | null,
): Promise<void> {
  const form = planningForm(input, { guestId, teamId });
  await run(eventPath(form), async () => {
    const user = await actor();
    await transaction(async (client) => {
      const {
        event,
        isOrganizer,
        guest: member,
      } = await eventAccess(client, form, user);
      const {
        rows: [guest],
      } = await client.query(
        "SELECT * FROM guests WHERE event_id=$1 AND id=$2",
        [event.id, idSchema.parse(field(form, "guestId"))],
      );
      if (
        !guest ||
        (!isOrganizer &&
          (guest.approval !== "approved" || guest.status === "declined"))
      )
        throw new PublicError("Select an accepted player.");
      let teamId = field(form, "teamId")
        ? idSchema.parse(field(form, "teamId"))
        : null;
      // Preserve the shipped free-text organizer form while keeping its normalized mirror.
      if (!form.has("teamId") && isOrganizer && field(form, "team")) {
        const name = z
          .string()
          .trim()
          .min(1)
          .max(60)
          .parse(field(form, "team"));
        teamId = (
          await client.query(
            "INSERT INTO teams(event_id,name) VALUES($1,$2) ON CONFLICT(event_id,name) DO UPDATE SET name=excluded.name RETURNING id",
            [event.id, name],
          )
        ).rows[0].id;
      }
      const team = teamId
        ? (
            await client.query(
              "SELECT * FROM teams WHERE event_id=$1 AND id=$2",
              [event.id, teamId],
            )
          ).rows[0]
        : null;
      if (teamId && !team) throw new PublicError("Team not found.");
      if (!isOrganizer) {
        if (member?.approval !== "approved" || member.status === "declined")
          throw new PublicError("Captain access required.");
        const own = (
          await client.query(
            "SELECT id FROM teams WHERE event_id=$1 AND captain_user_id=$2",
            [event.id, user.id],
          )
        ).rows.map((r) => r.id);
        if (
          teamId
            ? team.captain_user_id !== user.id ||
              (guest.team_id && guest.team_id !== teamId)
            : !own.includes(guest.team_id)
        )
          throw new PublicError(
            "Captains may only select unassigned players or release their own players.",
          );
      }
      await client.query(
        "UPDATE guests SET team_id=$3,team=$4 WHERE event_id=$1 AND id=$2",
        [event.id, guest.id, teamId, team?.name ?? ""],
      );
    });
    return success(eventPath(form));
  });
}
export async function createTeamAction(
  input: FormData | string,
  name?: string,
  color?: string,
): Promise<void> {
  const form = planningForm(input, { name, color });
  await run(eventPath(form), () =>
    owned(form, async (client, eventId) => {
      const name = z.string().trim().min(1).max(60).parse(field(form, "name"));
      const color = colorSchema.parse(field(form, "color") || "#d5fb51");
      const {
        rows: [count],
      } = await client.query(
        "SELECT count(*)::int AS n FROM teams WHERE event_id=$1",
        [eventId],
      );
      if (count.n >= 100)
        throw new PublicError("This day has reached its team limit.");
      const result = await client.query(
        "INSERT INTO teams(event_id,name,color) VALUES($1,$2,$3) ON CONFLICT(event_id,name) DO NOTHING",
        [eventId, name, color],
      );
      if (!result.rowCount)
        throw new PublicError("A team with that name already exists.");
    }),
  );
}
export async function updateTeamAction(
  input: FormData | string,
  teamId?: string,
  name?: string,
  color?: string,
  captainUserId?: string | null,
): Promise<void> {
  const form = planningForm(input, { teamId, name, color, captainUserId });
  await run(eventPath(form), async () => {
    const user = await actor();
    await transaction(async (client) => {
      const { event, isOrganizer, guest } = await eventAccess(
        client,
        form,
        user,
      );
      const teamId = idSchema.parse(field(form, "teamId"));
      const {
        rows: [team],
      } = await client.query(
        "SELECT * FROM teams WHERE event_id=$1 AND id=$2",
        [event.id, teamId],
      );
      if (
        !team ||
        (!isOrganizer &&
          (team.captain_user_id !== user.id ||
            guest?.approval !== "approved" ||
            guest.status === "declined"))
      )
        throw new PublicError("Team management access required.");
      const captain = form.has("captainUserId")
        ? field(form, "captainUserId")
          ? idSchema.parse(field(form, "captainUserId"))
          : null
        : team.captain_user_id;
      if (!isOrganizer && captain !== team.captain_user_id)
        throw new PublicError("Only organizers appoint captains.");
      if (
        captain &&
        !(
          await client.query(
            "SELECT 1 FROM guests WHERE event_id=$1 AND user_id=$2 AND approval='approved' AND status<>'declined'",
            [event.id, captain],
          )
        ).rowCount
      )
        throw new PublicError("Captains must be accepted registered players.");
      const name = z.string().trim().min(1).max(60).parse(field(form, "name"));
      const color = colorSchema.parse(field(form, "color"));
      if (
        (
          await client.query(
            "SELECT 1 FROM teams WHERE event_id=$1 AND name=$2 AND id<>$3",
            [event.id, name, teamId],
          )
        ).rowCount
      )
        throw new PublicError("A team with that name already exists.");
      await client.query(
        "UPDATE teams SET name=$3,color=$4,captain_user_id=$5 WHERE event_id=$1 AND id=$2",
        [event.id, teamId, name, color, captain],
      );
      await client.query(
        "UPDATE guests SET team=$3 WHERE event_id=$1 AND team_id=$2",
        [event.id, teamId, name],
      );
    });
    return success(eventPath(form));
  });
}
export async function deleteTeamAction(
  input: FormData | string,
  teamId?: string,
): Promise<void> {
  const form = planningForm(input, { teamId });
  await run(eventPath(form), () =>
    owned(form, async (client, eventId) => {
      const teamId = idSchema.parse(field(form, "teamId"));
      await client.query(
        "UPDATE guests SET team_id=NULL,team='' WHERE event_id=$1 AND team_id=$2",
        [eventId, teamId],
      );
      const result = await client.query(
        "DELETE FROM teams WHERE event_id=$1 AND id=$2",
        [eventId, teamId],
      );
      if (!result.rowCount) throw new PublicError("Team not found.");
    }),
  );
}
export async function approveGuestAction(
  input: FormData | string,
  guestId?: string,
  decision?: "approved" | "remove",
): Promise<void> {
  const form = planningForm(input, { guestId, decision });
  await run(eventPath(form), () =>
    owned(form, async (client, eventId, event) => {
      const guestId = idSchema.parse(field(form, "guestId"));
      const decision = z
        .enum(["approved", "remove"])
        .parse(field(form, "decision"));
      const {
        rows: [guest],
      } = await client.query(
        "SELECT * FROM guests WHERE event_id=$1 AND id=$2",
        [eventId, guestId],
      );
      if (!guest) throw new PublicError("Guest not found.");
      if (decision === "remove") {
        await client.query(
          "UPDATE teams SET captain_user_id=NULL WHERE event_id=$1 AND captain_user_id=$2",
          [eventId, guest.user_id],
        );
        await client.query("DELETE FROM guests WHERE event_id=$1 AND id=$2", [
          eventId,
          guestId,
        ]);
      } else {
        if (guest.status === "going")
          await checkCapacity(client, event, guestId);
        await client.query(
          "UPDATE guests SET approval='approved' WHERE event_id=$1 AND id=$2",
          [eventId, guestId],
        );
      }
    }),
  );
}
export async function addOrganizerAction(
  input: FormData | string,
  userId?: string,
): Promise<void> {
  const form = planningForm(input, { userId });
  await run(eventPath(form), async () => {
    const user = await actor();
    return owned(form, async (client, eventId, event) => {
      if (event.owner_id !== user.id)
        throw new PublicError(
          "Only the original organizer can appoint organizers.",
        );
      const userId = idSchema.parse(field(form, "userId"));
      if (
        !(
          await client.query(
            "SELECT 1 FROM guests WHERE event_id=$1 AND user_id=$2 AND approval='approved' AND status<>'declined'",
            [eventId, userId],
          )
        ).rowCount
      )
        throw new PublicError("Select an accepted registered player.");
      if (userId !== user.id)
        await client.query(
          "INSERT INTO event_organizers(event_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
          [eventId, userId],
        );
    });
  });
}
export async function removeOrganizerAction(
  input: FormData | string,
  userId?: string,
): Promise<void> {
  const form = planningForm(input, { userId });
  await run(eventPath(form), async () => {
    const user = await actor();
    return owned(form, async (client, eventId, event) => {
      const userId = idSchema.parse(field(form, "userId"));
      if (event.owner_id !== user.id || userId === event.owner_id)
        throw new PublicError(
          "Only the original organizer can remove other organizers.",
        );
      await client.query(
        "DELETE FROM event_organizers WHERE event_id=$1 AND user_id=$2",
        [eventId, userId],
      );
    });
  });
}
export async function addMessageAction(
  input: FormData | string,
  body?: string,
): Promise<void> {
  const form = planningForm(input, { body });
  await run(eventPath(form), async () => {
    const user = await actor();
    const body = z.string().trim().min(1).max(2000).parse(field(form, "body"));
    await rateLimit(`message:${user.id}`, 20, 60);
    await transaction(async (client) => {
      const { event, isOrganizer, guest } = await eventAccess(
        client,
        form,
        user,
      );
      if (
        !isOrganizer &&
        (!guest ||
          guest.user_id !== user.id ||
          guest.approval !== "approved" ||
          guest.status === "declined")
      )
        throw new PublicError(
          "Only accepted signed-in participants may send messages.",
        );
      const {
        rows: [count],
      } = await client.query(
        "SELECT count(*)::int AS n FROM messages WHERE event_id=$1",
        [event.id],
      );
      if (count.n >= 10000)
        throw new PublicError("This day has reached its message limit.");
      await client.query(
        "INSERT INTO messages(event_id,user_id,body) VALUES($1,$2,$3)",
        [event.id, user.id, body],
      );
    });
    return success(eventPath(form), "Message sent.");
  });
}
export async function deleteMessageAction(
  input: FormData | string,
  messageId?: string,
): Promise<void> {
  const form = planningForm(input, { messageId });
  await run(eventPath(form), async () => {
    const user = await actor();
    await transaction(async (client) => {
      const eventId = idSchema.parse(field(form, "eventId"));
      await client.query("SELECT id FROM events WHERE id=$1 FOR UPDATE", [
        eventId,
      ]);
      const result = await client.query(
        "DELETE FROM messages WHERE event_id=$1 AND id=$2 AND (user_id=$3 OR EXISTS(SELECT 1 FROM events e WHERE e.id=$1 AND e.owner_id=$3) OR EXISTS(SELECT 1 FROM event_organizers o WHERE o.event_id=$1 AND o.user_id=$3))",
        [eventId, idSchema.parse(field(form, "messageId")), user.id],
      );
      if (!result.rowCount)
        throw new PublicError("Message not found or access denied.");
    });
    return success(eventPath(form), "Message deleted.");
  });
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
    const user = await getUser();
    const result = await transaction(async (client) => {
      const {
        event,
        guest,
        isOrganizer,
        raw: existingRaw,
      } = await eventAccess(client, form, user);
      const rsvp = rsvpSchema.parse({
        notes: guest?.notes ?? "",
        ...fields(form),
        name:
          field(form, "name") ||
          (user ? (guest?.name ?? user.name) : undefined),
        marker:
          field(form, "marker") ||
          (user ? (guest?.marker ?? user.defaultMarker) : undefined),
      });
      await rateLimit(`rsvp:event:${event.id}`, 200, 3600, client);
      const approval =
        guest?.approval ??
        (isOrganizer || event.member_invites_enabled ? "approved" : "pending");
      const {
        rows: [counts],
      } = await client.query(
        "SELECT count(*)::int AS total FROM guests WHERE event_id=$1",
        [event.id],
      );
      if (!guest && counts.total >= 1000)
        throw new PublicError("This event has reached its guest limit.");
      if (rsvp.status === "going" && approval === "approved")
        await checkCapacity(client, event, guest?.id ?? null);
      const raw =
        guest && !guest.user_id && existingRaw ? existingRaw : token();
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
        await client.query(
          "INSERT INTO guests(event_id,user_id,edit_token_hash,name,status,marker,notes,approval) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
          [
            event.id,
            user?.id ?? null,
            hashToken(raw),
            rsvp.name,
            rsvp.status,
            rsvp.marker,
            rsvp.notes,
            approval,
          ],
        );
      }
      if (user && rsvp.status === "declined")
        await client.query(
          "UPDATE teams SET captain_user_id=NULL WHERE event_id=$1 AND captain_user_id=$2",
          [event.id, user.id],
        );
      await logActivity(
        client,
        "guest.rsvp",
        `RSVP ${guest ? "updated" : "created"} for event ${event.id}`,
      );
      return { eventId: event.id as string, raw, approval };
    });
    await setGuestToken(result.eventId, result.raw);
    form.set("eventId", result.eventId);
    return success(
      eventPath(form),
      result.approval === "pending"
        ? "Your request is pending organizer approval."
        : "Your RSVP is saved.",
    );
  });
}
export async function claimGuestAction(form: FormData): Promise<void> {
  await run(invitePath(form), async () => {
    const eventId = field(form, "eventId");
    const identifier = eventId
      ? idSchema.parse(eventId)
      : tokenSchema.parse(field(form, "inviteToken"));
    const edit = tokenSchema.parse(field(form, "editToken"));
    await rateLimit(`claim:${identifier}`, 30, 900);
    const [guest] = await query(
      `SELECT g.id,g.event_id FROM guests g JOIN events e ON e.id=g.event_id WHERE ${eventId ? "e.id=$1" : "e.invite_token=$1"} AND g.edit_token_hash=$2 AND g.user_id IS NULL`,
      [identifier, hashToken(edit)],
    );
    if (!guest)
      throw new PublicError("This personal edit link is invalid or expired.");
    const user = await getUser();
    if (
      user &&
      (
        await query(
          "SELECT 1 FROM guests WHERE event_id=$1 AND user_id=$2 AND id<>$3",
          [guest.event_id, user.id, guest.id],
        )
      ).length
    )
      throw new PublicError(
        "Your account already has an RSVP for this day. Use your linked RSVP instead.",
      );
    await setGuestToken(guest.event_id, edit);
    return `/days/${guest.event_id}`;
  });
}
export async function voteAction(form: FormData): Promise<void> {
  await run(invitePath(form), async () => {
    const pollId = idSchema.parse(field(form, "pollId"));
    const optionId = idSchema.parse(field(form, "optionId"));
    const user = await getUser();
    await transaction(async (client) => {
      const { event, guest } = await eventAccess(client, form, user);
      await rateLimit(`vote:event:${event.id}`, 120, 60, client);
      form.set("eventId", event.id);
      if (
        !guest ||
        guest.approval !== "approved" ||
        guest.status === "declined"
      )
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
    return success(eventPath(form), "Vote saved.");
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
