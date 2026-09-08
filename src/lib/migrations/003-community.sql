ALTER TABLE users
  ADD COLUMN first_name text NOT NULL DEFAULT '',
  ADD COLUMN profile_slug text UNIQUE CHECK (profile_slug = lower(profile_slug)),
  ADD COLUMN public_profile_enabled boolean NOT NULL DEFAULT false;
CREATE TABLE loadout_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category text NOT NULL,
  name text NOT NULL,
  notes text NOT NULL DEFAULT '',
  position integer NOT NULL DEFAULT 0
);
CREATE INDEX loadout_items_user_idx ON loadout_items(user_id,position,id);
CREATE TABLE password_reset_links (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  issuer_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE settings
  ADD COLUMN landing_title text NOT NULL DEFAULT 'Less group chat. More game time.',
  ADD COLUMN landing_subtitle text NOT NULL DEFAULT 'Find a paintball day or bring your own crew.',
  ADD COLUMN landing_cta text NOT NULL DEFAULT 'Find a day',
  ADD COLUMN accent_color text NOT NULL DEFAULT '#d5fb51',
  ADD COLUMN discovery_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN public_profiles_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN sponsors_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE teams ADD COLUMN logo_icon text NOT NULL DEFAULT 'shield';
ALTER TABLE events ADD COLUMN sponsors_enabled boolean NOT NULL DEFAULT false;
CREATE TABLE event_sponsors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name text NOT NULL,
  url text NOT NULL DEFAULT '',
  position integer NOT NULL DEFAULT 0
);
CREATE INDEX event_sponsors_event_idx ON event_sponsors(event_id,position,id);
ALTER TABLE guests
  ADD COLUMN attended boolean NOT NULL DEFAULT false,
  ADD COLUMN attended_at timestamptz;
