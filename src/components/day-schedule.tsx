import type { EventDetail } from "@/lib/types";
import { addScheduleAction, deleteScheduleAction } from "@/app/actions";
import { clockLabel, timeZoneLabel } from "@/lib/presentation";
import { Submit } from "./ui";
import { DayFields, DayRemove } from "./day-shared";

export function DaySchedule({ detail }: { detail: EventDetail }) {
  return (
    <section className="panel">
      <div className="day-row-heading">
        <h2>Schedule</h2>
        <span>{timeZoneLabel(detail.event.timezone)}</span>
      </div>
      {!detail.schedule.length && <p className="muted">No schedule yet.</p>}
      <div className="day-timeline">
        {[...detail.schedule]
          .sort((a, b) => a.time.localeCompare(b.time))
          .map((item) => (
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
        <details className="day-advanced">
          <summary>Add schedule item</summary>
          <form action={addScheduleAction} className="form-stack inset-form">
            <DayFields eventId={detail.event.id} section="schedule" />
            <div className="form-grid">
              <label>
                Time
                <input type="time" name="time" required />
              </label>
              <label>
                Title
                <input
                  name="title"
                  required
                  maxLength={120}
                  placeholder="Arrival & gear up"
                />
              </label>
            </div>
            <details>
              <summary>Details</summary>
              <label>
                <span className="sr-only">Details</span>
                <textarea name="description" rows={2} maxLength={2000} />
              </label>
            </details>
            <Submit>Add schedule item</Submit>
          </form>
        </details>
      )}
    </section>
  );
}
