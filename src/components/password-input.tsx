"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

export function PasswordInput({
  name = "password",
  id = "password",
  autoComplete = "current-password",
  minLength = 1,
  placeholder = "Your password",
  required = true,
}: {
  name?: string;
  id?: string;
  autoComplete?: string;
  minLength?: number;
  placeholder?: string;
  required?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <span className="password-control">
      <input
        name={name}
        id={id}
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        minLength={minLength}
        maxLength={128}
        placeholder={placeholder}
        required={required}
      />
      <button
        className="password-toggle"
        type="button"
        aria-pressed={visible}
        aria-label="Show password"
        title={visible ? "Hide password" : "Show password"}
        aria-controls={id}
        onClick={() => setVisible(!visible)}
      >
        {visible ? (
          <EyeOff size={18} aria-hidden="true" />
        ) : (
          <Eye size={18} aria-hidden="true" />
        )}
      </button>
    </span>
  );
}
