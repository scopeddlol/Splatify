import { connection } from "next/server";
import { query } from "./db";
import { getUser, requireUser, requireAdmin, guestToken } from "./auth";
import { hashToken } from "./security";
import { idSchema, tokenSchema } from "./validation";
import type {
  AdminOverview,
  Event,
  EventDetail,
  Guest,
  SiteSettings,
  ScheduleItem,
  GearItem,
  Announcement,
  Poll,
} from "./types";

export { getUser, requireUser, getRecoveryCodes } from "./auth";
export const eventColumns = `e.id,e.owner_id AS "ownerId",e.title,e.description,COALESCE(to_char(e.date,'YYYY-MM-DD'),'') AS date,e.time,e.timezone,e.venue,e.address,e.capacity,e.currency,e.invite_token AS "inviteToken",to_char(e.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",e.theme`;
const guestColumns = "id,name,status,marker,team,notes";

export async function getSiteSettings(): Promise<SiteSettings> {
  await connection();
  const [settings] = await query<SiteSettings>(
    'SELECT registration_enabled AS "registrationEnabled",event_creation_enabled AS "eventCreationEnabled",site_notice AS "siteNotice" FROM settings WHERE id=1',
  );
  if (!settings) throw new Error("Database migrations are required");
  return settings;
}
export async function getMyEvents(): Promise<
  Array<Event & { guestCount: number; goingCount: number }>
> {
  const user = await requireUser();
  return query(
    `SELECT ${eventColumns},(SELECT count(*)::int FROM guests g WHERE g.event_id=e.id) AS "guestCount",(SELECT count(*)::int FROM guests g WHERE g.event_id=e.id AND g.status='going') AS "goingCount" FROM events e WHERE e.owner_id=$1 ORDER BY e.created_at DESC LIMIT 100`,
    [user.id],
  );
}
export async function getMyInvitations(): Promise<Event[]> {
  const user = await requireUser();
  return query<Event>(
    `SELECT ${eventColumns} FROM events e JOIN guests g ON g.event_id=e.id WHERE g.user_id=$1 ORDER BY e.date ASC NULLS LAST,e.created_at DESC LIMIT 100`,
    [user.id],
  );
}
async function detail(event: Event, userId?: string): Promise<EventDetail> {
  const raw = await guestToken(event.id);
  const current = raw
    ? ((
        await query<Guest>(
          `SELECT ${guestColumns} FROM guests WHERE event_id=$1 AND edit_token_hash=$2`,
          [event.id, hashToken(raw)],
        )
      )[0] ?? null)
    : null;
  const [guests, schedule, gear, announcements, rows] = await Promise.all([
    query<Guest>(
      `SELECT ${guestColumns} FROM guests WHERE event_id=$1 ORDER BY created_at,id LIMIT 1000`,
      [event.id],
    ),
    query<ScheduleItem>(
      "SELECT id,time,title,description FROM schedule_items WHERE event_id=$1 ORDER BY time,id LIMIT 100",
      [event.id],
    ),
    query<GearItem>(
      "SELECT id,name,quantity,cost::float8 AS cost,category FROM gear_items WHERE event_id=$1 ORDER BY category,name,id LIMIT 100",
      [event.id],
    ),
    query<Announcement>(
      `SELECT id,body,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt" FROM announcements WHERE event_id=$1 ORDER BY created_at DESC,id LIMIT 100`,
      [event.id],
    ),
    query<{
      id: string;
      question: string;
      options: Poll["options"];
      myVote: string | null;
    }>(
      `SELECT p.id,p.question,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('id',o.id,'label',o.label,'votes',(SELECT count(*)::int FROM poll_votes v WHERE v.option_id=o.id AND v.poll_id=p.id)) ORDER BY o.position) FROM poll_options o WHERE o.poll_id=p.id),'[]'::jsonb) AS options,
      (SELECT v.option_id FROM poll_votes v WHERE v.poll_id=p.id AND v.guest_id=$2) AS "myVote"
      FROM polls p WHERE p.event_id=$1 ORDER BY p.created_at DESC,p.id LIMIT 50`,
      [event.id, current?.id ?? null],
    ),
  ]);
  return {
    event,
    guests,
    schedule,
    gear,
    announcements,
    polls: rows.map((row) => ({
      id: row.id,
      question: row.question,
      options: row.options,
      ...(row.myVote ? { myVote: row.myVote } : {}),
    })),
    isOwner: userId === event.ownerId,
    currentGuest: current,
    guestEditToken: current ? raw : null,
  };
}
export async function getEvent(id: string): Promise<EventDetail | null> {
  const user = await requireUser();
  if (!idSchema.safeParse(id).success) return null;
  const [event] = await query<Event>(
    `SELECT ${eventColumns} FROM events e WHERE e.id=$1 AND e.owner_id=$2`,
    [id, user.id],
  );
  return event ? detail(event, user.id) : null;
}
export async function getSharedEvent(
  invite: string,
): Promise<EventDetail | null> {
  await connection();
  if (!tokenSchema.safeParse(invite).success) return null;
  const [event] = await query<Event>(
    `SELECT ${eventColumns} FROM events e WHERE e.invite_token=$1`,
    [invite],
  );
  return event ? detail(event, (await getUser())?.id) : null;
}
export async function getAdminOverview(): Promise<AdminOverview> {
  await requireAdmin();
  const [counts, recentActivity, recentUsers, recentEvents, settings] =
    await Promise.all([
      query<
        Pick<AdminOverview, "users" | "events" | "guests" | "upcomingEvents">
      >(
        `SELECT (SELECT count(*)::int FROM users) AS users,(SELECT count(*)::int FROM events) AS events,(SELECT count(*)::int FROM guests) AS guests,(SELECT count(*)::int FROM events WHERE date>=CURRENT_DATE) AS "upcomingEvents"`,
      ),
      query<AdminOverview["recentActivity"][number]>(
        `SELECT id,action,detail,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt" FROM activity ORDER BY created_at DESC LIMIT 50`,
      ),
      query<AdminOverview["recentUsers"][number]>(
        `SELECT u.id,u.name,u.email,to_char(u.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",(SELECT count(*)::int FROM events e WHERE e.owner_id=u.id) AS "eventCount" FROM users u ORDER BY u.created_at DESC LIMIT 50`,
      ),
      query<AdminOverview["recentEvents"][number]>(
        `SELECT e.id,e.title,u.name AS "ownerName",COALESCE(to_char(e.date,'YYYY-MM-DD'),'') AS date,(SELECT count(*)::int FROM guests g WHERE g.event_id=e.id) AS "guestCount" FROM events e JOIN users u ON u.id=e.owner_id ORDER BY e.created_at DESC LIMIT 50`,
      ),
      getSiteSettings(),
    ]);
  return { ...counts[0], recentActivity, recentUsers, recentEvents, settings };
}
