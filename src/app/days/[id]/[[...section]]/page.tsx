import { notFound, redirect } from "next/navigation";
import { getDay } from "@/lib/data";
import { eventStyle } from "@/lib/presentation";
import { Shell, Notice } from "@/components/shell";
import { DayCover, DayBrief, DayNav } from "@/components/day-shared";
import { DayOverview } from "@/components/day-overview";
import { DayPlayers } from "@/components/day-players";
import { DayTeams } from "@/components/day-teams";
import { DaySchedule } from "@/components/day-schedule";
import { DayGear } from "@/components/day-gear";
import { DayMessages } from "@/components/day-messages";
import { DaySettings } from "@/components/day-settings";

export const metadata = { robots: { index: false, follow: false } };

export default async function DayPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; section?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id, section: segments } = await params;
  const section = segments?.[0] || "overview";
  if (
    (segments?.length || 0) > 1 ||
    ![
      "overview",
      "players",
      "teams",
      "schedule",
      "gear",
      "messages",
      "settings",
    ].includes(section)
  )
    notFound();
  const search = await searchParams;
  const detail = await getDay(id, {
    guestPage:
      typeof search.guestPage === "string" ? Number(search.guestPage) : 1,
    messagePage:
      typeof search.messagePage === "string" ? Number(search.messagePage) : 1,
  });
  if (!detail) notFound();
  if (section === "settings" && !detail.isOrganizer) redirect(`/days/${id}`);
  if (
    ["players", "teams", "schedule", "gear"].includes(section) &&
    !detail.canViewRoster
  )
    redirect(`/days/${id}`);
  // Anonymous accepted players may open the message URL to learn how to link an account.
  if (section === "messages" && !detail.canViewRoster) redirect(`/days/${id}`);
  return (
    <Shell user={detail.viewer} active="plans">
      <div className="day-page" style={eventStyle(detail.event.accentColor)}>
        <Notice params={search} />
        <header
          className={`day-header ${section === "overview" ? "day-header-overview" : ""}`}
        >
          {section === "overview" && (
            <DayCover
              mediaId={detail.event.coverId}
              title={`${detail.event.title} cover`}
            />
          )}
          <div className="day-header-copy">
            <span className="day-kicker">
              {detail.isOrganizer
                ? "Organizer"
                : detail.currentGuest?.approval === "pending"
                  ? "Awaiting approval"
                  : detail.isMember
                    ? "Your game day"
                    : detail.event.visibility === "public"
                      ? "Public game day"
                      : "Game day"}
            </span>
            <h1>{detail.event.title}</h1>
            <DayBrief event={detail.event} />
          </div>
        </header>
        <DayNav detail={detail} section={section} />
        {section === "overview" && <DayOverview detail={detail} />}
        {section === "players" && <DayPlayers detail={detail} />}
        {section === "teams" && <DayTeams detail={detail} />}
        {section === "schedule" && <DaySchedule detail={detail} />}
        {section === "gear" && <DayGear detail={detail} />}
        {section === "messages" && <DayMessages detail={detail} />}
        {section === "settings" && <DaySettings detail={detail} />}
      </div>
    </Shell>
  );
}
