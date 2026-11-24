-- Път на клиента: what c.js sends with the order form – the browser's visits in the last 30 days
-- ([{t, s, p, u}], oldest first, at most 8) and the pages of the visit with the form ([path, …]).
-- attributeOrders copies them into orders.src (first touch, number of visits, days to the order, the path),
-- because the leads are deleted after 30 days.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS trail jsonb;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS path jsonb;

-- Microsoft Clarity (Data Export API, the last 24 h, at most 10 calls a day per project): pulled once a day per shop
-- and kept here, because Clarity itself only gives the last 3 days. kind: url / source / device;
-- key: the page, "source|medium|campaign" or the device; m: the metrics as Clarity names them.
CREATE TABLE IF NOT EXISTS clarity_days (
  shop text NOT NULL,
  day date NOT NULL,
  kind text NOT NULL,
  key text NOT NULL,
  m jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (shop, day, kind, key)
);
CREATE INDEX IF NOT EXISTS clarity_days_day ON clarity_days (day);
