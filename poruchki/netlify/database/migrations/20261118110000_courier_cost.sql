-- What the courier really charges for the parcel (what Middleware shows in brackets next to the delivery price).
-- Our own waybills have it at once; for the others we ask Speedy (shipment/info) and Econt (shipment status).
ALTER TABLE orders ADD COLUMN courier_cost NUMERIC(12, 2);
ALTER TABLE orders ADD COLUMN courier_cost_at TIMESTAMPTZ; -- asked (also when the courier had no price)
UPDATE orders SET courier_cost = (waybill->>'price')::numeric, courier_cost_at = now()
 WHERE waybill IS NOT NULL AND waybill->>'number' = tracking_no AND (waybill->>'price') ~ '^[0-9.]+$';
CREATE INDEX orders_cost_idx ON orders (ordered_at DESC) WHERE tracking_no IS NOT NULL AND courier_cost_at IS NULL;
