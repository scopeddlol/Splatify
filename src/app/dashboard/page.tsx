import Link from "next/link";
import {
  ArrowUpRight,
  CalendarDays,
  Crosshair,
  MapPin,
  Plus,
  Users,
  Zap,
} from "lucide-react";
import {
  getMyEvents,
  getMyInvitations,
  getSiteSettings,
  requireUser,
} from "@/lib/data";
import { Shell, Notice, Empty, dateLabel } from "@/components/shell";

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const [events, invitations, settings, params] = await Promise.all([
    getMyEvents(),
    getMyInvitations(),
    getSiteSettings(),
    searchParams,
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = events.filter((e) => !e.date || e.date >= today);
  const firstName = user.name.split(" ")[0];
  return (
    <Shell user={user}>
      <Notice params={params} />
      {settings.siteNotice && (
        <div className="notice">{settings.siteNotice}</div>
      )}
      <div className="page-heading">
        <div>
          <span className="eyebrow">THE CREW STARTS WITH YOU</span>
          <h1>What&apos;s the plan, {firstName}?</h1>
          <p>Big days. Small details. All right here.</p>
        </div>
        {settings.eventCreationEnabled && (
          <Link href="/events/new" className="button primary">
            <Plus size={18} /> Create a day
          </Link>
        )}
      </div>
      <section className="dashboard-banner">
        <div>
          <span className="eyebrow">LESS PLANNING. MORE PLAYING.</span>
          <h2>
            Make the group chat
            <br />
            <em>actually happen.</em>
          </h2>
          <p>A field, a few friends, and a day worth getting out for.</p>
          <Link
            href={settings.eventCreationEnabled ? "/events/new" : "#your-plans"}
            className="button light"
          >
            {settings.eventCreationEnabled
              ? "Plan your next day"
              : "See your plans"}
            <ArrowUpRight size={17} />
          </Link>
        </div>
        <div className="banner-art" aria-hidden="true">
          <div className="banner-ring" />
          <Crosshair size={230} strokeWidth={0.7} />
          <span className="banner-stamp">
            GOOD
            <br />
            DAYS
            <br />
            <i>AHEAD.</i>
          </span>
          <span className="banner-coordinate">EST. NOW / GAME ON</span>
        </div>
      </section>
      <section className="stats-grid">
        <div className="stat">
          <span>
            <CalendarDays size={17} /> Days on the horizon
          </span>
          <strong>{upcoming.length.toString().padStart(2, "0")}</strong>
          <small>Upcoming or still taking shape</small>
        </div>
        <div className="stat">
          <span>
            <Users size={17} /> Confirmed RSVPs
          </span>
          <strong>
            {upcoming
              .reduce((sum, e) => sum + e.goingCount, 0)
              .toString()
              .padStart(2, "0")}
          </strong>
          <small>Across your upcoming days</small>
        </div>
        <div className="stat">
          <span>
            <Zap size={17} /> Days you&apos;ve created
          </span>
          <strong>{events.length.toString().padStart(2, "0")}</strong>
          <small>Every good day starts somewhere</small>
        </div>
      </section>
      <section id="your-plans">
        <div className="section-heading compact">
          <h2>
            Your game days <span className="count-badge">{events.length}</span>
          </h2>
          <span className="eyebrow">NEWEST PLANS FIRST</span>
        </div>
        {events.length ? (
          <div className="event-grid">
            {events.map((event, index) => (
              <Link
                href={`/events/${event.id}`}
                key={event.id}
                className={`event-card theme-${event.theme}`}
              >
                <div className="event-card-art">
                  <span className="tag">
                    {event.date && event.date < today
                      ? "IN THE BOOKS"
                      : event.date
                        ? "ON THE HORIZON"
                        : "TAKING SHAPE"}
                  </span>
                  <Crosshair size={118} strokeWidth={0.8} />
                  <span className="card-index">
                    {(index + 1).toString().padStart(2, "0")}
                  </span>
                </div>
                <div className="event-card-body">
                  <div className="card-title">
                    <h3>{event.title}</h3>
                    <ArrowUpRight size={20} />
                  </div>
                  <p>
                    <CalendarDays size={15} />
                    {dateLabel(event.date)}
                    {event.time ? ` / ${event.time}` : ""}
                  </p>
                  <p>
                    <MapPin size={15} />
                    {event.venue || "Field to be decided"}
                  </p>
                  <div className="card-bottom">
                    <span>
                      <Users size={15} />
                      {event.goingCount}
                      {event.capacity ? ` / ${event.capacity}` : ""} going
                    </span>
                    <span>
                      Open plan <ArrowUpRight size={14} />
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="empty-dashboard">
            <Empty title="A clear calendar. Endless possibilities.">
              Your plans will live here. Create your first day, share a link,
              and let the crew roll in.
            </Empty>
            {settings.eventCreationEnabled && (
              <Link href="/events/new" className="button primary">
                <Plus size={17} /> Create your first day
              </Link>
            )}
          </div>
        )}
      </section>
      {invitations.length > 0 && (
        <section className="section-space">
          <div className="section-heading compact">
            <h2>You&apos;re on the guest list</h2>
            <span className="eyebrow">DAYS YOU&apos;VE JOINED</span>
          </div>
          <div className="panel list-panel">
            {invitations.map((event) => (
              <Link
                className="list-row"
                key={event.id}
                href={`/invite/${event.inviteToken}`}
              >
                <div>
                  <strong>{event.title}</strong>
                  <small>
                    {dateLabel(event.date)} / {event.venue || "Field TBD"}
                  </small>
                </div>
                <ArrowUpRight size={19} />
              </Link>
            ))}
          </div>
        </section>
      )}
      <div className="bottom-note">
        <Crosshair size={17} />
        <span>
          Invite freely. Your guests don&apos;t need an account to get in on the
          plan.
        </span>
      </div>
    </Shell>
  );
}
