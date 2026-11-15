-- НВО тренажор: time-limited access. A code runs for `months` from its first opening (NULL = no limit),
-- or until `valid_until` when a batch has one fixed end date. expires_at is set at the first opening.
ALTER TABLE trener_keys ADD COLUMN months INT;
ALTER TABLE trener_keys ADD COLUMN valid_until TIMESTAMPTZ;
ALTER TABLE trener_keys ADD COLUMN expires_at TIMESTAMPTZ;
