-- Unfinished orders: what a customer typed in a shop's order form without sending it.
-- Written by /api/collect (the c.js script on the shop pages), kept 30 days.
CREATE TABLE leads (
  id bigserial PRIMARY KEY,
  shop text NOT NULL,
  sid text NOT NULL,               -- one visit of the order form (random id in the browser tab)
  name text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  cart jsonb NOT NULL DEFAULT '[]', -- lines as the shop shows them ("BeeVenom Gel 2+1 · 1 · 39,90 €")
  total text NOT NULL DEFAULT '',
  page text NOT NULL DEFAULT '',
  hits integer NOT NULL DEFAULT 1,
  first_at timestamptz NOT NULL DEFAULT now(),
  last_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'dismissed')),
  order_id bigint REFERENCES orders (id) ON DELETE SET NULL, -- order made from it in the platform
  UNIQUE (shop, sid)
);
CREATE INDEX leads_last_idx ON leads (last_at DESC);
CREATE INDEX leads_phone_key_idx ON leads (right(regexp_replace(phone, '\D', '', 'g'), 9));
