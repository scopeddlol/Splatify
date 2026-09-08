import Link from "next/link";
import type { EventDetail } from "@/lib/types";
import {
  addAnnouncementAction,
  deleteAnnouncementAction,
  deletePollAction,
} from "@/app/actions";
import { money } from "./shell";
import { CopyLink, Submit } from "./ui";
import { DayDirections, DayFields, DayRemove } from "./day-shared";
import { DayRsvp } from "./day-rsvp";
import { PollBuilder, PollVote } from "./poll-builder";

export function DayOverview({ detail }: { detail: EventDetail }) {
  const { event, isOrganizer, currentGuest } = detail;
  const canVote =
    currentGuest?.approval === "approved" && currentGuest.status !== "declined";
  return (
    <div className="day-stack">
      {detail.announcements.length > 0 && (
        <section
          className="day-announcements"
          aria-label="Organizer announcements"
        >
          <h2>Updates</h2>
          {detail.announcements.map((note) => (
            <article key={note.id}>
              <div className="day-row-heading">
                <time dateTime={note.createdAt}>
                  {new Date(note.createdAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    timeZone: event.timezone,
                  })}
                </time>
                {isOrganizer && (
                  <DayRemove
                    eventId={event.id}
                    itemId={note.id}
                    action={deleteAnnouncementAction}
                    label="Delete announcement"
                  />
                )}
              </div>
              <p>{note.body}</p>
            </article>
          ))}
        </section>
      )}
      <div className="day-columns">
        <div className="day-stack">
          <section className="panel">
            <h2>The plan</h2>
            {event.description && (
              <p className="day-prose">{event.description}</p>
            )}
            <div className="day-stats">
              <div>
                <strong>{detail.goingCount}</strong>
                <span>Going</span>
              </div>
              <div>
                <strong>
                  {event.capacity
                    ? Math.max(0, event.capacity - detail.goingCount)
                    : "Open"}
                </strong>
                <span>{event.capacity ? "Spots left" : "Player limit"}</span>
              </div>
              <div>
                <strong>{money(detail.estimatedCost, event.currency)}</strong>
                <span>Est. per player</span>
              </div>
            </div>
            {!detail.canViewRoster && (
              <p>Approved players can view the roster and plans.</p>
            )}
            {detail.canViewRoster && (
              <div className="day-actions">
                <Link className="text-link" href={`/days/${event.id}/schedule`}>
                  Schedule
                </Link>
                <Link className="text-link" href={`/days/${event.id}/gear`}>
                  Gear &amp; costs
                </Link>
              </div>
            )}
          </section>
          <DayDirections event={event} />
          {isOrganizer && (
            <details className="panel">
              <summary>Post an announcement</summary>
              <form
                action={addAnnouncementAction}
                className="form-stack inset-form"
              >
                <DayFields eventId={event.id} />
                <label>
                  Update
                  <textarea name="body" required rows={2} maxLength={3000} />
                </label>
                <Submit>Post update</Submit>
              </form>
            </details>
          )}
          {detail.canViewRoster && (detail.polls.length > 0 || isOrganizer) && (
            <section className="panel">
              <h2>Polls</h2>
              {detail.polls.map((poll) => (
                <article className="day-poll" key={poll.id}>
                  <div className="day-row-heading">
                    <h3>{poll.question}</h3>
                    {isOrganizer && (
                      <DayRemove
                        eventId={event.id}
                        itemId={poll.id}
                        action={deletePollAction}
                        label={`Delete poll: ${poll.question}`}
                      />
                    )}
                  </div>
                  <PollVote
                    key={`${poll.id}:${poll.myVote}`}
                    eventId={event.id}
                    poll={poll}
                    canVote={canVote}
                  />
                </article>
              ))}
              {isOrganizer && (
                <details className="day-advanced">
                  <summary>Create a poll</summary>
                  <PollBuilder eventId={event.id} />
                </details>
              )}
            </section>
          )}
          {event.sponsorsEnabled && detail.sponsors.length > 0 && (
            <section className="day-sponsors" aria-label="Sponsors">
              <h2>Sponsors</h2>
              <div className="day-actions">
                {detail.sponsors.map((sponsor) =>
                  sponsor.url ? (
                    <a
                      key={sponsor.id}
                      href={sponsor.url}
                      target="_blank"
                      rel="noreferrer sponsored"
                    >
                      {sponsor.name}
                    </a>
                  ) : (
                    <span className="day-chip" key={sponsor.id}>
                      {sponsor.name}
                    </span>
                  ),
                )}
              </div>
            </section>
          )}
          <p className="day-safety">
            Follow field rules. Keep your mask on in live areas.
          </p>
        </div>
        <aside className="day-stack">
          <DayRsvp detail={detail} />
          {event.inviteToken && (isOrganizer || event.memberInvitesEnabled) && (
            <section className="panel">
              <h2>Invite players</h2>
              <CopyLink path={`/invite/${event.inviteToken}`} />
              <Link className="text-link" href={`/invite/${event.inviteToken}`}>
                Preview invitation
              </Link>
            </section>
          )}
          {detail.organizers.length > 0 && (
            <section className="panel">
              <h2>Organizers</h2>
              {detail.organizers.map((organizer) => (
                <p key={organizer.id}>
                  {organizer.name}
                  {organizer.isOwner && <span className="day-chip">Owner</span>}
                </p>
              ))}
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
