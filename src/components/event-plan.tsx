import Link from "next/link";
import {
  CalendarDays,
  Check,
  Clock3,
  Crosshair,
  MapPin,
  Users,
  Zap,
  Megaphone,
  Package,
  ListChecks,
  BarChart3,
  Plus,
  ArrowUpRight,
  ShieldCheck,
} from "lucide-react";
import type { EventDetail } from "@/lib/types";
import { Hidden, Empty, dateLabel, money } from "./shell";
import { CopyLink, DeleteButton, Submit } from "./ui";
import {
  addScheduleAction,
  deleteScheduleAction,
  addGearAction,
  deleteGearAction,
  addAnnouncementAction,
  deleteAnnouncementAction,
  assignTeamAction,
  addPollAction,
  deletePollAction,
  voteAction,
  submitRsvpAction,
} from "@/app/actions";

function Remove({
  eventId,
  itemId,
  action,
  label,
}: {
  eventId: string;
  itemId: string;
  action: (data: FormData) => Promise<void>;
  label: string;
}) {
  return (
    <form action={action}>
      <Hidden name="eventId" value={eventId} />
      <Hidden name="itemId" value={itemId} />
      <DeleteButton label={label} />
    </form>
  );
}

export function EventPlan({
  detail,
  organizer = false,
}: {
  detail: EventDetail;
  organizer?: boolean;
}) {
  const {
    event,
    guests,
    schedule,
    gear,
    announcements,
    polls,
    currentGuest,
    guestEditToken,
  } = detail;
  const going = guests.filter((g) => g.status === "going");
  const maybe = guests.filter((g) => g.status === "maybe");
  const cost = gear.reduce((sum, item) => sum + item.cost, 0);
  const teams = [...new Set(going.map((g) => g.team).filter(Boolean))];
  return (
    <div className={`event-plan theme-${event.theme}`}>
      <section className="plan-hero">
        <div className="plan-hero-top">
          <span className="tag">
            {organizer
              ? "YOUR GAME DAY / ORGANIZER"
              : "YOU'RE INVITED / GAME DAY"}
          </span>
          <span className="eyebrow">
            {event.date
              ? dateLabel(event.date, { weekday: "long" })
              : "GOOD DAYS IN THE MAKING"}
          </span>
        </div>
        <div className="plan-hero-copy">
          <h1>{event.title}</h1>
          <p>
            {event.description ||
              "A field, your favorite people, and a day to remember. Let's get the crew together."}
          </p>
        </div>
        <Crosshair className="plan-target" size={250} strokeWidth={0.6} />
        <div className="plan-meta">
          <span>
            <CalendarDays size={17} />
            {dateLabel(event.date)}
          </span>
          <span>
            <Clock3 size={17} />
            {event.time || "Time TBD"}
            <small>{event.timezone}</small>
          </span>
          <span>
            <MapPin size={17} />
            {event.venue || "Field TBD"}
          </span>
        </div>
      </section>
      <nav className="plan-nav" aria-label="Plan sections">
        <a href="#crew">
          <Users size={15} /> The crew
        </a>
        <a href="#schedule">
          <ListChecks size={15} /> Schedule
        </a>
        <a href="#gear">
          <Package size={15} /> Gear & costs
        </a>
        <a href="#polls">
          <BarChart3 size={15} /> Polls
        </a>
        <a href="#updates">
          <Megaphone size={15} /> Updates
        </a>
      </nav>
      <div className="plan-columns">
        <div className="plan-main">
          <section className="panel" id="crew">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">GOOD COMPANY INCLUDED</span>
                <h2>
                  The crew <span className="count-badge">{guests.length}</span>
                </h2>
              </div>
              <Users size={21} className="muted" />
            </div>
            <div className="crew-stats">
              <span>
                <i className="status-dot going" />
                {going.length} going
              </span>
              <span>
                <i className="status-dot maybe" />
                {maybe.length} maybe
              </span>
              <span>
                {guests.length - going.length - maybe.length} can&apos;t make it
              </span>
              {event.capacity > 0 && (
                <span className="crew-capacity">
                  {Math.max(0, event.capacity - going.length)} spots left
                </span>
              )}
            </div>
            {guests.length ? (
              <div className="guest-list">
                {guests.map((guest) => (
                  <div
                    className={`guest-row ${guest.status === "declined" ? "declined" : ""}`}
                    key={guest.id}
                  >
                    <span
                      className={`avatar ${guest.marker === "electric" ? "electric-avatar" : ""}`}
                    >
                      {guest.name.slice(0, 2).toUpperCase()}
                    </span>
                    <div className="guest-info">
                      <strong>
                        {guest.name}
                        {currentGuest?.id === guest.id && (
                          <small className="you-label">YOU</small>
                        )}
                      </strong>
                      <span>
                        {guest.marker === "electric" ? (
                          <Zap size={12} />
                        ) : (
                          <Crosshair size={12} />
                        )}
                        {guest.marker === "rental"
                          ? "Rental / not sure yet"
                          : `${guest.marker[0].toUpperCase()}${guest.marker.slice(1)} marker`}
                        <i>/</i>
                        {guest.status === "going"
                          ? "Going"
                          : guest.status === "maybe"
                            ? "Maybe"
                            : "Can't make it"}
                      </span>
                      {guest.notes && (
                        <p className="guest-note">{guest.notes}</p>
                      )}
                    </div>
                    {organizer ? (
                      <form action={assignTeamAction} className="team-form">
                        <Hidden name="eventId" value={event.id} />
                        <Hidden name="guestId" value={guest.id} />
                        <input
                          aria-label={`Team for ${guest.name}`}
                          name="team"
                          maxLength={80}
                          defaultValue={guest.team}
                          placeholder="Assign team"
                          list="team-names"
                        />
                        <Submit className="button subtle small">Save</Submit>
                      </form>
                    ) : (
                      guest.team && (
                        <span className="team-badge">{guest.team}</span>
                      )
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <Empty title="The roster's wide open.">
                {organizer
                  ? "Share your invite link to start getting the crew together."
                  : "Be the first to join. Add your RSVP to get the day rolling."}
              </Empty>
            )}
            <datalist id="team-names">
              <option value="Alpha" />
              <option value="Bravo" />
              {teams
                .filter((t) => t !== "Alpha" && t !== "Bravo")
                .map((t) => (
                  <option key={t} value={t} />
                ))}
            </datalist>
            {going.length > 0 && (
              <div className="marker-summary">
                <span>
                  <Crosshair size={14} />{" "}
                  {going.filter((g) => g.marker === "mechanical").length}{" "}
                  Mechanical
                </span>
                <span>
                  <Zap size={14} />{" "}
                  {going.filter((g) => g.marker === "electric").length} Electric
                </span>
                <span>
                  <ShieldCheck size={14} />{" "}
                  {going.filter((g) => g.marker === "rental").length} Rental /
                  unsure
                </span>
              </div>
            )}
            {teams.length > 0 && (
              <div className="team-summary">
                {teams.map((team) => (
                  <span className="team-badge" key={team}>
                    {team} / {going.filter((g) => g.team === team).length} going
                  </span>
                ))}
              </div>
            )}
          </section>
          <section className="panel" id="schedule">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">FROM FIRST BRIEF TO FINAL GAME</span>
                <h2>The run of play</h2>
              </div>
              <Clock3 size={21} className="muted" />
            </div>
            <p className="field-help">
              All times in {event.timezone}.{" "}
              {event.date ? dateLabel(event.date) : "Date still to be decided."}
            </p>
            {schedule.length ? (
              <div className="schedule-list">
                {schedule.map((item) => (
                  <div className="schedule-row" key={item.id}>
                    <time>{item.time}</time>
                    <span className="timeline-dot" />
                    <div>
                      <h3>{item.title}</h3>
                      {item.description && <p>{item.description}</p>}
                    </div>
                    {organizer && (
                      <Remove
                        eventId={event.id}
                        itemId={item.id}
                        action={deleteScheduleAction}
                        label={`Delete ${item.title}`}
                      />
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <Empty title="A little room for spontaneity.">
                {organizer
                  ? "Add arrival time, safety briefing, game blocks, and a well-earned lunch break."
                  : "The organizer hasn't added a schedule yet. Check back before game day."}
              </Empty>
            )}
            {organizer && (
              <details className="add-details">
                <summary>
                  <Plus size={16} /> Add to the schedule
                </summary>
                <form
                  action={addScheduleAction}
                  className="form-stack inset-form"
                >
                  <Hidden name="eventId" value={event.id} />
                  <div className="form-grid time-grid">
                    <label>
                      Time
                      <input type="time" name="time" required />
                    </label>
                    <label>
                      What&apos;s happening?
                      <input
                        name="title"
                        placeholder="Arrival & gear up"
                        required
                        maxLength={120}
                      />
                    </label>
                  </div>
                  <label>
                    Details
                    <textarea
                      name="description"
                      rows={2}
                      maxLength={2000}
                      placeholder="Where to meet, what to expect..."
                    />
                  </label>
                  <Submit>Add schedule item</Submit>
                </form>
              </details>
            )}
          </section>
          <section className="panel" id="gear">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">PACK SMART. PLAY HAPPY.</span>
                <h2>Gear & the damage</h2>
              </div>
              <Package size={21} className="muted" />
            </div>
            {gear.length ? (
              <div className="gear-list">
                {gear.map((item) => (
                  <div className="gear-row" key={item.id}>
                    <span className="gear-icon">
                      <Package size={18} />
                    </span>
                    <div>
                      <strong>{item.name}</strong>
                      <small>
                        {item.category === "bring"
                          ? "Bring your own"
                          : item.category === "rental"
                            ? "Rental"
                            : "Shared gear"}{" "}
                        / Qty {item.quantity}
                      </small>
                    </div>
                    <span className="gear-cost">
                      {item.cost
                        ? money(item.cost, event.currency)
                        : "No added cost"}
                    </span>
                    {organizer && (
                      <Remove
                        eventId={event.id}
                        itemId={item.id}
                        action={deleteGearAction}
                        label={`Delete ${item.name}`}
                      />
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <Empty title="All the essentials, in one place.">
                {organizer
                  ? "Add field entry, paint, rentals, and what everyone should bring."
                  : "Gear and costs are still being worked out. Ask the organizer before buying anything."}
              </Empty>
            )}
            <div className="cost-total">
              <div>
                <strong>Estimated per player</strong>
                <small>Planning estimate only. Nothing is charged here.</small>
              </div>
              <strong>{money(cost, event.currency)}</strong>
            </div>
            {organizer && (
              <details className="add-details">
                <summary>
                  <Plus size={16} /> Add gear or a cost
                </summary>
                <form action={addGearAction} className="form-stack inset-form">
                  <Hidden name="eventId" value={event.id} />
                  <label>
                    Item
                    <input
                      name="name"
                      required
                      maxLength={120}
                      placeholder="e.g. Field entry + 500 paintballs"
                    />
                  </label>
                  <div className="form-grid">
                    <label>
                      Category
                      <select name="category">
                        <option value="bring">Bring your own</option>
                        <option value="rental">Rental</option>
                        <option value="shared">Shared / field cost</option>
                      </select>
                    </label>
                    <label>
                      Quantity
                      <input
                        type="number"
                        min={1}
                        max={10000}
                        name="quantity"
                        defaultValue={1}
                        required
                      />
                    </label>
                  </div>
                  <label>
                    Estimated cost per player ({event.currency})
                    <input
                      type="number"
                      name="cost"
                      min={0}
                      max={1000000}
                      step="0.01"
                      defaultValue={0}
                      required
                    />
                    <span className="field-help">
                      Total per-player estimate for this line, regardless of
                      quantity. Use 0 for things to bring.
                    </span>
                  </label>
                  <Submit>Add item</Submit>
                </form>
              </details>
            )}
          </section>
          <section className="panel" id="polls">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">LET THE CREW CALL IT</span>
                <h2>A quick show of hands</h2>
              </div>
              <BarChart3 size={21} className="muted" />
            </div>
            {polls.length ? (
              polls.map((poll) => {
                const total = poll.options.reduce(
                  (sum, option) => sum + option.votes,
                  0,
                );
                return (
                  <article className="poll" key={poll.id}>
                    <div className="poll-heading">
                      <h3>{poll.question}</h3>
                      {organizer && (
                        <Remove
                          eventId={event.id}
                          itemId={poll.id}
                          action={deletePollAction}
                          label={`Delete poll ${poll.question}`}
                        />
                      )}
                    </div>
                    <div className="poll-options">
                      {poll.options.map((option) => (
                        <form action={voteAction} key={option.id}>
                          <Hidden
                            name="inviteToken"
                            value={event.inviteToken}
                          />
                          <Hidden name="pollId" value={poll.id} />
                          <Hidden name="optionId" value={option.id} />
                          <button
                            className={`poll-option ${poll.myVote === option.id ? "selected" : ""}`}
                            disabled={!currentGuest || organizer}
                            type="submit"
                          >
                            <span
                              className="poll-bar"
                              style={{
                                width: `${total ? (option.votes / total) * 100 : 0}%`,
                              }}
                            />
                            <span>
                              {poll.myVote === option.id && (
                                <Check
                                  size={16}
                                  className="accent"
                                  aria-hidden="true"
                                />
                              )}
                              {option.label}
                            </span>
                            <strong>{option.votes}</strong>
                          </button>
                        </form>
                      ))}
                    </div>
                    <p className="field-help">
                      {total} {total === 1 ? "vote" : "votes"}
                      {organizer
                        ? " / Open the guest view and RSVP if you want to vote."
                        : currentGuest
                          ? " / Choose an option. You can change your vote."
                          : " / RSVP to cast your vote."}
                    </p>
                  </article>
                );
              })
            ) : (
              <Empty title="Decisions are a team sport.">
                {organizer
                  ? "Vote on a date, a game mode, or the all-important post-game food."
                  : "No polls just yet. The organizer can add one when there's a decision to make."}
              </Empty>
            )}
            {organizer && (
              <details className="add-details">
                <summary>
                  <Plus size={16} /> Ask the crew
                </summary>
                <form action={addPollAction} className="form-stack inset-form">
                  <Hidden name="eventId" value={event.id} />
                  <label>
                    Your question
                    <input
                      name="question"
                      required
                      maxLength={240}
                      placeholder="What's the post-game food plan?"
                    />
                  </label>
                  <label>
                    Options
                    <textarea
                      name="options"
                      rows={4}
                      required
                      maxLength={1000}
                      placeholder={"Pizza\nBurgers\nBring a picnic"}
                    />
                    <span className="field-help">
                      One option per line. Between 2 and 6 unique options.
                    </span>
                  </label>
                  <Submit>Create poll</Submit>
                </form>
              </details>
            )}
          </section>
        </div>
        <aside className="plan-aside">
          {organizer ? (
            <section className="panel invite-panel">
              <span className="eyebrow">EVERY GREAT DAY NEEDS A CREW</span>
              <h2>Send it to the group.</h2>
              <p>
                One link gets everyone the plan. They can RSVP without making an
                account.
              </p>
              <CopyLink path={`/invite/${event.inviteToken}`} />
              <Link href={`/invite/${event.inviteToken}`} className="text-link">
                Open guest view <ArrowUpRight size={15} />
              </Link>
              <div className="privacy-note">
                <ShieldCheck size={17} />
                <span>
                  Private, not public. Anyone with the link can see this plan
                  and the guest list.
                </span>
              </div>
            </section>
          ) : (
            <section className="panel rsvp-panel" id="rsvp">
              <span className="eyebrow">SAVE YOUR SPOT</span>
              <h2>{currentGuest ? "You're on the list." : "You in?"}</h2>
              <p>
                {currentGuest
                  ? "Plans change. Keep your RSVP up to date."
                  : "No account. No fuss. Just tell the crew you're coming."}
              </p>
              <form action={submitRsvpAction} className="form-stack">
                <Hidden name="inviteToken" value={event.inviteToken} />
                <label>
                  Your name
                  <input
                    name="name"
                    required
                    maxLength={80}
                    defaultValue={currentGuest?.name}
                    placeholder="What should the crew call you?"
                  />
                </label>
                <label>
                  Count me...
                  <select
                    name="status"
                    defaultValue={currentGuest?.status || "going"}
                  >
                    <option value="going">In! I&apos;m going</option>
                    <option value="maybe">Maybe, still working it out</option>
                    <option value="declined">
                      Out, can&apos;t make this one
                    </option>
                  </select>
                </label>
                <fieldset className="marker-picker">
                  <legend>What&apos;s your marker?</legend>
                  {[
                    {
                      value: "mechanical",
                      title: "Mechanical",
                      detail: "Keep it classic",
                    },
                    {
                      value: "electric",
                      title: "Electric",
                      detail: "Powered up",
                    },
                    {
                      value: "rental",
                      title: "Rental / not sure",
                      detail: "We'll figure it out",
                    },
                  ].map((marker) => (
                    <label key={marker.value}>
                      <input
                        type="radio"
                        name="marker"
                        value={marker.value}
                        defaultChecked={
                          (currentGuest?.marker || "rental") === marker.value
                        }
                      />
                      <span>
                        <strong>{marker.title}</strong>
                        <small>{marker.detail}</small>
                      </span>
                      {marker.value === "electric" ? (
                        <Zap size={17} />
                      ) : (
                        <Crosshair size={17} />
                      )}
                    </label>
                  ))}
                </fieldset>
                <label>
                  Anything the crew should know?
                  <textarea
                    name="notes"
                    rows={2}
                    maxLength={1000}
                    defaultValue={currentGuest?.notes}
                    placeholder="Need a lift? Bringing a spare marker?"
                  />
                  <span className="field-help">
                    Visible to everyone with this invite. Don&apos;t include
                    private or medical details.
                  </span>
                </label>
                <Submit>
                  {currentGuest ? "Update my RSVP" : "Send my RSVP"}
                  <ArrowUpRight size={16} />
                </Submit>
              </form>
              {guestEditToken && (
                <div className="personal-link">
                  <strong>Your private RSVP link</strong>
                  <p>
                    Keep this to edit from another device. Anyone with this link
                    can edit your RSVP. Don&apos;t share it with the crew.
                  </p>
                  <CopyLink
                    path={`/invite/${event.inviteToken}?editToken=${guestEditToken}`}
                    label="Copy my private edit link"
                  />
                </div>
              )}
              <p className="field-help">
                Have an account? <Link href="/login">Sign in</Link> before
                submitting to keep this day in your dashboard. Otherwise, keep
                your personal edit link.
              </p>
            </section>
          )}
          <section className="panel venue-panel">
            <span className="eyebrow">MEET YOU THERE</span>
            <div className="venue-map" aria-hidden="true">
              <div />
              <MapPin size={32} />
            </div>
            <h3>{event.venue || "Field to be decided"}</h3>
            <p>
              {event.address ||
                "The organizer will add the meeting point here."}
            </p>
            {event.address && (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.address)}`}
                target="_blank"
                rel="noreferrer"
                className="text-link"
              >
                Get directions <ArrowUpRight size={15} />
              </a>
            )}
          </section>
          <section className="panel" id="updates">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">STRAIGHT FROM THE ORGANIZER</span>
                <h2>Field notes</h2>
              </div>
              <Megaphone size={20} className="muted" />
            </div>
            {announcements.length ? (
              <div className="announcement-list">
                {announcements.map((note) => (
                  <article key={note.id}>
                    <div>
                      <time dateTime={note.createdAt}>
                        {new Date(note.createdAt).toLocaleDateString("en", {
                          month: "short",
                          day: "numeric",
                          timeZone: "UTC",
                        })}
                      </time>
                      {organizer && (
                        <Remove
                          eventId={event.id}
                          itemId={note.id}
                          action={deleteAnnouncementAction}
                          label="Delete announcement"
                        />
                      )}
                    </div>
                    <p>{note.body}</p>
                  </article>
                ))}
              </div>
            ) : (
              <p className="muted">
                All quiet for now. Last-minute details and important updates
                will appear here.
              </p>
            )}
            {organizer && (
              <form action={addAnnouncementAction} className="form-stack">
                <Hidden name="eventId" value={event.id} />
                <label>
                  <span className="sr-only">Announcement</span>
                  <textarea
                    name="body"
                    rows={3}
                    required
                    maxLength={5000}
                    placeholder="A heads-up for the crew..."
                  />
                </label>
                <Submit className="button secondary">
                  Post an update <Plus size={15} />
                </Submit>
              </form>
            )}
          </section>
          <div className="safety-note">
            <ShieldCheck size={22} />
            <div>
              <strong>Good days are safe days.</strong>
              <p>
                Follow your field&apos;s rules, attend the safety briefing, and
                keep your mask on in live areas. Confirm age limits, waivers,
                and marker rules with the venue.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
