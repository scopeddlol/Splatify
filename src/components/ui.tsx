"use client";

import { useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Check, Copy, LoaderCircle, Trash2 } from "lucide-react";

export function Submit({
  children,
  className = "button primary",
}: {
  children: ReactNode;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button className={className} disabled={pending} type="submit">
      {pending ? (
        <>
          <LoaderCircle size={16} className="spin" /> Saving...
        </>
      ) : (
        children
      )}
    </button>
  );
}

export function CopyLink({
  path,
  label = "Copy invite link",
}: {
  path: string;
  label?: string;
}) {
  const [state, setState] = useState<"idle" | "copied" | "manual">("idle");
  const [url, setUrl] = useState("");
  async function copy() {
    const absolute = new URL(path, window.location.origin).href;
    setUrl(absolute);
    try {
      await navigator.clipboard.writeText(absolute);
      setState("copied");
      setTimeout(() => setState("idle"), 2500);
    } catch {
      setState("manual");
    }
  }
  return (
    <div className="copy-control">
      <button type="button" className="button primary" onClick={copy}>
        {state === "copied" ? <Check size={16} /> : <Copy size={16} />}
        {state === "copied" ? "Link copied" : label}
      </button>
      {state === "manual" && (
        <label className="copy-fallback">
          Select and copy this link
          <input readOnly value={url} onFocus={(e) => e.target.select()} />
        </label>
      )}
      <span className="sr-only" aria-live="polite">
        {state === "copied" ? "Link copied to clipboard" : ""}
      </span>
    </div>
  );
}

export function DeleteButton({
  message = "Delete this item? This cannot be undone.",
  label = "Delete",
}: {
  message?: string;
  label?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="icon-button danger"
      title={label}
      aria-label={label}
      disabled={pending}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      <Trash2 size={16} />
    </button>
  );
}

export function ConfirmSubmit({
  children,
  message,
}: {
  children: ReactNode;
  message: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="button secondary"
      disabled={pending}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
