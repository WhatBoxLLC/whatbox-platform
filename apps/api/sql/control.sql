-- Control database: shared by all sites. Holds only site configuration, admin accounts
-- and licensing/usage. No member data ever lives here.
CREATE TABLE IF NOT EXISTS sites (
  id          text PRIMARY KEY,
  slug        text UNIQUE NOT NULL,
  domains     text[] NOT NULL DEFAULT '{}',
  db_name     text NOT NULL,            -- this site's own database
  key_ref     text NOT NULL,            -- Key Vault secret name for this site's encryption key
  doc         jsonb NOT NULL,           -- Site object: theme, settings, fields, owners
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sites_domains_idx ON sites USING gin (domains);

CREATE TABLE IF NOT EXISTS admins (
  id     text PRIMARY KEY,
  email  text UNIQUE NOT NULL,
  doc    jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  token       text PRIMARY KEY,
  admin_id    text NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  expires_at  timestamptz NOT NULL
);

-- Metering for licensing (base fee + usage surcharges). Counts only, no content.
CREATE TABLE IF NOT EXISTS usage_events (
  id       bigserial PRIMARY KEY,
  site_id  text NOT NULL REFERENCES sites(id),
  kind     text NOT NULL,               -- email | sms | ai_screen | storage_mb
  qty      integer NOT NULL DEFAULT 1,
  at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS usage_site_month_idx ON usage_events (site_id, at);
