-- Duplicate orders (like Middleware's "Откриване на дублирани поръчки"): a new order from a customer who already
-- ordered shortly before (same phone or email; by the rules in settings duplicates@<company>) is held with
-- stage 'duplicate' until someone looks at it – no waybill, no call – and then released or archived.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS dup_of BIGINT REFERENCES orders (id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS dup_state TEXT CHECK (dup_state IN ('held', 'released'));
ALTER TABLE orders ADD COLUMN IF NOT EXISTS dup_checked_at TIMESTAMPTZ;

-- Older orders are not checked; new, unconfirmed shop orders of the last 3 days are (at the next import).
UPDATE orders SET dup_checked_at = now()
 WHERE NOT (source = 'shop' AND confirmed_at IS NULL AND archived_at IS NULL AND tracking_no IS NULL
            AND coalesce(cb_status, '') NOT IN ('abandoned', 'canceled', 'completed', 'archived')
            AND ordered_at > now() - interval '3 days');

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
    WHEN dup_state = 'held' THEN 'duplicate'
    ELSE 'new'
  END
) STORED;
CREATE INDEX orders_stage_idx ON orders (stage);
CREATE INDEX IF NOT EXISTS orders_dup_unchecked ON orders (shop) WHERE dup_checked_at IS NULL;
