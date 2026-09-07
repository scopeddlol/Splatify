import { notFound } from "next/navigation";
import { getUser } from "@/lib/data";
import { idSchema, tokenSchema } from "@/lib/validation";
import { Shell, Hidden, Notice } from "@/components/shell";
import { Submit } from "@/components/ui";
import { claimGuestAction } from "@/app/actions";

export default async function PersonalRsvp({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const search = await searchParams;
  if (
    !idSchema.safeParse(id).success ||
    !tokenSchema.safeParse(search.editToken).success
  )
    notFound();
  const user = await getUser();
  return (
    <Shell user={user}>
      <div className="narrow-page">
        <Notice params={search} />
        <section className="panel form-stack">
          <span className="eyebrow">YOUR PRIVATE RSVP LINK</span>
          <h1>Pick up where you left off.</h1>
          <p>
            This link unlocks a guest RSVP on this device. Continue only if it
            belongs to you. If the RSVP has since been linked to an account,
            sign in to that account instead.
          </p>
          <form action={claimGuestAction}>
            <Hidden name="eventId" value={id} />
            <Hidden name="editToken" value={search.editToken as string} />
            <Submit>Open my RSVP</Submit>
          </form>
        </section>
      </div>
    </Shell>
  );
}
