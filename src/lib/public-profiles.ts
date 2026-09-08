import { connection } from "next/server";
import { query } from "./db";
import { validProfileSlug } from "./security";

export type PublicProfile = {
  name: string;
  firstName: string;
  bio: string;
  avatarId: string | null;
  defaultMarker: string;
  slug: string;
  loadout: { category: string; name: string; notes: string }[];
  attendance: (
    { title: "Private event" } | { title: string; id: string; date: string }
  )[];
  attendanceCount: number;
  page: number;
};

export async function getPublicProfile(
  slug: string,
  requestedPage = 1,
): Promise<PublicProfile | null> {
  await connection();
  if (!validProfileSlug(slug)) return null;
  const page = Number.isSafeInteger(requestedPage)
    ? Math.max(1, Math.min(100000, requestedPage))
    : 1;
  // One statement gives consent, feature gates and the allowlisted DTO one snapshot.
  const [row] = await query(
    `SELECT u.name,u.first_name,u.bio,u.avatar_id,u.default_marker,u.profile_slug,
      (SELECT COALESCE(json_agg(json_build_object('category',l.category,'name',l.name,'notes',l.notes) ORDER BY l.position,l.id),'[]'::json) FROM loadout_items l WHERE l.user_id=u.id) AS loadout,
      (SELECT count(*)::int FROM guests g WHERE g.user_id=u.id AND g.attended) AS attendance_count,
      (SELECT COALESCE(json_agg(a.entry),'[]'::json) FROM (
        SELECT CASE WHEN e.visibility='public' THEN json_build_object('title',e.title,'id',e.id,'date',COALESCE(to_char(e.date,'YYYY-MM-DD'),'')) ELSE json_build_object('title','Private event') END AS entry
        FROM guests g JOIN events e ON e.id=g.event_id WHERE g.user_id=u.id AND g.attended
        ORDER BY g.attended_at DESC NULLS LAST,g.id LIMIT 20 OFFSET $2
      ) a) AS attendance
    FROM users u JOIN settings s ON s.id=1 WHERE u.profile_slug=$1 AND u.public_profile_enabled AND s.public_profiles_enabled`,
    [slug, (page - 1) * 20],
  );
  if (!row) return null;
  return {
    name: row.name,
    firstName: row.first_name,
    bio: row.bio,
    avatarId: row.avatar_id,
    defaultMarker: row.default_marker,
    slug: row.profile_slug,
    loadout: row.loadout.map((item: PublicProfile["loadout"][number]) => ({
      category: item.category,
      name: item.name,
      notes: item.notes,
    })),
    attendance: row.attendance.map(
      (item: { title: string; id?: string; date?: string }) =>
        item.id
          ? { title: item.title, id: item.id, date: item.date ?? "" }
          : { title: "Private event" },
    ),
    attendanceCount: row.attendance_count,
    page,
  };
}
