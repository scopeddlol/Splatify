import Link from "next/link";
import { notFound } from "next/navigation";
import { getSharedEvent, getSiteSettings } from "@/lib/data";
import { Brand, Notice, Hidden } from "@/components/shell";
import { EventPlan } from "@/components/event-plan";
import { Submit } from "@/components/ui";
import { claimGuestAction } from "@/app/actions";
import { ArrowUpRight, LockKeyhole } from "lucide-react";

export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const token = (await params).token;
  const detail = await getSharedEvent(token);
  if (!detail) notFound();
  const search = await searchParams;
  const settings = await getSiteSettings();
  return (
    <div className="guest-layout">
      <header className="guest-header">
        <Brand />
        <div>
          <span className="eyebrow">GOOD DAYS ARE BETTER TOGETHER</span>
          <Link
            href={detail.isOwner ? `/events/${detail.event.id}` : "/dashboard"}
            className="button secondary"
          >
            {detail.isOwner ? "Organizer view" : "My account"}
            <ArrowUpRight size={15} />
          </Link>
        </div>
      </header>
      <main className="guest-main">
        <Notice params={search} />
        {settings.siteNotice && (
          <div className="notice">{settings.siteNotice}</div>
        )}
        {typeof search.editToken === "string" && (
          <section className="panel claim-panel">
            <LockKeyhole size={25} />
            <div>
              <h2>Open your personal RSVP</h2>
              <p>
                This private link lets you edit the RSVP it belongs to. Only
                continue if it&apos;s yours.
              </p>
            </div>
            <form action={claimGuestAction}>
              <Hidden name="inviteToken" value={token} />
              <Hidden name="editToken" value={search.editToken} />
              <Submit>Unlock my RSVP</Submit>
            </form>
          </section>
        )}
        <EventPlan detail={detail} />
      </main>
      <footer className="landing-footer">
        <Brand />
        <span>Your crew. Your field. One great day.</span>
        <Link href="/signup">
          Plan your own day <ArrowUpRight size={15} />
        </Link>
      </footer>
    </div>
  );
}
