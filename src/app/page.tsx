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

export default function Home() {
  return (
    <div className="landing">
      <header className="landing-nav">
        <Brand />
        <nav>
          <a href="#how-it-works">How it works</a>
          <Link href="/login">Sign in</Link>
          <Link href="/signup" className="button primary">
            Plan a day <ArrowUpRight size={16} />
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
              Get your crew out of the chat and onto the field. The free home
              for your next paintball day, from the first invite to the final
              game.
            </p>
            <div className="hero-actions">
              <Link href="/signup" className="button primary large">
                Let&apos;s make a day of it <ArrowUpRight size={19} />
              </Link>
              <a href="#how-it-works" className="text-link">
                Take a look <ArrowRight size={17} />
              </a>
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
        <section className="closing-cta">
          <Crosshair size={44} />
          <h2>
            Your next great day
            <br />
            starts right here.
          </h2>
          <Link href="/signup" className="button primary large">
            Get the crew together <ArrowUpRight size={18} />
          </Link>
          <p>Free planning. No guest signup hoops.</p>
        </section>
      </main>
      <footer className="landing-footer">
        <Brand />
        <span>Less organizing. More adrenaline.</span>
        <Link href="/login">
          Already part of the crew? Sign in <ArrowRight size={15} />
        </Link>
      </footer>
    </div>
  );
}
