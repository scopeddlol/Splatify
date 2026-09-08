import Link from "next/link";
import type { EventDetail } from "@/lib/types";
import { addMessageAction, deleteMessageAction } from "@/app/actions";
import { Pagination } from "@/components/pagination";
import { Submit } from "./ui";
import { DayFields, DayPerson, DayRemove } from "./day-shared";

export function DayMessages({ detail }: { detail: EventDetail }) {
  const next = `/days/${detail.event.id}/messages`;
  if (!detail.canMessage)
    return (
      <section className="panel">
        <h2>Join the conversation</h2>
        <p>Sign in and link an approved RSVP to chat.</p>
        <div className="day-actions">
          {!detail.viewer && (
            <>
              <Link
                className="button primary"
                href={`/signup?next=${encodeURIComponent(next)}`}
              >
                Sign up
              </Link>
              <Link
                className="button secondary"
                href={`/login?next=${encodeURIComponent(next)}`}
              >
                Sign in
              </Link>
            </>
          )}
          <Link className="text-link" href={`/days/${detail.event.id}#rsvp`}>
            Update your RSVP
          </Link>
        </div>
      </section>
    );
  return (
    <section className="panel day-chat">
      <div className="day-row-heading">
        <h2>Messages</h2>
        <span>Newest first</span>
      </div>
      <form action={addMessageAction} className="form-stack day-composer">
        <DayFields eventId={detail.event.id} section="messages" />
        <label>
          Your message
          <textarea
            name="body"
            rows={2}
            required
            maxLength={2000}
            placeholder="Message the day..."
          />
        </label>
        <Submit>Send</Submit>
      </form>
      <div className="day-message-list">
        {!detail.messages.length && <p className="muted">No messages yet.</p>}
        {detail.messages.map((message) => (
          <article
            key={message.id}
            className={
              message.authorId === detail.viewer?.id
                ? "day-message own"
                : "day-message"
            }
          >
            <div className="day-row-heading">
              <DayPerson
                name={message.authorName}
                avatarId={message.avatarId}
              />
              {(detail.isOrganizer ||
                message.authorId === detail.viewer?.id) && (
                <DayRemove
                  eventId={detail.event.id}
                  itemId={message.id}
                  name="messageId"
                  section="messages"
                  action={deleteMessageAction}
                  label={`Delete message from ${message.authorName}`}
                />
              )}
            </div>
            <time dateTime={message.createdAt}>
              {new Date(message.createdAt).toLocaleString("en-US", {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: detail.event.timezone,
              })}
            </time>
            <p className="day-prose">{message.body}</p>
          </article>
        ))}
      </div>
      <Pagination
        page={detail.messagePage}
        total={detail.messageTotal}
        pageSize={20}
        href={(page) => `/days/${detail.event.id}/messages?messagePage=${page}`}
      />
    </section>
  );
}
