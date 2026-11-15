-- „200 въпроса“ – the gift challenge: a module kind for its questions, classes and results.
ALTER TABLE modules DROP CONSTRAINT modules_kind_check;
ALTER TABLE modules ADD CONSTRAINT modules_kind_check
  CHECK (kind IN ('cards', 't25', 'chars', 'pesho', 'diagnostic', 'exam', 'lesson', 'reading', 'challenge'));

-- A class competition. No account: the teacher keeps a secret link, only its SHA-256 is stored.
CREATE TABLE challenge_classes (
  code         TEXT PRIMARY KEY,
  module_slug  TEXT NOT NULL REFERENCES modules(slug) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  teacher_hash TEXT NOT NULL UNIQUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per checked part. The player is an anonymous random id kept in the browser (stored as SHA-256).
-- attempt 1 is the one that counts for the ranking; later attempts are practice.
CREATE TABLE challenge_results (
  id          BIGSERIAL PRIMARY KEY,
  module_slug TEXT NOT NULL REFERENCES modules(slug) ON DELETE CASCADE,
  player_hash TEXT NOT NULL,
  part        SMALLINT NOT NULL,
  attempt     INT NOT NULL,
  nick        TEXT NOT NULL DEFAULT '',
  class_code  TEXT REFERENCES challenge_classes(code) ON DELETE SET NULL,
  answers     JSONB NOT NULL,
  points      INT NOT NULL,
  max_points  INT NOT NULL,
  correct     INT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (module_slug, player_hash, part, attempt)
);
CREATE INDEX challenge_results_part_idx ON challenge_results(module_slug, part, attempt, points);
CREATE INDEX challenge_results_class_idx ON challenge_results(class_code, attempt);
