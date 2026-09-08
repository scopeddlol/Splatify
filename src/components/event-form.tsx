"use client";

import { useState } from "react";
import type { Event } from "@/lib/types";
import { createEventAction, updateEventAction } from "@/app/actions";
import { TIME_ZONES, timeZoneLabel } from "@/lib/presentation";
import { Submit } from "./ui";
import { SettingsToggle, SliderField } from "./settings-controls";

export function EventForm({
  event,
  invitationOnly = false,
  sponsorsAvailable = false,
}: {
  event?: Event;
  invitationOnly?: boolean;
  sponsorsAvailable?: boolean;
}) {
  const [visibility, setVisibility] = useState(event?.visibility || "private");
  const [accent, setAccent] = useState(event?.accentColor || "#d5fb51");
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
              />
            </label>
          </section>
          <section className="form-section">
            <fieldset className="day-options day-segmented">
              <legend>Visibility</legend>
              <label>
                <input
                  type="radio"
                  name="visibility"
                  value="private"
                  checked={visibility === "private"}
                  onChange={() => setVisibility("private")}
                />
                Private
              </label>
              <label>
                <input
                  type="radio"
                  name="visibility"
                  value="public"
                  checked={visibility === "public"}
                  onChange={() => setVisibility("public")}
                />
                Public
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
            <SettingsToggle
              name="memberInvitesEnabled"
              label="Members can invite"
              defaultChecked={event?.memberInvitesEnabled ?? true}
            />
            <input type="hidden" name="sponsorsEnabledPresent" value="true" />
            {!sponsorsAvailable && event?.sponsorsEnabled && (
              <input type="hidden" name="sponsorsEnabled" value="true" />
            )}
            <SettingsToggle
              name="sponsorsEnabled"
              label="Sponsors"
              description={
                !sponsorsAvailable ? "Disabled site-wide" : undefined
              }
              defaultChecked={event?.sponsorsEnabled ?? false}
              disabled={!sponsorsAvailable}
            />
          </section>
          <details className="day-advanced">
            <summary>Player limit, costs &amp; appearance</summary>
            <div className="form-stack inset-form">
              <div className="form-grid">
                <SliderField
                  name="capacity"
                  label="Player limit (0 = open)"
                  min={0}
                  max={1000}
                  defaultValue={event?.capacity ?? 0}
                />
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
                </label>
              </div>
              <label>
                Accent color{" "}
                <span
                  className="day-accent-preview"
                  style={{ backgroundColor: accent }}
                />
                <input
                  type="color"
                  name="accentColor"
                  value={accent}
                  onChange={(e) => setAccent(e.target.value)}
                />
              </label>
              {!event && invitationFields}
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
