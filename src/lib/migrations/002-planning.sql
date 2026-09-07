ALTER TABLE users
  ADD COLUMN real_name text NOT NULL DEFAULT '',
  ADD COLUMN bio text NOT NULL DEFAULT '',
  ADD COLUMN avatar_id uuid,
  ADD COLUMN default_marker text NOT NULL DEFAULT 'rental' CHECK (default_marker IN ('mechanical','electric','rental'));
ALTER TABLE events
  ADD COLUMN city text NOT NULL DEFAULT '',
  ADD COLUMN state text NOT NULL DEFAULT '',
  ADD COLUMN country text NOT NULL DEFAULT '',
  ADD COLUMN visibility text NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','public')),
  ADD COLUMN accent_color text NOT NULL DEFAULT '#d5fb51',
  ADD COLUMN cover_id uuid,
  ADD COLUMN invitation_cover_id uuid,
  ADD COLUMN invitation_heading text NOT NULL DEFAULT 'You are invited!',
  ADD COLUMN invitation_message text NOT NULL DEFAULT '',
  ADD COLUMN member_invites_enabled boolean NOT NULL DEFAULT true;
CREATE TABLE media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id uuid REFERENCES events(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('avatar','cover','invitation')),
  data bytea NOT NULL,
  content_type text NOT NULL DEFAULT 'image/webp',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX media_owner_idx ON media(owner_id);
CREATE INDEX media_event_idx ON media(event_id);
CREATE TABLE event_organizers (
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY(event_id,user_id)
);
CREATE INDEX organizers_user_idx ON event_organizers(user_id);
CREATE TABLE teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#d5fb51',
  captain_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE(event_id,name), UNIQUE(event_id,id)
);
ALTER TABLE guests
  ADD COLUMN team_id uuid,
  ADD COLUMN approval text NOT NULL DEFAULT 'approved' CHECK (approval IN ('pending','approved')),
  ADD CONSTRAINT guests_team_event_fk FOREIGN KEY(event_id,team_id) REFERENCES teams(event_id,id);
INSERT INTO teams(event_id,name) SELECT DISTINCT event_id,team FROM guests WHERE team<>'';
UPDATE guests g SET team_id=t.id FROM teams t WHERE t.event_id=g.event_id AND t.name=g.team;
CREATE INDEX guests_roster_idx ON guests(event_id,approval,created_at,id);
CREATE INDEX guests_team_idx ON guests(team_id);
CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX messages_event_idx ON messages(event_id,created_at DESC,id);
CREATE INDEX messages_user_idx ON messages(user_id);
CREATE INDEX events_discovery_idx ON events(date,id) WHERE visibility='public';
CREATE INDEX events_location_idx ON events(lower(city),lower(state)) WHERE visibility='public';
