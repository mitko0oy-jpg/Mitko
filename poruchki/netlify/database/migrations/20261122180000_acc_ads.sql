-- Разходите за реклама по рекламни профили (Meta и др.) – по дни или по месец (ден = 1-во число).
-- Влизат в печалбата като „Реклама Meta“; фактурите/разписките от Meta не се въвеждат отделно като разход,
-- за да не се броят два пъти (плащанията с карта към FACEBK в банката са само за равняване).
CREATE TABLE acc_ads (
  id          BIGSERIAL PRIMARY KEY,
  company_id  integer NOT NULL REFERENCES companies (id),
  source      TEXT NOT NULL DEFAULT 'meta',
  account     TEXT NOT NULL,                              -- ID на рекламния профил
  name        TEXT NOT NULL DEFAULT '',
  day         DATE NOT NULL,
  spend       NUMERIC(12, 2) NOT NULL DEFAULT 0,          -- във валутата на профила
  currency    TEXT NOT NULL DEFAULT 'EUR',
  spend_eur   NUMERIC(12, 2) NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, source, account, day)
);
CREATE INDEX acc_ads_day ON acc_ads (company_id, day);
