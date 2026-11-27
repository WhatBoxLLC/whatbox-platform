-- WhatBox AI database. Holds only who may call the service and how many checks they ran.
-- Photos and the text read from them are never stored.
CREATE TABLE IF NOT EXISTS callers (
  id          text PRIMARY KEY,                 -- e.g. "whatbox-dating", "other-app", "acme-dating"
  name        text NOT NULL,
  key_hash    text UNIQUE NOT NULL,             -- sha256 of the API key; the key itself is shown once
  key_hint    text NOT NULL,                    -- last 4 characters, so people can tell keys apart
  billable    boolean NOT NULL DEFAULT true,    -- false for WhatBox's own sites and apps
  rate_cents  numeric(10,4) NOT NULL DEFAULT 0.5, -- per photo checked, when billable
  per_minute  integer NOT NULL DEFAULT 120,     -- burst limit
  enabled     boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- One row per caller, sub-account (e.g. a dating site id) and day. Counts only.
CREATE TABLE IF NOT EXISTS usage_daily (
  caller_id        text NOT NULL REFERENCES callers(id) ON DELETE CASCADE,
  account          text NOT NULL DEFAULT '',
  day              date NOT NULL,
  checks           integer NOT NULL DEFAULT 0,
  flagged_adult    integer NOT NULL DEFAULT 0,
  flagged_contact  integer NOT NULL DEFAULT 0,
  PRIMARY KEY (caller_id, account, day)
);
