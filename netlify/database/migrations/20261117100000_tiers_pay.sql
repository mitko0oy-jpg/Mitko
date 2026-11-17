-- НВО тренажор: levels of access, the free trial and paying with a card.
-- Старт (start): a part of the trainer, free and without a term. Стандарт (std): one subject (БЕЛ or математика).
-- Пълен (full): everything. A code whose term ended does not lock: it falls back to Старт, the grades stay.
-- The codes sold so far (boxes, PDFs) stay "full".
ALTER TABLE trener_keys ADD COLUMN IF NOT EXISTS tier TEXT NOT NULL DEFAULT 'full';
ALTER TABLE trener_keys ADD COLUMN IF NOT EXISTS subject TEXT;
-- A short term (the free trial): this many days from the first opening.
ALTER TABLE trener_keys ADD COLUMN IF NOT EXISTS days INT;
DO $$ BEGIN
  ALTER TABLE trener_keys ADD CONSTRAINT trener_keys_tier_ck CHECK (tier IN ('start', 'std', 'full'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- What a parent can buy on /dostap/. Changed with scripts/admin.mjs plans.
CREATE TABLE IF NOT EXISTS trener_plans (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  tier TEXT NOT NULL CHECK (tier IN ('std', 'full')),
  subject TEXT,
  months INT CHECK (months BETWEEN 1 AND 36),
  until DATE,
  price_cents INT NOT NULL CHECK (price_cents >= 50),
  currency TEXT NOT NULL DEFAULT 'eur',
  active BOOLEAN NOT NULL DEFAULT true,
  sort INT NOT NULL DEFAULT 0,
  CHECK (months IS NOT NULL OR until IS NOT NULL)
);

-- One row per Stripe Checkout. The card data never reaches us – only Stripe sees it.
CREATE TABLE IF NOT EXISTS trener_payments (
  id BIGSERIAL PRIMARY KEY,
  session TEXT NOT NULL UNIQUE,
  plan TEXT NOT NULL,
  tier TEXT NOT NULL,
  subject TEXT,
  months INT,
  until DATE,
  amount_cents INT NOT NULL,
  currency TEXT NOT NULL,
  for_code TEXT,
  code TEXT,
  email TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'paid', 'expired')),
  live BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS trener_payments_created ON trener_payments (created_at DESC);

-- Small switches the owner changes without a new release (the free trial: open or not, how long).
CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value JSONB NOT NULL);
INSERT INTO app_settings (key, value) VALUES ('trial', '{"open": true, "months": 1, "days": null, "daily": 300}') ON CONFLICT (key) DO NOTHING;
