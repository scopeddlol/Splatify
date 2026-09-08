"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { protectAction, rateLimit, requireAdmin } from "@/lib/auth";
import { logActivity, transaction } from "@/lib/db";
import { lockOwner } from "@/lib/owner";
import {
  canUsePublicRecovery,
  hashToken,
  resetLink,
  token,
} from "@/lib/security";
import { colorSchema, field, idSchema, PublicError } from "@/lib/validation";

export async function issueResetLinkAction(
  _previous: { link: string; error: string },
  form: FormData,
): Promise<{ link: string; error: string }> {
  try {
    await protectAction();
    const owner = await requireAdmin();
    const targetId = idSchema.parse(field(form, "userId"));
    await rateLimit(`owner-reset:${owner.id}`, 10, 900);
    await rateLimit(`reset-target:${targetId}`, 3, 900);
    if (targetId === owner.id)
      throw new PublicError("This account is environment-managed.");
    const raw = token();
    const link = resetLink(raw);
    await transaction(async (client) => {
      await lockOwner(client, owner.id, field(form, "currentPassword"));
      const {
        rows: [target],
      } = await client.query(
        "SELECT email,admin_verified FROM users WHERE id=$1 FOR UPDATE",
        [targetId],
      );
      if (!target || !canUsePublicRecovery(target.email, target.admin_verified))
        throw new PublicError("Reset unavailable for this account.");
      await client.query("DELETE FROM password_reset_links WHERE user_id=$1", [
        targetId,
      ]);
      await client.query(
        "INSERT INTO password_reset_links(token_hash,user_id,issuer_id,expires_at) VALUES($1,$2,$3,now()+interval '30 minutes')",
        [hashToken(raw), targetId, owner.id],
      );
      await logActivity(
        client,
        "owner.reset-issued",
        `Owner ${owner.id}; account ${targetId}`,
      );
    });
    return { link, error: "" };
  } catch (error) {
    return {
      link: "",
      error:
        error instanceof PublicError
          ? error.message
          : "Unable to issue reset link.",
    };
  }
}

export async function updateSiteAction(form: FormData): Promise<void> {
  let result = "success=Site%20saved.";
  try {
    await protectAction();
    const owner = await requireAdmin();
    await rateLimit(`owner-site:${owner.id}`, 10, 900);
    const title = z.string().trim().max(100).parse(field(form, "landingTitle"));
    const subtitle = z
      .string()
      .trim()
      .max(240)
      .parse(field(form, "landingSubtitle"));
    const cta = z.string().trim().max(40).parse(field(form, "landingCta"));
    const notice = z.string().trim().max(1000).parse(field(form, "siteNotice"));
    const accent = colorSchema.parse(field(form, "accentColor"));
    await transaction(async (client) => {
      await lockOwner(client, owner.id, field(form, "currentPassword"));
      await client.query(
        "UPDATE settings SET landing_title=$1,landing_subtitle=$2,landing_cta=$3,site_notice=$4,accent_color=$5,discovery_enabled=$6,public_profiles_enabled=$7,sponsors_enabled=$8,registration_enabled=$9,event_creation_enabled=$10 WHERE id=1",
        [
          title,
          subtitle,
          cta,
          notice,
          accent,
          form.has("discoveryEnabled"),
          form.has("publicProfilesEnabled"),
          form.has("sponsorsEnabled"),
          form.has("registrationEnabled"),
          form.has("eventCreationEnabled"),
        ],
      );
      await logActivity(
        client,
        "owner.site-updated",
        `Owner ${owner.id}; landingTitle,landingSubtitle,landingCta,siteNotice,accentColor,discoveryEnabled,publicProfilesEnabled,sponsorsEnabled,registrationEnabled,eventCreationEnabled`,
      );
    });
  } catch (error) {
    result = `error=${encodeURIComponent(error instanceof PublicError ? error.message : "Check your site settings.")}`;
  }
  revalidatePath("/", "layout");
  redirect(`/admin/site?${result}`);
}
