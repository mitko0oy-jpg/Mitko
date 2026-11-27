-- A status chosen by hand (a click on the status in Поръчки, like Middleware's status menu): Нова, Изпратена, В офис,
-- Взета, Върната or Отказана. It wins over the shop and Middleware until the courier reports something new about the
-- parcel (track.mts clears it) or the order gets another waybill (the trigger below). „Автоматичен статус“ clears it.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS manual_stage TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS manual_stage_at TIMESTAMPTZ;

DROP INDEX IF EXISTS orders_stage_idx;
ALTER TABLE orders DROP COLUMN stage;
ALTER TABLE orders ADD COLUMN stage TEXT GENERATED ALWAYS AS (
  CASE
    WHEN manual_stage IN ('new', 'shipped', 'at_office', 'delivered', 'returned', 'canceled') THEN manual_stage
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

-- A new (or removed) waybill: the parcel's own status counts again.
CREATE OR REPLACE FUNCTION orders_manual_stage_reset() RETURNS trigger AS $$
BEGIN
  IF NEW.tracking_no IS DISTINCT FROM OLD.tracking_no THEN
    NEW.manual_stage := NULL;
    NEW.manual_stage_at := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS orders_manual_stage_reset ON orders;
CREATE TRIGGER orders_manual_stage_reset BEFORE UPDATE OF tracking_no ON orders
  FOR EACH ROW EXECUTE FUNCTION orders_manual_stage_reset();
