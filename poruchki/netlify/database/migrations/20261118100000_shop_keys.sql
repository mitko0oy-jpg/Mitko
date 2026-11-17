-- Shops added in the app (Магазини → +): their ConvertBuilder API key is kept here, encrypted.
-- The shops from CB_SITES (Netlify settings) keep their key there.
ALTER TABLE shops ADD COLUMN api_key_sealed text;
ALTER TABLE shops ADD COLUMN platform text NOT NULL DEFAULT 'convertbuilder';
ALTER TABLE shops ADD COLUMN note text;
ALTER TABLE shops ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
-- The shops already here: "created" = their first order.
UPDATE shops SET created_at = coalesce((SELECT min(o.ordered_at) FROM orders o WHERE o.shop = shops.id), now());
