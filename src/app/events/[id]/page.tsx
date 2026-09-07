import { notFound, redirect } from "next/navigation";
import { getEvent } from "@/lib/data";

export default async function EventPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // getEvent authenticates and verifies management access before the legacy redirect.
  const detail = await getEvent((await params).id);
  if (!detail) notFound();
  const search = await searchParams;
  const notice = new URLSearchParams();
  for (const key of ["success", "error"])
    if (typeof search[key] === "string") notice.set(key, search[key]);
  redirect(`/days/${detail.event.id}${notice.size ? `?${notice}` : ""}`);
}
