import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Settings2 } from "lucide-react";
import { getEvent, requireUser } from "@/lib/data";
import { Shell, Notice, Hidden } from "@/components/shell";
import { EventPlan } from "@/components/event-plan";
import { EventForm } from "@/components/event-form";
import { ConfirmSubmit, DeleteButton } from "@/components/ui";
import { deleteEventAction, rotateInviteAction } from "@/app/actions";

export default async function EventPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const detail = await getEvent((await params).id);
  if (!detail) notFound();
  return (
    <Shell user={user}>
      <div className="event-breadcrumb">
        <Link href="/dashboard" className="text-link">
          <ArrowLeft size={15} /> All game days
        </Link>
        <a href="#event-settings" className="text-link">
          <Settings2 size={15} /> Edit day details
        </a>
      </div>
      <Notice params={await searchParams} />
      <EventPlan detail={detail} organizer />
      <section id="event-settings" className="panel event-settings">
        <details>
          <summary>
            <Settings2 size={19} />
            <div>
              <h2>Day details & settings</h2>
              <p>Change the basics, the colors, or who has access.</p>
            </div>
            <span className="count-badge">EDIT</span>
          </summary>
          <div className="settings-content">
            <EventForm event={detail.event} />
            <div className="danger-zone">
              <h3>Invite access</h3>
              <p>
                Replace your invite link if it has been shared too widely. The
                old link will stop working; send the new one to your guests.
              </p>
              <form action={rotateInviteAction}>
                <Hidden name="eventId" value={detail.event.id} />
                <ConfirmSubmit message="Replace the invite link? Everyone will need the new link to view this plan.">
                  Replace invite link
                </ConfirmSubmit>
              </form>
              <div className="danger-row">
                <div>
                  <h3>Delete this day</h3>
                  <p>
                    Permanently remove the plan, RSVPs, and votes. This
                    can&apos;t be undone.
                  </p>
                </div>
                <form action={deleteEventAction}>
                  <Hidden name="eventId" value={detail.event.id} />
                  <DeleteButton
                    label="Delete this day"
                    message={`Permanently delete '${detail.event.title}' and all its RSVPs? This cannot be undone.`}
                  />
                </form>
              </div>
            </div>
          </div>
        </details>
      </section>
    </Shell>
  );
}
