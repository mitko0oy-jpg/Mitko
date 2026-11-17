-- Товарителници, създадени от платформата, и търсене на товарителниците на Middleware.

-- Our own waybill for the order: {courier, number, parcelId, at, price, currency, cod, pdf, by, canceledAt}
ALTER TABLE orders ADD COLUMN waybill JSONB;
-- Last time we asked the courier whether Middleware made a waybill for this order.
ALTER TABLE orders ADD COLUMN lookup_at TIMESTAMPTZ;

CREATE INDEX orders_lookup_idx ON orders (lookup_at NULLS FIRST) WHERE tracking_no IS NULL;

CREATE TABLE waybill_log (
  id       BIGSERIAL PRIMARY KEY,
  order_id BIGINT REFERENCES orders(id) ON DELETE SET NULL,
  courier  TEXT NOT NULL,
  action   TEXT NOT NULL CHECK (action IN ('create', 'cancel')),
  ok       BOOLEAN NOT NULL,
  number   TEXT,
  info     JSONB NOT NULL DEFAULT '{}'::jsonb,
  user_id  BIGINT,
  at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX waybill_log_order_idx ON waybill_log (order_id, at DESC);
