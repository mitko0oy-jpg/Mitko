-- What happens on the shop pages, for the live feed (Какво се случва): a visitor came, reached the order
-- form, started typing, ordered. Written when a visit moves on (savePing). Kept 2 days.
CREATE TABLE visit_events (
  id bigserial PRIMARY KEY,
  shop text NOT NULL,
  sid text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('came', 'checkout', 'filling', 'ordered')),
  country text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  source text NOT NULL DEFAULT '',
  device text NOT NULL DEFAULT '',
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX visit_events_at_idx ON visit_events (at DESC);
