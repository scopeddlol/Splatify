import Link from "next/link";
import type { EventDetail } from "@/lib/types";
import { approveGuestAction, setAttendanceAction } from "@/app/actions";
import { Pagination } from "./pagination";
import { Hidden } from "./shell";
import { Submit, DeleteButton } from "./ui";
import { DayFields, DayPerson } from "./day-shared";
import { TeamBadge } from "./team-badge";

export function DayPlayers({ detail }: { detail: EventDetail }) {
  const { event, isOrganizer } = detail;
  const canAttend =
    !!event.date && event.date <= new Date().toISOString().slice(0, 10);
  return (
    <div className="day-stack">
      {isOrganizer && detail.pendingGuests.length > 0 && (
        <section className="panel day-approval">
          <h2>Awaiting approval ({detail.pendingGuests.length})</h2>
          {detail.pendingGuests.map((guest) => (
            <article className="day-player day-row-heading" key={guest.id}>
              <DayPerson name={guest.name} avatarId={guest.avatarId} />
              <div className="day-actions">
                <form action={approveGuestAction}>
                  <DayFields eventId={event.id} section="players" />
                  <Hidden name="guestId" value={guest.id} />
                  <Hidden name="decision" value="approved" />
                  <Submit>Approve</Submit>
                </form>
                <form action={approveGuestAction}>
                  <DayFields eventId={event.id} section="players" />
                  <Hidden name="guestId" value={guest.id} />
                  <Hidden name="decision" value="remove" />
                  <DeleteButton label={`Remove request from ${guest.name}`} />
                </form>
              </div>
            </article>
          ))}
        </section>
      )}
      <section className="panel">
        <div className="day-row-heading">
          <h2>Players ({detail.guestTotal})</h2>
          <span>{detail.goingCount} going</span>
        </div>
        {!detail.guests.length && <p>No players yet.</p>}
        <div className="day-roster">
          {detail.guests.map((guest) => {
            const team = detail.teams.find((t) => t.id === guest.teamId);
            return (
              <article className="day-player" key={guest.id}>
                <div className="day-row-heading">
                  <DayPerson name={guest.name} avatarId={guest.avatarId} />
                  {detail.currentGuest?.id === guest.id && (
                    <span className="day-chip">You</span>
                  )}
                </div>
                {guest.firstName && (
                  <p className="day-player-meta">{guest.firstName}</p>
                )}
                <div className="day-player-tags">
                  <span className="day-chip">{guest.marker}</span>
                  <span className="day-chip">
                    {guest.status === "going"
                      ? "Going"
                      : guest.status === "declined"
                        ? "Withdrawn"
                        : "Maybe"}
                  </span>
                  {team && (
                    <span className="day-team-label">
                      <TeamBadge
                        logoIcon={team.logoIcon}
                        color={team.color}
                        size={30}
                      />
                      {team.name}
                    </span>
                  )}
                </div>
                {guest.bio && <p className="day-clamp">{guest.bio}</p>}
                {guest.loadoutPreview && (
                  <p className="day-clamp day-loadout">
                    {guest.loadoutPreview}
                  </p>
                )}
                {guest.notes && (
                  <details>
                    <summary>Day notes</summary>
                    <p className="day-prose">{guest.notes}</p>
                  </details>
                )}
                {guest.profileSlug && (
                  <Link
                    className="text-link"
                    href={`/u/${encodeURIComponent(guest.profileSlug)}`}
                  >
                    View profile
                  </Link>
                )}
                {isOrganizer && (
                  <div className="day-player-controls">
                    <form action={setAttendanceAction}>
                      <DayFields eventId={event.id} section="players" />
                      <Hidden name="guestId" value={guest.id} />
                      <fieldset
                        className="day-vote day-actions"
                        disabled={!canAttend && !guest.attended}
                        title={
                          !canAttend
                            ? "Attendance is available on or after the day date."
                            : undefined
                        }
                      >
                        <label className="checkbox-label">
                          <input
                            type="checkbox"
                            name="attended"
                            defaultChecked={guest.attended}
                          />
                          Attended
                        </label>
                        <Submit className="button secondary">Save</Submit>
                      </fieldset>
                    </form>
                    <form action={approveGuestAction}>
                      <DayFields eventId={event.id} section="players" />
                      <Hidden name="guestId" value={guest.id} />
                      <Hidden name="decision" value="remove" />
                      <DeleteButton
                        label={`Remove ${guest.name}`}
                        message={`Remove ${guest.name}'s RSVP from this day?`}
                      />
                    </form>
                  </div>
                )}
              </article>
            );
          })}
        </div>
        <Pagination
          page={detail.guestPage}
          total={detail.guestTotal}
          pageSize={20}
          href={(page) => `/days/${event.id}/players?guestPage=${page}`}
        />
      </section>
    </div>
  );
}
