-- „✕ Откажи“ in OrderDesk (like Middleware's status „Отказана“): the customer does not want an order that is not
-- sent yet – a shop order, one made here or an abandoned cart. Kept in OrderDesk, so the shop sync does not undo it.
-- A parcel that already has a waybill or went out keeps following the courier (its waybill is cancelled first).
ALTER TABLE orders ADD COLUMN IF NOT EXISTS canceled_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancel_reason TEXT;

DROP INDEX IF EXISTS orders_stage_idx;
ALTER TABLE orders DROP COLUMN stage;
ALTER TABLE orders ADD COLUMN stage TEXT GENERATED ALWAYS AS (
  CASE
    WHEN canceled_at IS NOT NULL AND tracking_no IS NULL AND NOT cb_shipped AND parcel_status IS NULL THEN 'canceled'
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
