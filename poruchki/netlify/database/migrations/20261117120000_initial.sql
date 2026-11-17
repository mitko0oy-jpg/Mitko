-- Поръчки: начална схема.
-- Поръчките идват от ConvertBuilder (API + webhook), статусите на пратките – от Speedy и Еконт
-- (а докато върви преходът – и от Middleware).

CREATE TABLE users (
  id            BIGSERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL DEFAULT '',
  role          TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('admin', 'staff')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only the SHA-256 of the cookie token is stored.
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE rate_hits (
  key          TEXT PRIMARY KEY,
  window_start TIMESTAMPTZ NOT NULL,
  count        INT NOT NULL
);

-- The shops themselves (domain + API key) come from the CB_SITES env variable.
-- This table keeps what can be changed in the app and the sync state.
CREATE TABLE shops (
  id          TEXT PRIMARY KEY,
  label       TEXT NOT NULL,
  domain      TEXT NOT NULL,
  region      TEXT NOT NULL DEFAULT 'bg' CHECK (region IN ('bg', 'abroad')),
  currency    TEXT NOT NULL DEFAULT 'EUR',
  active      BOOLEAN NOT NULL DEFAULT true,
  position    INT NOT NULL DEFAULT 0,
  hook_id     TEXT,
  hook_secret TEXT,
  hook_at     TIMESTAMPTZ,
  synced_at   TIMESTAMPTZ,
  full_sync_at TIMESTAMPTZ,
  backfill    JSONB,
  last_error  TEXT,
  error_at    TIMESTAMPTZ
);

CREATE TABLE orders (
  id              BIGSERIAL PRIMARY KEY,
  shop            TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  cb_id           BIGINT NOT NULL,
  order_no        TEXT NOT NULL,
  ordered_at      TIMESTAMPTZ NOT NULL,
  day             DATE NOT NULL,                 -- ordered_at as a date in Sofia
  cb_status       TEXT NOT NULL,                 -- pending / shipped / completed / canceled / archived
  customer_name   TEXT NOT NULL DEFAULT '',
  phone           TEXT NOT NULL DEFAULT '',
  email           TEXT NOT NULL DEFAULT '',
  country         TEXT NOT NULL DEFAULT '',
  city            TEXT NOT NULL DEFAULT '',
  zip             TEXT NOT NULL DEFAULT '',
  address         TEXT NOT NULL DEFAULT '',
  address2        TEXT NOT NULL DEFAULT '',
  shipping_name   TEXT NOT NULL DEFAULT '',
  delivery        JSONB NOT NULL DEFAULT '{}'::jsonb,  -- {type, courier, officeId, officeName}
  items           JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{name, qty, total}]
  currency        TEXT NOT NULL DEFAULT 'EUR',
  sub_total       NUMERIC(12, 2) NOT NULL DEFAULT 0,
  shipping        NUMERIC(12, 2) NOT NULL DEFAULT 0,
  discount        NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total           NUMERIC(12, 2) NOT NULL DEFAULT 0,
  fx              NUMERIC(14, 6) NOT NULL DEFAULT 1, -- units of `currency` for 1 EUR
  total_eur       NUMERIC(12, 2) NOT NULL DEFAULT 0,
  paid            BOOLEAN NOT NULL DEFAULT false,
  payment_method  TEXT NOT NULL DEFAULT '',
  courier         TEXT,                          -- speedy / econt / free text
  tracking_no     TEXT,
  tracking_url    TEXT,
  tracking_source TEXT,                          -- cb / middleware / own
  mw_status       TEXT,                          -- Middleware status_key while we run in parallel
  parcel_status   TEXT,                          -- in_transit / at_office / delivered / returned / refused / canceled
  parcel_text     TEXT,
  parcel_at       TIMESTAMPTZ,
  parcel_final    BOOLEAN NOT NULL DEFAULT false,
  parcel_events   JSONB NOT NULL DEFAULT '[]'::jsonb,
  tracked_at      TIMESTAMPTZ,
  track_error     TEXT,
  delivered_at    TIMESTAMPTZ,
  cb_shipped      BOOLEAN NOT NULL DEFAULT false, -- the shop shows it as sent (has a courier/waybill)
  -- Where the order is now. The courier's own status wins; without it Middleware, then ConvertBuilder.
  -- An order cancelled in the shop after it was sent is a parcel that came back.
  stage           TEXT GENERATED ALWAYS AS (
    CASE
      WHEN parcel_status = 'delivered' THEN 'delivered'
      WHEN parcel_status IN ('returned', 'refused') THEN 'returned'
      WHEN parcel_status = 'at_office' THEN 'at_office'
      WHEN parcel_status = 'in_transit' THEN 'shipped'
      WHEN mw_status = 'completed' THEN 'delivered'
      WHEN mw_status = 'returned' THEN 'returned'
      WHEN mw_status = 'cancelled' AND (tracking_no IS NOT NULL OR cb_shipped) THEN 'returned'
      WHEN mw_status = 'cancelled' THEN 'canceled'
      WHEN cb_status = 'canceled' AND (tracking_no IS NOT NULL OR cb_shipped) THEN 'returned'
      WHEN cb_status = 'canceled' THEN 'canceled'
      WHEN cb_status = 'completed' THEN 'delivered'
      WHEN tracking_no IS NOT NULL OR cb_shipped OR cb_status = 'shipped' OR mw_status IN ('shipped', 'redirected') THEN 'shipped'
      WHEN cb_status = 'archived' THEN 'archived'
      ELSE 'new'
    END
  ) STORED,
  raw             JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  synced_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (shop, cb_id)
);
CREATE INDEX orders_day_idx ON orders (day, shop);
CREATE INDEX orders_stage_idx ON orders (stage);
CREATE INDEX orders_no_idx ON orders (shop, order_no);
CREATE INDEX orders_phone_idx ON orders (phone);
CREATE INDEX orders_track_idx ON orders (tracked_at NULLS FIRST) WHERE tracking_no IS NOT NULL AND NOT parcel_final;

-- Small key/value store: courier logins (encrypted), exchange rates, Middleware cursor.
CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- What the background jobs did, for the settings page ("последно обновяване").
CREATE TABLE job_log (
  id      BIGSERIAL PRIMARY KEY,
  job     TEXT NOT NULL,
  ok      BOOLEAN NOT NULL,
  info    JSONB NOT NULL DEFAULT '{}'::jsonb,
  at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX job_log_at_idx ON job_log (job, at DESC);
