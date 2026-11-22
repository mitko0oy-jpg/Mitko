-- When the parcel reached the office (or automat) where it waits for the customer.
-- The couriers send it back after about a week, so the list shows how many days it has been waiting.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS office_since TIMESTAMPTZ;

-- Parcels already waiting: the last courier event is the arrival.
UPDATE orders SET office_since = parcel_at WHERE parcel_status = 'at_office' AND office_since IS NULL;

CREATE INDEX IF NOT EXISTS orders_office_since ON orders (office_since) WHERE parcel_status = 'at_office';

-- Redirecting a parcel to another office or address goes into the same log as create/cancel.
ALTER TABLE waybill_log DROP CONSTRAINT IF EXISTS waybill_log_action_check;
ALTER TABLE waybill_log ADD CONSTRAINT waybill_log_action_check CHECK (action IN ('create', 'cancel', 'redirect'));
