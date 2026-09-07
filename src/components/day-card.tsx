import Link from "next/link";
import Image from "next/image";
import {
  CalendarDays,
  MapPin,
  Users,
  ArrowUpRight,
  Crosshair,
} from "lucide-react";
import type { Event } from "@/lib/types";
import { eventStyle, clockLabel } from "@/lib/presentation";
import { dateLabel } from "./shell";

export function DayCard({
  event,
}: {
  event: Event & { goingCount: number; approval?: string | null };
}) {
  return (
    <Link
      href={`/days/${event.id}`}
      className="event-card community-card"
      style={eventStyle(event.accentColor)}
    >
      <div className="event-card-art">
        {event.coverId ? (
          <Image
            className="discovery-cover"
            src={`/media/${event.coverId}`}
            alt=""
            width={600}
            height={300}
            unoptimized
          />
        ) : (
          <Crosshair size={118} strokeWidth={0.8} />
        )}
        <span className="tag">
          {event.approval === "pending"
            ? "Awaiting approval"
            : event.visibility === "public"
              ? "Public day"
              : "Private day"}
        </span>
      </div>
      <div className="event-card-body">
        <div className="card-title">
          <h3>{event.title}</h3>
          <ArrowUpRight size={20} />
        </div>
        <p>
          <CalendarDays size={15} />
          {dateLabel(event.date)}
          {event.time ? ` / ${clockLabel(event.time)}` : ""}
        </p>
        <p>
          <MapPin size={15} />
          {[event.city, event.state].filter(Boolean).join(", ") ||
            event.venue ||
            "Location to be confirmed"}
        </p>
        <div className="card-bottom">
          <span>
            <Users size={15} />
            {event.goingCount}
            {event.capacity ? ` / ${event.capacity}` : ""} going
          </span>
          <span>
            {!event.memberInvitesEnabled
              ? "Approval required"
              : event.capacity && event.goingCount >= event.capacity
                ? "Currently full"
                : "View day"}
          </span>
        </div>
      </div>
    </Link>
  );
}
