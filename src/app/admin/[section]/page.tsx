import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getAdminOverview, getSiteSettings } from "@/lib/data";
import { getOwnerAccounts } from "@/lib/owner";
import { Shell, Notice } from "@/components/shell";
import { Submit } from "@/components/ui";
import { OwnerDeleteForm } from "@/components/owner-delete-form";
import { OwnerNav } from "@/components/owner-nav";
import { OwnerResetForm } from "@/components/owner-reset-form";
import { PasswordInput } from "@/components/password-input";
import { Pagination } from "@/components/pagination";
import { deleteUserAction } from "@/app/actions";
import { updateSiteAction } from "../actions";

export default async function OwnerSection({
  params,
  searchParams,
}: {
  params: Promise<{ section: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  if (!user.isAdmin) redirect("/dashboard?error=Owner%20access%20required.");
  const { section } = await params;
  if (!["accounts", "site", "activity"].includes(section)) notFound();
  const search = await searchParams;
  let content;
  if (section === "accounts") {
    const term = typeof search.q === "string" ? search.q.slice(0, 100) : "";
    const result = await getOwnerAccounts(
      term,
      typeof search.page === "string" ? Number(search.page) : 1,
    );
    content = (
      <section className="panel">
        <form className="owner-search" action="/admin/accounts">
          <label>
            Search accounts
            <input
              name="q"
              defaultValue={term}
              maxLength={100}
              placeholder="Name or email"
            />
          </label>
          <button className="button secondary">Search</button>
        </form>
        <div className="admin-list">
          {result.accounts.map((account) => (
            <article className="owner-account" key={account.id}>
              <div className="admin-row">
                <div className="admin-row-main">
                  <strong>{account.name}</strong>
                  <small>{account.email}</small>
                </div>
                <span className="admin-row-detail">
                  {account.eventCount} events
                  <small>{account.createdAt.slice(0, 10)}</small>
                </span>
                {account.isManaged ? (
                  <span className="count-badge">MANAGED</span>
                ) : (
                  account.id !== user.id && (
                    <OwnerDeleteForm
                      action={deleteUserAction}
                      name="userId"
                      value={account.id}
                      label={`Delete ${account.name}`}
                      message={`Delete ${account.name}'s account and organized events? This cannot be undone.`}
                    />
                  )
                )}
              </div>
              {!account.isManaged && account.id !== user.id && (
                <OwnerResetForm userId={account.id} />
              )}
            </article>
          ))}
        </div>
        {!result.total && <p className="muted">No accounts found.</p>}
        <Pagination
          page={result.page}
          total={result.total}
          pageSize={20}
          href={(page) =>
            `/admin/accounts?q=${encodeURIComponent(term)}&page=${page}`
          }
        />
      </section>
    );
  } else if (section === "site") {
    const settings = await getSiteSettings();
    content = (
      <form
        action={updateSiteAction}
        className="panel form-stack owner-site-form"
      >
        <h2>Homepage</h2>
        <label>
          Title
          <input
            name="landingTitle"
            defaultValue={settings.landingTitle}
            maxLength={100}
          />
        </label>
        <label>
          Subtitle
          <textarea
            name="landingSubtitle"
            defaultValue={settings.landingSubtitle}
            maxLength={240}
            rows={2}
          />
        </label>
        <div className="account-field-pair">
          <label>
            Button label
            <input
              name="landingCta"
              defaultValue={settings.landingCta}
              maxLength={40}
            />
          </label>
          <label>
            Accent color
            <input
              name="accentColor"
              defaultValue={settings.accentColor}
              pattern="#[0-9a-fA-F]{6}"
              maxLength={7}
              required
            />
          </label>
        </div>
        <label>
          Site notice
          <textarea
            name="siteNotice"
            defaultValue={settings.siteNotice}
            maxLength={1000}
            rows={3}
          />
        </label>
        <h2>Features</h2>
        {(
          [
            ["registrationEnabled", "Account registration"],
            ["eventCreationEnabled", "New game days"],
            ["discoveryEnabled", "Discovery"],
            ["publicProfilesEnabled", "Public profiles"],
            ["sponsorsEnabled", "Sponsors"],
          ] as const
        ).map(([name, label]) => (
          <label className="toggle-label" key={name}>
            <span>{label}</span>
            <input
              name={name}
              type="checkbox"
              defaultChecked={settings[name]}
            />
          </label>
        ))}
        <label htmlFor="site-owner-password">Your owner password</label>
        <PasswordInput name="currentPassword" id="site-owner-password" />
        <Submit>Save site settings</Submit>
        <small>Owner credentials are environment-managed.</small>
      </form>
    );
  } else {
    const overview = await getAdminOverview();
    content = (
      <section className="panel">
        <div className="panel-heading">
          <h2>Recent activity</h2>
          <span className="count-badge">LATEST 50</span>
        </div>
        <div className="activity-feed">
          {overview.recentActivity.map((item) => (
            <article key={item.id}>
              <span className="activity-dot" />
              <div>
                <strong>{item.action.replaceAll(".", " / ")}</strong>
                <p>{item.detail}</p>
                <time dateTime={item.createdAt}>
                  {new Date(item.createdAt).toLocaleString("en", {
                    timeZone: "UTC",
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}{" "}
                  UTC
                </time>
              </div>
            </article>
          ))}
        </div>
        {!overview.recentActivity.length && (
          <span className="muted">No activity.</span>
        )}
      </section>
    );
  }
  return (
    <Shell user={user} active="admin">
      <OwnerNav active={section} />
      <Notice params={search} />
      {content}
    </Shell>
  );
}
