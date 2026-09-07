import type { EventDetail } from "@/lib/types";
import { addGearAction, deleteGearAction } from "@/app/actions";
import { money } from "./shell";
import { Submit } from "./ui";
import { DayFields, DayRemove } from "./day-shared";

export function DayGear({ detail }: { detail: EventDetail }) {
  const { event } = detail;
  return (
    <section className="panel">
      <h2>Gear &amp; costs</h2>
      <p>Know what to pack and what to budget.</p>
      {!detail.gear.length && (
        <p className="muted">
          Gear and costs are still being worked out. Confirm with the organizer
          before buying anything.
        </p>
      )}
      <div className="day-gear-list">
        {detail.gear.map((item) => (
          <article key={item.id}>
            <div>
              <h3>{item.name}</h3>
              <p>
                {item.category === "bring"
                  ? "Bring your own"
                  : item.category === "rental"
                    ? "Rental"
                    : "Shared / field cost"}{" "}
                / Quantity {item.quantity}
              </p>
            </div>
            <strong>
              {item.cost ? money(item.cost, event.currency) : "No added cost"}
            </strong>
            {detail.isOrganizer && (
              <DayRemove
                eventId={event.id}
                itemId={item.id}
                action={deleteGearAction}
                label={`Delete ${item.name}`}
                section="gear"
              />
            )}
          </article>
        ))}
      </div>
      <div className="cost-total">
        <div>
          <strong>Estimated per player</strong>
          <small>Planning estimate only. Nothing is charged here.</small>
        </div>
        <strong>{money(detail.estimatedCost, event.currency)}</strong>
      </div>
      {detail.isOrganizer && (
        <details className="day-advanced" open>
          <summary>Add gear or a cost</summary>
          <form action={addGearAction} className="form-stack inset-form">
            <DayFields eventId={event.id} section="gear" />
            <label>
              Item
              <input
                name="name"
                required
                maxLength={120}
                placeholder="Field entry + paintballs"
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
                  name="quantity"
                  min={1}
                  max={10000}
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
                Total per-player estimate for this line, regardless of quantity.
                Use 0 for things to bring.
              </span>
            </label>
            <Submit>Add item</Submit>
          </form>
        </details>
      )}
    </section>
  );
}
