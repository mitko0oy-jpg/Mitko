-- Еду БЕЛ: initial schema.
-- Parents (and reviewers/admins) are users with e-mail + password.
-- Children never give an e-mail: the parent creates them with a username + password.

CREATE TABLE users (
  id            BIGSERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL DEFAULT '',
  role          TEXT NOT NULL DEFAULT 'parent' CHECK (role IN ('parent', 'reviewer', 'admin')),
  consent_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE children (
  id            BIGSERIAL PRIMARY KEY,
  parent_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  display_name  TEXT NOT NULL,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  grade         SMALLINT NOT NULL CHECK (grade BETWEEN 4 AND 12),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX children_parent_idx ON children(parent_id);

-- One row per login. Only the SHA-256 of the cookie token is stored.
-- user_id only: parent/reviewer session. child_id only: child session.
-- both: a parent who switched into a child's profile on a shared device.
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    BIGINT REFERENCES users(id) ON DELETE CASCADE,
  child_id   BIGINT REFERENCES children(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (user_id IS NOT NULL OR child_id IS NOT NULL)
);

-- A module is one learning resource (90 cards, the task-25 trainer, ...).
-- free_count overrides free_ratio when set.
CREATE TABLE modules (
  slug        TEXT PRIMARY KEY,
  grade       SMALLINT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('cards', 't25', 'chars', 'pesho', 'diagnostic')),
  title       TEXT NOT NULL,
  subtitle    TEXT NOT NULL DEFAULT '',
  position    INT NOT NULL DEFAULT 0,
  free_ratio  REAL NOT NULL DEFAULT 0.3,
  free_count  INT,
  meta        JSONB NOT NULL DEFAULT '{}'::jsonb,
  active      BOOLEAN NOT NULL DEFAULT true
);

-- Content lives only here, never in the public repository.
-- status: draft (not shown), review (waiting for the teacher), approved, hidden.
CREATE TABLE items (
  id          BIGSERIAL PRIMARY KEY,
  module_slug TEXT NOT NULL REFERENCES modules(slug) ON DELETE CASCADE,
  ext_id      TEXT NOT NULL,
  position    INT NOT NULL,
  data        JSONB NOT NULL,
  status      TEXT NOT NULL DEFAULT 'review' CHECK (status IN ('draft', 'review', 'approved', 'hidden')),
  reviewed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (module_slug, ext_id)
);
CREATE INDEX items_module_pos_idx ON items(module_slug, position);

CREATE TABLE item_comments (
  id          BIGSERIAL PRIMARY KEY,
  item_id     BIGINT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  user_id     BIGINT REFERENCES users(id) ON DELETE SET NULL,
  body        TEXT NOT NULL,
  resolution  TEXT,
  resolved_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX item_comments_open_idx ON item_comments(item_id) WHERE resolved_at IS NULL;

-- Learning progress with a simple Leitner box for spaced repetition.
CREATE TABLE progress (
  child_id  BIGINT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  item_id   BIGINT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  attempts  INT NOT NULL DEFAULT 0,
  correct   INT NOT NULL DEFAULT 0,
  last_ok   BOOLEAN,
  score     SMALLINT,
  answer    TEXT,
  box       SMALLINT NOT NULL DEFAULT 0,
  due_at    TIMESTAMPTZ,
  last_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (child_id, item_id)
);
CREATE INDEX progress_due_idx ON progress(child_id, due_at);

-- Paid access belongs to the parent account and covers all its children.
-- product: 'bel-all' or 'bel<grade>' (e.g. 'bel7').
CREATE TABLE entitlements (
  id        BIGSERIAL PRIMARY KEY,
  user_id   BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product   TEXT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at   TIMESTAMPTZ NOT NULL,
  source    TEXT NOT NULL CHECK (source IN ('code', 'stripe', 'manual')),
  ref       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX entitlements_user_idx ON entitlements(user_id, ends_at);

-- Codes: printed in the card box, sent after a COD order, or given to testers.
-- kind 'reviewer' turns the registering account into a content reviewer.
CREATE TABLE access_codes (
  code       TEXT PRIMARY KEY,
  kind       TEXT NOT NULL DEFAULT 'access' CHECK (kind IN ('access', 'reviewer')),
  product    TEXT NOT NULL DEFAULT 'bel-all',
  days       INT NOT NULL DEFAULT 30,
  batch      TEXT NOT NULL DEFAULT '',
  max_uses   INT NOT NULL DEFAULT 1,
  uses       INT NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE code_redemptions (
  code    TEXT NOT NULL REFERENCES access_codes(code) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (code, user_id)
);

-- Raised when a child finishes the free part of a module. The parent sees it.
CREATE TABLE unlock_requests (
  id          BIGSERIAL PRIMARY KEY,
  child_id    BIGINT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  module_slug TEXT NOT NULL REFERENCES modules(slug) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  seen_at     TIMESTAMPTZ,
  UNIQUE (child_id, module_slug)
);

CREATE TABLE ai_usage (
  child_id BIGINT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  day      DATE NOT NULL,
  count    INT NOT NULL DEFAULT 0,
  PRIMARY KEY (child_id, day)
);

-- Fixed-window counters for rate limits (logins, AI, global caps).
CREATE TABLE rate_hits (
  key          TEXT PRIMARY KEY,
  window_start TIMESTAMPTZ NOT NULL,
  count        INT NOT NULL
);

-- Product analytics without personal data.
CREATE TABLE events (
  id       BIGSERIAL PRIMARY KEY,
  name     TEXT NOT NULL,
  user_id  BIGINT,
  child_id BIGINT,
  props    JSONB NOT NULL DEFAULT '{}'::jsonb,
  at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX events_name_at_idx ON events(name, at);
