-- One of these databases per site. Queryable columns are real columns; the full record is in doc.
-- Contact details are stored only as HMAC hashes and AES-GCM ciphertext using this site's own key.
CREATE TABLE IF NOT EXISTS members (
  id                text PRIMARY KEY,
  status            text NOT NULL,
  profile_complete  boolean NOT NULL,
  display_name      text NOT NULL,
  gender            text NOT NULL,
  birth_year        integer NOT NULL,
  lat               double precision NOT NULL,
  lng               double precision NOT NULL,
  city              text NOT NULL,
  premium           boolean NOT NULL, -- true for Paid or VIP; the tier itself is in doc
  email_hash        text UNIQUE,
  phone_hash        text UNIQUE,
  created_at        timestamptz NOT NULL,
  last_active_at    timestamptz NOT NULL,
  doc               jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS members_search_idx ON members (status, profile_complete, gender, birth_year);
CREATE INDEX IF NOT EXISTS members_geo_idx ON members (lat, lng);
CREATE INDEX IF NOT EXISTS members_active_idx ON members (last_active_at DESC);
-- HMACs of Apple / Google subject ids for social sign-in
ALTER TABLE members ADD COLUMN IF NOT EXISTS identity_hashes text[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS members_identity_idx ON members USING gin (identity_hashes);

CREATE TABLE IF NOT EXISTS photos (
  id         text PRIMARY KEY,
  member_id  text NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  kind       text NOT NULL CHECK (kind IN ('main','public','private')),
  rating     text NOT NULL CHECK (rating IN ('safe','suggestive','explicit')),
  status     text NOT NULL,
  sort       bigint NOT NULL,
  doc        jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS photos_member_idx ON photos (member_id, sort);

CREATE TABLE IF NOT EXISTS private_access (
  owner_id    text NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  viewer_id   text NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  status      text NOT NULL,
  updated_at  timestamptz NOT NULL,
  PRIMARY KEY (owner_id, viewer_id)
);
CREATE INDEX IF NOT EXISTS access_viewer_idx ON private_access (viewer_id);

CREATE TABLE IF NOT EXISTS likes (
  from_id  text NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  to_id    text NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  at       timestamptz NOT NULL,
  PRIMARY KEY (from_id, to_id)
);
CREATE INDEX IF NOT EXISTS likes_to_idx ON likes (to_id);
-- VIP like: the sender spent tokens to be shown first
ALTER TABLE likes ADD COLUMN IF NOT EXISTS vip boolean NOT NULL DEFAULT false;

-- Private bookmarks. Never shown to the other person.
CREATE TABLE IF NOT EXISTS favorites (
  from_id  text NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  to_id    text NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  at       timestamptz NOT NULL,
  PRIMARY KEY (from_id, to_id)
);

-- "Not for me" in Discover. The profile can come back after the site's cooldown.
CREATE TABLE IF NOT EXISTS passes (
  from_id  text NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  to_id    text NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  at       timestamptz NOT NULL,
  PRIMARY KEY (from_id, to_id)
);

CREATE TABLE IF NOT EXISTS views (
  viewer_id  text NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  viewed_id  text NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  at         timestamptz NOT NULL,
  PRIMARY KEY (viewer_id, viewed_id)
);
CREATE INDEX IF NOT EXISTS views_viewed_idx ON views (viewed_id);

CREATE TABLE IF NOT EXISTS blocks (
  blocker_id  text NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  blocked_id  text NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  at          timestamptz NOT NULL,
  PRIMARY KEY (blocker_id, blocked_id)
);
CREATE INDEX IF NOT EXISTS blocks_blocked_idx ON blocks (blocked_id);

CREATE TABLE IF NOT EXISTS messages (
  id       text PRIMARY KEY,
  from_id  text NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  to_id    text NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  at       timestamptz NOT NULL,
  held     boolean NOT NULL,
  read_at  timestamptz,
  doc      jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_pair_idx ON messages (from_id, to_id, at);
CREATE INDEX IF NOT EXISTS messages_to_idx ON messages (to_id, at);

CREATE TABLE IF NOT EXISTS contact_optins (
  member_id  text NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  other_id   text NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  at         timestamptz NOT NULL,
  PRIMARY KEY (member_id, other_id)
);

CREATE TABLE IF NOT EXISTS reports (
  id           text PRIMARY KEY,
  reporter_id  text NOT NULL,
  target_id    text NOT NULL,
  reason       text NOT NULL,
  at           timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS reports_target_idx ON reports (target_id);

CREATE TABLE IF NOT EXISTS moderation (
  id          text PRIMARY KEY,
  status      text NOT NULL,
  created_at  timestamptz NOT NULL,
  doc         jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS moderation_status_idx ON moderation (status, created_at DESC);

-- Site-run events (members only) and who is going.
CREATE TABLE IF NOT EXISTS events (
  id         text PRIMARY KEY,
  starts_at  timestamptz NOT NULL,
  doc        jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS event_rsvps (
  event_id   text NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  member_id  text NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  status     text NOT NULL,
  at         timestamptz NOT NULL,
  PRIMARY KEY (event_id, member_id)
);
CREATE INDEX IF NOT EXISTS rsvps_member_idx ON event_rsvps (member_id);

CREATE TABLE IF NOT EXISTS pages (
  slug  text PRIMARY KEY,
  doc   jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS challenges (
  id          text PRIMARY KEY,
  expires_at  timestamptz NOT NULL,
  doc         jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token       text PRIMARY KEY,
  member_id   text NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  expires_at  timestamptz NOT NULL
);

-- Expo push tokens (APNs / FCM behind them). Notifications never include message text or names.
CREATE TABLE IF NOT EXISTS push_tokens (
  token      text PRIMARY KEY,
  member_id  text NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  platform   text NOT NULL,
  at         timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS push_member_idx ON push_tokens (member_id);

-- Billing. The processor holds the card; we keep only its subscription id and status.
CREATE TABLE IF NOT EXISTS subscriptions (
  id           text PRIMARY KEY,
  member_id    text NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  provider     text NOT NULL,
  provider_ref text NOT NULL DEFAULT '',
  tier         text NOT NULL,
  status       text NOT NULL,
  period_end   timestamptz,
  created_at   timestamptz NOT NULL,
  updated_at   timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS subs_member_idx ON subscriptions (member_id);
CREATE INDEX IF NOT EXISTS subs_ref_idx ON subscriptions (provider, provider_ref);

-- Webhook replay guard: each provider event is applied once.
CREATE TABLE IF NOT EXISTS webhook_events (
  provider text NOT NULL,
  event_id text NOT NULL,
  at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, event_id)
);
