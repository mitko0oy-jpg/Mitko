-- НВО тренажор: paid terms of 1, 6 or 12 months (a batch's `months`) and renewal codes.
-- A renewal code (kind 'renew') adds its months to a pupil's own code, so the gradebook stays.
ALTER TABLE trener_keys ADD COLUMN kind TEXT NOT NULL DEFAULT 'access' CHECK (kind IN ('access', 'renew'));
ALTER TABLE trener_keys ADD COLUMN used_for TEXT;
