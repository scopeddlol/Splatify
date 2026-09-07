/* eslint-disable @typescript-eslint/no-explicit-any -- Playwright is intentionally supplied externally. */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { Pool } from "pg";
import { hashPassword, token, hashToken } from "../src/lib/security";

// Only this run's prefixed users/events are changed. Platform settings are never changed.
// UI mode includes all behavioral checks before capturing the responsive route matrix.
export async function runCommunityBrowser(screenshots: boolean) {
  const { BROWSER_DATABASE_URL, PLAYWRIGHT_MODULE, BROWSER_EXECUTABLE, UI_SCREENSHOT_DIR } = process.env;
  assert.ok(BROWSER_DATABASE_URL && PLAYWRIGHT_MODULE && BROWSER_EXECUTABLE,
    "Set BROWSER_DATABASE_URL, PLAYWRIGHT_MODULE, BROWSER_EXECUTABLE");
  if (screenshots) assert.ok(UI_SCREENSHOT_DIR, "Set UI_SCREENSHOT_DIR to an existing directory");
  const requireModule = createRequire(import.meta.url);
  const { chromium } = requireModule(PLAYWRIGHT_MODULE);
  const db = new Pool({ connectionString: BROWSER_DATABASE_URL });
  const browser = await chromium.launch({ executablePath: BROWSER_EXECUTABLE, headless: true });
  const base = process.env.BROWSER_BASE_URL || "http://localhost:3107";
  const prefix = `v2-smoke-${randomUUID()}`;
  const password = "v2-smoke-password-only";
  const emails: string[] = [];
  const failures: string[] = [];
  const diagnostics: string[] = [];
  let passed = 0;
  let event: any;
  const check = async (name: string, test: () => Promise<void>) => {
    try { await test(); passed++; console.info(`PASS ${name}`); }
    catch (error) { const detail = `${name}: ${error}`; failures.push(detail); console.error(`FAIL ${detail}`); }
  };
  const newPage = async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.on("pageerror", (error: Error) => diagnostics.push(`pageerror ${page.url()}: ${error.message}`));
    page.on("console", (message: any) => {
      if (message.type() === "error") diagnostics.push(`console ${page.url()}: ${message.text()}`);
    });
    page.on("response", (response: any) => {
      if (response.status() >= 400) diagnostics.push(`HTTP ${response.status()} ${response.url()}`);
    });
    page.on("dialog", (dialog: any) => dialog.accept());
    return page;
  };
  const goto = async (page: any, path: string) => {
    const response = await page.goto(`${base}${path}`);
    assert.ok(response && response.status() < 400, `${path}: HTTP ${response?.status()}`);
    await page.locator("h1").waitFor();
    await page.waitForLoadState("networkidle");
  };
  const submit = async (page: any, label: string) => {
    await Promise.all([
      page.waitForResponse((response: any) => response.request().method() === "POST"),
      page.getByRole("button", { name: label, exact: true }).click(),
    ]);
    await page.waitForURL(/[?&](success|error)=/);
    await page.waitForLoadState("networkidle");
    assert.ok(!new URL(page.url()).searchParams.has("error"), decodeURIComponent(page.url()));
  };
  const login = async (page: any, email: string) => {
    await goto(page, "/login");
    await page.locator('[name="email"]').fill(email);
    await page.locator('[name="password"]').fill(password);
    await page.locator('form:has([name="email"]) button[type="submit"]').click();
    await page.waitForURL("**/dashboard");
  };
  const seedUser = async (role: string) => {
    const email = `${prefix}-${role}@example.com`;
    emails.push(email);
    return (await db.query("INSERT INTO users(name,email,password_hash) VALUES($1,$2,$3) RETURNING *",
      [`${prefix}-${role}`, email, await hashPassword(password)])).rows[0];
  };
  const owner = await newPage();
  const member = await newPage();
  const anonymous = await newPage();
  try {
    const ownerUser = await seedUser("owner");
    const memberUser = await seedUser("member");
    await login(owner, ownerUser.email);
    await check("signed-in create public day and own overview", async () => {
      await goto(owner, "/events/new");
      await owner.locator('[name="title"]').fill(prefix);
      await owner.locator('[name="visibility"][value="public"]').check();
      await owner.locator('[name="city"]').fill("Austin");
      await owner.locator('[name="state"]').fill("TX");
      await owner.getByRole("button", { name: "Create my day", exact: true }).click();
      await owner.waitForURL(/\/days\/[a-f0-9-]{36}$/);
      event = (await db.query("SELECT * FROM events WHERE title=$1 AND owner_id=$2", [prefix, ownerUser.id])).rows[0];
      assert.ok(event);
      assert.equal(await owner.locator("h1").innerText(), prefix);
      assert.ok(await owner.getByRole("link", { name: "Settings", exact: true }).count());
    });
    assert.ok(event, "Creation is prerequisite for event checks");
    const day = `/days/${event.id}`;
    const invite = `/invite/${event.invite_token}`;
    for (const state of ["TX", "Texas"]) await check(`anonymous Explore search Austin/${state}`, async () => {
      await goto(anonymous, "/explore");
      await anonymous.locator('[name="city"]').fill("Austin");
      await anonymous.locator('[name="state"]').fill(state);
      await anonymous.locator('[name="query"]').fill(prefix);
      await anonymous.getByRole("button", { name: "Search days" }).click();
      await anonymous.waitForURL(/query=/);
      assert.equal(await anonymous.locator(`a[href="${day}"]`).count(), 1);
    });
    await check("password toggle does not submit", async () => {
      await goto(anonymous, "/signup");
      const input = anonymous.locator('[name="password"]');
      await input.fill(password);
      await anonymous.getByRole("button", { name: "Show password", exact: true }).click();
      assert.equal(await input.getAttribute("type"), "text");
      assert.equal(new URL(anonymous.url()).pathname, "/signup");
      const toggle = anonymous.getByRole("button", { name: "Show password", exact: true });
      assert.equal(await toggle.getAttribute("aria-pressed"), "true");
      await toggle.click();
      assert.equal(await input.getAttribute("type"), "password");
      assert.equal(await toggle.getAttribute("aria-pressed"), "false");
      assert.equal(new URL(anonymous.url()).pathname, "/signup");
    });
    await check("custom invitation headline persists independently of day settings", async () => {
      await goto(owner, `${day}/settings`);
      await owner.locator('[name="invitationHeading"]').fill(`${prefix} welcome`);
      await owner.locator('[name="invitationMessage"]').fill("Bring your crew for the smoke test.");
      await submit(owner, "Save invitation welcome");
      await goto(owner, `${day}/settings`);
      await submit(owner, "Save day details");
      await goto(anonymous, invite);
      assert.equal(await anonymous.locator("h1").innerText(), `${prefix} welcome`);
      assert.equal((await db.query("SELECT invitation_heading FROM events WHERE id=$1", [event.id])).rows[0].invitation_heading, `${prefix} welcome`);
    });
    await login(member, memberUser.email);
    const image = { name: "v2-smoke.png", mimeType: "image/png", buffer: await requireModule("sharp")({ create: { width: 120, height: 120, channels: 3, background: "#d5fb51" } }).png().toBuffer() };
    await check("profile display name, private real name, marker and avatar persist", async () => {
      await goto(member, "/profile");
      await member.locator('[name="displayName"]').fill(`${prefix}-display`);
      await member.locator('[name="realName"]').fill(`${prefix}-PRIVATE-REAL`);
      await member.locator('[name="marker"]').selectOption("electric");
      await member.locator('[name="bio"]').fill("Smoke test player bio");
      await member.locator('[name="avatar"]').setInputFiles(image);
      await submit(member, "Save profile");
      await goto(member, "/profile");
      assert.equal(await member.locator('[name="displayName"]').inputValue(), `${prefix}-display`);
      assert.equal(await member.locator('[name="marker"]').inputValue(), "electric");
      const avatar = member.getByAltText("Current avatar");
      await avatar.waitFor();
      await avatar.evaluate((img: HTMLImageElement) => img.decode());
      const saved = (await db.query("SELECT * FROM users WHERE id=$1", [memberUser.id])).rows[0];
      assert.ok(saved.avatar_id);
      assert.equal(saved.real_name, `${prefix}-PRIVATE-REAL`);
    });
    await check("profile defaults prefill RSVP; signed-in membership established", async () => {
      await goto(member, invite);
      assert.equal(await member.locator('#rsvp [name="name"]').inputValue(), `${prefix}-display`);
      assert.equal(await member.locator('#rsvp [name="marker"]').inputValue(), "electric");
      await submit(member, "Send my RSVP");
      const saved = (await db.query("SELECT * FROM guests WHERE event_id=$1 AND user_id=$2", [event.id, memberUser.id])).rows[0];
      assert.equal(saved.approval, "approved");
    });
    await check("accepted member stable day across fresh login without guest cookie", async () => {
      const fresh = await newPage();
      await login(fresh, memberUser.email);
      assert.equal((await fresh.context().cookies()).filter((c: any) => c.name.startsWith("splatify_guest_")).length, 0);
      await goto(fresh, `${day}/players`);
      assert.equal(new URL(fresh.url()).pathname, `${day}/players`);
      assert.ok((await fresh.locator(".day-roster").innerText()).includes(`${prefix}-display`));
      assert.ok(!(await fresh.locator("body").textContent()).includes(`${prefix}-PRIVATE-REAL`));
      await fresh.context().close();
    });
    await check("signed-in accepted member posts message", async () => {
      await goto(member, `${day}/messages`);
      await member.locator('[name="body"]').fill(`${prefix}-private-message`);
      await submit(member, "Send message");
      assert.ok((await member.locator(".day-message-list").innerText()).includes(`${prefix}-private-message`));
    });
    await check("public anonymous DOM excludes roster, messages and real name", async () => {
      for (const route of [day, `${day}/players`, `${day}/messages`, invite]) {
        await goto(anonymous, route);
        const dom = await anonymous.content();
        for (const secret of [`${prefix}-display`, `${prefix}-private-message`, `${prefix}-PRIVATE-REAL`]) assert.ok(!dom.includes(secret), `${route} leaked ${secret}`);
        assert.equal(await anonymous.locator('[name="body"]').count(), 0);
        assert.equal(await anonymous.locator(".day-roster").count(), 0);
      }
    });
    await check("signup invite next survives recovery acknowledgement", async () => {
      const signup = await newPage();
      const email = `${prefix}-signup@example.com`;
      emails.push(email);
      await goto(signup, invite);
      await signup.getByRole("link", { name: "Sign up & return here" }).click();
      await signup.waitForURL(/\/signup\?next=/);
      assert.equal(new URL(signup.url()).searchParams.get("next"), invite);
      await signup.locator('[name="name"]').fill(`${prefix}-signup`);
      await signup.locator('[name="email"]').fill(email);
      await signup.locator('[name="password"]').fill(password);
      await signup.locator('form:has([name="email"]) button[type="submit"]').click();
      await signup.waitForURL(/\/recovery-codes/);
      assert.equal(await signup.locator(".recovery-grid code").count(), 8);
      await signup.getByRole("button", { name: "I've stored my recovery codes" }).click();
      await signup.waitForURL(`${base}${invite}`);
      await signup.context().close();
    });
    let guestToken: string | undefined;
    await check("anonymous RSVP private edit link claims on another device", async () => {
      await goto(anonymous, invite);
      await anonymous.locator('#rsvp [name="name"]').fill(`${prefix}-guest`);
      await submit(anonymous, "Send my RSVP");
      const cookie = (await anonymous.context().cookies()).find((c: any) => c.name === `splatify_guest_${event.id}`);
      assert.ok(cookie?.httpOnly);
      guestToken = cookie.value;
      const fresh = await newPage();
      await goto(fresh, `/rsvp/${event.id}?editToken=${guestToken}`);
      await fresh.getByRole("button", { name: "Open my RSVP" }).click();
      await fresh.waitForURL(`${base}${day}`);
      assert.equal(await fresh.locator('#rsvp [name="name"]').inputValue(), `${prefix}-guest`);
      await goto(fresh, `${day}/messages`);
      assert.equal(await fresh.locator('[name="body"]').count(), 0);
      assert.equal(await fresh.locator(".day-message-list").count(), 0);
      await fresh.context().close();
    });
    await check("linked guest edit token requires account sign-in", async () => {
      assert.ok(guestToken);
      const linked = await seedUser("linked");
      await login(anonymous, linked.email);
      await goto(anonymous, day);
      await submit(anonymous, "Save my RSVP");
      const fresh = await newPage();
      await goto(fresh, `/rsvp/${event.id}?editToken=${guestToken}`);
      await fresh.getByRole("button", { name: "Open my RSVP" }).click();
      await fresh.waitForURL(/error=/);
      assert.match(new URL(fresh.url()).searchParams.get("error")!, /invalid or expired/);
      assert.equal((await fresh.context().cookies()).filter((c: any) => c.name.startsWith("splatify_guest_")).length, 0);
      await login(fresh, linked.email);
      await goto(fresh, day);
      assert.equal(await fresh.locator('#rsvp [name="name"]').inputValue(), `${prefix}-guest`);
      await fresh.context().close();
    });
    await check("disabled member invites makes requests pending; owner approval grants roster", async () => {
      await goto(owner, `${day}/settings`);
      await owner.locator('[name="memberInvitesEnabled"]').uncheck();
      await submit(owner, "Save day details");
      const pendingUser = await seedUser("pending");
      const pending = await newPage();
      await login(pending, pendingUser.email);
      await goto(pending, invite);
      await submit(pending, "Request to join");
      assert.equal((await db.query("SELECT approval FROM guests WHERE event_id=$1 AND user_id=$2", [event.id, pendingUser.id])).rows[0].approval, "pending");
      await goto(pending, `${day}/players`);
      assert.equal(new URL(pending.url()).pathname, day);
      assert.equal(await pending.locator(".day-roster").count(), 0);
      assert.ok(!(await pending.content()).includes(`${prefix}-private-message`));
      await goto(owner, `${day}/players`);
      await submit(owner, `Approve ${pendingUser.name}`);
      await goto(pending, `${day}/players`);
      assert.equal(new URL(pending.url()).pathname, `${day}/players`);
      assert.ok(await pending.locator(".day-roster").count());
      await pending.context().close();
    });
    await check("captain picks unassigned and releases own player", async () => {
      await goto(owner, `${day}/players`);
      await owner.getByText("Create a team", { exact: true }).click();
      const form = owner.locator('form:has(button:text-is("Create team"))');
      await form.locator('[name="name"]').fill("Smoke team");
      await submit(owner, "Create team");
      await goto(owner, `${day}/players`);
      await owner.getByText("Edit Smoke team", { exact: true }).click();
      const edit = owner.locator('form:has([name="captainUserId"])');
      await edit.locator('[name="captainUserId"]').selectOption(memberUser.id);
      await edit.getByRole("button", { name: "Save team", exact: true }).click();
      await owner.waitForURL(/success=/);
      await goto(member, `${day}/players`);
      const player = member.locator(".day-roster .day-player").filter({ hasText: `${prefix}-guest` });
      await player.getByRole("button", { name: "Pick player", exact: true }).click();
      await member.waitForURL(/success=/);
      await goto(member, `${day}/players`);
      assert.ok((await db.query("SELECT team_id FROM guests WHERE event_id=$1 AND name=$2", [event.id, `${prefix}-guest`])).rows[0].team_id);
      await player.getByRole("button", { name: "Release player", exact: true }).click();
      await member.waitForURL(/success=/);
      assert.equal((await db.query("SELECT team_id FROM guests WHERE event_id=$1 AND name=$2", [event.id, `${prefix}-guest`])).rows[0].team_id, null);
      assert.equal(await member.locator('[name="captainUserId"]').count(), 0);
    });
    await check("co-organizer delegated settings and planning, no appointment or deletion", async () => {
      await goto(owner, `${day}/settings`);
      await owner.locator('select[name="userId"]').selectOption(memberUser.id);
      await submit(owner, "Add co-organizer");
      await goto(member, `${day}/settings`);
      assert.ok(await member.getByRole("button", { name: "Save day details", exact: true }).count());
      assert.equal(await member.getByRole("button", { name: "Delete this day", exact: true }).count(), 0);
      assert.equal(await member.getByRole("button", { name: "Add co-organizer", exact: true }).count(), 0);
      await member.locator('[name="invitationMessage"]').fill("Delegated welcome");
      await submit(member, "Save invitation welcome");
      await goto(member, `${day}/schedule`);
      await member.locator('[name="time"]').fill("10:00");
      await member.locator('[name="title"]').fill("Smoke briefing");
      await submit(member, "Add schedule item");
      assert.ok(await member.getByRole("heading", { name: "Smoke briefing", exact: true }).count());
      await goto(member, `${day}/gear`);
      await member.locator('[name="name"]').fill("Smoke rental mask");
      await member.locator('[name="cost"]').fill("12.50");
      await submit(member, "Add item");
      assert.ok(await member.getByRole("heading", { name: "Smoke rental mask", exact: true }).count());
    });
    await check("cover and invitation uploads render and enforce private media access", async () => {
      await goto(owner, `${day}/settings`);
      await owner.locator('#day-cover').setInputFiles(image);
      await submit(owner, "Save day cover");
      await goto(owner, `${day}/settings`);
      await owner.locator('#invitation-cover').setInputFiles(image);
      await submit(owner, "Save invitation image");
      const saved = (await db.query("SELECT cover_id,invitation_cover_id FROM events WHERE id=$1", [event.id])).rows[0];
      assert.ok(saved.cover_id && saved.invitation_cover_id);
      await goto(member, day);
      await member.locator(`img[src="/media/${saved.cover_id}"]`).evaluate((img: HTMLImageElement) => img.decode());
      const fresh = await newPage();
      await goto(fresh, invite);
      await fresh.locator(`img[src*="${saved.invitation_cover_id}"]`).evaluate((img: HTMLImageElement) => img.decode());
      assert.equal((await fresh.request.get(`${base}/media/${saved.cover_id}`)).status(), 200);
      assert.equal((await fresh.request.get(`${base}/media/${saved.invitation_cover_id}`)).status(), 200);
      await goto(owner, `${day}/settings`);
      await owner.locator('[name="visibility"][value="private"]').check();
      await submit(owner, "Save day details");
      assert.equal((await fresh.request.get(`${base}/media/${saved.cover_id}`)).status(), 404);
      assert.equal((await fresh.request.get(`${base}/media/${saved.invitation_cover_id}`)).status(), 404);
      const avatarId = (await db.query("SELECT avatar_id FROM users WHERE id=$1", [memberUser.id])).rows[0].avatar_id;
      assert.equal((await fresh.request.get(`${base}/media/${avatarId}`)).status(), 404);
      assert.equal((await member.request.get(`${base}/media/${saved.cover_id}`)).status(), 200);
      await goto(fresh, invite);
      await fresh.locator(`img[src*="${saved.invitation_cover_id}"]`).evaluate((img: HTMLImageElement) => img.decode());
      await fresh.context().close();
    });
    await check("roster and message page two show exact DB rows without overlap", async () => {
      for (let i = 0; i < 23; i++) {
        await db.query("INSERT INTO guests(event_id,edit_token_hash,name,status,marker,created_at) VALUES($1,$2,$3,'going','rental',now()+$4*interval '1 second')", [event.id, hashToken(token()), `${prefix}-roster-${i}`, i]);
        await db.query("INSERT INTO messages(event_id,user_id,body,created_at) VALUES($1,$2,$3,now()+$4*interval '1 second')", [event.id, memberUser.id, `${prefix}-message-${i}`, i]);
      }
      for (const kind of ["players", "messages"]) {
        const roster = kind === "players";
        const rows = (await db.query(roster ? "SELECT name AS value FROM guests WHERE event_id=$1 AND approval='approved' ORDER BY created_at,id" : "SELECT body AS value FROM messages WHERE event_id=$1 ORDER BY created_at DESC,id", [event.id])).rows;
        await goto(owner, `${day}/${kind}`);
        const selector = roster ? ".day-roster .day-player" : ".day-message-list > article";
        assert.equal(await owner.locator(selector).count(), 20);
        const first = await owner.locator(selector).allTextContents();
        rows.slice(0, 20).forEach((row, i) => assert.ok(first[i].includes(row.value)));
        await owner.locator(`a[href="${day}/${kind}?${roster ? "guestPage" : "messagePage"}=2"]`).click();
        await owner.waitForURL(/Page=2/);
        const second = await owner.locator(selector).allTextContents();
        assert.equal(second.length, rows.length - 20);
        rows.slice(20).forEach((row, i) => assert.ok(second[i].includes(row.value), `${kind} row ${i}`));
        assert.ok(!second.some((text: string) => first.includes(text)));
      }
    });
    if (screenshots) {
      const visitor = await newPage();
      for (const width of [1440, 390, 320]) {
        for (const [name, route, page] of [
          ["landing", "/", visitor], ["explore", "/explore", visitor],
          ["profile", "/profile", member], ["day", day, owner],
          ["players", `${day}/players`, owner], ["schedule", `${day}/schedule`, owner],
          ["gear", `${day}/gear`, owner], ["messages", `${day}/messages`, owner],
          ["settings", `${day}/settings`, owner], ["invite", invite, visitor],
        ]) await check(`responsive ${name} ${width}px`, async () => {
          await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
          await goto(page, route);
          await page.evaluate(() => document.fonts.ready);
          for (const image of await page.locator("img").all()) {
            await image.scrollIntoViewIfNeeded();
            await image.evaluate((img: HTMLImageElement) => img.decode());
          }
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.screenshot({ path: join(UI_SCREENSHOT_DIR!, `${name}-${width}.png`), fullPage: true });
          const size = await page.evaluate(() => ({
            viewport: document.documentElement.clientWidth,
            scroll: document.documentElement.scrollWidth,
            offenders: Array.from(document.querySelectorAll("body *")).filter((el) => el.getBoundingClientRect().right > document.documentElement.clientWidth + 1).map((el) => `${el.tagName}.${el.className}`).slice(0, 10),
          }));
          assert.ok(size.scroll <= size.viewport, JSON.stringify(size));
        });
      }
    }
    await check("browser console, runtime and resource health", async () => {
      assert.deepEqual(diagnostics, []);
    });
  } finally {
    await browser.close();
    const fixtureIds = (await db.query("SELECT id::text FROM users WHERE email=ANY($1::text[])", [emails])).rows.map((row) => row.id);
    if (event) fixtureIds.push(event.id);
    await db.query("DELETE FROM activity WHERE EXISTS (SELECT 1 FROM unnest($1::text[]) AS fixture(id) WHERE position(fixture.id in detail)>0)", [fixtureIds]);
    await db.query("DELETE FROM users WHERE email=ANY($1::text[])", [emails]);
    assert.equal((await db.query("SELECT id FROM events WHERE title=$1", [prefix])).rowCount, 0);
    await db.end();
    console.info(JSON.stringify({ prefix, passed, failed: failures.length, failures, diagnostics, screenshotDirectory: screenshots ? UI_SCREENSHOT_DIR : undefined }, null, 2));
  }
  assert.equal(failures.length, 0, `${failures.length} browser checks failed`);
}
