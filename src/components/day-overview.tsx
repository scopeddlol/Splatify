import Link from "next/link";
import type { EventDetail } from "@/lib/types";
import {
  addAnnouncementAction,
  deleteAnnouncementAction,
  addPollAction,
  deletePollAction,
  voteAction,
} from "@/app/actions";
import { Hidden, money } from "./shell";
import { CopyLink, Submit } from "./ui";
import { DayDirections, DayFields, DayRemove } from "./day-shared";
import { DayRsvp } from "./day-rsvp";

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
          <h2>Important updates</h2>
          {detail.announcements.map((note) => (
            <article key={note.id}>
              <div className="day-row-heading">
                <time dateTime={note.createdAt}>
                  {new Date(note.createdAt).toLocaleDateString("en-US", {
                    month: "long",
                    day: "numeric",
                    timeZone: "UTC",
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
            <p className="day-prose">
              {event.description ||
                "The organizer is putting the details together. Check back before the day."}
            </p>
            <div className="day-stats">
              <div>
                <strong>{detail.goingCount}</strong>
                <span>players going</span>
              </div>
              <div>
                <strong>
                  {event.capacity
                    ? Math.max(0, event.capacity - detail.goingCount)
                    : "Open"}
                </strong>
                <span>
                  {event.capacity ? "places remaining" : "player limit"}
                </span>
              </div>
              <div>
                <strong>{money(detail.estimatedCost, event.currency)}</strong>
                <span>estimated per player</span>
              </div>
            </div>
            <p className="field-help">
              Planning estimate only. Nothing is charged here.
            </p>
            {!detail.canViewRoster && (
              <p className="field-help">
                Player details and planning sections are private. RSVP and
                receive approval to see them.
              </p>
            )}
            {detail.canViewRoster && (
              <div className="day-actions">
                <Link className="text-link" href={`/days/${event.id}/schedule`}>
                  See the schedule
                </Link>
                <Link className="text-link" href={`/days/${event.id}/gear`}>
                  Check gear &amp; costs
                </Link>
              </div>
            )}
          </section>
          <DayDirections event={event} />
          {isOrganizer && (
            <section className="panel">
              <h2>Post an announcement</h2>
              <p>
                Important updates appear at the top of the overview for accepted
                players.
              </p>
              <form action={addAnnouncementAction} className="form-stack">
                <DayFields eventId={event.id} />
                <label>
                  Update
                  <textarea
                    name="body"
                    required
                    rows={3}
                    maxLength={3000}
                    placeholder="Arrival changes, weather updates, or a reminder for everyone."
                  />
                </label>
                <Submit>Post update</Submit>
              </form>
            </section>
          )}
          {detail.canViewRoster && (
            <section className="panel">
              <h2>Player polls</h2>
              {detail.polls.length === 0 && (
                <p className="muted">No decisions to vote on yet.</p>
              )}
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
                  <div className="day-stack">
                    {poll.options.map((option) => (
                      <form action={voteAction} key={option.id}>
                        <DayFields eventId={event.id} />
                        <Hidden name="pollId" value={poll.id} />
                        <Hidden name="optionId" value={option.id} />
                        <fieldset disabled={!canVote} className="day-vote">
                          <Submit
                            className={`button ${poll.myVote === option.id ? "primary" : "secondary"}`}
                          >
                            {poll.myVote === option.id ? "Your vote: " : ""}
                            {option.label} ({option.votes})
                          </Submit>
                        </fieldset>
                      </form>
                    ))}
                  </div>
                  <p className="field-help">
                    {canVote
                      ? "Choose an option. You can change your vote."
                      : "RSVP as going or maybe and receive approval to vote."}
                  </p>
                </article>
              ))}
              {isOrganizer && (
                <details className="day-advanced">
                  <summary>Create a poll</summary>
                  <form
                    action={addPollAction}
                    className="form-stack inset-form"
                  >
                    <DayFields eventId={event.id} />
                    <label>
                      Question
                      <input name="question" maxLength={240} required />
                    </label>
                    <label>
                      Options
                      <textarea
                        name="options"
                        rows={4}
                        required
                        maxLength={1000}
                      />
                      <span className="field-help">
                        One per line. Use 2 to 6 unique options, up to 120
                        characters each.
                      </span>
                    </label>
                    <Submit>Create poll</Submit>
                  </form>
                </details>
              )}
            </section>
          )}
          <section className="day-safety">
            <h3>Play safe</h3>
            <p>
              Follow the field rules, attend the safety briefing, and keep your
              mask on in live areas. Confirm age limits, waivers, and marker
              rules with the venue.
            </p>
          </section>
        </div>
        <aside className="day-stack">
          <DayRsvp detail={detail} />
          {event.inviteToken && (isOrganizer || event.memberInvitesEnabled) && (
            <section className="panel">
              <h2>Bring your people</h2>
              <p>
                {event.memberInvitesEnabled
                  ? "Share the invitation so friends can RSVP."
                  : "Only organizers can share this invitation. New requests will wait for approval."}
              </p>
              <CopyLink path={`/invite/${event.inviteToken}`} />
              <Link className="text-link" href={`/invite/${event.inviteToken}`}>
                Preview invitation
              </Link>
            </section>
          )}
          {!event.memberInvitesEnabled &&
            !isOrganizer &&
            detail.canViewRoster && (
              <section className="panel">
                <h3>Invitations are organizer-managed</h3>
                <p>
                  Ask an organizer to invite someone. New join requests need
                  approval.
                </p>
              </section>
            )}
          {detail.organizers.length > 0 && (
            <section className="panel">
              <h2>Your organizers</h2>
              {detail.organizers.map((organizer) => (
                <p key={organizer.id}>
                  {organizer.name}
                  {organizer.isOwner ? " (day owner)" : ""}
                </p>
              ))}
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
