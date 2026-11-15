-- НВО тренажор: how many new devices a code took in the current 30-day window.
-- Freeing a place and adding another device again and again would let one code travel between many families.
ALTER TABLE trener_keys ADD COLUMN IF NOT EXISTS adds INT NOT NULL DEFAULT 0;
ALTER TABLE trener_keys ADD COLUMN IF NOT EXISTS adds_since TIMESTAMPTZ;
