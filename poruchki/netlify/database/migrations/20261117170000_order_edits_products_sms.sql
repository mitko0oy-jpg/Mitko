-- Корекции на поръчки (продукти, доставка), хронология, продукти от магазините, SMS.

-- What the shop says, kept apart from what we show. ConvertBuilder's API cannot change amounts or
-- products, so a correction lives here and survives every re-sync from the shop.
ALTER TABLE orders ADD COLUMN cb_items     JSONB;
ALTER TABLE orders ADD COLUMN cb_sub_total NUMERIC(12, 2);
ALTER TABLE orders ADD COLUMN cb_shipping  NUMERIC(12, 2);
ALTER TABLE orders ADD COLUMN cb_discount  NUMERIC(12, 2);
ALTER TABLE orders ADD COLUMN cb_total     NUMERIC(12, 2);
-- Our correction: {at, by, cbTotal} – NULL when the order is as the shop sent it.
ALTER TABLE orders ADD COLUMN edit         JSONB;

UPDATE orders SET cb_items = items, cb_sub_total = sub_total, cb_shipping = shipping, cb_discount = discount, cb_total = total;

-- History of an order: corrections, waybills, SMS.
CREATE TABLE order_events (
  id       BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  kind     TEXT NOT NULL,           -- edit / edit_reset / waybill / waybill_cancel / sms
  text     TEXT NOT NULL,
  info     JSONB NOT NULL DEFAULT '{}'::jsonb,
  user_id  BIGINT,
  at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX order_events_order_idx ON order_events (order_id, at);

-- Products of each shop (from ConvertBuilder), to add to an order.
CREATE TABLE products (
  id        BIGSERIAL PRIMARY KEY,
  shop      TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  cb_id     BIGINT NOT NULL,
  variant   TEXT NOT NULL DEFAULT '',
  title     TEXT NOT NULL,
  price     NUMERIC(12, 2) NOT NULL DEFAULT 0,
  sku       TEXT NOT NULL DEFAULT '',
  image     TEXT,
  hidden    BOOLEAN NOT NULL DEFAULT false,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (shop, cb_id, variant)
);
CREATE INDEX products_shop_idx ON products (shop, hidden);
