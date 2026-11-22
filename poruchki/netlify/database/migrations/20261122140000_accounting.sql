-- Счетоводство: нашето управленско счетоводство (официалното води външната счетоводителка).
-- Приходите идват сами от поръчките (взетите – по датата на доставка), себестойността – от склада,
-- куриерите – от товарителниците. Тук се пази само това, което идва отвън: разходите (фактури),
-- движенията по банковата сметка и номерата на документите за месечния файл към НАП.

-- Разход или приход извън поръчките (фактура, такса, заплата…), или върната сума на клиент.
CREATE TABLE acc_entries (
  id          BIGSERIAL PRIMARY KEY,
  company_id  integer NOT NULL REFERENCES companies (id),
  day         DATE NOT NULL,                              -- датата на документа (за месеца в отчета)
  kind        TEXT NOT NULL DEFAULT 'expense' CHECK (kind IN ('expense', 'income', 'refund')),
  category    TEXT NOT NULL DEFAULT 'other',
  party       TEXT NOT NULL DEFAULT '',                   -- доставчик / контрагент
  description TEXT NOT NULL DEFAULT '',
  doc_no      TEXT NOT NULL DEFAULT '',                   -- № на фактурата
  net         NUMERIC(12, 2) NOT NULL DEFAULT 0,          -- без ДДС
  vat         NUMERIC(12, 2) NOT NULL DEFAULT 0,          -- ДДС за приспадане (0 без право на кредит)
  total       NUMERIC(12, 2) NOT NULL DEFAULT 0,          -- с ДДС, във валутата на документа
  currency    TEXT NOT NULL DEFAULT 'EUR',
  total_eur   NUMERIC(12, 2) NOT NULL DEFAULT 0,
  paid_by     TEXT NOT NULL DEFAULT 'bank' CHECK (paid_by IN ('bank', 'card', 'cash', 'courier', 'unpaid', 'other')),
  order_no    TEXT NOT NULL DEFAULT '',                   -- върната сума: № на поръчката
  refund_paym SMALLINT,                                   -- върната сума: 1 сметка, 2 карта, 3 в брой, 4 друг (НАП)
  shop        TEXT,                                       -- върната сума: магазинът на поръчката
  source      TEXT NOT NULL DEFAULT 'manual',             -- manual / import
  ext_key     TEXT,                                       -- ключ при импорт – повторният импорт не дублира
  note        TEXT NOT NULL DEFAULT '',
  who         TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, ext_key)
);
CREATE INDEX acc_entries_day_idx ON acc_entries (company_id, day);

-- Ред от банковото извлечение: + постъпление, − плащане.
CREATE TABLE acc_bank (
  id          BIGSERIAL PRIMARY KEY,
  company_id  integer NOT NULL REFERENCES companies (id),
  account     TEXT NOT NULL DEFAULT '',                   -- коя сметка (последните цифри на IBAN или име)
  day         DATE NOT NULL,
  amount      NUMERIC(12, 2) NOT NULL,
  currency    TEXT NOT NULL DEFAULT 'EUR',
  party       TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  ref         TEXT NOT NULL DEFAULT '',
  balance     NUMERIC(12, 2),                             -- салдото след движението, ако банката го дава
  category    TEXT NOT NULL DEFAULT '',                   -- '' = неразпределено
  entry_id    BIGINT REFERENCES acc_entries (id) ON DELETE SET NULL,
  ext_key     TEXT,
  note        TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, ext_key)
);
CREATE INDEX acc_bank_day_idx ON acc_bank (company_id, day);

-- Номер на документа за поръчката във файла към НАП (DOC_N е цяло число до 10 цифри и не се повтаря
-- в един магазин). Даваме го веднъж – при първото влизане на поръчката във файл – и после не се мени.
CREATE TABLE nap_docs (
  order_id BIGINT PRIMARY KEY REFERENCES orders (id) ON DELETE CASCADE,
  shop     TEXT NOT NULL,
  doc_n    BIGINT NOT NULL,
  at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (shop, doc_n)
);

-- Изпратените файлове: кога, на кого и какво (sha256), за да се прати поправка само при промяна.
CREATE TABLE nap_sent (
  id         BIGSERIAL PRIMARY KEY,
  company_id integer NOT NULL REFERENCES companies (id),
  shop       TEXT NOT NULL,
  month      TEXT NOT NULL,                               -- 2026-11
  sha        TEXT NOT NULL,
  orders     INT NOT NULL DEFAULT 0,
  total      NUMERIC(12, 2) NOT NULL DEFAULT 0,
  sent_to    TEXT NOT NULL DEFAULT '',
  auto       BOOLEAN NOT NULL DEFAULT false,
  ok         BOOLEAN NOT NULL DEFAULT true,
  error      TEXT,
  at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX nap_sent_idx ON nap_sent (company_id, month, shop, at DESC);
