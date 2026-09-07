import type { EventDetail } from "@/lib/types";
import {
  approveGuestAction,
  assignTeamAction,
  createTeamAction,
  updateTeamAction,
  deleteTeamAction,
} from "@/app/actions";
import { eventStyle } from "@/lib/presentation";
import { Pagination } from "@/components/pagination";
import { Hidden } from "./shell";
import { Submit, DeleteButton } from "./ui";
import { DayFields, DayPerson, DayRemove } from "./day-shared";

export function DayPlayers({ detail }: { detail: EventDetail }) {
  const { event, isOrganizer, teams, viewer } = detail;
  const captainTeams = detail.isMember
    ? teams.filter((team) => viewer && team.captainUserId === viewer.id)
    : [];
  return (
    <div className="day-stack">
      {isOrganizer && detail.pendingGuests.length > 0 && (
        <section className="panel day-approval">
          <h2>Waiting for approval ({detail.pendingGuests.length})</h2>
          <p>
            Approve a request to give this player access to the roster and
            planning sections.
          </p>
          {detail.pendingGuests.map((guest) => (
            <article className="day-player" key={guest.id}>
              <DayPerson
                name={guest.name}
                avatarId={guest.avatarId}
                bio={guest.bio}
              />
              <p>
                {guest.status} / {guest.marker}
              </p>
              {guest.notes && <p className="day-prose">{guest.notes}</p>}
              <div className="day-actions">
                <form action={approveGuestAction}>
                  <DayFields eventId={event.id} section="players" />
                  <Hidden name="guestId" value={guest.id} />
                  <Hidden name="decision" value="approved" />
                  <Submit>Approve {guest.name}</Submit>
                </form>
                <form action={approveGuestAction}>
                  <DayFields eventId={event.id} section="players" />
                  <Hidden name="guestId" value={guest.id} />
                  <Hidden name="decision" value="remove" />
                  <DeleteButton
                    label={`Remove request from ${guest.name}`}
                    message={`Remove ${guest.name}'s join request?`}
                  />
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
        {captainTeams.length > 0 && (
          <p className="day-pending">
            As captain, you can pick unassigned players for your team or release
            your own players. Use the roster pages to see everyone.
          </p>
        )}
        {detail.guests.length === 0 && <p>No players on this page yet.</p>}
        <div className="day-roster">
          {detail.guests.map((guest) => {
            const canPick =
              !guest.teamId &&
              guest.status !== "declined" &&
              captainTeams.length > 0;
            const canRelease =
              guest.status !== "declined" &&
              captainTeams.some((team) => team.id === guest.teamId);
            return (
              <article className="day-player" key={guest.id}>
                <DayPerson
                  name={guest.name}
                  avatarId={guest.avatarId}
                  bio={guest.bio}
                />
                <p className="day-player-meta">
                  {guest.status === "declined"
                    ? "Cannot make it"
                    : guest.status === "going"
                      ? "Going"
                      : "Maybe"}{" "}
                  /{" "}
                  {guest.marker === "rental"
                    ? "Rental / unsure"
                    : `${guest.marker} marker`}
                  {detail.currentGuest?.id === guest.id ? " / You" : ""}
                </p>
                {guest.team && (
                  <span
                    className="day-team-label"
                    style={eventStyle(guest.teamColor)}
                  >
                    <i />
                    {guest.team}
                  </span>
                )}
                {guest.notes && <p className="day-prose">{guest.notes}</p>}
                {(isOrganizer || canPick || canRelease) && (
                  <form action={assignTeamAction} className="day-inline-form">
                    <DayFields eventId={event.id} section="players" />
                    <Hidden name="guestId" value={guest.id} />
                    {isOrganizer ? (
                      <label>
                        Team for {guest.name}
                        <select name="teamId" defaultValue={guest.teamId || ""}>
                          <option value="">Unassigned</option>
                          {teams.map((team) => (
                            <option value={team.id} key={team.id}>
                              {team.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : canPick ? (
                      <label>
                        Pick for team
                        <select name="teamId">
                          {captainTeams.map((team) => (
                            <option value={team.id} key={team.id}>
                              {team.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : (
                      <Hidden name="teamId" value="" />
                    )}
                    <Submit className="button secondary">
                      {isOrganizer
                        ? "Save team"
                        : canPick
                          ? "Pick player"
                          : "Release player"}
                    </Submit>
                  </form>
                )}
                {isOrganizer && (
                  <form
                    action={approveGuestAction}
                    className="day-remove-player"
                  >
                    <DayFields eventId={event.id} section="players" />
                    <Hidden name="guestId" value={guest.id} />
                    <Hidden name="decision" value="remove" />
                    <DeleteButton
                      label={`Remove ${guest.name} from this day`}
                      message={`Remove ${guest.name}'s RSVP from this day?`}
                    />
                  </form>
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
      <section className="panel">
        <h2>Teams &amp; captains</h2>
        {teams.length === 0 && (
          <p>
            No teams yet. Organizers can create teams when players are ready.
          </p>
        )}
        <div className="day-team-grid">
          {teams.map((team) => (
            <article
              className="day-team-card"
              key={team.id}
              style={eventStyle(team.color)}
            >
              <h3>
                <span className="day-team-label">
                  <i />
                  {team.name}
                </span>
              </h3>
              <p>
                {team.playerCount} players /{" "}
                {team.captainName
                  ? `Captain: ${team.captainName}`
                  : "No captain yet"}
              </p>
              {(isOrganizer ||
                captainTeams.some((own) => own.id === team.id)) && (
                <details>
                  <summary>Edit {team.name}</summary>
                  <form
                    action={updateTeamAction}
                    className="form-stack inset-form"
                  >
                    <DayFields eventId={event.id} section="players" />
                    <Hidden name="teamId" value={team.id} />
                    <label>
                      Team name
                      <input
                        name="name"
                        required
                        maxLength={60}
                        defaultValue={team.name}
                      />
                    </label>
                    <label>
                      Team color
                      <input
                        type="color"
                        name="color"
                        defaultValue={team.color}
                      />
                    </label>
                    {isOrganizer && (
                      <label>
                        Captain
                        <select
                          name="captainUserId"
                          defaultValue={team.captainUserId || ""}
                        >
                          <option value="">No captain</option>
                          {detail.memberCandidates.map((member) => (
                            <option key={member.id} value={member.id}>
                              {member.name}
                            </option>
                          ))}
                        </select>
                        <span className="field-help">
                          Captains need an account and an approved going or
                          maybe RSVP first.
                        </span>
                      </label>
                    )}
                    <Submit>Save team</Submit>
                  </form>
                </details>
              )}
              {isOrganizer && (
                <DayRemove
                  eventId={event.id}
                  itemId={team.id}
                  name="teamId"
                  section="players"
                  action={deleteTeamAction}
                  label={`Delete team ${team.name}`}
                />
              )}
            </article>
          ))}
        </div>
        {isOrganizer && (
          <details className="day-advanced">
            <summary>Create a team</summary>
            <form action={createTeamAction} className="form-stack inset-form">
              <DayFields eventId={event.id} section="players" />
              <label>
                Team name
                <input
                  name="name"
                  maxLength={60}
                  required
                  placeholder="Choose a name your players will recognize"
                />
              </label>
              <label>
                Team color
                <input type="color" name="color" defaultValue="#d5fb51" />
              </label>
              <Submit>Create team</Submit>
            </form>
          </details>
        )}
      </section>
    </div>
  );
}
