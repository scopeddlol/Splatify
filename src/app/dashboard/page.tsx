import Link from "next/link";
import { Plus, Compass, UserRound } from "lucide-react";
import { requireUser, getSiteSettings } from "@/lib/data";
import { getPlayerDays } from "@/lib/player-days";
import { Shell, Notice, Empty } from "@/components/shell";
import { DayCard } from "@/components/day-card";
import { Pagination } from "@/components/pagination";

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const view = params.view === "organizing" ? "organizing" : "attending";
  const [result, settings] = await Promise.all([
    getPlayerDays(view, Number(params.page) || 1),
    getSiteSettings(),
  ]);
  return (
    <Shell user={user}>
      <Notice params={params} />
      {settings.siteNotice && (
        <div className="notice">{settings.siteNotice}</div>
      )}
      <div className="page-heading">
        <div>
          <h1>Your game days</h1>
        </div>
        {settings.eventCreationEnabled && (
          <Link href="/events/new" className="button primary">
            <Plus size={17} /> Create a day
          </Link>
        )}
      </div>
      {!user.bio && !user.avatarId && (
        <div className="profile-nudge">
          <UserRound size={23} />
          <div>
            <strong>Build your player card.</strong>
          </div>
          <Link href="/profile" className="button secondary small">
            Edit profile
          </Link>
        </div>
      )}
      <nav className="day-nav dashboard-tabs" aria-label="My day lists">
        <Link
          href="/dashboard"
          aria-current={view === "attending" ? "page" : undefined}
        >
          Joining
        </Link>
        <Link
          href="/dashboard?view=organizing"
          aria-current={view === "organizing" ? "page" : undefined}
        >
          Organizing
        </Link>
      </nav>
      <div className="section-heading compact">
        <h2>
          {view === "attending" ? "Your guest list" : "Your plans"}{" "}
          <span className="count-badge">{result.total}</span>
        </h2>
        <Link href="/explore" className="text-link">
          <Compass size={15} /> Explore
        </Link>
      </div>
      {result.events.length ? (
        <>
          <div className="event-grid">
            {result.events.map((event) => (
              <DayCard event={event} key={event.id} />
            ))}
          </div>
          <Pagination
            page={result.page}
            total={result.total}
            pageSize={result.pageSize}
            href={(page) => `/dashboard?view=${view}&page=${page}`}
          />
        </>
      ) : (
        <div className="empty-dashboard">
          <Empty
            title={
              view === "attending"
                ? "Your next crew is out there."
                : "One good idea. One great day."
            }
          >
            {view === "attending"
              ? "Join a public day or open an invitation."
              : "Create a day and invite your crew."}
          </Empty>
          <Link
            href={view === "attending" ? "/explore" : "/events/new"}
            className="button primary"
          >
            {view === "attending"
              ? "Find a day to join"
              : "Create your first day"}
          </Link>
        </div>
      )}
    </Shell>
  );
}
