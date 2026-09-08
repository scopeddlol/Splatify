"use server";

import { redirect } from "next/navigation";
import {
  protectAction,
  rateLimit,
  setSession,
  setAuthReturn,
} from "@/lib/auth";
import { logActivity, query, transaction } from "@/lib/db";
import { replaceCredentials } from "@/lib/profile";
import { canUsePublicRecovery, hashPassword, hashToken } from "@/lib/security";
import {
  field,
  passwordSchema,
  PublicError,
  tokenSchema,
} from "@/lib/validation";

export async function consumeResetLinkAction(
  _previous: { error: string },
  form: FormData,
): Promise<{ error: string }> {
  let result;
  try {
    await protectAction();
    const raw = tokenSchema.parse(field(form, "token"));
    await rateLimit(`reset-consume:${hashToken(raw)}`, 6, 900);
    await rateLimit("reset-consume:global", 100, 900);
    const password = passwordSchema.parse(field(form, "password"));
    if (password !== field(form, "confirmPassword"))
      throw new PublicError("Passwords do not match.");
    const hash = hashToken(raw);
    const [link] = await query(
      "SELECT user_id FROM password_reset_links WHERE token_hash=$1 AND expires_at>now()",
      [hash],
    );
    if (!link) throw new PublicError("Invalid or expired reset link.");
    const passwordHash = await hashPassword(password);
    result = await transaction(async (client) => {
      // Lock the account before consuming the token, matching issuance and recovery.
      const {
        rows: [target],
      } = await client.query(
        "SELECT id,email,admin_verified FROM users WHERE id=$1 FOR UPDATE",
        [link.user_id],
      );
      if (!target || !canUsePublicRecovery(target.email, target.admin_verified))
        throw new PublicError("Invalid or expired reset link.");
      const used = await client.query(
        "DELETE FROM password_reset_links WHERE token_hash=$1 AND user_id=$2 AND expires_at>clock_timestamp() RETURNING user_id",
        [hash, target.id],
      );
      if (!used.rowCount)
        throw new PublicError("Invalid or expired reset link.");
      const credentials = await replaceCredentials(
        client,
        target.id,
        passwordHash,
      );
      await logActivity(client, "user.link-reset", `Account ${target.id}`);
      return credentials;
    });
  } catch (error) {
    return {
      error:
        error instanceof PublicError
          ? error.message
          : "Invalid link or password. Use 12-128 characters.",
    };
  }
  await setSession(result.raw, result.codes);
  await setAuthReturn("/profile", result.raw);
  redirect("/recovery-codes");
}
