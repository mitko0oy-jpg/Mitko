-- The course structure: every work or language topic of the curriculum is a unit.
-- Units do not hold content themselves; resources are found by matching work titles
-- and topics in the items (match = {"works": [...], "topics": [...]}).
CREATE TABLE units (
  slug     TEXT PRIMARY KEY,
  grade    SMALLINT NOT NULL,
  section  TEXT NOT NULL CHECK (section IN ('literature', 'language')),
  grp      TEXT NOT NULL DEFAULT '',
  title    TEXT NOT NULL,
  subtitle TEXT NOT NULL DEFAULT '',
  position INT NOT NULL DEFAULT 0,
  match    JSONB NOT NULL DEFAULT '{}'::jsonb,
  planned  JSONB NOT NULL DEFAULT '[]'::jsonb,
  info     JSONB NOT NULL DEFAULT '{}'::jsonb,
  active   BOOLEAN NOT NULL DEFAULT true
);
CREATE INDEX units_grade_idx ON units(grade, section, position);
