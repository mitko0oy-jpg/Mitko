-- Online mock exams: a new module kind. One item per exam section.
ALTER TABLE modules DROP CONSTRAINT modules_kind_check;
ALTER TABLE modules ADD CONSTRAINT modules_kind_check
  CHECK (kind IN ('cards', 't25', 'chars', 'pesho', 'diagnostic', 'exam'));
