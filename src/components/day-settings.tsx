import type { EventDetail } from "@/lib/types";
import {
  addOrganizerAction,
  removeOrganizerAction,
  deleteEventAction,
  rotateInviteAction,
  addSponsorAction,
  deleteSponsorAction,
} from "@/app/actions";
import { uploadEventImageAction } from "@/app/profile/actions";
import { EventForm } from "./event-form";
import { ImageUpload } from "./image-upload";
import { Hidden } from "./shell";
import { Submit, ConfirmSubmit, DeleteButton } from "./ui";
import { DayFields, DayPerson, DayRemove } from "./day-shared";
import { getSiteSettings } from "@/lib/data";

export async function DaySettings({ detail }: { detail: EventDetail }) {
  const site = await getSiteSettings();
  const { event } = detail;
  const candidates = detail.memberCandidates.filter(
    (member) =>
      !detail.organizers.some((organizer) => organizer.id === member.id),
  );
  return (
    <div className="day-stack">
      <section className="panel">
        <h2>Day details</h2>
        <EventForm event={event} sponsorsAvailable={site.sponsorsEnabled} />
      </section>
      <section className="panel">
        <h2>Day cover</h2>
        <form action={uploadEventImageAction} className="form-stack">
          <DayFields eventId={event.id} section="settings" />
          <Hidden name="purpose" value="cover" />
          <ImageUpload
            id="day-cover"
            label="Day cover image"
            mediaId={event.coverId}
          />
          <Submit>Save day cover</Submit>
        </form>
      </section>
      <section className="panel">
        <h2>Invitation welcome</h2>
        <EventForm event={event} invitationOnly />
        <form
          action={uploadEventImageAction}
          className="form-stack day-image-form"
        >
          <DayFields eventId={event.id} section="settings" />
          <Hidden name="purpose" value="invitation" />
          <ImageUpload
            id="invitation-cover"
            label="Invitation image"
            mediaId={event.invitationCoverId}
          />
          <Submit>Save invitation image</Submit>
        </form>
      </section>
      {detail.isOwner && (
        <section className="panel">
          <h2>Co-organizers</h2>
          <p>Co-organizers can edit the day and manage players.</p>
          <div className="day-stack">
            {detail.organizers.map((organizer) => (
              <div className="day-row-heading" key={organizer.id}>
                <DayPerson
                  name={organizer.name}
                  avatarId={organizer.avatarId}
                />
                {organizer.isOwner ? (
                  <span>Day owner</span>
                ) : (
                  <DayRemove
                    eventId={event.id}
                    itemId={organizer.id}
                    name="userId"
                    section="settings"
                    action={removeOrganizerAction}
                    label={`Remove ${organizer.name} as co-organizer`}
                  />
                )}
              </div>
            ))}
          </div>
          {candidates.length > 0 ? (
            <form action={addOrganizerAction} className="form-stack">
              <DayFields eventId={event.id} section="settings" />
              <label>
                Add a co-organizer
                <select name="userId" required>
                  <option value="">Choose a player</option>
                  {candidates.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </label>
              <Submit>Add co-organizer</Submit>
            </form>
          ) : (
            <p>No other eligible players yet.</p>
          )}
        </section>
      )}
      {site.sponsorsEnabled && event.sponsorsEnabled && (
        <section className="panel">
          <h2>Sponsors</h2>
          <div className="day-stack">
            {detail.sponsors.map((sponsor) => (
              <div className="day-row-heading" key={sponsor.id}>
                {sponsor.url ? (
                  <a href={sponsor.url} target="_blank" rel="noreferrer">
                    {sponsor.name}
                  </a>
                ) : (
                  <span>{sponsor.name}</span>
                )}
                <DayRemove
                  eventId={event.id}
                  itemId={sponsor.id}
                  name="sponsorId"
                  section="settings"
                  action={deleteSponsorAction}
                  label={`Remove ${sponsor.name}`}
                />
              </div>
            ))}
          </div>
          {detail.sponsors.length < 12 && (
            <details className="day-advanced">
              <summary>Add sponsor</summary>
              <form action={addSponsorAction} className="form-stack inset-form">
                <DayFields eventId={event.id} section="settings" />
                <label>
                  Name
                  <input name="name" maxLength={100} required />
                </label>
                <label>
                  Website
                  <input
                    type="url"
                    name="url"
                    pattern="https://.*"
                    placeholder="https://"
                    maxLength={500}
                    required
                  />
                </label>
                <Submit>Add sponsor</Submit>
              </form>
            </details>
          )}
        </section>
      )}
      <section className="panel">
        <h2>Invitation access</h2>
        <p>
          Replacing the link disables old invitations and personal edit links.
        </p>
        <form action={rotateInviteAction}>
          <DayFields eventId={event.id} section="settings" />
          <ConfirmSubmit message="Replace the invitation link? Old invitation links will stop working. Send guests the new link.">
            Replace invitation link
          </ConfirmSubmit>
        </form>
      </section>
      {detail.isOwner && (
        <section className="panel danger-zone">
          <div className="day-row-heading">
            <div>
              <h2>Delete this day</h2>
              <p>Permanently deletes the day and all player activity.</p>
            </div>
            <form action={deleteEventAction}>
              <DayFields eventId={event.id} section="settings" />
              <DeleteButton
                label="Delete this day"
                message={`Permanently delete '${event.title}' and all its RSVPs and messages? This cannot be undone.`}
              />
            </form>
          </div>
        </section>
      )}
    </div>
  );
}
