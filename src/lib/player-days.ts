import { query } from "./db";
import { requireUser, eventColumns } from "./data";
import type { Event } from "./types";

export async function getPlayerDays(
  view: "attending" | "organizing",
  requestedPage: number,
) {
  const user = await requireUser();
  const pageSize = 12;
  const where =
    view === "organizing"
      ? "(e.owner_id=$1 OR EXISTS(SELECT 1 FROM event_organizers o WHERE o.event_id=e.id AND o.user_id=$1))"
      : "EXISTS(SELECT 1 FROM guests g WHERE g.event_id=e.id AND g.user_id=$1)";
  const [{ total }] = await query<{ total: number }>(
    `SELECT count(*)::int AS total FROM events e WHERE ${where}`,
    [user.id],
  );
  const page = Math.min(
    Math.max(1, Math.floor(requestedPage) || 1),
    Math.max(1, Math.ceil(total / pageSize)),
  );
  const events = await query<
    Event & { goingCount: number; approval: string | null }
  >(
    `SELECT ${eventColumns.replace('e.invite_token AS "inviteToken"', `'' AS "inviteToken"`)},(SELECT count(*)::int FROM guests g WHERE g.event_id=e.id AND g.approval='approved' AND g.status='going') AS "goingCount",(SELECT g.approval FROM guests g WHERE g.event_id=e.id AND g.user_id=$1) AS approval FROM events e WHERE ${where} ORDER BY e.date DESC NULLS FIRST,e.created_at DESC,e.id LIMIT 12 OFFSET $2`,
    [user.id, (page - 1) * pageSize],
  );
  return { events, total, page, pageSize };
}
