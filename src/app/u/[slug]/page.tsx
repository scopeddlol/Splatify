import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicProfile } from "@/lib/public-profiles";
import { Brand } from "@/components/shell";
import { Pagination } from "@/components/pagination";

export const dynamic = "force-dynamic";

export default async function PublicProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const search = await searchParams;
  const profile = await getPublicProfile(
    slug,
    typeof search.page === "string" ? Number(search.page) : 1,
  );
  if (!profile) notFound();
  return (
    <main className="public-profile">
      <Brand />
      <section className="panel profile-public-card">
        {profile.avatarId ? (
          <Image
            className="profile-portrait"
            src={`/media/${profile.avatarId}`}
            alt=""
            width={112}
            height={112}
            unoptimized
          />
        ) : (
          <span className="profile-portrait profile-initials">
            {profile.name.slice(0, 2).toUpperCase()}
          </span>
        )}
        <div>
          <span className="eyebrow">PLAYER / {profile.slug}</span>
          <h1>{profile.name}</h1>
          {profile.firstName && <span>{profile.firstName}</span>}
          {profile.bio && <p className="profile-bio">{profile.bio}</p>}
          <span className="count-badge">{profile.defaultMarker}</span>
        </div>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <h2>Loadout</h2>
        </div>
        <div className="profile-gear-grid">
          {profile.loadout.map((item, index) => (
            <article className="profile-gear-card" key={index}>
              <span className="eyebrow">{item.category}</span>
              <h3>{item.name}</h3>
              {item.notes && <p>{item.notes}</p>}
            </article>
          ))}
        </div>
        {!profile.loadout.length && (
          <span className="muted">No gear listed.</span>
        )}
      </section>
      <section className="panel">
        <div className="panel-heading">
          <h2>Events attended</h2>
          <span className="count-badge">{profile.attendanceCount}</span>
        </div>
        <div className="profile-attendance">
          {profile.attendance.map((event, index) => (
            <article key={index}>
              {"id" in event ? (
                <>
                  <Link href={`/days/${event.id}`}>{event.title}</Link>
                  {event.date && (
                    <time dateTime={event.date}>{event.date}</time>
                  )}
                </>
              ) : (
                <span>Private event</span>
              )}
            </article>
          ))}
        </div>
        {!profile.attendanceCount && (
          <span className="muted">No confirmed attendance.</span>
        )}
        <Pagination
          page={profile.page}
          total={profile.attendanceCount}
          pageSize={20}
          href={(page) => `/u/${profile.slug}?page=${page}`}
        />
      </section>
    </main>
  );
}
