import type { EventDetail } from "@/lib/types";
import { addScheduleAction, deleteScheduleAction } from "@/app/actions";
import { clockLabel, timeZoneLabel } from "@/lib/presentation";
import { Submit } from "./ui";
import { DayFields, DayRemove } from "./day-shared";

export function DaySchedule({ detail }: { detail: EventDetail }) {
  return (
    <section className="panel">
      <h2>The schedule</h2>
      <p>All times are {timeZoneLabel(detail.event.timezone)}.</p>
      {!detail.schedule.length && (
        <p className="muted">
          The organizer has not added a schedule yet. Check back before game
          day.
        </p>
      )}
      <div className="day-timeline">
        {detail.schedule.map((item) => (
          <article key={item.id}>
            <time>{clockLabel(item.time)}</time>
            <div>
              <h3>{item.title}</h3>
              {item.description && (
                <p className="day-prose">{item.description}</p>
              )}
            </div>
            {detail.isOrganizer && (
              <DayRemove
                eventId={detail.event.id}
                itemId={item.id}
                action={deleteScheduleAction}
                label={`Delete ${item.title}`}
                section="schedule"
              />
            )}
          </article>
        ))}
      </div>
      {detail.isOrganizer && (
        <details className="day-advanced" open>
          <summary>Add to the schedule</summary>
          <form action={addScheduleAction} className="form-stack inset-form">
            <DayFields eventId={detail.event.id} section="schedule" />
            <div className="form-grid">
              <label>
                Time
                <input type="time" name="time" required />
              </label>
              <label>
                What is happening?
                <input
                  name="title"
                  required
                  maxLength={120}
                  placeholder="Arrival & gear up"
                />
              </label>
            </div>
            <label>
              Details
              <textarea name="description" rows={3} maxLength={2000} />
            </label>
            <Submit>Add schedule item</Submit>
          </form>
        </details>
      )}
    </section>
  );
}
