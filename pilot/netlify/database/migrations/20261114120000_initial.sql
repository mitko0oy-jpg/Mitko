-- Generic document store used by the shared service (settings, actions log, creatives, radar…).
CREATE TABLE IF NOT EXISTS docs (
  coll text NOT NULL,
  id text NOT NULL,
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (coll, id)
);

-- Daily Meta insights per ad (re-synced for the trailing window every day).
CREATE TABLE IF NOT EXISTS insights (
  ad text NOT NULL,
  date date NOT NULL,
  account text NOT NULL,
  adset text,
  campaign text,
  data jsonb NOT NULL,
  synced_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ad, date)
);
CREATE INDEX IF NOT EXISTS insights_account_date ON insights (account, date);

-- Shop orders (ConvertBuilder or webhook). No personal data is stored.
CREATE TABLE IF NOT EXISTS orders (
  site text NOT NULL,
  order_no text NOT NULL,
  date date NOT NULL,
  data jsonb NOT NULL,
  synced_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (site, order_no)
);
CREATE INDEX IF NOT EXISTS orders_date ON orders (date);

CREATE TABLE IF NOT EXISTS site_sessions (
  site text NOT NULL,
  date date NOT NULL,
  sessions integer NOT NULL,
  PRIMARY KEY (site, date)
);

-- Login sessions (only the SHA-256 of the cookie is stored).
CREATE TABLE IF NOT EXISTS auth_sessions (
  token_hash text PRIMARY KEY,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Every write to Meta, with the raw request and answer (audit log).
CREATE TABLE IF NOT EXISTS meta_writes (
  id bigserial PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  object_id text NOT NULL,
  op text NOT NULL,
  request jsonb,
  response jsonb,
  ok boolean NOT NULL
);
