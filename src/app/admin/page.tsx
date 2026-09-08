import { getAdminOverview } from "@/lib/data";
import { requireUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Shell, Notice, dateLabel } from "@/components/shell";
import { OwnerDeleteForm } from "@/components/owner-delete-form";
import { OwnerNav } from "@/components/owner-nav";
import { adminDeleteEventAction } from "@/app/actions";

export default async function Admin({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  if (!user.isAdmin) redirect("/dashboard?error=Owner%20access%20required.");
  const overview = await getAdminOverview();
  return (
    <Shell user={user} active="admin">
      <OwnerNav active="overview" />
      <Notice params={await searchParams} />
      <div className="stats-grid admin-stats">
        {[
          { label: "Accounts", value: overview.users },
          { label: "Game days", value: overview.events },
          { label: "RSVPs", value: overview.guests },
          { label: "Upcoming", value: overview.upcomingEvents },
        ].map((stat) => (
          <div className="stat" key={stat.label}>
            <span>{stat.label}</span>
            <strong>{stat.value.toLocaleString("en")}</strong>
          </div>
        ))}
      </div>
      <section className="panel section-space">
        <div className="panel-heading">
          <h2>Recent game days</h2>
          <span className="count-badge">LATEST 50</span>
        </div>
        <div className="admin-list">
          {overview.recentEvents.map((event) => (
            <div className="admin-row" key={event.id}>
              <div className="admin-row-main">
                <strong>{event.title}</strong>
                <small>{event.ownerName}</small>
              </div>
              <span className="admin-row-detail">
                {event.guestCount} RSVPs<small>{dateLabel(event.date)}</small>
              </span>
              <OwnerDeleteForm
                action={adminDeleteEventAction}
                name="eventId"
                value={event.id}
                label={`Remove ${event.title}`}
                message={`Permanently remove '${event.title}' and all its RSVPs?`}
              />
            </div>
          ))}
        </div>
        {!overview.recentEvents.length && (
          <span className="muted">No game days.</span>
        )}
      </section>
    </Shell>
  );
}
