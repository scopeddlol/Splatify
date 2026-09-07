import { getRecoveryCodes, requireUser } from "@/lib/data";
import { Shell, Notice } from "@/components/shell";
import { Submit } from "@/components/ui";
import { acknowledgeRecoveryAction } from "@/app/actions";
import { ShieldCheck } from "lucide-react";

export default async function RecoveryCodes({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const codes = await getRecoveryCodes();
  return (
    <Shell user={user}>
      <div className="narrow-page">
        <span className="eyebrow">ONE LAST THING</span>
        <h1>Keep your way back in.</h1>
        <Notice params={await searchParams} />
        <div className="panel">
          <ShieldCheck size={32} className="accent" />
          <h2>Your recovery codes</h2>
          {codes.length ? (
            <>
              <p>
                Store these in your password manager now. Each code can reset
                your password once. They are only displayed for ten minutes, or
                until you continue.
              </p>
              <div className="recovery-grid">
                {codes.map((code) => (
                  <code key={code}>{code}</code>
                ))}
              </div>
              <p className="field-help">
                No email resets. No support backdoor. These codes are your
                backup key.
              </p>
            </>
          ) : (
            <p>
              Recovery codes are no longer available to view. Use the copy you
              saved when you registered.
            </p>
          )}
          <form action={acknowledgeRecoveryAction}>
            <Submit>
              {codes.length
                ? "I've stored my recovery codes"
                : "Go to my plans"}
            </Submit>
          </form>
        </div>
      </div>
    </Shell>
  );
}
