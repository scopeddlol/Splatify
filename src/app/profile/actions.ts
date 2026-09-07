"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getUser, protectAction } from "@/lib/auth";
import { transaction } from "@/lib/db";
import { saveImage } from "@/lib/profile";
import { field, idSchema, PublicError } from "@/lib/validation";

export async function saveProfileAction(form: FormData): Promise<void> {
  let result = "success=Profile%20saved.";
  try {
    await protectAction();
    const user = await getUser();
    if (!user) throw new PublicError("Please sign in to continue.");
    const values = z
      .object({
        displayName: z.string().trim().min(1).max(80),
        realName: z.string().trim().max(120),
        bio: z.string().trim().max(500),
        marker: z.enum(["mechanical", "electric", "rental"]),
      })
      .parse({
        displayName: user.isAdmin ? user.name : field(form, "displayName"),
        realName: field(form, "realName"),
        bio: field(form, "bio"),
        marker: field(form, "marker"),
      });
    const avatar = form.get("avatar");
    const remove = form.has("removeAvatar");
    if (remove && avatar instanceof File && avatar.size)
      throw new PublicError(
        "Choose either a new avatar or remove your current avatar.",
      );
    await transaction(async (client) => {
      await client.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [
        user.id,
      ]);
      await client.query(
        "UPDATE users SET name=CASE WHEN $6 THEN name ELSE $2 END,real_name=$3,bio=$4,default_marker=$5 WHERE id=$1",
        [
          user.id,
          values.displayName,
          values.realName,
          values.bio,
          values.marker,
          user.isAdmin,
        ],
      );
      if (remove) {
        await client.query("UPDATE users SET avatar_id=NULL WHERE id=$1", [
          user.id,
        ]);
        await client.query(
          "DELETE FROM media WHERE owner_id=$1 AND event_id IS NULL AND purpose='avatar'",
          [user.id],
        );
      } else if (avatar instanceof File && avatar.size) {
        await saveImage(client, user.id, null, "avatar", avatar);
      }
    });
  } catch (error) {
    const message =
      error instanceof PublicError
        ? error.message
        : error instanceof z.ZodError
          ? "Check your profile fields and try again."
          : "Unable to save your profile. Please try again.";
    result = `error=${encodeURIComponent(message)}`;
  }
  revalidatePath("/", "layout");
  redirect(`/profile?${result}`);
}

export async function uploadEventImageAction(form: FormData): Promise<void> {
  const parsedId = idSchema.safeParse(field(form, "eventId"));
  const path = parsedId.success
    ? `/days/${parsedId.data}/settings`
    : "/dashboard";
  let result = "success=Image%20saved.";
  try {
    await protectAction();
    const user = await getUser();
    if (!user) throw new PublicError("Please sign in to continue.");
    if (!parsedId.success) throw new PublicError("Invalid event.");
    const eventId = parsedId.data;
    const purpose = field(form, "purpose");
    if (purpose !== "cover" && purpose !== "invitation")
      throw new PublicError("Invalid image purpose.");
    const file = form.get("file");
    const remove = form.has("remove");
    if (remove && file instanceof File && file.size)
      throw new PublicError("Choose either a replacement image or removal.");
    if (!remove && (!(file instanceof File) || !file.size))
      throw new PublicError("Choose an image to upload.");
    await transaction(async (client) => {
      const {
        rows: [event],
      } = await client.query(
        "SELECT owner_id FROM events WHERE id=$1 FOR UPDATE",
        [eventId],
      );
      if (!event) throw new PublicError("Event not found.");
      if (event.owner_id !== user.id) {
        const organizer = await client.query(
          "SELECT user_id FROM event_organizers WHERE event_id=$1 AND user_id=$2 FOR SHARE",
          [eventId, user.id],
        );
        if (!organizer.rowCount)
          throw new PublicError(
            "Only this event's organizers can change its images.",
          );
      }
      if (remove) {
        const column = purpose === "cover" ? "cover_id" : "invitation_cover_id";
        await client.query(`UPDATE events SET ${column}=NULL WHERE id=$1`, [
          eventId,
        ]);
        await client.query(
          "DELETE FROM media WHERE event_id=$1 AND purpose=$2",
          [eventId, purpose],
        );
      } else {
        await saveImage(client, user.id, eventId, purpose, file as File);
      }
    });
  } catch (error) {
    result = `error=${encodeURIComponent(error instanceof PublicError ? error.message : "Unable to save this image. Please try again.")}`;
  }
  revalidatePath("/", "layout");
  redirect(`${path}?${result}`);
}
