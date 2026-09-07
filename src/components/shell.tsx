import Link from "next/link";
import {
  CalendarDays,
  Crosshair,
  LayoutDashboard,
  LogOut,
  Plus,
  Shield,
  ArrowUpRight,
} from "lucide-react";
import type { User } from "@/lib/types";
import { logoutAction } from "@/app/actions";

export function Brand() {
  return (
    <Link href="/" className="brand" aria-label="Splatify home">
      <span className="brand-mark">
        <Crosshair size={23} strokeWidth={2.5} />
      </span>
      splatify<span className="brand-dot">.</span>
    </Link>
  );
}

export function Shell({
  user,
  active = "plans",
  children,
}: {
  user: User;
  active?: "plans" | "admin";
  children: React.ReactNode;
}) {
  return (
    <div className="app-layout">
      <aside className="sidebar">
        <Brand />
        <div className="workspace-label">YOUR BASECAMP</div>
        <nav className="side-nav" aria-label="Main navigation">
          <Link
            href="/dashboard"
            className={active === "plans" ? "active" : ""}
          >
            <LayoutDashboard size={18} /> My plans <span className="nav-dot" />
          </Link>
          <Link href="/events/new">
            <Plus size={18} /> Create a day
          </Link>
          {user.isAdmin && (
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
          <div className="account">
            <span className="avatar">
              {user.name.slice(0, 2).toUpperCase()}
            </span>
            <div>
              <strong>{user.name}</strong>
              <small>
                {user.isAdmin ? "Site owner" : "Game day organizer"}
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
        </div>
      </aside>
      <div className="app-body">
        <header className="topbar">
          <span>
            <span className="live-dot" /> THE GOOD DAYS DON&apos;T PLAN
            THEMSELVES.
          </span>
          <Link href="/dashboard">
            <CalendarDays size={16} /> Your field. Your crew.
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
