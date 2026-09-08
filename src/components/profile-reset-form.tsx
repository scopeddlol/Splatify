"use client";

import { useActionState } from "react";
import { consumeResetLinkAction } from "@/app/reset/actions";
import { PasswordInput } from "./password-input";
import { Submit } from "./ui";

export function ProfileResetForm({ token }: { token: string }) {
  const [state, action] = useActionState(consumeResetLinkAction, { error: "" });
  return (
    <form action={action} className="form-stack">
      <input type="hidden" name="token" value={token} />
      {state.error && (
        <p role="alert" className="notice error">
          {state.error}
        </p>
      )}
      <label htmlFor="reset-password">New password</label>
      <PasswordInput
        id="reset-password"
        autoComplete="new-password"
        minLength={12}
      />
      <label htmlFor="reset-confirm-password">Confirm password</label>
      <PasswordInput
        id="reset-confirm-password"
        name="confirmPassword"
        autoComplete="new-password"
        minLength={12}
      />
      <small>Signs out all sessions and replaces recovery codes.</small>
      <Submit>Reset password</Submit>
    </form>
  );
}
