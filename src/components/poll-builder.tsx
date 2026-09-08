"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { addPollAction, voteAction } from "@/app/actions";
import type { Poll } from "@/lib/types";
import { Submit } from "./ui";

export function PollBuilder({ eventId }: { eventId: string }) {
  const [options, setOptions] = useState([
    { id: 0, value: "" },
    { id: 1, value: "" },
  ]);
  const [nextId, setNextId] = useState(2);
  return (
    <form action={addPollAction} className="form-stack inset-form">
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="returnSection" value="overview" />
      <input
        type="hidden"
        name="options"
        value={options.map((o) => o.value).join("\n")}
      />
      <label>
        Question
        <input name="question" maxLength={240} required />
      </label>
      <div className="poll-builder-options">
        {options.map((option, index) => (
          <div className="day-row-heading" key={option.id}>
            <label>
              Option {index + 1}
              <input
                required
                maxLength={120}
                value={option.value}
                onChange={(e) =>
                  setOptions(
                    options.map((o) =>
                      o.id === option.id ? { ...o, value: e.target.value } : o,
                    ),
                  )
                }
              />
            </label>
            <button
              type="button"
              className="icon-button"
              aria-label={`Remove option ${index + 1}`}
              disabled={options.length <= 2}
              onClick={() =>
                setOptions(options.filter((o) => o.id !== option.id))
              }
            >
              <X size={18} />
            </button>
          </div>
        ))}
      </div>
      <div className="day-actions">
        <button
          className="button secondary"
          type="button"
          disabled={options.length >= 6}
          onClick={() => {
            setOptions([...options, { id: nextId, value: "" }]);
            setNextId(nextId + 1);
          }}
        >
          <Plus size={18} />
          Add option
        </button>
        <Submit>Create poll</Submit>
      </div>
    </form>
  );
}

export function PollVote({
  eventId,
  poll,
  canVote,
}: {
  eventId: string;
  poll: Poll;
  canVote: boolean;
}) {
  const total = poll.options.reduce((sum, option) => sum + option.votes, 0);
  return (
    <form action={voteAction}>
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="returnSection" value="overview" />
      <input type="hidden" name="pollId" value={poll.id} />
      <fieldset className="day-vote poll-results" disabled={!canVote}>
        <legend className="sr-only">{poll.question}</legend>
        {poll.options.map((option) => {
          const percent = total ? Math.round((option.votes / total) * 100) : 0;
          return (
            <label className="poll-result" key={option.id}>
              <span
                className="poll-result-bar"
                style={{ width: `${percent}%` }}
                aria-hidden="true"
              />
              <input
                type="radio"
                name="optionId"
                value={option.id}
                defaultChecked={poll.myVote === option.id}
                onChange={(e) => e.currentTarget.form?.requestSubmit()}
              />
              <span>{option.label}</span>
              <strong>
                {percent}% <span>({option.votes})</span>
              </strong>
            </label>
          );
        })}
      </fieldset>
      <span className="day-poll-total">
        {total} {total === 1 ? "vote" : "votes"}
      </span>
    </form>
  );
}
