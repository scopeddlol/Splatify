import type { CSSProperties } from "react";

export const TIME_ZONES = [
  { value: "America/New_York", label: "Eastern US (New York)" },
  { value: "America/Chicago", label: "Central US (Chicago)" },
  { value: "America/Denver", label: "Mountain US (Denver)" },
  { value: "America/Phoenix", label: "Arizona (no daylight saving)" },
  { value: "America/Los_Angeles", label: "Pacific US (Los Angeles)" },
  { value: "America/Anchorage", label: "Alaska" },
  { value: "Pacific/Honolulu", label: "Hawaii" },
  { value: "America/Toronto", label: "Eastern Canada (Toronto)" },
  { value: "America/Vancouver", label: "Pacific Canada (Vancouver)" },
  { value: "America/Halifax", label: "Atlantic Canada (Halifax)" },
  { value: "America/St_Johns", label: "Newfoundland" },
  { value: "America/Mexico_City", label: "Central Mexico (Mexico City)" },
  { value: "America/Sao_Paulo", label: "Brazil (Sao Paulo)" },
  { value: "Europe/London", label: "United Kingdom & Ireland" },
  { value: "Europe/Paris", label: "Central Europe (Paris)" },
  { value: "Europe/Berlin", label: "Central Europe (Berlin)" },
  { value: "Europe/Helsinki", label: "Eastern Europe (Helsinki)" },
  { value: "Africa/Johannesburg", label: "South Africa" },
  { value: "Asia/Dubai", label: "United Arab Emirates" },
  { value: "Asia/Kolkata", label: "India" },
  { value: "Asia/Singapore", label: "Singapore" },
  { value: "Asia/Tokyo", label: "Japan" },
  { value: "Australia/Perth", label: "Western Australia (Perth)" },
  { value: "Australia/Adelaide", label: "South Australia (Adelaide)" },
  { value: "Australia/Brisbane", label: "Queensland (Brisbane)" },
  { value: "Australia/Sydney", label: "Eastern Australia (Sydney)" },
  { value: "Pacific/Auckland", label: "New Zealand" },
  { value: "UTC", label: "Universal Time" },
];

export function timeZoneLabel(value: string) {
  const known = TIME_ZONES.find((zone) => zone.value === value);
  if (known) return known.label;
  try {
    return (
      new Intl.DateTimeFormat("en-US", {
        timeZone: value,
        timeZoneName: "longGeneric",
      })
        .formatToParts(new Date("2026-01-15T12:00:00Z"))
        .find((part) => part.type === "timeZoneName")?.value || "Local time"
    );
  } catch {
    return "Local time";
  }
}

export function clockLabel(value: string) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return "Time to be confirmed";
  const [hours, minutes] = value.split(":").map(Number);
  return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${hours >= 12 ? "PM" : "AM"}`;
}

export function eventStyle(value: string): CSSProperties {
  const color = /^#[0-9a-f]{6}$/i.test(value) ? value : "#d5fb51";
  const rgb = [1, 3, 5].map((start) =>
    parseInt(color.slice(start, start + 2), 16),
  );
  const luminance = (channels: number[]) =>
    channels
      .map((n) => n / 255)
      .map((n) => (n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4))
      .reduce((sum, n, i) => sum + n * [0.2126, 0.7152, 0.0722][i], 0);
  // Keep accent labels readable on the dark interface even for very dark chosen colors.
  while (luminance(rgb) < 0.3)
    for (let i = 0; i < 3; i++)
      rgb[i] += Math.max(1, Math.round((255 - rgb[i]) * 0.12));
  const accent = `#${rgb.map((n) => n.toString(16).padStart(2, "0")).join("")}`;
  return {
    "--accent": accent,
    "--accent-ink": "#101210",
    "--event-color": color,
  } as CSSProperties;
}
