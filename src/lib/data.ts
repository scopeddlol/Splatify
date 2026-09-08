import { connection } from "next/server";
import { query } from "./db";
import { getUser, requireUser, requireAdmin, guestToken } from "./auth";
import { hashToken } from "./security";
import { idSchema, tokenSchema } from "./validation";
import { regionSearchTerms } from "./locations";
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
  Team,
  Organizer,
  Message,
} from "./types";

export { getUser, requireUser, getRecoveryCodes } from "./auth";
export const eventColumns = `e.id,e.owner_id AS "ownerId",e.title,e.description,COALESCE(to_char(e.date,'YYYY-MM-DD'),'') AS date,e.time,e.timezone,e.venue,e.address,e.capacity,e.currency,e.invite_token AS "inviteToken",to_char(e.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",e.theme,e.city,e.state,e.country,e.visibility,e.accent_color AS "accentColor",e.cover_id AS "coverId",e.invitation_cover_id AS "invitationCoverId",e.invitation_heading AS "invitationHeading",e.invitation_message AS "invitationMessage",e.member_invites_enabled AS "memberInvitesEnabled",e.sponsors_enabled AS "sponsorsEnabled"`;
const guestColumns = `g.id,g.name,g.status,g.marker,g.team,g.notes,g.user_id AS "userId",u.avatar_id AS "avatarId",COALESCE(u.bio,'') AS bio,g.team_id AS "teamId",COALESCE(t.color,'') AS "teamColor",g.approval,g.attended,COALESCE(u.first_name,'') AS "firstName",CASE WHEN u.public_profile_enabled AND (SELECT public_profiles_enabled FROM settings WHERE id=1) THEN u.profile_slug ELSE NULL END AS "profileSlug",COALESCE((SELECT l.name FROM loadout_items l WHERE l.user_id=u.id AND l.category='marker' ORDER BY l.position,l.id LIMIT 1),'') AS "loadoutPreview"`;
const guestFrom =
  "guests g LEFT JOIN users u ON u.id=g.user_id LEFT JOIN teams t ON t.id=g.team_id";
const pageNumber = (value?: number) =>
  Number.isSafeInteger(value) && value! > 0 ? Math.min(value!, 100000) : 1;
type DetailOptions = { guestPage?: number; messagePage?: number };

export async function getSiteSettings(): Promise<SiteSettings> {
  await connection();
  const [settings] = await query<SiteSettings>(
    'SELECT registration_enabled AS "registrationEnabled",event_creation_enabled AS "eventCreationEnabled",site_notice AS "siteNotice",landing_title AS "landingTitle",landing_subtitle AS "landingSubtitle",landing_cta AS "landingCta",accent_color AS "accentColor",discovery_enabled AS "discoveryEnabled",public_profiles_enabled AS "publicProfilesEnabled",sponsors_enabled AS "sponsorsEnabled" FROM settings WHERE id=1',
  );
  if (!settings) throw new Error("Database migrations are required");
  return settings;
}
export async function getMyEvents(
  page = 1,
): Promise<Array<Event & { guestCount: number; goingCount: number }>> {
  const user = await requireUser();
  return query(
    `SELECT ${eventColumns},(SELECT count(*)::int FROM guests g WHERE g.event_id=e.id AND g.approval='approved' AND g.status<>'declined') AS "guestCount",(SELECT count(*)::int FROM guests g WHERE g.event_id=e.id AND g.status='going' AND g.approval='approved') AS "goingCount" FROM events e WHERE e.owner_id=$1 OR EXISTS(SELECT 1 FROM event_organizers o WHERE o.event_id=e.id AND o.user_id=$1) ORDER BY e.created_at DESC,e.id LIMIT 100 OFFSET $2`,
    [user.id, (pageNumber(page) - 1) * 100],
  );
}
export async function getMyInvitations(page = 1): Promise<Event[]> {
  const user = await requireUser();
  const events = await query<Event>(
    `SELECT ${eventColumns.replace('e.invite_token AS "inviteToken"', `CASE WHEN e.owner_id=$1 OR EXISTS(SELECT 1 FROM event_organizers o WHERE o.event_id=e.id AND o.user_id=$1) OR (g.approval='approved' AND g.status<>'declined' AND e.member_invites_enabled) THEN e.invite_token ELSE '' END AS "inviteToken"`)} FROM events e JOIN guests g ON g.event_id=e.id WHERE g.user_id=$1 ORDER BY e.date ASC NULLS LAST,e.created_at DESC,e.id LIMIT 100 OFFSET $2`,
    [user.id, (pageNumber(page) - 1) * 100],
  );
  return events;
}
async function detail(
  event: Event,
  options: DetailOptions = {},
): Promise<EventDetail> {
  const viewer = await getUser();
  const isOwner = viewer?.id === event.ownerId;
  const isOrganizer =
    isOwner ||
    !!(
      viewer &&
      (
        await query(
          "SELECT 1 FROM event_organizers WHERE event_id=$1 AND user_id=$2",
          [event.id, viewer.id],
        )
      ).length
    );
  const raw = await guestToken(event.id);
  const current =
    (
      await query<Guest>(
        `SELECT ${guestColumns} FROM ${guestFrom} WHERE g.event_id=$1 AND (g.user_id=$2 OR (g.user_id IS NULL AND g.edit_token_hash=$3)) ORDER BY (g.user_id IS NOT NULL) DESC LIMIT 1`,
        [event.id, viewer?.id ?? null, raw ? hashToken(raw) : null],
      )
    )[0] ?? null;
  const accepted = current?.approval === "approved";
  const isMember = accepted && current.status !== "declined";
  const canViewRoster = isOrganizer || isMember;
  const canMessage =
    isOrganizer || (!!viewer && current?.userId === viewer.id && isMember);
  const guestPage = pageNumber(options.guestPage),
    messagePage = pageNumber(options.messagePage);
  const [counts] = await query<{
    going: number;
    guests: number;
    estimatedCost: number;
  }>(
    `SELECT count(*) FILTER(WHERE approval='approved' AND status='going')::int AS going,count(*) FILTER(WHERE approval='approved' AND status<>'declined')::int AS guests,(SELECT COALESCE(sum(cost),0)::float8 FROM gear_items WHERE event_id=$1) AS "estimatedCost" FROM guests WHERE event_id=$1`,
    [event.id],
  );
  const base: EventDetail = {
    teamPlayers: [],
    sponsors:
      event.sponsorsEnabled && (await getSiteSettings()).sponsorsEnabled
        ? await query(
            "SELECT id,name,url FROM event_sponsors WHERE event_id=$1 ORDER BY position,id LIMIT 12",
            [event.id],
          )
        : [],
    event: {
      ...event,
      inviteToken:
        isOrganizer || (isMember && event.memberInvitesEnabled)
          ? event.inviteToken
          : "",
    },
    viewer,
    isOwner,
    isOrganizer,
    isMember,
    canViewRoster,
    canMessage,
    currentGuest: current,
    guestEditToken: current && !current.userId ? raw : null,
    guests: [],
    schedule: [],
    gear: [],
    announcements: [],
    polls: [],
    teams: [],
    organizers: [],
    messages: [],
    guestTotal: canViewRoster ? counts.guests : 0,
    goingCount: counts.going,
    estimatedCost: counts.estimatedCost,
    messageTotal: 0,
    guestPage,
    messagePage,
    pendingGuests: [],
    memberCandidates: [],
  };
  if (!canViewRoster) return base;
  const [guests, schedule, gear, announcements, rows] = await Promise.all([
    query<Guest>(
      `SELECT ${guestColumns} FROM ${guestFrom} WHERE g.event_id=$1 AND g.approval='approved' AND g.status<>'declined' ORDER BY g.created_at,g.id LIMIT 20 OFFSET $2`,
      [event.id, (guestPage - 1) * 20],
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
      COALESCE((SELECT jsonb_agg(jsonb_build_object('id',o.id,'label',o.label,'votes',(SELECT count(*)::int FROM poll_votes v JOIN guests vg ON vg.id=v.guest_id WHERE v.option_id=o.id AND v.poll_id=p.id AND vg.approval='approved' AND vg.status<>'declined')) ORDER BY o.position) FROM poll_options o WHERE o.poll_id=p.id),'[]'::jsonb) AS options,
      (SELECT v.option_id FROM poll_votes v WHERE v.poll_id=p.id AND v.guest_id=$2) AS "myVote"
      FROM polls p WHERE p.event_id=$1 ORDER BY p.created_at DESC,p.id LIMIT 50`,
      [event.id, current?.id ?? null],
    ),
  ]);
  const [teams, organizers, pendingGuests, memberCandidates] =
    await Promise.all([
      query<Team>(
        `SELECT t.id,t.name,t.color,t.logo_icon AS "logoIcon",t.captain_user_id AS "captainUserId",COALESCE(u.name,'') AS "captainName",(SELECT count(*)::int FROM guests g WHERE g.team_id=t.id AND g.approval='approved' AND g.status<>'declined') AS "playerCount" FROM teams t LEFT JOIN users u ON u.id=t.captain_user_id WHERE t.event_id=$1 ORDER BY t.name,t.id`,
        [event.id],
      ),
      query<Organizer>(
        `SELECT u.id,u.name,u.avatar_id AS "avatarId",(u.id=$2) AS "isOwner" FROM users u WHERE u.id=$2 OR EXISTS(SELECT 1 FROM event_organizers o WHERE o.event_id=$1 AND o.user_id=u.id) ORDER BY (u.id=$2) DESC,u.name,u.id`,
        [event.id, event.ownerId],
      ),
      isOrganizer
        ? query<Guest>(
            `SELECT ${guestColumns} FROM ${guestFrom} WHERE g.event_id=$1 AND g.approval='pending' AND g.status<>'declined' ORDER BY g.created_at,g.id LIMIT 1000`,
            [event.id],
          )
        : [],
      isOrganizer
        ? query<{ id: string; name: string }>(
            `SELECT u.id,u.name FROM guests g JOIN users u ON u.id=g.user_id WHERE g.event_id=$1 AND g.approval='approved' AND g.status<>'declined' ORDER BY u.name,u.id LIMIT 1000`,
            [event.id],
          )
        : [],
    ]);
  if (canMessage) {
    base.messages = await query<Message>(
      `SELECT m.id,m.body,m.user_id AS "authorId",u.name AS "authorName",u.avatar_id AS "avatarId",to_char(m.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt" FROM messages m JOIN users u ON u.id=m.user_id WHERE m.event_id=$1 ORDER BY m.created_at DESC,m.id LIMIT 20 OFFSET $2`,
      [event.id, (messagePage - 1) * 20],
    );
    base.messageTotal = (
      await query<{ n: number }>(
        "SELECT count(*)::int AS n FROM messages WHERE event_id=$1",
        [event.id],
      )
    )[0].n;
  }
  return {
    ...base,
    teamPlayers: await query<Guest>(
      `SELECT ${guestColumns} FROM ${guestFrom} WHERE g.event_id=$1 AND g.approval='approved' AND g.status<>'declined' ORDER BY g.created_at,g.id LIMIT 1000`,
      [event.id],
    ),
    teams,
    organizers,
    pendingGuests,
    memberCandidates,
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
  };
}
export async function getEvent(id: string): Promise<EventDetail | null> {
  const user = await requireUser();
  if (!idSchema.safeParse(id).success) return null;
  const [event] = await query<Event>(
    `SELECT ${eventColumns} FROM events e WHERE e.id=$1 AND (e.owner_id=$2 OR EXISTS(SELECT 1 FROM event_organizers o WHERE o.event_id=e.id AND o.user_id=$2))`,
    [id, user.id],
  );
  return event ? detail(event) : null;
}
export async function getDay(
  id: string,
  options: DetailOptions = {},
): Promise<EventDetail | null> {
  await connection();
  if (!idSchema.safeParse(id).success) return null;
  const [event] = await query<Event>(
    `SELECT ${eventColumns} FROM events e WHERE e.id=$1`,
    [id],
  );
  if (!event) return null;
  const result = await detail(event, options);
  return event.visibility === "public" ||
    result.isOrganizer ||
    result.currentGuest
    ? result
    : null;
}
export async function getPublicEvents(
  filters: {
    city?: string;
    state?: string;
    query?: string;
    page?: number;
  } = {},
): Promise<{
  events: Array<Event & { goingCount: number }>;
  total: number;
  page: number;
  pageSize: number;
}> {
  await connection();
  const page = pageNumber(filters.page);
  if (!(await getSiteSettings()).discoveryEnabled)
    return { events: [], total: 0, page, pageSize: 12 };
  const values = [
    filters.city?.trim().slice(0, 100) || "",
    regionSearchTerms(filters.state || ""),
    filters.query?.trim().slice(0, 120) || "",
  ];
  const where = `e.visibility='public' AND (e.date>=CURRENT_DATE OR e.date IS NULL) AND ($1='' OR strpos(lower(e.city),lower($1))>0) AND (''=ANY($2::text[]) OR lower(e.state)=ANY($2::text[])) AND ($3='' OR strpos(lower(e.title||' '||e.description||' '||e.venue),lower($3))>0)`;
  const [count] = await query<{ total: number }>(
    `SELECT count(*)::int AS total FROM events e WHERE ${where}`,
    values,
  );
  const events = await query<Event & { goingCount: number }>(
    `SELECT ${eventColumns.replace('e.invite_token AS "inviteToken"', `'' AS "inviteToken"`)},(SELECT count(*)::int FROM guests g WHERE g.event_id=e.id AND g.approval='approved' AND g.status='going') AS "goingCount" FROM events e WHERE ${where} ORDER BY e.date ASC NULLS LAST,e.created_at DESC,e.id LIMIT 12 OFFSET $4`,
    [...values, (page - 1) * 12],
  );
  return { events, total: count.total, page, pageSize: 12 };
}
export async function getSharedEvent(
  invite: string,
  options: DetailOptions = {},
): Promise<EventDetail | null> {
  await connection();
  if (!tokenSchema.safeParse(invite).success) return null;
  const [event] = await query<Event>(
    `SELECT ${eventColumns} FROM events e WHERE e.invite_token=$1`,
    [invite],
  );
  return event ? detail(event, options) : null;
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
