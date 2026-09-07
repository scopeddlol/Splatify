import Link from "next/link";
import {
  ArrowUpRight,
  ArrowRight,
  Crosshair,
  Users,
  Zap,
  CalendarDays,
  Check,
  ShieldCheck,
} from "lucide-react";
import { Brand } from "@/components/shell";
import { getUser } from "@/lib/data";

export default async function Home() {
  const user = await getUser();
  return (
    <div className="landing">
      <header className="landing-nav">
        <Brand />
        <nav>
          <Link href="/explore">Explore days</Link>
          <a href="#how-it-works">How it works</a>
          <Link href={user ? "/dashboard" : "/login"}>
            {user ? "My days" : "Sign in"}
          </Link>
          <Link href="/events/new" className="button primary">
            Create a day <ArrowUpRight size={16} />
          </Link>
        </nav>
      </header>
      <main>
        <section className="landing-hero">
          <div className="hero-copy">
            <span className="eyebrow">
              <span className="live-dot" /> GOOD TIMES. ZERO PLANNING CHAOS.
            </span>
            <h1>
              Less group chat.
              <br />
              More <span>game time.</span>
            </h1>
            <p>
              Find a public paintball day near you, join a friend&apos;s game,
              or bring your own crew together. Splatify keeps the people, teams,
              schedule, and little details in one easy-to-follow plan.
            </p>
            <div className="hero-actions">
              <Link href="/explore" className="button primary large">
                Find your next day <ArrowUpRight size={19} />
              </Link>
              <Link href="/events/new" className="text-link">
                Organize your own <ArrowRight size={17} />
              </Link>
            </div>
            <div className="hero-trust">
              <span>
                <Check size={15} /> Free to use
              </span>
              <span>
                <Check size={15} /> No guest accounts needed
              </span>
            </div>
          </div>
          <div
            className="hero-art"
            aria-label="Illustration of a paintball game day plan"
          >
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <div className="art-cross cross-one">+</div>
            <div className="art-cross cross-two">+</div>
            <span className="art-coordinate">51.5072 / GAME ON</span>
            <div className="preview-card">
              <div className="preview-art">
                <span className="tag">EXAMPLE GAME DAY</span>
                <Crosshair size={146} strokeWidth={0.7} />
                <span className="preview-number">01</span>
                <span className="art-bottom">MAKE YOUR SATURDAY COUNT.</span>
              </div>
              <div className="preview-body">
                <span className="eyebrow">THE WEEKEND CREW</span>
                <h2>Operation: good times</h2>
                <p>
                  <CalendarDays size={15} /> Saturday, 10:00 AM{" "}
                  <span className="muted">/</span> Your local field
                </p>
                <div className="preview-divider" />
                <div className="preview-crew">
                  <div className="avatar-stack">
                    <span>JD</span>
                    <span>SK</span>
                    <span>AM</span>
                    <span>+9</span>
                  </div>
                  <span>12 players. One great day.</span>
                  <span className="live-dot" />
                </div>
              </div>
            </div>
            <div className="floating-note">
              <span className="note-icon">
                <Check size={18} />
              </span>
              <div>
                <strong>The crew is coming.</strong>
                <small>One link. Everyone in the loop.</small>
              </div>
            </div>
          </div>
        </section>
        <div className="landing-strip">
          <span>BUILT FOR EVERY KIND OF PLAYER</span>
          <span>
            <Crosshair size={19} /> Mechanical
          </span>
          <span>
            <Zap size={19} /> Electric
          </span>
          <span>
            <ShieldCheck size={19} /> First-timer friendly
          </span>
          <span>
            <Users size={19} /> Whole-crew ready
          </span>
        </div>
        <section id="how-it-works" className="how-section">
          <div className="section-heading">
            <div>
              <span className="eyebrow">
                FROM &quot;WE SHOULD&quot; TO &quot;SEE YOU THERE&quot;
              </span>
              <h2>
                A proper plan.
                <br />
                Without the project management.
              </h2>
            </div>
            <p>
              You bring the people.
              <br />
              We&apos;ll keep the details together.
            </p>
          </div>
          <div className="feature-grid">
            {[
              {
                number: "01",
                title: "Set the scene.",
                text: "Pick a day, choose your field, and make it yours. Build a schedule, sort gear, and put a number on the costs.",
                icon: CalendarDays,
              },
              {
                number: "02",
                title: "Rally your crew.",
                text: "Send one private link. Friends RSVP, pick their marker, and vote on the details. No account required.",
                icon: Users,
              },
              {
                number: "03",
                title: "Show up. Game on.",
                text: "Balance the teams, post the final details, and see who's ready. Less chasing people. More playing.",
                icon: Crosshair,
              },
            ].map((item) => (
              <article className="feature-card" key={item.number}>
                <div>
                  <item.icon size={25} />
                  <span>{item.number}</span>
                </div>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="landing-info" id="for-everyone">
          <div className="landing-info-heading">
            <div>
              <span className="eyebrow">
                ONE ACCOUNT. BOTH SIDES OF THE DAY.
              </span>
              <h2>
                You don&apos;t have to organize
                <br />
                to be part of the action.
              </h2>
            </div>
            <p>
              From first-timers hiring a marker to regular crews booking a
              field, there&apos;s a place for everyone.
            </p>
          </div>
          <div className="landing-roles">
            <article className="landing-role">
              <Users size={28} />
              <h3>Here to play?</h3>
              <p>
                Browse by city and state, or follow a friend&apos;s invitation.
                See where you&apos;re going, when to arrive, and what it might
                cost before joining.
              </p>
              <ul>
                {[
                  "Build your player profile once, then RSVP with your display name and marker preference.",
                  "Keep days you're joining in your account, even when someone else is organizing.",
                  "See your team, open Apple or Google Maps directions, and chat with approved members.",
                  "Not ready for an account? Guest RSVPs are still welcome.",
                ].map((text) => (
                  <li key={text}>
                    <Check size={15} />
                    {text}
                  </li>
                ))}
              </ul>
              <Link href="/explore" className="button primary">
                Explore public days <ArrowUpRight size={16} />
              </Link>
            </article>
            <article className="landing-role">
              <CalendarDays size={28} />
              <h3>Bringing people together?</h3>
              <p>
                Create a public day or keep it invitation-only. Customize the
                colors, cover image, and welcome message, then hand guests a
                clear plan.
              </p>
              <ul>
                {[
                  "Keep the overview, schedule, gear, and players on separate, focused pages.",
                  "Share the planning with co-organizers and give team captains control of their own picks.",
                  "Let your crew invite friends, or require organizer approval for every new join request.",
                  "Post important announcement banners, run polls, and estimate costs. No payments are collected.",
                ].map((text) => (
                  <li key={text}>
                    <Check size={15} />
                    {text}
                  </li>
                ))}
              </ul>
              <Link href="/events/new" className="button secondary">
                Create a day <ArrowUpRight size={16} />
              </Link>
            </article>
          </div>
          <div className="landing-faq">
            <h2>A few things worth knowing.</h2>
            {[
              {
                question: "Is Splatify really free?",
                answer:
                  "Splatify is free to use for planning and joining days. Paintball venue entry, rentals, paint, and travel are separate costs arranged with your organizer or field. The cost numbers in a plan are estimates, not charges.",
              },
              {
                question: "Can I join without creating an account?",
                answer:
                  "Yes. You can browse public days and RSVP using a display name and marker choice. Keep your private RSVP edit link to return on another device. An account keeps your joined days together, saves your player profile, and unlocks the member message board after approval.",
              },
              {
                question: "Who can see my information?",
                answer:
                  "Public visitors see a day preview, not its roster or messages. Accepted players and organizers can see shared display names, avatars, bios, and RSVP details. Your profile's real-name field stays private. Only approved signed-in participants and organizers can use the message board.",
              },
              {
                question: "What happens when a day requires approval?",
                answer:
                  "Your RSVP becomes a join request. An organizer reviews it before you get access to player information and the full plan. Your place is not confirmed until approved, and capacity is checked at approval time.",
              },
              {
                question:
                  "Does Splatify book the field or handle safety waivers?",
                answer:
                  "No. Organizers still need to confirm venue availability, age limits, marker rules, waivers, and payment arrangements directly with the field. Always follow the venue's safety rules.",
              },
            ].map((item) => (
              <details key={item.question}>
                <summary>{item.question}</summary>
                <p>{item.answer}</p>
              </details>
            ))}
          </div>
        </section>
        <section className="closing-cta">
          <Crosshair size={44} />
          <h2>
            Your next great day
            <br />
            starts right here.
          </h2>
          <Link
            href={user ? "/dashboard" : "/signup"}
            className="button primary large"
          >
            {user ? "Open my game days" : "Find your place in the crew"}{" "}
            <ArrowUpRight size={18} />
          </Link>
          <p>Free planning. No guest signup hoops.</p>
        </section>
      </main>
      <footer className="landing-footer">
        <Brand />
        <span>Less organizing. More adrenaline.</span>
        <Link href="/explore">
          See what&apos;s happening near you <ArrowRight size={15} />
        </Link>
      </footer>
    </div>
  );
}
