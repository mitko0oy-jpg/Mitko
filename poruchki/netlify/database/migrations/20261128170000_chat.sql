-- Чат на сайта на магазина (/chat.js): автоматичният асистент отговаря, сложните случаи чакат човек.
-- Един ред = един разговор (sid е случаен номер в браузъра на клиента). Пазят се 90 дни.
CREATE TABLE chats (
  id bigserial PRIMARY KEY,
  shop text NOT NULL,
  sid text NOT NULL,
  -- [{r: 'u' клиентът | 'a' асистентът | 'h' човек от екипа, t: текст, at: време}]
  messages jsonb NOT NULL DEFAULT '[]',
  name text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  page text NOT NULL DEFAULT '',
  country text NOT NULL DEFAULT '',
  -- bot = отговаря асистентът; human = чака човек (асистентът е предал случая); done = приключен
  status text NOT NULL DEFAULT 'bot' CHECK (status IN ('bot', 'human', 'done')),
  case_kind text NOT NULL DEFAULT '',
  case_summary text NOT NULL DEFAULT '',
  order_id bigint REFERENCES orders (id) ON DELETE SET NULL,
  ai_calls integer NOT NULL DEFAULT 0,
  first_at timestamptz NOT NULL DEFAULT now(),
  last_at timestamptz NOT NULL DEFAULT now(),
  human_at timestamptz,
  seen_at timestamptz,
  UNIQUE (shop, sid)
);
CREATE INDEX chats_last_idx ON chats (last_at DESC);
CREATE INDEX chats_status_idx ON chats (status) WHERE status = 'human';
