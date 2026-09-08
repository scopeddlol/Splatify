"use client";

import { useActionState } from "react";
import { issueResetLinkAction } from "@/app/admin/actions";
import { PasswordInput } from "./password-input";
import { Submit } from "./ui";

export function OwnerResetForm({ userId }: { userId: string }) {
  const [state, action] = useActionState(issueResetLinkAction, {
    link: "",
    error: "",
  });
  return (
    <details className="owner-reset">
      <summary>Reset password</summary>
      <form action={action} className="form-stack">
        <input type="hidden" name="userId" value={userId} />
        <label htmlFor={`owner-password-${userId}`}>Your owner password</label>
        <PasswordInput name="currentPassword" id={`owner-password-${userId}`} />
        <Submit>Issue reset link</Submit>
        {state.error && (
          <p role="alert" className="notice error">
            {state.error}
          </p>
        )}
        {state.link && (
          <div role="status">
            <label>
              Reset link
              <input
                readOnly
                value={state.link}
                onFocus={(e) => e.target.select()}
              />
            </label>
            <small>Single use. Expires in 30 minutes. Share privately.</small>
          </div>
        )}
      </form>
    </details>
  );
}
