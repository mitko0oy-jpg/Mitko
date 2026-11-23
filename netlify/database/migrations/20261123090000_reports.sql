-- Signals about problems: errors the app notices by itself, and „Мисля, че тук има грешка“ from children and parents.
-- Nothing here says who it was – no code, device, account or IP address – only what went wrong, where and in which version.
-- The same problem in the same version is one row with a count, so a bug that hits 300 children is one line, not 300.
CREATE TABLE IF NOT EXISTS reports (
  id BIGSERIAL PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('error', 'task')),
  sig TEXT NOT NULL,
  page TEXT NOT NULL DEFAULT '',
  ref TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  version TEXT NOT NULL DEFAULT '',
  device TEXT NOT NULL DEFAULT '',
  count INT NOT NULL DEFAULT 1,
  first_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'seen', 'fixed'))
);
CREATE UNIQUE INDEX IF NOT EXISTS reports_sig_open ON reports (sig) WHERE status <> 'fixed';
CREATE INDEX IF NOT EXISTS reports_status_last ON reports (status, last_at DESC);
