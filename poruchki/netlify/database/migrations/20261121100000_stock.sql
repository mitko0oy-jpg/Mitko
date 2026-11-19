-- Склад: наличности, заприхождаване и връзка с продуктите от поръчките.
-- Наличността сега = последното броене + заприходеното след него − бракуваното след него
--   − изпратеното след него (поръчки с товарителница) + върнатите пратки след него.
-- Всичко се смята при показване (lib/stock.mts), в базата е само това, което човек е въвел.

CREATE TABLE stock_items (
  id          BIGSERIAL PRIMARY KEY,
  company_id  integer NOT NULL REFERENCES companies (id),
  name        TEXT NOT NULL,
  grp         TEXT NOT NULL DEFAULT '',                 -- група на екрана (Козметика, Еду Бел…)
  unit_cost   NUMERIC(12, 4) NOT NULL DEFAULT 0,        -- доставна цена за брой (средна при нова доставка)
  counted_qty NUMERIC(12, 2) NOT NULL DEFAULT 0,        -- бройки при последното броене
  counted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),       -- кога е броено
  min_days    INT NOT NULL DEFAULT 30,                  -- „поръчай отново“, когато стигат за по-малко дни
  position    INT NOT NULL DEFAULT 0,
  archived    BOOLEAN NOT NULL DEFAULT false,
  note        TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, name)
);

-- Какво е направено с наличността: броене (count = новата бройка), доставка (receipt = +бройки),
-- брак / мостри / лично (writeoff = −бройки).
CREATE TABLE stock_moves (
  id        BIGSERIAL PRIMARY KEY,
  item_id   BIGINT NOT NULL REFERENCES stock_items (id) ON DELETE CASCADE,
  kind      TEXT NOT NULL CHECK (kind IN ('count', 'receipt', 'writeoff')),
  qty       NUMERIC(12, 2) NOT NULL,
  unit_cost NUMERIC(12, 4),
  before    NUMERIC(12, 2),                             -- колко показваше складът точно преди това
  note      TEXT NOT NULL DEFAULT '',
  user_id   BIGINT,
  who       TEXT,
  at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX stock_moves_item_idx ON stock_moves (item_id, at);

-- Кой продукт от поръчките колко бройки от склада взима: „Пакет 3+2“ → 5 гела.
-- product е точното име на реда в поръчката (без значение главни/малки букви).
CREATE TABLE stock_links (
  id      BIGSERIAL PRIMARY KEY,
  item_id BIGINT NOT NULL REFERENCES stock_items (id) ON DELETE CASCADE,
  product TEXT NOT NULL,
  units   NUMERIC(10, 2) NOT NULL DEFAULT 1 CHECK (units > 0),
  UNIQUE (item_id, product)
);
CREATE INDEX stock_links_product_idx ON stock_links (lower(btrim(product)));
