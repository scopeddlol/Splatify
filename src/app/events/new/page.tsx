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
  const user = await requireUser();
  const settings = await getSiteSettings();
  return (
    <Shell user={user}>
      <div className="narrow-page">
        <Link href="/dashboard" className="text-link">
          <ArrowLeft size={16} /> All game days
        </Link>
        <div className="page-heading">
          <div>
            <span className="eyebrow">FROM AN IDEA TO A GREAT DAY</span>
            <h1>Let&apos;s make a plan.</h1>
            <p>A few details now. A whole lot of good times later.</p>
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
