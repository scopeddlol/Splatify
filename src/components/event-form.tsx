import type { Event } from "@/lib/types";
import { createEventAction, updateEventAction } from "@/app/actions";
import { Hidden } from "./shell";
import { Submit } from "./ui";
import { ArrowUpRight } from "lucide-react";

export function EventForm({ event }: { event?: Event }) {
  return (
    <form
      action={event ? updateEventAction : createEventAction}
      className="form-stack"
    >
      {event && <Hidden name="eventId" value={event.id} />}
      <div className="form-section">
        <span className="eyebrow">01 / THE BIG PICTURE</span>
        <label>
          Give your day a name
          <input
            name="title"
            required
            maxLength={120}
            defaultValue={event?.title}
            placeholder="e.g. Saturday skirmish, Alex's birthday"
          />
        </label>
        <label>
          The game plan
          <textarea
            name="description"
            rows={3}
            maxLength={5000}
            defaultValue={event?.description}
            placeholder="Set the vibe. Who's coming, what are we playing, and what should everyone know?"
          />
        </label>
        <div className="form-grid">
          <label>
            Date <span className="optional">optional</span>
            <input
              type="date"
              name="date"
              min="2000-01-01"
              max="2200-12-31"
              defaultValue={event?.date}
            />
          </label>
          <label>
            Meet-up time <span className="optional">optional</span>
            <input type="time" name="time" defaultValue={event?.time} />
          </label>
        </div>
        <label>
          Time zone
          <input
            name="timezone"
            required
            defaultValue={event?.timezone || "Europe/London"}
            list="timezones"
            maxLength={80}
          />
          <datalist id="timezones">
            {[
              "Europe/London",
              "Europe/Paris",
              "Europe/Berlin",
              "America/New_York",
              "America/Chicago",
              "America/Denver",
              "America/Los_Angeles",
              "America/Toronto",
              "Australia/Sydney",
              "Pacific/Auckland",
              "Asia/Singapore",
              "UTC",
            ].map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
          <span className="field-help">
            Use an IANA time zone. Every time in this plan uses this zone.
          </span>
        </label>
      </div>
      <div className="form-section">
        <span className="eyebrow">02 / YOUR FIELD. YOUR CREW.</span>
        <label>
          Venue name
          <input
            name="venue"
            maxLength={160}
            defaultValue={event?.venue}
            placeholder="Your favorite paintball field"
          />
        </label>
        <label>
          Address / meeting point
          <input
            name="address"
            maxLength={300}
            defaultValue={event?.address}
            placeholder="Make it easy for the crew to find you"
          />
        </label>
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
              0 = open headcount, up to 1,000 RSVPs.
            </span>
          </label>
          <label>
            Currency
            <select name="currency" defaultValue={event?.currency || "GBP"}>
              {[
                "GBP",
                "USD",
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
              ].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <span className="field-help">
              For estimates only. No payments collected.
            </span>
          </label>
        </div>
      </div>
      <div className="form-section">
        <span className="eyebrow">03 / MAKE IT YOURS</span>
        <fieldset className="theme-picker">
          <legend>Choose your colors</legend>
          {[
            { value: "lime", label: "Acid green" },
            { value: "orange", label: "Hot orange" },
            { value: "violet", label: "Ultraviolet" },
          ].map((theme) => (
            <label
              key={theme.value}
              className={`theme-choice theme-${theme.value}`}
            >
              <input
                type="radio"
                name="theme"
                value={theme.value}
                defaultChecked={(event?.theme || "lime") === theme.value}
              />
              <span className="theme-swatch" />
              {theme.label}
            </label>
          ))}
        </fieldset>
      </div>
      <div className="form-submit">
        <p>
          {event
            ? "Changes are visible to everyone with the invite link."
            : "Start with the basics. Add teams, gear, polls, and a schedule next."}
        </p>
        <Submit>
          {event ? "Save changes" : "Create my day"}
          <ArrowUpRight size={17} />
        </Submit>
      </div>
    </form>
  );
}
