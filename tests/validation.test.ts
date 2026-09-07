import assert from "node:assert/strict";
import { test } from "node:test";
import {
  dateSchema,
  timeSchema,
  eventSchema,
  passwordSchema,
  emailSchema,
  rsvpSchema,
  pollSchema,
  gearSchema,
  idSchema,
  tokenSchema,
} from "../src/lib/validation";

const event = {
  title: "Weekend paintball",
  description: "",
  date: "2026-10-10",
  time: "09:00",
  timezone: "Europe/London",
  venue: "Woods",
  address: "",
  capacity: "20",
  currency: "gbp",
  theme: "forest",
};
test("dates reject overflow, invalid years and malformed strings", () => {
  for (const value of ["", "2024-02-29", "2026-12-31"])
    assert.equal(dateSchema.safeParse(value).success, true);
  for (const value of [
    "2026-02-29",
    "2026-02-30",
    "2026-13-01",
    "2026-1-1",
    "0000-01-01",
    "9999-01-01",
  ])
    assert.equal(dateSchema.safeParse(value).success, false, value);
  for (const value of ["", "00:00", "23:59"])
    assert.equal(timeSchema.safeParse(value).success, true);
  for (const value of ["24:00", "12:60", "9:00", "noon"])
    assert.equal(timeSchema.safeParse(value).success, false);
});
test("event input normalizes values and bounds capacity and timezone", () => {
  assert.equal(eventSchema.parse(event).capacity, 20);
  assert.equal(eventSchema.parse(event).currency, "GBP");
  assert.equal(eventSchema.safeParse({ ...event, capacity: 0 }).success, true);
  for (const capacity of [-1, 1001, 1.5, "NaN"])
    assert.equal(eventSchema.safeParse({ ...event, capacity }).success, false);
  assert.equal(
    eventSchema.safeParse({ ...event, timezone: "Not/A_Zone" }).success,
    false,
  );
  assert.equal(eventSchema.safeParse({ ...event, title: " " }).success, false);
  assert.equal(
    eventSchema.safeParse({ ...event, theme: "<script>" }).success,
    false,
  );
  assert.equal(
    eventSchema.safeParse({ ...event, description: "a".repeat(5001) }).success,
    false,
  );
});
test("authentication input is bounded and email canonicalized", () => {
  assert.equal(emailSchema.parse(" OWNER@Example.com "), "owner@example.com");
  assert.equal(passwordSchema.safeParse("short").success, false);
  assert.equal(passwordSchema.safeParse("x".repeat(129)).success, false);
  assert.equal(passwordSchema.safeParse("a strong password").success, true);
});
test("RSVP enums and notes are validated", () => {
  const guest = {
    name: "Guest",
    status: "going",
    marker: "mechanical",
    notes: "",
  };
  assert.equal(rsvpSchema.safeParse(guest).success, true);
  assert.equal(
    rsvpSchema.safeParse({ ...guest, status: "admin" }).success,
    false,
  );
  assert.equal(
    rsvpSchema.safeParse({ ...guest, marker: "unknown" }).success,
    false,
  );
  assert.equal(
    rsvpSchema.safeParse({ ...guest, notes: "x".repeat(1001) }).success,
    false,
  );
});
test("polls require two to six distinct bounded options", () => {
  assert.deepEqual(
    pollSchema.parse({
      question: "Which map?",
      options: " Woods \r\n\n Village ",
    }).options,
    ["Woods", "Village"],
  );
  for (const options of [
    "one",
    "one\nONE",
    "1\n2\n3\n4\n5\n6\n7",
    `one\n${"x".repeat(121)}`,
  ])
    assert.equal(
      pollSchema.safeParse({ question: "Map?", options }).success,
      false,
    );
});
test("gear accepts per-player money amounts, not negative or fractional quantities", () => {
  const gear = {
    name: "Paint",
    quantity: "2",
    cost: "12.50",
    category: "shared",
  };
  assert.deepEqual(gearSchema.parse(gear), {
    name: "Paint",
    quantity: 2,
    cost: 12.5,
    category: "shared",
  });
  for (const cost of [-1, Infinity, 0.001, 1000001])
    assert.equal(gearSchema.safeParse({ ...gear, cost }).success, false);
  for (const quantity of [0, 0.5, 10001])
    assert.equal(gearSchema.safeParse({ ...gear, quantity }).success, false);
});
test("IDs and bearer tokens reject path and SQL injection payloads", () => {
  for (const value of [
    "../admin",
    "' OR 1=1 --",
    "//example.com",
    "not-an-id",
  ]) {
    assert.equal(idSchema.safeParse(value).success, false);
    assert.equal(tokenSchema.safeParse(value).success, false);
  }
});
