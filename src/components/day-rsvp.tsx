import Link from "next/link";
import type { EventDetail } from "@/lib/types";
import { submitRsvpAction, withdrawRsvpAction } from "@/app/actions";
import { Hidden } from "./shell";
import { CopyLink, Submit, ConfirmSubmit } from "./ui";

export function DayRsvp({
  detail,
  inviteToken,
}: {
  detail: EventDetail;
  inviteToken?: string;
}) {
  const { event, currentGuest, viewer, guestEditToken } = detail;
  const next = inviteToken ? `/invite/${inviteToken}` : `/days/${event.id}`;
  return (
    <section className="panel day-rsvp" id="rsvp">
      <h2>{currentGuest ? "Your RSVP" : "Join the day"}</h2>
      {currentGuest?.approval === "pending" ? (
        <p className="day-pending" role="status">
          Awaiting approval.
        </p>
      ) : !event.memberInvitesEnabled &&
        !currentGuest &&
        !detail.isOrganizer ? (
        <p className="day-pending">Organizer approval required.</p>
      ) : null}
      {currentGuest?.status === "declined" && (
        <p className="day-chip">Withdrawn</p>
      )}
      {!viewer && (
        <div className="day-signup">
          <p>Save your days. Join the chat.</p>
          <div className="day-actions">
            <Link
              className="button secondary"
              href={`/signup?next=${encodeURIComponent(next)}`}
            >
              Sign up
            </Link>
            <Link
              className="text-link"
              href={`/login?next=${encodeURIComponent(next)}`}
            >
              Sign in
            </Link>
          </div>
        </div>
      )}
      {viewer && currentGuest && !currentGuest.userId && (
        <p className="day-pending">Save your RSVP to link your account.</p>
      )}
      <form action={submitRsvpAction} className="form-stack">
        {/* Initial private RSVPs must retain the original URL token, not the scrubbed detail token. */}
        {inviteToken ? (
          <Hidden name="inviteToken" value={inviteToken} />
        ) : (
          <Hidden name="eventId" value={event.id} />
        )}
        <label>
          Your display name
          <input
            name="name"
            required
            maxLength={80}
            defaultValue={currentGuest?.name || viewer?.name}
            autoComplete="nickname"
          />
        </label>
        <label>
          Will you be there?
          <select
            name="status"
            defaultValue={currentGuest?.status === "maybe" ? "maybe" : "going"}
          >
            <option value="going">Going</option>
            <option value="maybe">Maybe</option>
          </select>
        </label>
        <label>
          Marker
          <select
            name="marker"
            defaultValue={
              currentGuest?.marker || viewer?.defaultMarker || "rental"
            }
          >
            <option value="mechanical">Mechanical</option>
            <option value="electric">Electric</option>
            <option value="rental">Rental / unsure</option>
          </select>
        </label>
        <label>
          Day notes
          <textarea
            name="notes"
            rows={2}
            maxLength={1000}
            defaultValue={currentGuest?.notes}
          />
          <span className="field-help">
            Visible to accepted players. No private or medical details.
          </span>
        </label>
        <Submit>
          {currentGuest
            ? "Save my RSVP"
            : !event.memberInvitesEnabled && !detail.isOrganizer
              ? "Request to join"
              : "Send my RSVP"}
        </Submit>
      </form>
      {currentGuest && currentGuest.status !== "declined" && (
        <form action={withdrawRsvpAction} className="day-withdraw">
          <Hidden name="eventId" value={event.id} />
          {inviteToken && <Hidden name="inviteToken" value={inviteToken} />}
          <ConfirmSubmit message="Withdraw from this day?">
            Withdraw RSVP
          </ConfirmSubmit>
        </form>
      )}
      {currentGuest && !currentGuest.userId && (
        <div className="personal-link">
          <CopyLink path={`/days/${event.id}`} label="Copy day link" />
          {guestEditToken && (
            <>
              <p>Keep this link private: anyone with it can edit your RSVP.</p>
              <CopyLink
                path={`/rsvp/${event.id}?editToken=${encodeURIComponent(guestEditToken)}`}
                label="Copy private edit link"
              />
            </>
          )}
        </div>
      )}
    </section>
  );
}
