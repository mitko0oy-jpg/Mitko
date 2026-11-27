-- A second subject (mathematics) and a new module kind: the quiz "200 задачи".
-- subject separates the BEL course from other subjects: their own pages and their own paid access.
ALTER TABLE modules ADD COLUMN subject TEXT NOT NULL DEFAULT 'bel';
ALTER TABLE modules ADD CONSTRAINT modules_subject_check CHECK (subject IN ('bel', 'mat'));
ALTER TABLE modules DROP CONSTRAINT modules_kind_check;
ALTER TABLE modules ADD CONSTRAINT modules_kind_check
  CHECK (kind IN ('cards', 't25', 'chars', 'pesho', 'diagnostic', 'exam', 'lesson', 'reading', 'quiz'));
CREATE INDEX modules_subject_idx ON modules(subject, kind, grade, position);
