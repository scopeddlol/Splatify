import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireUser, getSiteSettings } from "@/lib/data";
import { Shell, Notice } from "@/components/shell";
import { EventForm } from "@/components/event-form";

export default async function NewEvent({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser("/events/new");
  const settings = await getSiteSettings();
  return (
    <Shell user={user} active="plans">
      <div className="narrow-page day-page">
        <Link href="/dashboard" className="text-link">
          <ArrowLeft size={16} /> All game days
        </Link>
        <div className="page-heading">
          <div>
            <h1>Create a day</h1>
            <p>
              Start with a name, a place, and a date. Add the rest when you are
              ready.
            </p>
          </div>
        </div>
        <Notice params={await searchParams} />
        <div className="panel">
          {settings.eventCreationEnabled ? (
            <EventForm />
          ) : (
            <p>
              New event creation is temporarily paused by the site owner.
              Existing plans are still available.
            </p>
          )}
        </div>
      </div>
    </Shell>
  );
}
