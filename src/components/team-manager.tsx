"use client";

import { useDeferredValue, useState } from "react";
import type { Guest, Team } from "@/lib/types";
import {
  batchAssignTeamAction,
  createTeamAction,
  updateTeamAction,
} from "@/app/actions";
import { TEAM_ICON_KEYS } from "@/lib/team-icons";
import { eventStyle } from "@/lib/presentation";
import { TeamBadge, TEAM_ICONS } from "./team-badge";
import { Submit } from "./ui";

export function TeamForm({
  eventId,
  team,
  isOrganizer,
  candidates = [],
}: {
  eventId: string;
  team?: Team;
  isOrganizer: boolean;
  candidates?: Array<{ id: string; name: string }>;
}) {
  const [color, setColor] = useState(team?.color || "#d5fb51");
  const [icon, setIcon] = useState(team?.logoIcon || "shield");
  return (
    <form
      action={team ? updateTeamAction : createTeamAction}
      className="form-stack inset-form"
    >
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="returnSection" value="teams" />
      {team && <input type="hidden" name="teamId" value={team.id} />}
      <div className="team-preview">
        <TeamBadge logoIcon={icon} color={color} size={72} />
        <label>
          Team name
          <input
            name="name"
            required
            maxLength={60}
            defaultValue={team?.name}
          />
        </label>
        <label>
          Color
          <input
            type="color"
            name="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
          />
        </label>
      </div>
      <fieldset className="team-icon-picker" style={eventStyle(color)}>
        <legend>Insignia</legend>
        <div className="team-icon-grid">
          {TEAM_ICON_KEYS.map((key) => {
            const Icon = TEAM_ICONS[key];
            return (
              <label key={key} title={key.replaceAll("-", " ")}>
                <input
                  type="radio"
                  name="logoIcon"
                  value={key}
                  checked={icon === key}
                  onChange={() => setIcon(key)}
                />
                <Icon size={22} aria-hidden="true" />
                <span className="sr-only">{key.replaceAll("-", " ")}</span>
              </label>
            );
          })}
        </div>
      </fieldset>
      {team && isOrganizer && (
        <label>
          Captain
          <select name="captainUserId" defaultValue={team.captainUserId || ""}>
            <option value="">No captain</option>
            {candidates.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <Submit>{team ? "Save team" : "Create team"}</Submit>
    </form>
  );
}

export function TeamManager({
  eventId,
  players,
  teams,
  isOrganizer,
  captainTeamIds,
}: {
  eventId: string;
  players: Guest[];
  teams: Team[];
  isOrganizer: boolean;
  captainTeamIds: string[];
}) {
  const targets = isOrganizer
    ? teams
    : teams.filter((t) => captainTeamIds.includes(t.id));
  const [target, setTarget] = useState(isOrganizer ? "" : targets[0]?.id || "");
  const [search, setSearch] = useState("");
  const query = useDeferredValue(search).trim().toLowerCase();
  const [selected, setSelected] = useState<string[]>([]);
  const eligible = players.filter(
    (p) =>
      isOrganizer ||
      (target
        ? !p.teamId || p.teamId === target
        : !!p.teamId && captainTeamIds.includes(p.teamId)),
  );
  const visible = eligible.filter((p) =>
    `${p.name} ${p.firstName} ${p.team} ${p.marker}`
      .toLowerCase()
      .includes(query),
  );
  return (
    <details className="panel team-manager">
      <summary>Assign players</summary>
      <form action={batchAssignTeamAction} className="form-stack inset-form">
        <input type="hidden" name="eventId" value={eventId} />
        <input type="hidden" name="returnSection" value="teams" />
        {selected.map((id) => (
          <input key={id} type="hidden" name="guestIds" value={id} />
        ))}
        <div className="form-grid">
          <label>
            Target team
            <select
              name="teamId"
              value={target}
              onChange={(e) => {
                setTarget(e.target.value);
                setSelected([]);
              }}
            >
              <option value="">
                {isOrganizer ? "Unassigned" : "Release from my teams"}
              </option>
              {targets.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Find players
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name, team or marker"
            />
          </label>
        </div>
        <div className="day-actions">
          <button
            type="button"
            className="button secondary"
            onClick={() =>
              setSelected(
                [...new Set([...selected, ...visible.map((p) => p.id)])].slice(
                  0,
                  100,
                ),
              )
            }
          >
            Select visible
          </button>
          <button
            type="button"
            className="button secondary"
            onClick={() => setSelected([])}
          >
            Clear
          </button>
          <span role="status">{selected.length} / 100 selected</span>
        </div>
        {selected.length > 0 && (
          <div className="team-selection">
            {players
              .filter((p) => selected.includes(p.id))
              .slice(0, 6)
              .map((p) => (
                <button
                  type="button"
                  key={p.id}
                  className="day-chip"
                  onClick={() =>
                    setSelected(selected.filter((id) => id !== p.id))
                  }
                  aria-label={`Deselect ${p.name}`}
                >
                  {p.name} <span aria-hidden="true">x</span>
                </button>
              ))}
            {selected.length > 6 && <span>+{selected.length - 6}</span>}
          </div>
        )}
        <div className="team-picker-list">
          {visible.map((p) => (
            <label className="team-picker-row" key={p.id}>
              <input
                type="checkbox"
                checked={selected.includes(p.id)}
                disabled={!selected.includes(p.id) && selected.length >= 100}
                onChange={(e) =>
                  setSelected(
                    e.target.checked
                      ? [...selected, p.id]
                      : selected.filter((id) => id !== p.id),
                  )
                }
              />
              <span>
                <strong>{p.name}</strong>
                <span>{p.team || "Unassigned"}</span>
              </span>
              <span className="day-chip">{p.marker}</span>
            </label>
          ))}
          {!visible.length && <p>No matching players.</p>}
        </div>
        <fieldset disabled={!selected.length} className="day-vote">
          <Submit>Assign selected</Submit>
        </fieldset>
      </form>
    </details>
  );
}
