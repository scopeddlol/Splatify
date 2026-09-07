import type { EventDetail } from "@/lib/types";
import {
  addOrganizerAction,
  removeOrganizerAction,
  deleteEventAction,
  rotateInviteAction,
} from "@/app/actions";
import { uploadEventImageAction } from "@/app/profile/actions";
import { EventForm } from "./event-form";
import { ImageUpload } from "./image-upload";
import { Hidden } from "./shell";
import { Submit, ConfirmSubmit, DeleteButton } from "./ui";
import { DayFields, DayPerson, DayRemove } from "./day-shared";

export function DaySettings({ detail }: { detail: EventDetail }) {
  const { event } = detail;
  const candidates = detail.memberCandidates.filter(
    (member) =>
      !detail.organizers.some((organizer) => organizer.id === member.id),
  );
  return (
    <div className="day-stack">
      <section className="panel">
        <h2>Day details</h2>
        <EventForm event={event} />
      </section>
      <section className="panel">
        <h2>Day cover</h2>
        <p>The image players see on the day overview and public preview.</p>
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
        <p>
          A personal greeting for people opening your invitation. This is
          separate from the day description and cover.
        </p>
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
          <p>
            Co-organizers can edit the day, invitations, teams, schedule, gear,
            announcements, and polls, and approve players. Only you can appoint
            organizers or delete the day.
          </p>
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
          <p className="field-help">
            To appear here, a player needs an account and an approved going or
            maybe RSVP first.
          </p>
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
      <section className="panel">
        <h2>Invitation access</h2>
        <p>
          Replace the invitation link if it has been shared too widely. The old
          invitation and its personal edit links will stop working. Existing
          members can still open the stable day URL.
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
              <p>
                Permanently remove the day, RSVPs, messages, and plans. This
                cannot be undone.
              </p>
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
