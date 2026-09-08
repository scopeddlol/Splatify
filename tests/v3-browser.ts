/* eslint-disable @typescript-eslint/no-explicit-any -- Playwright is supplied externally. */
import assert from "node:assert/strict";
import { join } from "node:path";
import { hashToken, token } from "../src/lib/security";
import { runCommunityBrowser } from "./community-browser";

// Reuses disposable fixtures and cleanup; never edits application files.
runCommunityBrowser(true, async (c: any) => {
  const {
    db,
    base,
    prefix,
    owner,
    member,
    memberUser,
    ownerUser,
    event,
    day,
    check,
    newPage,
    goto,
    submit,
    seedUser,
    login,
    screenshotDirectory,
  } = c;
  const visitor = await newPage();
  const slug = `v3-${token()
    .replace(/[^a-z0-9]/gi, "")
    .slice(0, 20)
    .toLowerCase()}`;
  const settings = (await db.query("SELECT * FROM settings WHERE id=1"))
    .rows[0];
  // Keep the event title distinct from deliberately public fixture display names.
  event.title = `${prefix}-event-only`;
  await db.query("UPDATE events SET title=$2 WHERE id=$1", [
    event.id,
    event.title,
  ]);
  let siteChanged = false;
  let admin: any;
  const auditIds: string[] = [];
  const screenshot = async (page: any, name: string) => {
    await page.screenshot({
      path: join(screenshotDirectory, `v3-${name}.png`),
      fullPage: true,
    });
  };
  const toggle = async (page: any, name: string, checked: boolean) => {
    const input = page.locator(`[name="${name}"]`);
    if ((await input.isChecked()) !== checked)
      await input.locator("xpath=ancestor::label").click();
    assert.equal(await input.isChecked(), checked);
  };
  try {
    await check(
      "v3 Teams tab, separate roster, 24 keyboard radios and live preview create/save",
      async () => {
        await goto(owner, `${day}/players`);
        assert.equal(
          await owner.getByRole("link", { name: "Teams", exact: true }).count(),
          1,
        );
        assert.equal(
          await owner.locator(".team-manager, .team-icon-picker").count(),
          0,
        );
        await owner.getByRole("link", { name: "Teams", exact: true }).click();
        await owner.getByText("Create a team", { exact: true }).click();
        const form = owner.locator('form:has(button:text-is("Create team"))');
        assert.equal(await form.getByRole("radio").count(), 24);
        await form.locator('[name="name"]').fill("V3 Falcons");
        const before = await form
          .locator(".team-preview svg")
          .getAttribute("class");
        await form.locator('[name="logoIcon"]:checked').focus();
        await owner.keyboard.press("ArrowRight");
        const selected = await form
          .locator('[name="logoIcon"]:checked')
          .inputValue();
        assert.notEqual(selected, "shield");
        assert.notEqual(
          await form.locator(".team-preview svg").getAttribute("class"),
          before,
        );
        await form.locator('[name="color"]').fill("#123abc");
        await screenshot(owner, "new-team-1440");
        await submit(owner, "Create team");
        const team = (
          await db.query(
            "SELECT * FROM teams WHERE event_id=$1 AND name='V3 Falcons'",
            [event.id],
          )
        ).rows[0];
        assert.equal(team.logo_icon, selected);
        assert.equal(team.color, "#123abc");
        await goto(owner, `${day}/teams`);
        const card = owner
          .locator(".day-team-card")
          .filter({
            has: owner.getByRole("heading", {
              name: "V3 Falcons",
              exact: true,
            }),
          });
        await card.getByText("Edit team", { exact: true }).click();
        await card.locator('[name="name"]').fill("V3 Falcons saved");
        await card
          .getByRole("button", { name: "Save team", exact: true })
          .click();
        await owner.waitForURL(/success=/);
        assert.equal(
          (await db.query("SELECT name FROM teams WHERE id=$1", [team.id]))
            .rows[0].name,
          "V3 Falcons saved",
        );
      },
    );
    await check(
      "v3 bulk select crosses roster pagination, targets exact team and unassigns every row",
      async () => {
        const team = (
          await db.query(
            "SELECT id FROM teams WHERE event_id=$1 AND name='V3 Falcons saved'",
            [event.id],
          )
        ).rows[0];
        assert.ok(team);
        const ids = (
          await db.query(
            "SELECT id FROM guests WHERE event_id=$1 AND approval='approved' AND status<>'declined'",
            [event.id],
          )
        ).rows
          .map((r: any) => r.id)
          .sort();
        assert.ok(ids.length > 20);
        for (const target of [team.id, ""]) {
          await goto(owner, `${day}/teams`);
          await owner.getByText("Assign players", { exact: true }).click();
          await owner
            .locator('.team-manager [name="teamId"]')
            .selectOption(target);
          await owner
            .getByRole("button", { name: "Select visible", exact: true })
            .click();
          assert.equal(
            await owner.locator('[name="guestIds"]').count(),
            ids.length,
          );
          await submit(owner, "Assign selected");
          const rows = (
            await db.query(
              "SELECT id,team_id FROM guests WHERE id=ANY($1::uuid[])",
              [ids],
            )
          ).rows;
          assert.deepEqual(rows.map((r: any) => r.id).sort(), ids);
          for (const row of rows) assert.equal(row.team_id, target || null);
        }
      },
    );
    await check(
      "v3 profile opt-in, first name, bio, avatar and loadout visible anonymously without private values",
      async () => {
        await goto(member, "/profile");
        await member.locator('[name="profileSlug"]').fill(slug);
        await member.locator('[name="firstName"]').fill("Alex V3");
        await member.locator('[name="bio"]').fill("V3 player bio");
        await toggle(member, "publicProfileEnabled", true);
        await submit(member, "Save profile");
        await member
          .locator("summary")
          .filter({ hasText: /^Add gear$/ })
          .click();
        await member
          .locator('form:has([name="category"]) [name="name"]')
          .fill("V3 tournament marker");
        await submit(member, "Add gear");
        await goto(visitor, `/u/${slug}`);
        const dom = await visitor.content();
        for (const text of ["Alex V3", "V3 player bio", "V3 tournament marker"])
          assert.ok(dom.includes(text));
        for (const secret of [
          memberUser.id,
          memberUser.email,
          `${prefix}-PRIVATE-REAL`,
          event.id,
          event.title,
        ])
          assert.ok(!dom.includes(secret), `Public profile leaked ${secret}`);
        await visitor
        .locator("img.profile-portrait")
          .evaluate((img: HTMLImageElement) => img.decode());
        await screenshot(visitor, "public-profile-1440");
        await goto(owner, `${day}/players`);
        const row = owner
          .locator(".day-roster .day-player")
          .filter({ hasText: `${prefix}-display` });
        assert.equal(
          await row
            .getByRole("link", { name: "View profile" })
            .getAttribute("href"),
          `/u/${slug}`,
        );
        assert.ok((await row.innerText()).includes("V3 tournament marker"));
        await screenshot(owner, "players-1440");
        await goto(member, "/profile");
        await toggle(member, "publicProfileEnabled", false);
        await submit(member, "Save profile");
        const hiddenProfile = await visitor.request.get(`${base}/u/${slug}`);
        assert.ok(
          !(await hiddenProfile.text()).includes(
            'class="panel profile-public-card"',
          ),
        );
        await goto(owner, `${day}/players`);
        assert.equal(await owner.locator(`a[href="/u/${slug}"]`).count(), 0);
        await goto(member, "/profile");
        await toggle(member, "publicProfileEnabled", true);
        await submit(member, "Save profile");
      },
    );
    await check(
      "v3 poll builder add/remove preserves values; member vote persists after reload",
      async () => {
        await goto(owner, day);
        await owner.getByText("Create a poll", { exact: true }).click();
        const form = owner.locator('form:has([name="question"])');
        await form.locator('[name="question"]').fill("V3 preferred game?");
        await form.getByLabel("Option 1", { exact: true }).fill("Capture");
        await form.getByLabel("Option 2", { exact: true }).fill("Elimination");
        await form
          .getByRole("button", { name: "Add option", exact: true })
          .click();
        await form.getByLabel("Option 3", { exact: true }).fill("Remove me");
        await form
          .getByRole("button", { name: "Remove option 3", exact: true })
          .click();
        assert.equal(
          await form.getByLabel("Option 2", { exact: true }).inputValue(),
          "Elimination",
        );
        await submit(owner, "Create poll");
        await goto(member, day);
        const vote = member.locator(
          'form:has(legend:text-is("V3 preferred game?"))',
        );
        await vote.getByRole("radio").first().check();
        await member.waitForURL(/success=/);
        await goto(member, day);
        assert.ok(await vote.getByRole("radio").first().isChecked());
        assert.ok((await vote.innerText()).includes("1 vote"));
      },
    );
    await check(
      "v3 settings switch keyboard and slider/number shared state persist across partial forms",
      async () => {
        await goto(owner, `${day}/settings`);
        const input = owner.locator('[name="memberInvitesEnabled"]');
        const initial = await input.isChecked();
        await input.focus();
        await owner.keyboard.press("Space");
        assert.equal(await input.isChecked(), !initial);
        await owner
          .getByText("Player limit, costs & appearance", { exact: true })
          .click();
        const range = owner.getByRole("slider");
        await range.fill("64");
        assert.equal(
          await owner
            .locator('input[type="number"][name="capacity"]')
            .inputValue(),
          "64",
        );
        await owner.locator('input[type="number"][name="capacity"]').fill("72");
        assert.equal(await range.inputValue(), "72");
        await screenshot(owner, "settings-1440");
        await submit(owner, "Save day details");
        await goto(owner, `${day}/settings`);
        await owner
          .locator('[name="invitationMessage"]')
          .fill("V3 partial form welcome");
        await submit(owner, "Save invitation welcome");
        const saved = (
          await db.query(
            "SELECT capacity,member_invites_enabled FROM events WHERE id=$1",
            [event.id],
          )
        ).rows[0];
        assert.equal(saved.capacity, 72);
        assert.equal(saved.member_invites_enabled, !initial);
      },
    );
    await check(
      "v3 sponsors default off, enable/add public HTTPS link, disable hides",
      async () => {
        assert.equal(
          (
            await db.query("SELECT sponsors_enabled FROM events WHERE id=$1", [
              event.id,
            ])
          ).rows[0].sponsors_enabled,
          false,
        );
        await goto(owner, `${day}/settings`);
        await toggle(owner, "sponsorsEnabled", true);
        await owner.locator('[name="visibility"][value="public"]').check();
        await submit(owner, "Save day details");
        await goto(owner, `${day}/settings`);
        await owner
          .locator("summary")
          .filter({ hasText: /^Add sponsor$/ })
          .click();
        const form = owner.locator('form:has([name="url"])');
        await form.locator('[name="name"]').fill("V3 sponsor");
        await form
          .locator('[name="url"]')
          .fill("https://example.com/v3-sponsor");
        await submit(owner, "Add sponsor");
        await goto(visitor, day);
        assert.equal(
          await visitor
            .getByRole("link", { name: "V3 sponsor", exact: true })
            .getAttribute("href"),
          "https://example.com/v3-sponsor",
        );
        await goto(owner, `${day}/settings`);
        await toggle(owner, "sponsorsEnabled", false);
        await submit(owner, "Save day details");
        await goto(visitor, day);
        assert.equal(
          await visitor
            .getByRole("link", { name: "V3 sponsor", exact: true })
            .count(),
          0,
        );
      },
    );
    await check(
      "v3 organizer confirms public/private past attendance; anonymous count redacts private event",
      async () => {
        const privateEvent = (
          await db.query(
            "INSERT INTO events(owner_id,title,invite_token,date,visibility) VALUES($1,$2,$3,'2025-01-02','private') RETURNING id",
            [ownerUser.id, `${prefix}-PRIVATE-DAY`, token()],
          )
        ).rows[0];
        await db.query(
          "INSERT INTO guests(event_id,user_id,edit_token_hash,name,status,marker) VALUES($1,$2,$3,$4,'going','electric')",
          [
            privateEvent.id,
            memberUser.id,
            hashToken(token()),
            `${prefix}-display`,
          ],
        );
        await db.query(
          "UPDATE events SET date='2025-01-01',visibility='public' WHERE id=$1",
          [event.id],
        );
        for (const id of [event.id, privateEvent.id]) {
          await goto(owner, `/days/${id}/players`);
          const row = owner
            .locator(".day-roster .day-player")
            .filter({ hasText: `${prefix}-display` });
          await row
            .getByRole("checkbox", { name: "Attended", exact: true })
            .check();
          await row.getByRole("button", { name: "Save", exact: true }).click();
          await owner.waitForURL(/success=/);
          assert.equal(
            (
              await db.query(
                "SELECT attended FROM guests WHERE event_id=$1 AND user_id=$2",
                [id, memberUser.id],
              )
            ).rows[0].attended,
            true,
          );
        }
        await goto(visitor, `/u/${slug}`);
        assert.equal(
          await visitor.locator(".profile-attendance article").count(),
          2,
        );
        assert.equal(
          await visitor.getByText("Private event", { exact: true }).count(),
          1,
        );
        assert.equal(await visitor.locator(`a[href="${day}"]`).count(), 1);
        const dom = await visitor.content();
        for (const secret of [
          privateEvent.id,
          `${prefix}-PRIVATE-DAY`,
          memberUser.id,
          `${prefix}-PRIVATE-REAL`,
        ])
          assert.ok(!dom.includes(secret), `Attendance leaked ${secret}`);
        assert.equal(
          await visitor
            .locator("section")
            .filter({
              has: visitor.getByRole("heading", {
                name: "Events attended",
                exact: true,
              }),
            })
            .locator(".count-badge")
            .innerText(),
          "2",
        );
        await screenshot(visitor, "public-attendance-1440");
      },
    );
    await check(
      "v3 regular user has no owner controls; direct admin routes deny without server error",
      async () => {
        await goto(member, "/dashboard");
        assert.equal(await member.locator('a[href^="/admin"]').count(), 0);
        for (const route of ["/admin", "/admin/accounts", "/admin/site"]) {
          await goto(member, route);
          assert.equal(new URL(member.url()).pathname, "/dashboard");
          assert.equal(
            await member
              .locator('.owner-tabs, [name="currentPassword"]')
              .count(),
            0,
          );
        }
      },
    );
    await check(
      "v3 own password rejects wrong current and mismatch; success rotates codes and invalidates old session",
      async () => {
        const user = await seedUser("password");
        const page = await newPage();
        const old = await newPage();
        await login(page, user.email);
        await login(old, user.email);
        const next = "V3 changed password 2026";
        for (const [current, confirm, error] of [
          ["incorrect current password", next, true],
          [c.password, "Mismatch password 2026", true],
          [c.password, next, false],
        ]) {
          await goto(page, "/profile");
          await page.getByText("Password", { exact: true }).click();
          await page.locator('[name="currentPassword"]').fill(current);
          await page.locator('[name="password"]').fill(next);
          await page.locator('[name="confirmPassword"]').fill(confirm);
          await page
            .getByRole("button", { name: "Change password", exact: true })
            .click();
          await page.waitForURL(error ? /error=/ : /recovery-codes/);
        }
        assert.equal(await page.locator(".recovery-grid code").count(), 8);
        await goto(old, "/profile");
        assert.equal(new URL(old.url()).pathname, "/login");
        await page
          .getByRole("button", { name: "I've stored my recovery codes" })
          .click();
        await page.waitForLoadState("networkidle");
        await goto(old, "/login");
        await old.locator('[name="email"]').fill(user.email);
        await old.locator('[name="password"]').fill(next);
        await old
          .locator('form:has([name="email"]) button[type="submit"]')
          .click();
        await old.waitForURL("**/dashboard");
      },
    );
    await check(
      "v3 owner accounts/reset reauth, inert GET, 30 minute expiry, new codes and single use",
      async () => {
        assert.ok(
          process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD,
          "Owner environment credentials required for browser checks",
        );
        admin = await newPage();
        await goto(admin, "/login");
        await admin.locator('[name="email"]').fill(process.env.ADMIN_EMAIL);
        await admin
          .locator('[name="password"]')
          .fill(process.env.ADMIN_PASSWORD);
        await admin
          .locator('form:has([name="email"]) button[type="submit"]')
          .click();
        await admin.waitForURL("**/dashboard");
        const target = await seedUser("reset");
        await goto(
          admin,
          `/admin/accounts?q=${encodeURIComponent(target.email)}`,
        );
        const card = admin
          .locator(".owner-account")
          .filter({ hasText: target.email });
        await card.getByText("Reset password", { exact: true }).click();
        await card
          .locator('.owner-reset [name="currentPassword"]')
          .fill("wrong owner password");
        await card.getByRole("button", { name: "Issue reset link" }).click();
        await card.getByRole("alert").waitFor();
        assert.equal(
          (
            await db.query(
              "SELECT * FROM password_reset_links WHERE user_id=$1",
              [target.id],
            )
          ).rowCount,
          0,
        );
        await card
          .locator('.owner-reset [name="currentPassword"]')
          .fill(process.env.ADMIN_PASSWORD);
        await card.getByRole("button", { name: "Issue reset link" }).click();
        await card.getByLabel("Reset link", { exact: true }).waitFor();
        const link = await card
          .getByLabel("Reset link", { exact: true })
          .inputValue();
        assert.equal(new URL(link).origin, base);
        const reset = (
          await db.query(
            "SELECT *,extract(epoch FROM expires_at-created_at)::int AS seconds FROM password_reset_links WHERE user_id=$1",
            [target.id],
          )
        ).rows[0];
        assert.equal(reset.seconds, 1800);
        const fresh = await newPage();
        await goto(fresh, new URL(link).pathname);
        await fresh.reload();
        assert.equal(
          (
            await db.query(
              "SELECT * FROM password_reset_links WHERE user_id=$1",
              [target.id],
            )
          ).rowCount,
          1,
        );
        await fresh
          .locator('[name="password"]')
          .fill("V3 owner reset password");
        await fresh
          .locator('[name="confirmPassword"]')
          .fill("V3 owner reset password");
        await fresh
          .getByRole("button", { name: "Reset password", exact: true })
          .click();
      await fresh.waitForURL(/recovery-codes/);
      await fresh.locator(".recovery-grid code").first().waitFor();
      assert.equal(await fresh.locator(".recovery-grid code").count(), 8);
        assert.equal(
          (
            await db.query(
              "SELECT * FROM password_reset_links WHERE user_id=$1",
              [target.id],
            )
          ).rowCount,
          0,
        );
        const reuse = await newPage();
        await goto(reuse, new URL(link).pathname);
        await reuse.locator(".account-reset [role=alert]").waitFor();
        assert.equal(await reuse.locator('[name="password"]').count(), 0);
        assert.match(
          await reuse.locator(".account-reset [role=alert]").innerText(),
          /Invalid or expired/,
        );
      },
    );
    await check(
      "v3 site headline/banner/color and global flags apply including landing; restored afterward",
      async () => {
        assert.ok(admin, "Owner login required");
        await goto(admin, "/admin/site");
        siteChanged = true;
        await admin
          .locator('[name="landingTitle"]')
          .fill("V3 disposable headline");
        await admin.locator('[name="siteNotice"]').fill("V3 disposable banner");
        await admin.locator('[name="accentColor"]').fill("#aa33cc");
        const flags = [
          "registrationEnabled",
          "eventCreationEnabled",
          "discoveryEnabled",
          "publicProfilesEnabled",
          "sponsorsEnabled",
        ];
        for (const flag of flags) await toggle(admin, flag, false);
        await admin
          .locator('[name="currentPassword"]')
          .fill(process.env.ADMIN_PASSWORD);
        await submit(admin, "Save site settings");
        const audit = (
          await db.query(
            "SELECT id FROM activity WHERE action='owner.site-updated' ORDER BY created_at DESC LIMIT 1",
          )
        ).rows[0];
        if (audit) auditIds.push(audit.id);
        await goto(visitor, "/");
        assert.ok(
          (await visitor.locator("h1").innerText()).includes(
            "V3 disposable headline",
          ),
        );
        assert.ok(
          (await visitor.locator("body").innerText()).includes(
            "V3 disposable banner",
          ),
        );
        assert.ok(
          (
            (await visitor.locator("body").getAttribute("style")) || ""
          ).includes("#aa33cc"),
        );
        assert.equal(await visitor.locator('a[href="/explore"]').count(), 0);
        const disabledProfile = await visitor.request.get(`${base}/u/${slug}`);
        assert.ok(
          !(await disabledProfile.text()).includes(
            'class="panel profile-public-card"',
          ),
        );
        await goto(member, "/events/new");
        assert.equal(
          await member
            .getByRole("button", { name: "Create my day", exact: true })
            .count(),
          0,
        );
        await goto(owner, `${day}/settings`);
        assert.ok(await owner.locator('[name="sponsorsEnabled"]').isDisabled());
        await visitor.setViewportSize({ width: 1920, height: 1080 });
        await screenshot(visitor, "landing-flags-1920");
      },
    );
  } finally {
    if (siteChanged) {
      const keys = Object.keys(settings).filter((key) => key !== "id");
      assert.ok(keys.every((key) => /^[a-z_]+$/.test(key)));
      await db.query(
        `UPDATE settings SET ${keys.map((key, i) => `${key}=$${i + 1}`).join(",")} WHERE id=1`,
        keys.map((key) => settings[key]),
      );
      assert.deepEqual(
        (await db.query("SELECT * FROM settings WHERE id=1")).rows[0],
        settings,
      );
      console.info("RESTORED exact site settings snapshot");
    }
    if (admin) {
      const session = (await admin.context().cookies()).find(
        (cookie: any) => cookie.name === "splatify_session",
      );
      if (session)
        await db.query("DELETE FROM sessions WHERE token_hash=$1", [
          hashToken(session.value),
        ]);
    }
    if (auditIds.length)
      await db.query("DELETE FROM activity WHERE id=ANY($1::uuid[])", [
        auditIds,
      ]);
  }
  await check(
    "v3 going/maybe only; withdrawal clears team and access but preserves verified attendance",
    async () => {
      await db.query(
        "DELETE FROM event_organizers WHERE event_id=$1 AND user_id=$2",
        [event.id, memberUser.id],
      );
      const team = (
        await db.query("SELECT id FROM teams WHERE event_id=$1 LIMIT 1", [
          event.id,
        ])
      ).rows[0];
      await db.query("UPDATE teams SET captain_user_id=$1 WHERE id=$2", [
        memberUser.id,
        team.id,
      ]);
      await db.query(
        "UPDATE guests SET team_id=$1 WHERE event_id=$2 AND user_id=$3",
        [team.id, event.id, memberUser.id],
      );
      await goto(member, day);
      assert.deepEqual(
        await member
          .locator('#rsvp [name="status"] option')
          .evaluateAll((options: HTMLOptionElement[]) =>
            options.map((option) => option.value),
          ),
        ["going", "maybe"],
      );
      await submit(member, "Withdraw RSVP");
      const guest = (
        await db.query(
          "SELECT status,team_id,attended FROM guests WHERE event_id=$1 AND user_id=$2",
          [event.id, memberUser.id],
        )
      ).rows[0];
      assert.deepEqual(guest, {
        status: "declined",
        team_id: null,
        attended: true,
      });
      assert.equal(
        (
          await db.query("SELECT captain_user_id FROM teams WHERE id=$1", [
            team.id,
          ])
        ).rows[0].captain_user_id,
        null,
      );
      for (const route of ["players", "teams", "messages"]) {
        await goto(member, `${day}/${route}`);
        assert.equal(
          await member
            .locator('.day-roster, .team-manager, [name="body"]')
            .count(),
          0,
        );
      }
    },
  );
  for (const width of [1440, 1920, 390, 320]) {
    for (const [name, route, page] of [
      ["public-profile", `/u/${slug}`, visitor],
      ["landing", "/", visitor],
      ["new-team", `${day}/teams`, owner],
      ["players", `${day}/players`, owner],
      ["schedule", `${day}/schedule`, owner],
      ["chat", `${day}/messages`, owner],
      ["settings", `${day}/settings`, owner],
      ["profile", "/profile", member],
      ["dashboard", "/dashboard", owner],
      ["new-event", "/events/new", owner],
    ]) {
      await check(`v3 layout and 44px controls ${name} ${width}`, async () => {
        await page.setViewportSize({
          width,
          height: width >= 1440 ? 1080 : 844,
        });
        await goto(page, route);
        if (name === "new-team")
          await page.getByText("Create a team", { exact: true }).click();
        if (name === "schedule")
          await page
            .locator("summary")
            .filter({ hasText: /^Add schedule item$/ })
            .click();
        if (name === "settings")
          await page
            .getByText("Player limit, costs & appearance", { exact: true })
            .click();
        await page.evaluate(() => document.fonts.ready);
        await screenshot(page, `${name}-${width}`);
        const layout = await page.evaluate(() => {
          const viewport = document.documentElement.clientWidth;
          const small = Array.from(
            document.querySelectorAll<HTMLElement>(
              'button, summary, input:not([type="hidden"]), select, textarea, a.button, [role="switch"]',
            ),
          )
            .filter((el) => {
              if (el.closest("nextjs-portal") || el.matches(":disabled"))
                return false;
              return (
                el.getClientRects().length &&
                getComputedStyle(el).visibility !== "hidden"
              );
            })
            .map((el) => {
              const target = el.matches(
                'input[type="radio"], input[type="checkbox"]',
              )
                ? el.closest("label") || el
                : el;
              const r = target.getBoundingClientRect();
              return {
                tag: el.tagName,
                name:
                  el.getAttribute("aria-label") ||
                  el.getAttribute("name") ||
                  el.textContent?.trim().slice(0, 60),
                width: Math.round(r.width),
                height: Math.round(r.height),
              };
            })
            .filter((r) => r.width < 44 || r.height < 44);
          return {
            viewport,
            scroll: document.documentElement.scrollWidth,
            small,
          };
        });
        assert.ok(
          layout.scroll <= layout.viewport,
          `Horizontal overflow ${JSON.stringify(layout)}`,
        );
        assert.deepEqual(
          layout.small,
          [],
          `Under-44px controls ${JSON.stringify(layout.small)}`,
        );
      });
    }
  }
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
