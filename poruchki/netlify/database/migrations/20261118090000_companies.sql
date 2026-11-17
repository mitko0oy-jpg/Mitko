-- Companies: separate accounts on one platform. Everything that was here belongs to company 1 (Mitko's).
CREATE TABLE companies (
  id serial PRIMARY KEY,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);
INSERT INTO companies (id, name) VALUES (1, 'Основна фирма');
SELECT setval('companies_id_seq', 1);

ALTER TABLE users ADD COLUMN company_id integer REFERENCES companies (id);
UPDATE users SET company_id = 1;
ALTER TABLE users ALTER COLUMN company_id SET NOT NULL;
-- The platform owner (the first owner account) may create companies; he does not see their orders.
ALTER TABLE users ADD COLUMN is_owner boolean NOT NULL DEFAULT false;
UPDATE users SET is_owner = true WHERE id = (SELECT min(id) FROM users WHERE role = 'admin');
CREATE INDEX users_company_idx ON users (company_id);

ALTER TABLE shops ADD COLUMN company_id integer REFERENCES companies (id);
UPDATE shops SET company_id = 1;
ALTER TABLE shops ALTER COLUMN company_id SET NOT NULL;
CREATE INDEX shops_company_idx ON shops (company_id);

-- Settings of a company are "<key>@<company>"; the shared ones (fx rates, Econt office list) stay as they are.
UPDATE settings SET key = key || '@1'
 WHERE key IN ('sms', 'automation', 'shipping', 'econt_profile', 'nekorekten', 'products_tried', 'econt_match', 'mw_cursor')
    OR key LIKE 'courier:%' OR key LIKE 'courier_state:%';

-- nekorekten.com checks are made with a company's key: kept per company.
ALTER TABLE phone_checks ADD COLUMN company_id integer;
UPDATE phone_checks SET company_id = 1;
ALTER TABLE phone_checks ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE phone_checks DROP CONSTRAINT phone_checks_pkey;
ALTER TABLE phone_checks ADD PRIMARY KEY (company_id, phone_key);
