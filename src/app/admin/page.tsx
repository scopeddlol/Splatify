import {
  Activity,
  CalendarDays,
  Shield,
  Users,
  UserCheck,
  Settings2,
} from "lucide-react";
import { getAdminOverview, requireUser } from "@/lib/data";
import { Shell, Notice, Hidden, dateLabel } from "@/components/shell";
import { DeleteButton, Submit } from "@/components/ui";
import {
  updateSettingsAction,
  deleteUserAction,
  adminDeleteEventAction,
} from "@/app/actions";

export default async function Admin({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const overview = await getAdminOverview();
  return (
    <Shell user={user} active="admin">
      <Notice params={await searchParams} />
      <div className="page-heading">
        <div>
          <span className="eyebrow">OWNER CONSOLE / PRIVATE ACCESS</span>
          <h1>A view of the whole field.</h1>
          <p>Real usage. Real activity. Your platform, under control.</p>
        </div>
        <span className="admin-badge">
          <Shield size={16} /> Environment-managed owner
        </span>
      </div>
      <div className="stats-grid admin-stats">
        {[
          { label: "Registered accounts", value: overview.users, icon: Users },
          {
            label: "Game days created",
            value: overview.events,
            icon: CalendarDays,
          },
          { label: "Total RSVPs", value: overview.guests, icon: UserCheck },
          {
            label: "Upcoming dated events",
            value: overview.upcomingEvents,
            icon: Activity,
          },
        ].map((stat) => (
          <div className="stat" key={stat.label}>
            <span>
              <stat.icon size={17} />
              {stat.label}
            </span>
            <strong>{stat.value.toLocaleString("en")}</strong>
            <small>Live database totals</small>
          </div>
        ))}
      </div>
      <div className="admin-columns">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">THE CONTROLS</span>
              <h2>Platform settings</h2>
            </div>
            <Settings2 size={22} className="muted" />
          </div>
          <form action={updateSettingsAction} className="form-stack">
            <label className="toggle-label">
              <span>
                <strong>Account registration</strong>
                <small>Allow new organizers to create an account.</small>
              </span>
              <input
                type="checkbox"
                name="registrationEnabled"
                defaultChecked={overview.settings.registrationEnabled}
              />
            </label>
            <label className="toggle-label">
              <span>
                <strong>New game days</strong>
                <small>
                  Allow organizers to create new events. Existing plans stay
                  usable.
                </small>
              </span>
              <input
                type="checkbox"
                name="eventCreationEnabled"
                defaultChecked={overview.settings.eventCreationEnabled}
              />
            </label>
            <label>
              Site-wide notice
              <textarea
                name="siteNotice"
                rows={3}
                maxLength={1000}
                defaultValue={overview.settings.siteNotice}
                placeholder="Maintenance heads-up, field news, or an important update..."
              />
              <span className="field-help">
                Shown on dashboards and invite pages. Clear it to hide it.
              </span>
            </label>
            <Submit>Save platform settings</Submit>
          </form>
          <div className="privacy-note">
            <Shield size={20} />
            <span>
              Manage your owner name, email, and password through{" "}
              <code>ADMIN_NAME</code>, <code>ADMIN_EMAIL</code>, and{" "}
              <code>ADMIN_PASSWORD</code> in the server&apos;s <code>.env</code>
              . Run the migration and recreate the web container to apply
              changes. Credential changes revoke existing sessions.
            </span>
          </div>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">WHAT&apos;S HAPPENING</span>
              <h2>Recent activity</h2>
            </div>
            <Activity size={21} className="muted" />
          </div>
          <p className="field-help">
            Latest 50 account, event, RSVP, voting, and admin actions. Retained
            for up to 180 days when maintenance runs. No third-party tracking.
          </p>
          <div className="activity-feed">
            {overview.recentActivity.length ? (
              overview.recentActivity.map((item) => (
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
              ))
            ) : (
              <p className="muted">
                Activity will appear as people use Splatify.
              </p>
            )}
          </div>
        </section>
      </div>
      <section className="panel section-space">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">THE PEOPLE BEHIND THE PLANS</span>
            <h2>Recent accounts</h2>
          </div>
          <span className="count-badge">LATEST 50</span>
        </div>
        <div className="admin-list">
          {overview.recentUsers.map((account) => (
            <div className="admin-row" key={account.id}>
              <span className="avatar">
                {account.name.slice(0, 2).toUpperCase()}
              </span>
              <div className="admin-row-main">
                <strong>
                  {account.name}
                  {account.id === user.id && (
                    <span className="you-label">YOU</span>
                  )}
                </strong>
                <small>{account.email}</small>
              </div>
              <span className="admin-row-detail">
                {account.eventCount}{" "}
                {account.eventCount === 1 ? "event" : "events"}
                <small>
                  Joined {dateLabel(account.createdAt.slice(0, 10))}
                </small>
              </span>
              {account.id !== user.id && (
                <form action={deleteUserAction}>
                  <Hidden name="userId" value={account.id} />
                  <DeleteButton
                    label={`Delete account ${account.name}`}
                    message={`Delete ${account.name}'s account and all their organized events? This cannot be undone.`}
                  />
                </form>
              )}
            </div>
          ))}
        </div>
      </section>
      <section className="panel section-space">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">PLATFORM OVERSIGHT</span>
            <h2>Recent game days</h2>
          </div>
          <span className="count-badge">LATEST 50</span>
        </div>
        <div className="admin-list">
          {overview.recentEvents.length ? (
            overview.recentEvents.map((event) => (
              <div className="admin-row" key={event.id}>
                <span className="avatar">
                  <CalendarDays size={19} />
                </span>
                <div className="admin-row-main">
                  <strong>{event.title}</strong>
                  <small>Organized by {event.ownerName}</small>
                </div>
                <span className="admin-row-detail">
                  {event.guestCount} RSVPs<small>{dateLabel(event.date)}</small>
                </span>
                <form action={adminDeleteEventAction}>
                  <Hidden name="eventId" value={event.id} />
                  <DeleteButton
                    label={`Remove event ${event.title}`}
                    message={`Permanently remove '${event.title}' and all its RSVPs? This cannot be undone.`}
                  />
                </form>
              </div>
            ))
          ) : (
            <p className="muted">No game days yet.</p>
          )}
        </div>
      </section>
      <p className="bottom-note">
        Usage counters reflect current records, not lifetime totals. Anonymous
        page views, IP addresses, and browsing sessions are not included in this
        console.
      </p>
    </Shell>
  );
}
