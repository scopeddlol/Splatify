"use client";

import { useState } from "react";
import type { Event } from "@/lib/types";
import { createEventAction, updateEventAction } from "@/app/actions";
import { TIME_ZONES, timeZoneLabel } from "@/lib/presentation";
import { Submit } from "./ui";

export function EventForm({
  event,
  invitationOnly = false,
}: {
  event?: Event;
  invitationOnly?: boolean;
}) {
  const [visibility, setVisibility] = useState(event?.visibility || "private");
  const timezone = event?.timezone || "America/New_York";
  const theme = event?.theme === "forest" ? "lime" : event?.theme || "lime";
  const invitationFields = (
    <>
      <label>
        Welcome headline
        <input
          name="invitationHeading"
          maxLength={160}
          defaultValue={event?.invitationHeading || "You are invited!"}
        />
      </label>
      <label>
        Personal welcome message
        <textarea
          name="invitationMessage"
          rows={4}
          maxLength={3000}
          defaultValue={event?.invitationMessage}
          placeholder="Tell your guests why you would love to see them there."
        />
      </label>
    </>
  );
  return (
    <form
      action={event ? updateEventAction : createEventAction}
      className="form-stack day-event-form"
    >
      {event && <input type="hidden" name="eventId" value={event.id} />}
      <input type="hidden" name="returnSection" value="settings" />
      <input type="hidden" name="theme" value={theme} />
      {invitationOnly && event ? (
        <>
          {(
            [
              "title",
              "description",
              "date",
              "time",
              "timezone",
              "venue",
              "address",
              "capacity",
              "currency",
            ] as const
          ).map((name) => (
            <input key={name} type="hidden" name={name} value={event[name]} />
          ))}
          {invitationFields}
        </>
      ) : (
        <>
          <section className="form-section">
            <h2>The basics</h2>
            <label>
              Day name
              <input
                name="title"
                required
                maxLength={120}
                defaultValue={event?.title}
                placeholder="Saturday at the field"
              />
            </label>
            <label>
              About the day
              <textarea
                name="description"
                rows={3}
                maxLength={5000}
                defaultValue={event?.description}
                placeholder="Who is it for, and what should players know?"
              />
            </label>
            <div className="form-grid">
              <label>
                Date (optional)
                <input
                  type="date"
                  name="date"
                  min="2000-01-01"
                  max="2200-12-31"
                  defaultValue={event?.date}
                />
              </label>
              <label>
                Meet-up time (optional)
                <input type="time" name="time" defaultValue={event?.time} />
              </label>
            </div>
            <label>
              Time zone
              <select name="timezone" defaultValue={timezone} required>
                {!TIME_ZONES.some((zone) => zone.value === timezone) && (
                  <option value={timezone}>{timeZoneLabel(timezone)}</option>
                )}
                {TIME_ZONES.map((zone) => (
                  <option key={zone.value} value={zone.value}>
                    {zone.label}
                  </option>
                ))}
              </select>
              <span className="field-help">
                All schedule times use this time zone.
              </span>
            </label>
            <label>
              Venue
              <input
                name="venue"
                maxLength={160}
                defaultValue={event?.venue}
                placeholder="Field or meeting place"
              />
            </label>
            <label>
              Street address
              <input
                name="address"
                maxLength={300}
                defaultValue={event?.address}
                placeholder="A real address for driving directions"
              />
            </label>
          </section>
          <section className="form-section">
            <h2>Who can join?</h2>
            <fieldset className="day-options">
              <legend>Visibility</legend>
              <label>
                <input
                  type="radio"
                  name="visibility"
                  value="private"
                  checked={visibility === "private"}
                  onChange={() => setVisibility("private")}
                />
                Private{" "}
                <span>Only people with an invitation can request to join.</span>
              </label>
              <label>
                <input
                  type="radio"
                  name="visibility"
                  value="public"
                  checked={visibility === "public"}
                  onChange={() => setVisibility("public")}
                />
                Public{" "}
                <span>
                  Show a preview in Explore. The player list stays private.
                </span>
              </label>
            </fieldset>
            <div className="form-grid">
              <label>
                City{visibility === "public" ? " (required)" : ""}
                <input
                  name="city"
                  maxLength={100}
                  required={visibility === "public"}
                  defaultValue={event?.city}
                  autoComplete="address-level2"
                />
              </label>
              <label>
                State / region{visibility === "public" ? " (required)" : ""}
                <input
                  name="state"
                  maxLength={100}
                  required={visibility === "public"}
                  defaultValue={event?.state}
                  autoComplete="address-level1"
                />
              </label>
            </div>
            <label>
              Country
              <input
                name="country"
                maxLength={100}
                defaultValue={event?.country}
                autoComplete="country-name"
              />
            </label>
            <input
              type="hidden"
              name="memberInvitesEnabledPresent"
              value="true"
            />
            <label className="checkbox-label">
              <input
                type="checkbox"
                name="memberInvitesEnabled"
                defaultChecked={event?.memberInvitesEnabled ?? true}
              />
              Let members invite others
            </label>
            <p className="field-help">
              When off, new join requests need organizer approval, and only
              organizers can share the invitation.
            </p>
          </section>
          <details className="day-advanced" open={event ? true : undefined}>
            <summary>Player limit, costs &amp; appearance</summary>
            <div className="form-stack inset-form">
              <div className="form-grid">
                <label>
                  Player limit
                  <input
                    type="number"
                    name="capacity"
                    min={0}
                    max={1000}
                    defaultValue={event?.capacity ?? 0}
                    required
                  />
                  <span className="field-help">
                    0 means no set limit, up to 1,000 RSVPs.
                  </span>
                </label>
                <label>
                  Currency
                  <select
                    name="currency"
                    defaultValue={event?.currency || "USD"}
                  >
                    {[
                      "USD",
                      "GBP",
                      "EUR",
                      "CAD",
                      "AUD",
                      "NZD",
                      "ZAR",
                      "SEK",
                      "NOK",
                      "DKK",
                      "CHF",
                      "JPY",
                      "SGD",
                    ].map((currency) => (
                      <option key={currency}>{currency}</option>
                    ))}
                  </select>
                  <span className="field-help">
                    Estimates only. No payments collected.
                  </span>
                </label>
              </div>
              <label>
                Accent color
                <input
                  type="color"
                  name="accentColor"
                  defaultValue={
                    event?.accentColor ||
                    (theme === "orange"
                      ? "#ffad72"
                      : theme === "violet"
                        ? "#c0a5ff"
                        : "#d5fb51")
                  }
                />
              </label>
              {!event && invitationFields}
              {!event && (
                <p className="field-help">
                  Add a day cover and a separate invitation image in Settings
                  after creating your day.
                </p>
              )}
            </div>
          </details>
        </>
      )}
      <div className="form-submit">
        <Submit>
          {event
            ? invitationOnly
              ? "Save invitation welcome"
              : "Save day details"
            : "Create my day"}
        </Submit>
      </div>
    </form>
  );
}
