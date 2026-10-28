-- Card orders from the shop pages (/karti-nvo/). Cash on delivery through Econt or Speedy.
-- Prices are euro cents, computed on the server from public/assets/shop-catalog.js.
CREATE TABLE orders (
  id          BIGSERIAL PRIMARY KEY,
  package     TEXT NOT NULL,
  shipping    TEXT NOT NULL CHECK (shipping IN ('econt', 'speedy', 'address')),
  name        TEXT NOT NULL,
  phone       TEXT NOT NULL,
  city        TEXT NOT NULL,
  place       TEXT NOT NULL,
  note        TEXT NOT NULL DEFAULT '',
  price       INT NOT NULL,
  ship_price  INT NOT NULL,
  total       INT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'confirmed', 'sent', 'done', 'canceled')),
  source      TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX orders_status_idx ON orders(status, created_at DESC);
