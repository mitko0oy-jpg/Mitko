-- НВО тренажор: a separate product opened with a personal link (QR code on a PDF or a box sticker).
-- No account: the code is the key, and the grades are kept with the code so they follow the child to another device.

CREATE TABLE trener_keys (
  code        TEXT PRIMARY KEY,
  batch       TEXT NOT NULL DEFAULT '',
  note        TEXT NOT NULL DEFAULT '',
  max_devices INT NOT NULL DEFAULT 3,
  state       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  first_used  TIMESTAMPTZ,
  last_used   TIMESTAMPTZ,
  disabled_at TIMESTAMPTZ
);
CREATE INDEX trener_keys_batch_idx ON trener_keys(batch);

-- A device is one browser: it keeps a random key, and only its SHA-256 is stored here.
CREATE TABLE trener_devices (
  code       TEXT NOT NULL REFERENCES trener_keys(code) ON DELETE CASCADE,
  device     TEXT NOT NULL,
  label      TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (code, device)
);

-- The question bank (paid content, loaded with scripts/admin.mjs). The newest row is served.
CREATE TABLE trener_bank (
  id         BIGSERIAL PRIMARY KEY,
  data       JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
