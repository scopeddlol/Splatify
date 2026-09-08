"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  getUser,
  protectAction,
  rateLimit,
  setSession,
  setAuthReturn,
  requireActiveSession,
} from "@/lib/auth";
import { transaction } from "@/lib/db";
import { saveImage, replaceCredentials } from "@/lib/profile";
import {
  canUsePublicRecovery,
  hashPassword,
  validProfileSlug,
  verifyPassword,
} from "@/lib/security";
import { field, idSchema, passwordSchema, PublicError } from "@/lib/validation";

export async function saveProfileAction(form: FormData): Promise<void> {
  let result = "success=Profile%20saved.";
  try {
    await protectAction();
    const user = await getUser();
    if (!user) throw new PublicError("Please sign in to continue.");
    await rateLimit(`profile:${user.id}`, 30, 900);
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
      const {
        rows: [locked],
      } = await client.query(
        "SELECT id,email,admin_verified,first_name,profile_slug,public_profile_enabled FROM users WHERE id=$1 FOR UPDATE",
        [user.id],
      );
      if (!locked) throw new PublicError("Account not found.");
      await requireActiveSession(client, user.id);
      const firstName = z
        .string()
        .trim()
        .max(80)
        .parse(
          form.has("firstName") ? field(form, "firstName") : locked.first_name,
        );
      const slug = form.has("profileSlug")
        ? field(form, "profileSlug").trim().toLowerCase() || null
        : locked.profile_slug;
      if (slug && !validProfileSlug(slug))
        throw new PublicError(
          "Use 3-30 lowercase letters, numbers or hyphens. This address may be reserved.",
        );
      const enabled =
        form.has("publicProfilePresent") || form.has("publicProfileEnabled")
          ? form.has("publicProfileEnabled")
          : locked.public_profile_enabled;
      if (enabled && !slug)
        throw new PublicError("Choose a profile address first.");
      await client.query(
        "UPDATE users SET name=CASE WHEN $6 THEN name ELSE $2 END,real_name=$3,bio=$4,default_marker=$5,first_name=$7,profile_slug=$8,public_profile_enabled=$9 WHERE id=$1",
        [
          user.id,
          values.displayName,
          values.realName,
          values.bio,
          values.marker,
          !canUsePublicRecovery(locked.email, locked.admin_verified),
          firstName,
          slug,
          enabled,
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
        : error &&
            typeof error === "object" &&
            "code" in error &&
            error.code === "23505"
          ? "That profile address is taken. Choose another."
          : error instanceof z.ZodError
            ? "Check your profile fields and try again."
            : "Unable to save your profile. Please try again.";
    result = `error=${encodeURIComponent(message)}`;
  }
  revalidatePath("/", "layout");
  redirect(`/profile?${result}`);
}

export async function addLoadoutAction(form: FormData): Promise<void> {
  let result = "success=Gear%20added.";
  try {
    await protectAction();
    const user = await getUser();
    if (!user) throw new PublicError("Please sign in to continue.");
    await rateLimit(`loadout:${user.id}`, 30, 900);
    const category = z
      .enum(["marker", "hopper", "tank", "mask", "other"])
      .parse(field(form, "category"));
    const name = z.string().trim().min(1).max(100).parse(field(form, "name"));
    const notes = z.string().trim().max(250).parse(field(form, "notes"));
    await transaction(async (client) => {
      const locked = await client.query(
        "SELECT id FROM users WHERE id=$1 FOR UPDATE",
        [user.id],
      );
      if (!locked.rowCount) throw new PublicError("Account not found.");
      await requireActiveSession(client, user.id);
      const {
        rows: [count],
      } = await client.query(
        "SELECT count(*)::int AS total FROM loadout_items WHERE user_id=$1",
        [user.id],
      );
      if (count.total >= 10) throw new PublicError("Maximum 10 gear items.");
      await client.query(
        "INSERT INTO loadout_items(user_id,category,name,notes,position) VALUES($1,$2,$3,$4,$5)",
        [user.id, category, name, notes, count.total],
      );
    });
  } catch (error) {
    result = `error=${encodeURIComponent(error instanceof PublicError ? error.message : "Check your gear fields.")}`;
  }
  revalidatePath("/", "layout");
  redirect(`/profile?${result}`);
}

export async function deleteLoadoutAction(form: FormData): Promise<void> {
  let result = "success=Gear%20removed.";
  try {
    await protectAction();
    const user = await getUser();
    if (!user) throw new PublicError("Please sign in to continue.");
    const id = idSchema.parse(field(form, "itemId"));
    await transaction(async (client) => {
      await client.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [
        user.id,
      ]);
      await requireActiveSession(client, user.id);
      await client.query(
        "DELETE FROM loadout_items WHERE id=$1 AND user_id=$2",
        [id, user.id],
      );
    });
  } catch (error) {
    result = `error=${encodeURIComponent(error instanceof PublicError ? error.message : "Unable to remove gear.")}`;
  }
  revalidatePath("/", "layout");
  redirect(`/profile?${result}`);
}

export async function changePasswordAction(form: FormData): Promise<void> {
  let result;
  try {
    await protectAction();
    const user = await getUser();
    if (!user) throw new PublicError("Please sign in to continue.");
    await rateLimit(`password:${user.id}`, 6, 900);
    const current = z
      .string()
      .min(1)
      .max(128)
      .parse(field(form, "currentPassword"));
    const password = passwordSchema.parse(field(form, "password"));
    if (password !== field(form, "confirmPassword"))
      throw new PublicError("Passwords do not match.");
    result = await transaction(async (client) => {
      const {
        rows: [locked],
      } = await client.query(
        "SELECT id,email,admin_verified,password_hash FROM users WHERE id=$1 FOR UPDATE",
        [user.id],
      );
      if (!locked || !canUsePublicRecovery(locked.email, locked.admin_verified))
        throw new PublicError("This account is environment-managed.");
      await requireActiveSession(client, user.id);
      if (!(await verifyPassword(current, locked.password_hash)))
        throw new PublicError("Current password is incorrect.");
      return replaceCredentials(client, user.id, await hashPassword(password));
    });
  } catch (error) {
    redirect(
      `/profile?error=${encodeURIComponent(error instanceof PublicError ? error.message : "Use a password of 12-128 characters.")}`,
    );
  }
  await setSession(result.raw, result.codes);
  await setAuthReturn("/profile", result.raw);
  redirect("/recovery-codes");
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
      await requireActiveSession(client, user.id);
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
