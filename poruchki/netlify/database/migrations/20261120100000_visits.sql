-- Live visitors of the shop pages (sent every ~30 s by c.js while the page is open). Anonymous:
-- a random visitor id from the browser, the country and city from Netlify's geo data, no IP address.
-- Kept 2 days (purgeVisits in the sync).
CREATE TABLE visits (
  shop text NOT NULL,
  sid text NOT NULL,                       -- one visit (browser tab)
  vid text NOT NULL DEFAULT '',            -- the browser (to count people, not visits)
  page text NOT NULL DEFAULT '',
  stage text NOT NULL DEFAULT 'browsing' CHECK (stage IN ('browsing', 'checkout', 'filling', 'ordered')),
  reached text NOT NULL DEFAULT 'browsing' CHECK (reached IN ('browsing', 'checkout', 'filling', 'ordered')),
  device text NOT NULL DEFAULT '',
  source text NOT NULL DEFAULT '',
  country text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  cart_lines integer NOT NULL DEFAULT 0,
  value text NOT NULL DEFAULT '',
  pages integer NOT NULL DEFAULT 1,
  first_at timestamptz NOT NULL DEFAULT now(),
  last_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  PRIMARY KEY (shop, sid)
);
CREATE INDEX visits_last_idx ON visits (last_at DESC);
