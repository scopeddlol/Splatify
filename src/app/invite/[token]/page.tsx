import Link from "next/link";
import { notFound } from "next/navigation";
import { getSharedEvent, getSiteSettings } from "@/lib/data";
import { eventStyle } from "@/lib/presentation";
import { Shell, Notice, Hidden, money } from "@/components/shell";
import { DayCover, DayBrief, DayDirections } from "@/components/day-shared";
import { DayRsvp } from "@/components/day-rsvp";
import { Submit } from "@/components/ui";
import { claimGuestAction } from "@/app/actions";

export const metadata = {
  title: "Your invitation",
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};

export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await params;
  const detail = await getSharedEvent(token);
  if (!detail) notFound();
  const search = await searchParams;
  const settings = await getSiteSettings();
  const { event } = detail;
  return (
    <Shell user={detail.viewer} active="plans">
      <div
        className="day-page day-invitation"
        style={eventStyle(event.accentColor)}
      >
        <Notice params={search} />
        {settings.siteNotice && (
          <div className="notice">{settings.siteNotice}</div>
        )}
        {typeof search.editToken === "string" && (
          <section className="panel">
            <h2>Open your personal RSVP</h2>
            <p>
              This private link lets you edit the guest RSVP it belongs to.
              Continue only if it is yours.
            </p>
            <form action={claimGuestAction}>
              <Hidden name="inviteToken" value={token} />
              <Hidden name="editToken" value={search.editToken} />
              <Submit>Unlock my RSVP</Submit>
            </form>
          </section>
        )}
        <section className="day-welcome">
          <DayCover
            mediaId={event.invitationCoverId || event.coverId}
            title={`Invitation to ${event.title}`}
            inviteToken={token}
          />
          <div className="day-header-copy">
            <span className="day-kicker">A day worth getting together for</span>
            <h1>{event.invitationHeading || "You are invited!"}</h1>
            {event.invitationMessage && (
              <p className="day-prose day-welcome-message">
                {event.invitationMessage}
              </p>
            )}
            <h2>{event.title}</h2>
            <DayBrief event={event} />
            <p className="day-prose">{event.description}</p>
            <p>
              {detail.goingCount} going / Estimated{" "}
              {money(detail.estimatedCost, event.currency)} per player
            </p>
            {(detail.currentGuest || detail.isOrganizer) && (
              <Link className="button primary" href={`/days/${event.id}`}>
                {detail.canViewRoster
                  ? "Open the full day"
                  : "View your day & request status"}
              </Link>
            )}
          </div>
        </section>
        <div className="day-columns">
          <DayRsvp detail={detail} inviteToken={token} />
          <DayDirections event={event} />
        </div>
      </div>
    </Shell>
  );
}
