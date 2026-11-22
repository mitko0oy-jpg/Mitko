-- Where the orders come from (like RevOrder's Attribution), and the history of the visits by landing page.
-- visits: the first page of the visit (the landing) and the ad it came from (utm_* / click ids, from c.js).
ALTER TABLE visits ADD COLUMN IF NOT EXISTS landing text NOT NULL DEFAULT '';
ALTER TABLE visits ADD COLUMN IF NOT EXISTS utm jsonb;
-- leads: the same ad data, so the order can be tied to its ad after the visit is gone (visits are kept 2 days).
ALTER TABLE leads ADD COLUMN IF NOT EXISTS utm jsonb;
-- orders: where it came from, written once by the sync: {channel, source, campaign, adset, ad, ad_id, medium, page, later}.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS src jsonb;
CREATE INDEX IF NOT EXISTS orders_src_todo ON orders (ordered_at) WHERE src IS NULL;
-- One row per shop, day (Sofia), landing page, channel and campaign: kept long after the visits are deleted.
CREATE TABLE IF NOT EXISTS visit_days (
  shop text NOT NULL,
  day date NOT NULL,
  landing text NOT NULL,
  channel text NOT NULL,
  campaign text NOT NULL DEFAULT '',
  visits integer NOT NULL DEFAULT 0,
  people integer NOT NULL DEFAULT 0,
  checkout integer NOT NULL DEFAULT 0,
  filling integer NOT NULL DEFAULT 0,
  ordered integer NOT NULL DEFAULT 0,
  PRIMARY KEY (shop, day, landing, channel, campaign)
);
CREATE INDEX IF NOT EXISTS visit_days_day ON visit_days (day);
