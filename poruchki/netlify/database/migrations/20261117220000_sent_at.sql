-- When the order got its waybill ("Изпратени днес" filter). Set by a trigger whenever tracking_no
-- changes, whatever wrote it (our waybill, the shop, Middleware, the Econt/Speedy lookups).
ALTER TABLE orders ADD COLUMN sent_at timestamptz;

-- Existing orders: our waybill's time, else the first courier event, else the last one, else the order time.
UPDATE orders o SET sent_at = coalesce(
    CASE WHEN o.waybill->>'number' = o.tracking_no AND o.waybill->>'at' ~ '^\d{4}-\d{2}-\d{2}T' THEN (o.waybill->>'at')::timestamptz END,
    (SELECT min((e->>'at')::timestamptz) FROM jsonb_array_elements(o.parcel_events) e WHERE e->>'at' ~ '^\d{4}-\d{2}-\d{2}T'),
    o.parcel_at,
    o.ordered_at)
  WHERE o.tracking_no IS NOT NULL;

CREATE FUNCTION orders_set_sent_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.tracking_no IS NULL THEN
    NEW.sent_at := NULL;
  ELSIF TG_OP = 'INSERT' THEN
    -- Old orders imported with a waybill were sent long ago, not now.
    NEW.sent_at := coalesce(NEW.sent_at, CASE WHEN NEW.ordered_at < now() - interval '3 days' THEN NEW.ordered_at ELSE now() END);
  ELSIF OLD.tracking_no IS DISTINCT FROM NEW.tracking_no THEN
    NEW.sent_at := now();
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER orders_sent_at BEFORE INSERT OR UPDATE OF tracking_no ON orders
  FOR EACH ROW EXECUTE FUNCTION orders_set_sent_at();

CREATE INDEX orders_sent_idx ON orders (sent_at) WHERE sent_at IS NOT NULL;
