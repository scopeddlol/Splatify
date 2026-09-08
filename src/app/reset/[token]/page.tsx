import Link from "next/link";
import { connection } from "next/server";
import { query } from "@/lib/db";
import { canUsePublicRecovery, hashToken } from "@/lib/security";
import { tokenSchema } from "@/lib/validation";
import { Brand } from "@/components/shell";
import { ProfileResetForm } from "@/components/profile-reset-form";

export const dynamic = "force-dynamic";
export const metadata = {
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};

export default async function ResetPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  await connection();
  const { token } = await params;
  const [row] = tokenSchema.safeParse(token).success
    ? await query(
        "SELECT u.email,u.admin_verified FROM password_reset_links r JOIN users u ON u.id=r.user_id WHERE r.token_hash=$1 AND r.expires_at>now()",
        [hashToken(token)],
      )
    : [];
  const valid = row && canUsePublicRecovery(row.email, row.admin_verified);
  return (
    <main className="account-reset">
      <Brand />
      <section className="panel form-stack">
        <h1>Reset password</h1>
        {valid ? (
          <ProfileResetForm token={token} />
        ) : (
          <>
            <p role="alert">Invalid or expired reset link.</p>
            <Link href="/login" className="text-link">
              Sign in
            </Link>
          </>
        )}
      </section>
    </main>
  );
}
