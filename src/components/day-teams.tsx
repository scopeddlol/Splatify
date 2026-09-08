"use client";

import { useDeferredValue, useState } from "react";
import type { EventDetail, Guest } from "@/lib/types";
import { deleteTeamAction } from "@/app/actions";
import { DayPerson, DayRemove } from "./day-shared";
import { TeamBadge } from "./team-badge";
import { TeamForm, TeamManager } from "./team-manager";

function TeamRoster({
  players,
  currentId,
}: {
  players: Guest[];
  currentId?: string;
}) {
  const [limit, setLimit] = useState(5);
  return (
    <>
      <div role="list" className="team-roster">
        {players.slice(0, limit).map((p) => (
          <div role="listitem" className="team-roster-row" key={p.id}>
            <DayPerson name={p.name} avatarId={p.avatarId} />
            <span className="day-chip">{p.marker}</span>
            {p.id === currentId && <span className="day-chip">You</span>}
          </div>
        ))}
      </div>
      {players.length > 5 && (
        <button
          className="button secondary"
          type="button"
          onClick={() => setLimit(limit >= players.length ? 5 : limit + 20)}
        >
          {limit >= players.length
            ? "Show less"
            : `Show more (${players.length - limit})`}
        </button>
      )}
    </>
  );
}

export function DayTeams({ detail }: { detail: EventDetail }) {
  const [search, setSearch] = useState("");
  const query = useDeferredValue(search).trim().toLowerCase();
  if (!detail.canViewRoster) return null;
  const { event, teams, teamPlayers, isOrganizer, viewer } = detail;
  const captainTeamIds =
    detail.isMember && viewer && detail.currentGuest?.userId === viewer.id
      ? teams.filter((t) => t.captainUserId === viewer.id).map((t) => t.id)
      : [];
  const unassigned = teamPlayers.filter(
    (p) =>
      !p.teamId &&
      `${p.name} ${p.marker} unassigned`.toLowerCase().includes(query),
  );
  return (
    <div className="day-stack">
      <section className="panel">
        <div className="day-row-heading">
          <h2>
            Teams <span className="day-chip">{teams.length}</span>
          </h2>
          <span>{teamPlayers.length} players</span>
        </div>
        <label className="day-search">
          Find teams or players
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Team, player or marker"
          />
        </label>
      </section>
      {(isOrganizer || captainTeamIds.length > 0) && (
        <TeamManager
          key={teamPlayers.map((p) => `${p.id}:${p.teamId}`).join(",")}
          eventId={event.id}
          players={teamPlayers}
          teams={teams}
          isOrganizer={isOrganizer}
          captainTeamIds={captainTeamIds}
        />
      )}
      <div className="day-team-grid">
        {teams.map((team) => {
          const all = teamPlayers.filter((p) => p.teamId === team.id);
          const teamMatch = `${team.name} ${team.captainName}`
            .toLowerCase()
            .includes(query);
          const players = teamMatch
            ? all
            : all.filter((p) =>
                `${p.name} ${p.firstName} ${p.marker}`
                  .toLowerCase()
                  .includes(query),
              );
          if (!teamMatch && !players.length) return null;
          return (
            <section className="panel day-team-card" key={team.id}>
              <div className="day-row-heading">
                <div className="team-preview">
                  <TeamBadge
                    logoIcon={team.logoIcon}
                    color={team.color}
                    size={60}
                  />
                  <div>
                    <h3>{team.name}</h3>
                    <span>
                      {team.captainName
                        ? `Captain: ${team.captainName}`
                        : "No captain"}
                    </span>
                  </div>
                </div>
                <strong
                  className="team-headcount"
                  aria-label={`${team.playerCount} players`}
                >
                  {team.playerCount}
                </strong>
              </div>
              <TeamRoster
                key={query}
                players={players}
                currentId={detail.currentGuest?.id}
              />
              {(isOrganizer || captainTeamIds.includes(team.id)) && (
                <details className="day-advanced">
                  <summary>Edit team</summary>
                  <TeamForm
                    key={`${team.name}:${team.color}:${team.logoIcon}:${team.captainUserId}`}
                    eventId={event.id}
                    team={team}
                    isOrganizer={isOrganizer}
                    candidates={detail.memberCandidates}
                  />
                </details>
              )}
              {isOrganizer && (
                <DayRemove
                  eventId={event.id}
                  itemId={team.id}
                  name="teamId"
                  section="teams"
                  action={deleteTeamAction}
                  label={`Delete ${team.name}`}
                />
              )}
            </section>
          );
        })}
      </div>
      {unassigned.length > 0 && (
        <section className="panel">
          <h2>
            Unassigned <span className="day-chip">{unassigned.length}</span>
          </h2>
          <TeamRoster
            key={query}
            players={unassigned}
            currentId={detail.currentGuest?.id}
          />
        </section>
      )}
      {!teams.length && <p>No teams yet.</p>}
      {isOrganizer && (
        <details className="panel">
          <summary>Create a team</summary>
          <TeamForm eventId={event.id} isOrganizer />
        </details>
      )}
    </div>
  );
}
