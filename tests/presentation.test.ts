import assert from "node:assert/strict";
import { test } from "node:test";
import { clockLabel, timeZoneLabel, eventStyle } from "../src/lib/presentation";
import { regionSearchTerms } from "../src/lib/locations";

test("friendly time zones and twelve-hour times preserve stored values", () => {
  assert.equal(timeZoneLabel("America/New_York"), "Eastern US (New York)");
  assert.equal(timeZoneLabel("America/Chicago"), "Central US (Chicago)");
  assert.equal(clockLabel("00:05"), "12:05 AM");
  assert.equal(clockLabel("12:30"), "12:30 PM");
  assert.equal(clockLabel("19:00"), "7:00 PM");
  assert.equal(clockLabel(""), "Time to be confirmed");
});
test("state search accepts full names, abbreviations and international regions", () => {
  assert.deepEqual(regionSearchTerms(" NY "), ["ny", "new york"]);
  assert.deepEqual(regionSearchTerms("Texas"), ["tx", "texas"]);
  assert.deepEqual(regionSearchTerms("Ontario"), ["ontario"]);
});
test("custom accents cannot inject CSS and dark selections stay readable", () => {
  const fallback = eventStyle(
    "red; background:url(https://example.com)",
  ) as Record<string, string>;
  assert.equal(fallback["--event-color"], "#d5fb51");
  const dark = eventStyle("#000000") as Record<string, string>;
  assert.match(dark["--accent"], /^#[0-9a-f]{6}$/);
  assert.notEqual(dark["--accent"], "#000000");
});
