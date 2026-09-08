import { cookies } from "next/headers";
import { getUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { hashToken } from "@/lib/security";
import { idSchema, tokenSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const headers = {
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
  const { id } = await context.params;
  if (!idSchema.safeParse(id).success)
    return new Response(null, { status: 404, headers });
  const user = await getUser();
  const guestCredentials = (await cookies())
    .getAll()
    .filter(
      ({ name, value }) =>
        name.startsWith("splatify_guest_") &&
        idSchema.safeParse(name.slice(15)).success &&
        tokenSchema.safeParse(value).success,
    )
    .slice(0, 100);
  const invite = new URL(request.url).searchParams.get("inviteToken");
  // Public visibility and invite tokens never grant roster/avatar access.
  // Account RSVPs take precedence; cookies identify only unlinked guests.
  const [media] = await query<{ data: Buffer }>(
    `WITH actor_guests AS (
      SELECT g.event_id,g.approval FROM guests g
      WHERE g.status<>'declined' AND (g.user_id=$2::uuid OR (
        g.user_id IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM guests account_guest
          WHERE account_guest.event_id=g.event_id AND account_guest.user_id=$2::uuid
        )
        AND EXISTS (
          SELECT 1 FROM unnest($3::uuid[],$4::text[]) AS c(event_id,token_hash)
          WHERE c.event_id=g.event_id AND c.token_hash=g.edit_token_hash
        )
      ))
    )
    SELECT m.data FROM media m WHERE m.id=$1 AND m.content_type='image/webp' AND (
      (m.purpose='avatar' AND m.event_id IS NULL AND (
        m.owner_id=$2::uuid OR EXISTS (
          SELECT 1 FROM users u JOIN settings s ON s.id=1
          WHERE u.id=m.owner_id AND u.avatar_id=m.id
            AND u.public_profile_enabled AND s.public_profiles_enabled
        ) OR EXISTS (
          SELECT 1 FROM events e
          WHERE (
            e.owner_id=$2::uuid OR EXISTS (SELECT 1 FROM event_organizers o WHERE o.event_id=e.id AND o.user_id=$2::uuid)
            OR EXISTS (SELECT 1 FROM actor_guests a WHERE a.event_id=e.id AND a.approval='approved')
          ) AND (
            e.owner_id=m.owner_id OR EXISTS (SELECT 1 FROM event_organizers o WHERE o.event_id=e.id AND o.user_id=m.owner_id)
            OR EXISTS (SELECT 1 FROM guests g WHERE g.event_id=e.id AND g.user_id=m.owner_id AND (
              (g.approval='approved' AND g.status<>'declined') OR e.owner_id=$2::uuid
              OR EXISTS (SELECT 1 FROM event_organizers o WHERE o.event_id=e.id AND o.user_id=$2::uuid)
            ))
          )
        )
      )) OR (m.purpose IN ('cover','invitation') AND EXISTS (
        SELECT 1 FROM events e WHERE e.id=m.event_id AND (
          e.visibility='public' OR e.owner_id=$2::uuid
          OR EXISTS (SELECT 1 FROM event_organizers o WHERE o.event_id=e.id AND o.user_id=$2::uuid)
          OR EXISTS (SELECT 1 FROM actor_guests a WHERE a.event_id=e.id)
          OR e.invite_token=$5
        )
      ))
    )`,
    [
      id,
      user?.id ?? null,
      guestCredentials.map((c) => c.name.slice(15)),
      guestCredentials.map((c) => hashToken(c.value)),
      tokenSchema.safeParse(invite).success ? invite : null,
    ],
  );
  if (!media) return new Response(null, { status: 404, headers });
  return new Response(new Uint8Array(media.data), {
    headers: {
      ...headers,
      "Content-Type": "image/webp",
      "Content-Length": String(media.data.length),
    },
  });
}
