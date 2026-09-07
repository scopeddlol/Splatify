import Link from "next/link";
import Image from "next/image";
import {
  CalendarDays,
  Crosshair,
  LayoutDashboard,
  LogOut,
  Plus,
  Shield,
  ArrowUpRight,
  Compass,
  UserRound,
} from "lucide-react";
import type { User } from "@/lib/types";
import { logoutAction } from "@/app/actions";

export function Brand() {
  return (
    <Link href="/" className="brand" aria-label="Splatify home">
      <Image
        src="/mark.svg"
        width={35}
        height={35}
        alt=""
        className="brand-symbol"
        unoptimized
      />
      splatify<span className="brand-dot">.</span>
    </Link>
  );
}

export function Shell({
  user,
  active = "plans",
  children,
}: {
  user: User | null;
  active?: "plans" | "admin" | "explore" | "profile";
  children: React.ReactNode;
}) {
  return (
    <div className="app-layout">
      <aside className="sidebar">
        <Brand />
        <div className="workspace-label">
          {user ? "YOUR PAINTBALL HOME" : "COME OUT AND PLAY"}
        </div>
        <nav className="side-nav" aria-label="Main navigation">
          <Link
            href="/explore"
            className={active === "explore" ? "active" : ""}
          >
            <Compass size={18} /> Explore days
          </Link>
          {user && (
            <>
              <Link
                href="/dashboard"
                className={active === "plans" ? "active" : ""}
              >
                <LayoutDashboard size={18} /> My plans{" "}
                <span className="nav-dot" />
              </Link>
              <Link
                href="/profile"
                className={active === "profile" ? "active" : ""}
              >
                <UserRound size={18} /> My profile
              </Link>
            </>
          )}
          <Link href="/events/new">
            <Plus size={18} /> Create a day
          </Link>
          {user?.isAdmin && (
            <Link href="/admin" className={active === "admin" ? "active" : ""}>
              <Shield size={18} /> Owner console
            </Link>
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="field-note">
            <Crosshair size={22} />
            <strong>
              Less group chat.
              <br />
              More game time.
            </strong>
            <p>A good day starts with a plan.</p>
            <Link href="/events/new">
              Make it happen <ArrowUpRight size={14} />
            </Link>
          </div>
          {user ? (
            <div className="account">
              <Link href="/profile" aria-label="My profile">
                {user.avatarId ? (
                  <Image
                    className="avatar"
                    src={`/media/${user.avatarId}`}
                    width={38}
                    height={38}
                    alt=""
                    unoptimized
                  />
                ) : (
                  <span className="avatar">
                    {user.name.slice(0, 2).toUpperCase()}
                  </span>
                )}
              </Link>
              <div>
                <strong>{user.name}</strong>
                <small>
                  {user.isAdmin ? "Site owner" : "Player & organizer"}
                </small>
              </div>
              <form action={logoutAction}>
                <button
                  className="icon-button"
                  title="Sign out"
                  aria-label="Sign out"
                >
                  <LogOut size={17} />
                </button>
              </form>
            </div>
          ) : (
            <div className="public-account">
              <Link href="/login" className="text-link">
                Sign in
              </Link>
              <Link href="/signup" className="button primary small">
                Join Splatify
              </Link>
            </div>
          )}
        </div>
      </aside>
      <div className="app-body">
        <header className="topbar">
          <span>
            <span className="live-dot" /> THE GOOD DAYS DON&apos;T PLAN
            THEMSELVES.
          </span>
          <Link href={user ? "/dashboard" : "/explore"}>
            <CalendarDays size={16} />{" "}
            {user ? "My game days" : "Find your next game"}
          </Link>
        </header>
        <main className="main-content">{children}</main>
        <footer className="app-footer">
          <span>Built for the days you talk about all week.</span>
          <span>SPLATIFY / GET OUT & PLAY</span>
        </footer>
      </div>
    </div>
  );
}

export function Notice({
  params,
}: {
  params: Record<string, string | string[] | undefined>;
}) {
  const error = typeof params.error === "string" ? params.error : null;
  const success = typeof params.success === "string" ? params.success : null;
  return (
    <>
      {error && (
        <div className="notice error" role="alert">
          {error}
        </div>
      )}
      {success && (
        <div className="notice success" role="status">
          {success}
        </div>
      )}
    </>
  );
}

export function Empty({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="empty">
      <Crosshair size={26} />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}

export function Hidden({ name, value }: { name: string; value: string }) {
  return <input type="hidden" name={name} value={value} />;
}

export function dateLabel(date: string, options?: Intl.DateTimeFormatOptions) {
  return date
    ? new Intl.DateTimeFormat("en", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
        ...options,
      }).format(new Date(`${date}T12:00:00Z`))
    : "Date to be decided";
}

export function money(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}
