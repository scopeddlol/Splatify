import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { Pool } from "pg";

const requireModule = createRequire(import.meta.url);
const {
  BROWSER_DATABASE_URL,
  PLAYWRIGHT_MODULE,
  BROWSER_EXECUTABLE,
  UI_SCREENSHOT_DIR,
} = process.env;
if (
  !BROWSER_DATABASE_URL ||
  !PLAYWRIGHT_MODULE ||
  !BROWSER_EXECUTABLE ||
  !UI_SCREENSHOT_DIR
)
  throw new Error(
    "Set BROWSER_DATABASE_URL, PLAYWRIGHT_MODULE, BROWSER_EXECUTABLE, and UI_SCREENSHOT_DIR for a disposable environment.",
  );
const { chromium } = requireModule(PLAYWRIGHT_MODULE);
const db = new Pool({ connectionString: BROWSER_DATABASE_URL });
const base = process.env.BROWSER_BASE_URL || "http://127.0.0.1:3107";

async function main() {
  const browser = await chromium.launch({
    executablePath: BROWSER_EXECUTABLE,
    headless: true,
  });
  const owner = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const guest = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await owner.newPage();
  const visitor = await guest.newPage();
  const title = `UI smoke ${randomUUID()}`;
  const errors: string[] = [];
  const overflows: string[] = [];
  for (const p of [page, visitor]) {
    p.setDefaultTimeout(30000);
    p.on("pageerror", (error: Error) => errors.push(error.message));
    p.on("dialog", (dialog: { accept(): Promise<void> }) => dialog.accept());
  }
  let eventId: string | undefined;
  let originalNotice: string | undefined;
  let noticeChanged = false;
  try {
    for (const [p, name] of [
      [page, "landing-desktop"],
      [visitor, "landing-mobile"],
    ] as const) {
      await p.goto(base);
      await p.locator("h1").waitFor();
      await p.screenshot({
        path: join(UI_SCREENSHOT_DIR!, `${name}.png`),
        fullPage: true,
      });
    }
    await page.goto(`${base}/login`);
    await page.locator('[name="email"]').fill("admin@splatify.test");
    await page.locator('[name="password"]').fill("local-only-splatify-admin");
    await page
      .locator('form:has([name="email"]) button[type="submit"]')
      .click();
    await page.waitForURL("**/dashboard");
    await page.goto(`${base}/events/new`);
    await page.locator('[name="title"]').fill(title);
    await page.getByRole("button", { name: "Create my day" }).click();
    await page.waitForURL(/\/events\/[a-f0-9-]{36}$/);
    eventId = new URL(page.url()).pathname.split("/").pop();
    const event = (
      await db.query("SELECT * FROM events WHERE id=$1", [eventId])
    ).rows[0];
    assert.ok(event);
    await page.getByText("Add to the schedule", { exact: true }).click();
    const schedule = page.locator('#schedule form:has([name="title"])');
    await schedule.locator('[name="time"]').fill("10:00");
    await schedule.locator('[name="title"]').fill("Safety briefing");
    await schedule.getByRole("button", { name: "Add schedule item" }).click();
    await page
      .locator(".schedule-row")
      .filter({ hasText: "Safety briefing" })
      .waitFor();
    await page.getByText("Add gear or a cost", { exact: true }).click();
    const gear = page.locator('#gear form:has([name="name"])');
    await gear.locator('[name="name"]').fill("Rental mask");
    await gear.locator('[name="category"]').selectOption("rental");
    await gear.locator('[name="cost"]').fill("12.50");
    await gear.getByRole("button", { name: "Add item", exact: true }).click();
    await page
      .locator(".gear-row")
      .filter({ hasText: "Rental mask" })
      .waitFor();
    await page.getByText("Ask the crew", { exact: true }).click();
    await page.locator('[name="question"]').fill("Lunch choice?");
    await page.locator('[name="options"]').fill("Pizza\nBurgers");
    await page
      .getByRole("button", { name: "Create poll", exact: true })
      .click();
    await page.locator(".poll").filter({ hasText: "Lunch choice?" }).waitFor();
    await visitor.goto(`${base}/invite/${event.invite_token}`);
    assert.equal(await visitor.locator(".poll-option:disabled").count(), 2);
    await visitor.locator('#rsvp [name="name"]').fill("UI smoke guest");
    await visitor.getByRole("button", { name: "Send my RSVP" }).click();
    await visitor.getByRole("button", { name: "Update my RSVP" }).waitFor();
    await visitor.getByRole("button", { name: "Pizza" }).click();
    await visitor
      .locator(".poll-option.selected")
      .filter({ hasText: "Pizza" })
      .waitFor();
    assert.equal(
      await visitor.locator(".poll-option.selected svg.lucide-check").count(),
      1,
    );
    await visitor.getByRole("button", { name: "Burgers" }).click();
    await visitor
      .locator(".poll-option.selected")
      .filter({ hasText: "Burgers" })
      .waitFor();
    assert.equal(
      (
        await db.query(
          "SELECT count(*)::int AS n FROM poll_votes v JOIN polls p ON p.id=v.poll_id WHERE p.event_id=$1",
          [eventId],
        )
      ).rows[0].n,
      1,
    );
    await page.goto(`${base}/admin`);
    await page.waitForLoadState("networkidle");
    originalNotice = await page.locator('[name="siteNotice"]').inputValue();
    await page.locator('[name="siteNotice"]').fill(title);
    noticeChanged = true;
    await page.getByRole("button", { name: "Save platform settings" }).click();
    await page.waitForURL(/success=/);
    await page.goto(`${base}/dashboard`);
    await page.locator(".notice").filter({ hasText: title }).waitFor();
    await visitor.reload();
    await visitor.locator(".notice").filter({ hasText: title }).waitFor();
    await page.goto(`${base}/admin`);
    await page.waitForLoadState("networkidle");
    await page.locator('[name="siteNotice"]').fill(originalNotice);
    assert.equal(
      await page.locator('[name="siteNotice"]').inputValue(),
      originalNotice,
    );
    await page.getByRole("button", { name: "Save platform settings" }).click();
    await page.waitForURL(/success=/);
    assert.equal(
      (await db.query("SELECT site_notice FROM settings WHERE id=1")).rows[0]
        .site_notice,
      originalNotice,
    );
    noticeChanged = false;
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({
        width,
        height: width === 1440 ? 1000 : 844,
      });
      for (const route of [
        "/",
        "/login",
        "/signup",
        "/dashboard",
        "/events/new",
        `/events/${eventId}`,
        `/invite/${event.invite_token}`,
        "/admin",
      ]) {
        const current = ["/login", "/signup"].includes(route) ? visitor : page;
        await current.setViewportSize({
          width,
          height: width === 1440 ? 1000 : 844,
        });
        await current.goto(`${base}${route}`);
        await current.locator("h1").waitFor({ state: "attached" });
        await current.waitForLoadState("networkidle");
        if (route === `/events/${eventId}`) {
          for (const summary of await page.locator("details > summary").all())
            await summary.click();
        }
        const overflow = await current.evaluate(() => ({
          viewport: document.documentElement.clientWidth,
          scroll: document.documentElement.scrollWidth,
          elements: Array.from(document.querySelectorAll("body *"))
            .filter((el) => {
              const rect = el.getBoundingClientRect();
              return (
                rect.width > 0 &&
                rect.right > document.documentElement.clientWidth + 1
              );
            })
            .map((el) => `${el.tagName}.${el.className}`)
            .slice(0, 12),
        }));
        console.info(JSON.stringify({ width, route, ...overflow }));
        if (overflow.scroll > overflow.viewport)
          overflows.push(`${route} at ${width}px: ${overflow.scroll}px wide`);
        if (
          ["/dashboard", "/admin", `/events/${eventId}`].includes(route) &&
          width !== 320
        ) {
          const name =
            route === "/dashboard"
              ? "dashboard"
              : route === "/admin"
                ? "admin"
                : "event";
          await page.screenshot({
            path: join(
              UI_SCREENSHOT_DIR!,
              `${name}-${width === 1440 ? "desktop" : "mobile"}.png`,
            ),
            fullPage: true,
          });
        }
      }
    }
    await visitor.setViewportSize({ width: 390, height: 844 });
    await visitor.goto(`${base}/invite/${event.invite_token}`);
    await visitor.locator(".poll-option.selected").waitFor();
    await visitor.screenshot({
      path: join(UI_SCREENSHOT_DIR!, "guest-vote-mobile.png"),
      fullPage: true,
    });
    await page.goto(`${base}/events/${eventId}`);
    for (const label of [
      "Delete Safety briefing",
      "Delete Rental mask",
      "Delete poll Lunch choice?",
    ]) {
      await page.getByRole("button", { name: label, exact: true }).click();
      await page
        .getByRole("button", { name: label, exact: true })
        .waitFor({ state: "detached" });
    }
    await page.locator("#event-settings summary").click();
    await page
      .getByRole("button", { name: "Delete this day", exact: true })
      .click();
    await page.waitForURL(/\/dashboard/);
    assert.equal(
      (await db.query("SELECT id FROM events WHERE id=$1", [eventId])).rowCount,
      0,
    );
    assert.deepEqual(errors, []);
    console.info(
      "PASS: organizer create/delete schedule, gear, poll; guest RSVP, vote/change vote; admin notice update/display/restore; event UI cleanup; no page errors.",
    );
    assert.deepEqual(overflows, [], "Horizontal overflow detected");
  } finally {
    if (noticeChanged)
      await db.query("UPDATE settings SET site_notice=$1 WHERE id=1", [
        originalNotice,
      ]);
    await db.query(
      "DELETE FROM events WHERE title=$1 AND owner_id=(SELECT id FROM users WHERE email=$2)",
      [title, "admin@splatify.test"],
    );
    await browser.close();
    await db.end();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
