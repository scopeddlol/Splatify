import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { token } from "../src/lib/security";

// Explicit disposable-environment smoke test. Playwright is supplied externally;
// this does not add browser tooling to the application dependency set.
const requireModule = createRequire(import.meta.url);
if (
  !process.env.BROWSER_DATABASE_URL ||
  !process.env.PLAYWRIGHT_MODULE ||
  !process.env.BROWSER_EXECUTABLE
)
  throw new Error(
    "Set BROWSER_DATABASE_URL, PLAYWRIGHT_MODULE and BROWSER_EXECUTABLE for a disposable environment.",
  );
const { chromium } = requireModule(process.env.PLAYWRIGHT_MODULE);
const db = new Pool({ connectionString: process.env.BROWSER_DATABASE_URL });
const base = process.env.BROWSER_BASE_URL || "http://127.0.0.1:3107";
async function main() {
  const browser = await chromium.launch({
    executablePath: process.env.BROWSER_EXECUTABLE,
    headless: true,
  });
  const owner = await browser.newContext();
  const guest = await browser.newContext();
  const page = await owner.newPage();
  page.setDefaultTimeout(30000);
  const email = `browser-${randomUUID()}@example.com`;
  let foreignEventId: string | undefined;
  try {
    await page.goto(`${base}/signup`);
    await page.locator('[name="name"]').fill("Browser Organizer");
    await page.locator('[name="email"]').fill(email);
    await page.locator('[name="password"]').fill("browser-test-password");
    await page
      .locator('form:has([name="email"]) button[type="submit"]')
      .click();
    await page.waitForURL("**/recovery-codes");
    const codes = await page.locator(".recovery-grid code").allTextContents();
    assert.equal(codes.length, 8);
    await page
      .getByRole("button", { name: "I've stored my recovery codes" })
      .click();
    await page.waitForURL("**/dashboard");
    await page.goto(`${base}/events/new`);
    await page.locator('[name="title"]').fill("Browser Integration Game");
    await page.locator('[name="capacity"]').fill("1");
    await page
      .locator('form:has([name="title"]) button[type="submit"]')
      .click();
    await page.waitForURL(/\/events\/[a-f0-9-]{36}$/);
    const eventId = new URL(page.url()).pathname.split("/").pop();
    const {
      rows: [event],
    } = await db.query("SELECT * FROM events WHERE id=$1", [eventId]);
    assert.ok(event);
    const stranger = await guest.newPage();
    await stranger.goto(`${base}/events/${eventId}`);
    await stranger.waitForURL(/\/login/);
    assert.match(stranger.url(), /\/login/);
    await stranger.goto(`${base}/invite/${event.invite_token}`);
    const rsvp = stranger.locator('form:has([name="status"])');
    await rsvp.locator('[name="name"]').fill("Browser Guest");
    await rsvp.locator('[name="status"]').selectOption("going");
    await rsvp.locator('button[type="submit"]').click();
    await stranger.waitForURL(/success=/);
    const {
      rows: [saved],
    } = await db.query("SELECT * FROM guests WHERE event_id=$1", [eventId]);
    assert.equal(saved.name, "Browser Guest");
    assert.equal(saved.status, "going");
    const editCookie = (await guest.cookies()).find(
      (cookie: { name: string }) => cookie.name === `splatify_guest_${eventId}`,
    );
    assert.ok(editCookie?.httpOnly);
    await stranger.goto(`${base}/invite/${event.invite_token}`);
    await stranger
      .locator('form:has([name="status"]) [name="name"]')
      .fill("Guest Edited");
    await stranger
      .locator('form:has([name="status"]) button[type="submit"]')
      .click();
    await stranger.waitForURL(/success=/);
    assert.equal(
      (
        await db.query(
          "SELECT count(*)::int AS n FROM guests WHERE event_id=$1",
          [eventId],
        )
      ).rows[0].n,
      1,
    );
    const another = await browser.newContext();
    const otherPage = await another.newPage();
    await otherPage.goto(`${base}/invite/${event.invite_token}`);
    await otherPage
      .locator('form:has([name="status"]) [name="name"]')
      .fill("Excess Guest");
    await otherPage.locator('[name="status"]').selectOption("going");
    await otherPage
      .locator('form:has([name="status"]) button[type="submit"]')
      .click();
    await otherPage.waitForURL(/error=/);
    assert.match(decodeURIComponent(otherPage.url()), /full/);
    await otherPage.goto(
      `${base}/invite/${event.invite_token}?editToken=${editCookie.value}`,
    );
    await otherPage.getByRole("button", { name: "Unlock my RSVP" }).click();
    await otherPage.waitForURL(`${base}/invite/${event.invite_token}`);
    assert.equal(
      await otherPage
        .locator('form:has([name="status"]) [name="name"]')
        .inputValue(),
      "Guest Edited",
    );
    const adminPage = await (await browser.newContext()).newPage();
    await adminPage.goto(`${base}/login`);
    await adminPage.locator('[name="email"]').fill("admin@splatify.test");
    await adminPage
      .locator('[name="password"]')
      .fill("local-only-splatify-admin");
    await adminPage
      .locator('form:has([name="email"]) button[type="submit"]')
      .click();
    await adminPage.waitForURL("**/dashboard");
    await adminPage.goto(`${base}/admin`);
    assert.equal(new URL(adminPage.url()).pathname, "/admin");
    assert.ok(await adminPage.locator('[name="siteNotice"]').count());
    const {
      rows: [foreign],
    } = await db.query(
      "INSERT INTO events(owner_id,title,invite_token) SELECT id,'Authorization smoke target',$1 FROM users WHERE email='admin@splatify.test' RETURNING id",
      [token()],
    );
    foreignEventId = foreign.id;
    await page.goto(`${base}/events/${eventId}`);
    const scheduleForm = page
      .locator('form:has([name="time"]):has([name="title"])')
      .first();
    await scheduleForm.evaluate((form: HTMLFormElement) => {
      const details = form.closest("details");
      if (details) details.open = true;
    });
    await page.route(
      "**/events/**",
      async (route: {
        request(): { postData(): string | null };
        continue(options: { postData?: string }): Promise<void>;
      }) => {
        const body = route.request().postData();
        await route.continue(
          body ? { postData: body.replaceAll(eventId!, foreign.id) } : {},
        );
      },
    );
    await scheduleForm.locator('[name="title"]').fill("Unauthorized schedule");
    await scheduleForm.locator('[name="time"]').fill("10:00");
    await scheduleForm.locator('button[type="submit"]').click();
    await page.waitForURL(/error=/);
    assert.match(decodeURIComponent(page.url()), /access denied/);
    assert.equal(
      (
        await db.query(
          "SELECT count(*)::int AS n FROM schedule_items WHERE event_id=$1",
          [foreignEventId],
        )
      ).rows[0].n,
      0,
    );
    console.info(
      "Browser flows passed: signup, recovery display/acknowledgement, event creation, private route authorization, RSVP create/edit, capacity rejection, edit-link claim, admin login/overview, forged event-ID write rejection.",
    );
  } finally {
    await browser.close();
    await db.query("DELETE FROM users WHERE email=$1", [email]);
    if (foreignEventId)
      await db.query("DELETE FROM events WHERE id=$1", [foreignEventId]);
    await db.end();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
