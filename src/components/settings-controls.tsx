"use client";

import { useId, useState } from "react";

export function SettingsToggle({
  name,
  label,
  description,
  defaultChecked,
  disabled = false,
}: {
  name: string;
  label: string;
  description?: string;
  defaultChecked: boolean;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <label className="settings-toggle" htmlFor={id}>
      <span>
        <strong>{label}</strong>
        {description && <span id={`${id}-description`}>{description}</span>}
      </span>
      <input
        id={id}
        name={name}
        type="checkbox"
        role="switch"
        defaultChecked={defaultChecked}
        disabled={disabled}
        aria-describedby={description ? `${id}-description` : undefined}
      />
      <span className="settings-toggle-track" aria-hidden="true" />
    </label>
  );
}

export function SliderField({
  name,
  label,
  min,
  max,
  step = 1,
  defaultValue,
  unit,
}: {
  name: string;
  label: string;
  min: number;
  max: number;
  step?: number;
  defaultValue: number;
  unit?: string;
}) {
  const id = useId();
  const [value, setValue] = useState(String(defaultValue));
  return (
    <div className="slider-field">
      <label htmlFor={id}>
        {label}
        {unit ? ` (${unit})` : ""}
      </label>
      <div>
        <input
          type="range"
          aria-label={`${label} slider`}
          min={min}
          max={max}
          step={step}
          value={value === "" ? min : value}
          onChange={(e) => setValue(e.target.value)}
        />
        <input
          id={id}
          type="number"
          name={name}
          min={min}
          max={max}
          step={step}
          required
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </div>
    </div>
  );
}
