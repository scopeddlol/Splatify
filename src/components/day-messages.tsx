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
        <p>
          The message board is for accepted players with an account. Sign up,
          then save your RSVP to link it to your account. New requests may need
          organizer approval.
        </p>
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
    <section className="panel">
      <h2>Message board</h2>
      <p>
        Talk with the players and organizers. Keep personal and medical
        information private.
      </p>
      <form action={addMessageAction} className="form-stack">
        <DayFields eventId={detail.event.id} section="messages" />
        <label>
          Your message
          <textarea
            name="body"
            rows={3}
            required
            maxLength={2000}
            placeholder="Ask a question or make a plan with the team."
          />
        </label>
        <Submit>Send message</Submit>
      </form>
      <div className="day-message-list">
        {!detail.messages.length && (
          <p className="muted">
            No messages on this page. Start the conversation.
          </p>
        )}
        {detail.messages.map((message) => (
          <article key={message.id}>
            <div className="day-row-heading">
              <DayPerson
                name={message.authorName}
                avatarId={message.avatarId}
                bio={
                  message.authorId === detail.viewer?.id
                    ? detail.viewer.bio
                    : detail.guests.find(
                        (guest) => guest.userId === message.authorId,
                      )?.bio
                }
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
