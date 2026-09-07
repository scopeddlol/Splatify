import Link from "next/link";
import type { EventDetail } from "@/lib/types";
import { submitRsvpAction } from "@/app/actions";
import { Hidden } from "./shell";
import { CopyLink, Submit } from "./ui";

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
          Your request is waiting for organizer approval. You can update your
          RSVP here while you wait.
        </p>
      ) : !event.memberInvitesEnabled &&
        !currentGuest &&
        !detail.isOrganizer ? (
        <p className="day-pending">
          New join requests need organizer approval. Your place is not confirmed
          until approved.
        </p>
      ) : (
        <p>
          {currentGuest
            ? "Plans change. Keep your answer up to date."
            : "Let the organizer know if you can make it."}
        </p>
      )}
      {!viewer && (
        <div className="day-signup">
          <strong>Keep your days in one place.</strong>
          <p>
            Create an account to save your RSVP across devices and join the
            member message board after approval. You can also RSVP as a guest.
          </p>
          <div className="day-actions">
            <Link
              className="button secondary"
              href={`/signup?next=${encodeURIComponent(next)}`}
            >
              Sign up &amp; return here
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
        <p className="day-pending">
          Save your RSVP below to link this guest RSVP to your account.
        </p>
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
          <select name="status" defaultValue={currentGuest?.status || "going"}>
            <option value="going">Going</option>
            <option value="maybe">Maybe</option>
            <option value="declined">Cannot make it</option>
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
            <option value="rental">Rental / not sure yet</option>
          </select>
        </label>
        <label>
          Anything players should know?
          <textarea
            name="notes"
            rows={2}
            maxLength={1000}
            defaultValue={currentGuest?.notes}
          />
          <span className="field-help">
            Shared with accepted players and organizers. Do not include private
            or medical information.
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
      {currentGuest && !currentGuest.userId && (
        <div className="personal-link">
          <strong>Keep access to your RSVP</strong>
          <p>
            This browser remembers your RSVP. Bookmark the day to return here on
            this device.
          </p>
          <CopyLink path={`/days/${event.id}`} label="Copy day link" />
          {guestEditToken && (
            <>
              <p>
                Your personal edit link works on another device. Keep it
                private: anyone with it can edit your guest RSVP.
              </p>
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
