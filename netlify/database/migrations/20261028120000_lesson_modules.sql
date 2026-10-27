-- Short lessons and reading (text + audio) per unit: two new module kinds.
-- Their items carry data.unit = the slug of the unit they belong to.
ALTER TABLE modules DROP CONSTRAINT modules_kind_check;
ALTER TABLE modules ADD CONSTRAINT modules_kind_check
  CHECK (kind IN ('cards', 't25', 'chars', 'pesho', 'diagnostic', 'exam', 'lesson', 'reading'));
