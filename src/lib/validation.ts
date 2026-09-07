import { z } from "zod";

export class PublicError extends Error {}
export const idSchema = z.uuid();
export const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const emailSchema = z.string().trim().toLowerCase().email().max(254);
export const passwordSchema = z
  .string()
  .min(12, "Use at least 12 characters for your password.")
  .max(128);
export const nameSchema = z.string().trim().min(1).max(80);
const text = (max: number) => z.string().trim().max(max);
export const dateSchema = z.string().refine((value) => {
  if (!value) return true;
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    value < "2000-01-01" ||
    value > "2200-12-31"
  )
    return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
  );
});
export const timeSchema = z.string().regex(/^$|^([01]\d|2[0-3]):[0-5]\d$/);
export const eventSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: text(5000),
  date: dateSchema,
  time: timeSchema,
  timezone: z
    .string()
    .min(1)
    .max(80)
    .refine((value) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: value });
        return true;
      } catch {
        return false;
      }
    }),
  venue: text(160),
  address: text(300),
  capacity: z.coerce.number().int().min(0).max(1000),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/),
  theme: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .regex(/^[a-zA-Z0-9_-]+$/),
});
export const rsvpSchema = z.object({
  name: nameSchema,
  status: z.enum(["going", "maybe", "declined"]),
  marker: z.enum(["mechanical", "electric", "rental"]),
  notes: text(1000),
});
export const scheduleSchema = z.object({
  time: timeSchema.refine(Boolean),
  title: z.string().trim().min(1).max(120),
  description: text(2000),
});
export const gearSchema = z.object({
  name: z.string().trim().min(1).max(120),
  quantity: z.coerce.number().int().min(1).max(10000),
  cost: z.coerce
    .number()
    .min(0)
    .max(1000000)
    .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 0.00001),
  category: z.enum(["bring", "rental", "shared"]),
});
export const pollSchema = z.object({
  question: z.string().trim().min(1).max(240),
  options: z
    .string()
    .max(1000)
    .transform((s) =>
      s
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.string().min(1).max(120)).min(2).max(6))
    .refine(
      (options) =>
        new Set(options.map((s) => s.toLowerCase())).size === options.length,
    ),
});
export function fields(form: FormData): Record<string, FormDataEntryValue> {
  return Object.fromEntries(form.entries());
}
export function field(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}
