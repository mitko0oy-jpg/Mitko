-- Abandoned carts in the orders list (like Middleware's "Изоставена"): an unfinished order with a phone becomes
-- an order row with cb_status 'abandoned' (stage 'abandoned'). Confirming it makes it a real order; if the
-- customer orders by themselves, it is archived.
ALTER TABLE orders ADD COLUMN lead_id bigint REFERENCES leads (id) ON DELETE SET NULL;
CREATE UNIQUE INDEX orders_lead_idx ON orders (lead_id) WHERE lead_id IS NOT NULL;

DROP INDEX IF EXISTS orders_stage_idx;
ALTER TABLE orders DROP COLUMN stage;
ALTER TABLE orders ADD COLUMN stage TEXT GENERATED ALWAYS AS (
  CASE
    WHEN cb_status = 'abandoned' THEN 'abandoned'
    WHEN parcel_status = 'delivered' THEN 'delivered'
    WHEN parcel_status IN ('returned', 'refused') THEN 'returned'
    WHEN parcel_status = 'at_office' THEN 'at_office'
    WHEN parcel_status = 'in_transit' THEN 'shipped'
    WHEN parcel_status = 'prepared' THEN 'prepared'
    WHEN mw_status = 'completed' THEN 'delivered'
    WHEN mw_status = 'returned' THEN 'returned'
    WHEN mw_status = 'cancelled' AND (tracking_no IS NOT NULL OR cb_shipped) THEN 'returned'
    WHEN mw_status = 'cancelled' THEN 'canceled'
    WHEN cb_status = 'canceled' AND (tracking_no IS NOT NULL OR cb_shipped) THEN 'returned'
    WHEN cb_status = 'canceled' THEN 'canceled'
    WHEN cb_status = 'completed' THEN 'delivered'
    WHEN tracking_no IS NOT NULL OR cb_shipped OR cb_status = 'shipped' OR mw_status IN ('shipped', 'redirected') THEN 'shipped'
    WHEN cb_status = 'archived' THEN 'archived'
    ELSE 'new'
  END
) STORED;
CREATE INDEX orders_stage_idx ON orders (stage);
