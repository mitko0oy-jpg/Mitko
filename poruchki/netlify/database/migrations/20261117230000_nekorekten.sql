-- nekorekten.com: reports about unreliable customers, checked by phone and kept per phone
-- (last 9 digits, like the client marks), so every order of that client shows them.
CREATE TABLE phone_checks (
  phone_key text PRIMARY KEY,
  phone text NOT NULL,                 -- as sent to nekorekten (359…)
  checked_at timestamptz NOT NULL DEFAULT now(),
  count integer NOT NULL DEFAULT 0,    -- reports found
  reports jsonb NOT NULL DEFAULT '[]', -- [{id, text, date, name, city}] – the newest 10, short
  error text
);
CREATE INDEX phone_checks_count_idx ON phone_checks (count) WHERE count > 0;
