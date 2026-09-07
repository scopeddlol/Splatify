import Link from "next/link";
import { Search, Compass, ArrowUpRight } from "lucide-react";
import { getPublicEvents, getUser, getSiteSettings } from "@/lib/data";
import { Shell, Empty } from "@/components/shell";
import { DayCard } from "@/components/day-card";
import { Pagination } from "@/components/pagination";

export const metadata = { title: "Explore Paintball Days" };
export default async function Explore({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const search = await searchParams;
  const city = typeof search.city === "string" ? search.city : "";
  const state = typeof search.state === "string" ? search.state : "";
  const query = typeof search.query === "string" ? search.query : "";
  const [user, result, settings] = await Promise.all([
    getUser(),
    getPublicEvents({ city, state, query, page: Number(search.page) || 1 }),
    getSiteSettings(),
  ]);
  const pageUrl = (page: number) =>
    `/explore?${new URLSearchParams({ city, state, query, page: String(page) })}`;
  return (
    <Shell user={user} active="explore">
      {settings.siteNotice && (
        <div className="notice">{settings.siteNotice}</div>
      )}
      <div className="page-heading">
        <div>
          <span className="eyebrow">YOUR NEXT GAME STARTS HERE</span>
          <h1>Find a day. Meet your crew.</h1>
          <p>
            Browse public paintball days near you. No account needed to look
            around.
          </p>
        </div>
        <Compass size={35} className="accent" />
      </div>
      <form action="/explore" className="panel discovery-search">
        <label>
          City
          <input
            name="city"
            defaultValue={city}
            placeholder="e.g. Austin"
            maxLength={100}
            autoComplete="address-level2"
          />
        </label>
        <label>
          State / region
          <input
            name="state"
            defaultValue={state}
            placeholder="e.g. Texas or TX"
            maxLength={100}
            autoComplete="address-level1"
          />
        </label>
        <label>
          Day, field, or keyword
          <input
            name="query"
            defaultValue={query}
            placeholder="Find your kind of game"
            maxLength={120}
          />
        </label>
        <button className="button primary" type="submit">
          <Search size={17} /> Search days
        </button>
      </form>
      <div className="section-heading compact">
        <h2>
          {result.total} {result.total === 1 ? "public day" : "public days"}
        </h2>
        {(city || state || query) && (
          <Link href="/explore" className="text-link">
            Clear filters
          </Link>
        )}
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
            href={pageUrl}
          />
        </>
      ) : (
        <div className="empty-dashboard">
          <Empty
            title={
              city || state || query
                ? "No days match just yet."
                : "Be the first to get people playing."
            }
          >
            {city || state || query
              ? "Try a nearby city, clear a filter, or organize your own public day."
              : "Public days will appear here when organizers share them. Private invitations never appear in this list."}
          </Empty>
          <Link href="/events/new" className="button primary">
            Organize a public day <ArrowUpRight size={16} />
          </Link>
        </div>
      )}
      <div className="discovery-note">
        <strong>Your privacy comes along.</strong>
        <p>
          Public previews show the location, date, cost estimate, and
          availability. Player profiles and conversations stay with the crew.
          Some days require organizer approval before you join.
        </p>
      </div>
    </Shell>
  );
}
