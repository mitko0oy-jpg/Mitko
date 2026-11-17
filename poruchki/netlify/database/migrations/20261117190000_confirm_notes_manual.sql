-- Потвърждение, бележки, агентът за обаждания, ръчни поръчки, архив.

ALTER TABLE orders ADD COLUMN confirmed_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN confirmed_by TEXT;
-- The latest comment, shown in the list (all comments are in order_events, kind 'note').
ALTER TABLE orders ADD COLUMN note TEXT;
-- The phone agent: {state, attempts, at, summary}
ALTER TABLE orders ADD COLUMN call JSONB;
-- shop = from ConvertBuilder; manual = made here; phone = taken by the phone agent.
ALTER TABLE orders ADD COLUMN source TEXT NOT NULL DEFAULT 'shop';
ALTER TABLE orders ADD COLUMN archived_at TIMESTAMPTZ;
-- Name, phone and delivery corrected here: {at, by}. While set, the shop sync keeps ours.
ALTER TABLE orders ADD COLUMN contact_edit JSONB;

-- Orders made here have no ConvertBuilder id: they get a negative one, so the shop sync never meets them.
CREATE SEQUENCE manual_order_seq START 1001;

ALTER TABLE order_events ADD COLUMN who TEXT;

CREATE INDEX orders_to_confirm_idx ON orders (ordered_at) WHERE confirmed_at IS NULL;

-- Same phone, any format: for "N поръчки от този клиент" and returned-parcel warnings.
CREATE INDEX orders_phone_key_idx ON orders (right(regexp_replace(phone, '\D', '', 'g'), 9));

-- New stage "prepared" (Изготвена): the waybill exists but the courier has not taken the parcel yet.
DROP INDEX IF EXISTS orders_stage_idx;
ALTER TABLE orders DROP COLUMN stage;
ALTER TABLE orders ADD COLUMN stage TEXT GENERATED ALWAYS AS (
  CASE
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
