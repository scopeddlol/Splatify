import Link from "next/link";
import {
  ArrowUpRight,
  Crosshair,
  Users,
  CalendarDays,
  Check,
  Shield,
  MessageSquare,
  Compass,
} from "lucide-react";
import { Brand } from "@/components/shell";
import { getUser, getSiteSettings } from "@/lib/data";
import { TeamBadge } from "@/components/team-badge";

export default async function Home() {
  const [user, site] = await Promise.all([getUser(), getSiteSettings()]);
  const destination = site.discoveryEnabled
    ? "/explore"
    : user
      ? "/dashboard"
      : "/signup";
  const title = site.landingTitle || "Less group chat. More game time.";
  const split = title.lastIndexOf(". ");
  return (
    <div className="landing landing-refined">
      <header className="landing-nav">
        <Brand />
        <nav>
          {site.discoveryEnabled && <Link href="/explore">Explore</Link>}
          <Link href={user ? "/dashboard" : "/login"}>
            {user ? "My days" : "Sign in"}
          </Link>
          <Link href="/events/new" className="button primary">
            Create a day <ArrowUpRight size={17} />
          </Link>
        </nav>
      </header>
      {site.siteNotice && (
        <div className="landing-announcement" role="status">
          <span className="live-dot" />
          {site.siteNotice}
        </div>
      )}
      <main>
        <section className="landing-hero">
          <div className="hero-copy">
            <span className="eyebrow">PAINTBALL. PLANNED.</span>
            <h1>
              {split >= 0 ? (
                <>
                  {title.slice(0, split + 1)}
                  <br />
                  <span>{title.slice(split + 2)}</span>
                </>
              ) : (
                title
              )}
            </h1>
            <p>
              {site.landingSubtitle ||
                "Find a paintball day or bring your own crew."}
            </p>
            <div className="hero-actions">
              <Link href={destination} className="button primary large">
                {site.landingCta || "Find a day"}
                <ArrowUpRight size={20} />
              </Link>
              <a href="#how-it-works" className="text-link">
                How it works
              </a>
            </div>
            <div className="hero-trust">
              <span>
                <Check size={16} /> Free to use
              </span>
              <span>
                <Check size={16} /> Guest RSVPs welcome
              </span>
            </div>
          </div>
          <div className="hero-art" aria-label="Example paintball day roster">
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <div className="art-cross cross-one">+</div>
            <div className="art-cross cross-two">+</div>
            <div className="preview-card">
              <div className="preview-art">
                <span className="tag">EXAMPLE DAY</span>
                <Crosshair size={160} strokeWidth={0.7} />
                <span className="preview-number">01</span>
              </div>
              <div className="preview-body">
                <span className="eyebrow">SATURDAY / 10:00 AM</span>
                <h2>Operation: good times</h2>
                <div className="preview-teams">
                  <div>
                    <TeamBadge logoIcon="shield" color="#d5fb51" />
                    <span>
                      Vanguard<small>6 players</small>
                    </span>
                  </div>
                  <div>
                    <TeamBadge logoIcon="skull" color="#ffad72" />
                    <span>
                      Outlaws<small>6 players</small>
                    </span>
                  </div>
                </div>
                <div className="preview-divider" />
                <div className="preview-crew">
                  <div className="avatar-stack">
                    <span>JD</span>
                    <span>SK</span>
                    <span>AM</span>
                    <span>+9</span>
                  </div>
                  <span>Your crew. Ready to play.</span>
                </div>
              </div>
            </div>
            <div className="floating-note">
              <span className="note-icon">
                <Check size={19} />
              </span>
              <div>
                <strong>You&apos;re on the roster.</strong>
                <small>See you at the field.</small>
              </div>
            </div>
          </div>
        </section>
        <section className="how-section" id="how-it-works">
          <div className="section-heading">
            <div>
              <span className="eyebrow">LESS ADMIN. MORE ACTION.</span>
              <h2>One day. Everything sorted.</h2>
            </div>
          </div>
          <div className="feature-grid">
            {[
              {
                icon: Compass,
                title: "Find your game.",
                text: "Explore local days or open a friend's invitation.",
              },
              {
                icon: Users,
                title: "Build your crew.",
                text: "RSVP, pick teams, and share the plan.",
              },
              {
                icon: CalendarDays,
                title: "Show up ready.",
                text: "Your schedule, gear, and directions in one place.",
              },
            ].map((item) => (
              <article className="feature-card" key={item.title}>
                <item.icon size={29} />
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="landing-compact">
          <div className="compact-heading">
            <Shield size={31} />
            <h2>Your crew. Your rules.</h2>
          </div>
          <div className="compact-features">
            <span>Private or public days</span>
            <span>Custom team badges</span>
            <span>Co-organizers & captains</span>
            <span>
              <MessageSquare size={17} /> Member chat
            </span>
          </div>
          <Link href="/events/new" className="button secondary">
            Plan a day <ArrowUpRight size={17} />
          </Link>
        </section>
        <section className="landing-faq compact-faq">
          <h2>Quick answers.</h2>
          {[
            {
              q: "Do guests need an account?",
              a: "No. An account saves your days, profile, and loadout, and unlocks member chat.",
            },
            {
              q: "Who can see my profile?",
              a: "Your crew sees your player card. A public profile is optional; private events are never named there.",
            },
            {
              q: "Does Splatify book the field?",
              a: "No. Arrange bookings, waivers, and payments with the venue. Costs shown here are estimates.",
            },
          ].map((item) => (
            <details key={item.q}>
              <summary>{item.q}</summary>
              <p>{item.a}</p>
            </details>
          ))}
        </section>
      </main>
      <footer className="landing-footer">
        <Brand />
        <span>Less organizing. More playing.</span>
        <Link href={destination}>
          {user ? "My days" : "Get started"}
          <ArrowUpRight size={16} />
        </Link>
      </footer>
    </div>
  );
}
