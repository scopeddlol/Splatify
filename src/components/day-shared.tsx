import Image from "next/image";
import Link from "next/link";
import type { Event, EventDetail } from "@/lib/types";
import { Hidden, dateLabel } from "./shell";
import { DeleteButton } from "./ui";
import { clockLabel, timeZoneLabel } from "@/lib/presentation";

export function DayFields({
  eventId,
  section = "overview",
}: {
  eventId: string;
  section?: string;
}) {
  return (
    <>
      <Hidden name="eventId" value={eventId} />
      <Hidden name="returnSection" value={section} />
    </>
  );
}

export function DayRemove({
  eventId,
  itemId,
  action,
  label,
  section = "overview",
  name = "itemId",
}: {
  eventId: string;
  itemId: string;
  action: (form: FormData) => Promise<void>;
  label: string;
  section?: string;
  name?: string;
}) {
  return (
    <form action={action}>
      <DayFields eventId={eventId} section={section} />
      <Hidden name={name} value={itemId} />
      <DeleteButton label={label} />
    </form>
  );
}

export function DayCover({
  mediaId,
  title,
  inviteToken,
}: {
  mediaId: string | null;
  title: string;
  inviteToken?: string;
}) {
  if (!mediaId) return null;
  return (
    <Image
      className="day-cover"
      src={`/media/${mediaId}${inviteToken ? `?inviteToken=${encodeURIComponent(inviteToken)}` : ""}`}
      alt={title}
      width={1400}
      height={600}
      unoptimized
    />
  );
}

export function DayPerson({
  name,
  avatarId,
  bio,
}: {
  name: string;
  avatarId: string | null;
  bio?: string;
}) {
  return (
    <div className="day-person">
      {avatarId ? (
        <Image
          className="avatar"
          src={`/media/${avatarId}`}
          width={44}
          height={44}
          alt={`${name}'s avatar`}
          unoptimized
        />
      ) : (
        <span className="avatar" aria-hidden="true">
          {name.slice(0, 2).toUpperCase()}
        </span>
      )}
      <div>
        <strong>{name}</strong>
        {bio && <p className="day-bio day-clamp">{bio}</p>}
      </div>
    </div>
  );
}

export function DayBrief({ event }: { event: Event }) {
  return (
    <div className="day-facts">
      <span>{dateLabel(event.date)}</span>
      <span>
        {clockLabel(event.time)} <small>{timeZoneLabel(event.timezone)}</small>
      </span>
      <span>{event.venue || "Venue to be confirmed"}</span>
      {(event.city || event.state) && (
        <span>
          {[event.city, event.state, event.country].filter(Boolean).join(", ")}
        </span>
      )}
    </div>
  );
}

export function DayDirections({ event }: { event: Event }) {
  const destination = encodeURIComponent(
    [event.address, event.city, event.state, event.country]
      .filter(Boolean)
      .join(", "),
  );
  return (
    <section className="panel day-directions">
      <h2>Getting there</h2>
      <h3>{event.venue || "Venue to be confirmed"}</h3>
      <p>{event.address || "Address TBD"}</p>
      {event.address ? (
        <div className="day-actions">
          <a
            className="button secondary"
            href={`https://www.google.com/maps/dir/?api=1&destination=${destination}`}
            target="_blank"
            rel="noreferrer"
          >
            Google Maps
          </a>
          <a
            className="button secondary"
            href={`https://maps.apple.com/?daddr=${destination}&dirflg=d`}
            target="_blank"
            rel="noreferrer"
          >
            Apple Maps
          </a>
        </div>
      ) : null}
    </section>
  );
}

export function DayNav({
  detail,
  section,
}: {
  detail: EventDetail;
  section: string;
}) {
  const sections = [
    ["overview", "Overview"],
    ...(detail.canViewRoster
      ? [
          ["players", "Players"],
          ["teams", "Teams"],
          ["schedule", "Schedule"],
          ["gear", "Gear & costs"],
        ]
      : []),
    ...(detail.canMessage ? [["messages", "Messages"]] : []),
    ...(detail.isOrganizer ? [["settings", "Settings"]] : []),
  ];
  return (
    <nav className="day-nav" aria-label="Day sections">
      {sections.map(([key, label]) => (
        <Link
          key={key}
          href={`/days/${detail.event.id}${key === "overview" ? "" : `/${key}`}`}
          aria-current={section === key ? "page" : undefined}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
