-- Reminders to unfinished orders (SMS and e-mail), by hand or automatically, and who asked not to get them.
ALTER TABLE leads ADD COLUMN email text NOT NULL DEFAULT '';

CREATE TABLE lead_messages (
  id bigserial PRIMARY KEY,
  lead_id bigint NOT NULL REFERENCES leads (id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('sms', 'email')),
  step text NOT NULL DEFAULT 'manual' CHECK (step IN ('manual', 'auto1', 'auto2')),
  text text NOT NULL DEFAULT '',
  ok boolean NOT NULL DEFAULT true,
  error text,
  user_id bigint,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX lead_messages_lead_idx ON lead_messages (lead_id, at DESC);

-- Unsubscribed (the link in the e-mail): the last 9 digits of a phone or a lower-case e-mail.
CREATE TABLE optouts (
  company_id bigint NOT NULL,
  contact text NOT NULL,
  at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, contact)
);
