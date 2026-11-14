# Пилот – рекламен автопилот (папка pilot/)

Отделно приложение от Еду БЕЛ в същото хранилище. Собственикът (Митко) не е програмист: обяснявай на български, просто.

## Бизнесът
BeeVenom (гел/крем/пластири с пчелна отрова) + Bio, наложен платеж, лендинги в ConvertBuilder (сайтове bg, max4, sk, vcelijed, sl, hu, bioshop). Мета акаунти: BeeVenom (BG), Словакия, Словения, Унгария, Bio – в EUR. Изискване: марж след реклама ≥ 25–30%. Другото приложение „Табло Печалба“ (репо tablo-app) пази себестойности и месечни разходи – внасят се от архива му.

## Архитектура
- `public/core/` – споделено ядро (чист JS, без зависимости): `metrics` (печалба за наложен платеж), `fatigue`, `diversity` (Андромеда), `regime` (пазар), `rules` (автопилот), `learning`, `studio`, `compliance` (твърдения, AI етикет), `calendar`, `simulator` + `demo-source` (демо), `service` (целият API).
- `public/assets/` – интерфейс без build стъпка; `api.js` избира сървър или демо в браузъра.
- `netlify/functions/` – `api` (`/api/*`), `sync` (на 15 мин.), `daily` (04:37 UTC).
- `netlify/lib/` – `meta` (Graph API v27), `sales` (формат v1 / уебхук), `ai` (Claude през AI Gateway), `video` (fal.ai), `market` (GDELT, новини, Trends, библиотека с реклами), `live-source`, `sync`, `auth`.
- Postgres: `docs` (общо хранилище), `insights`, `orders`, `site_sessions`, `auth_sessions`, `meta_writes`.

## Правила
- Парите се местят само от детерминирани правила (`rules.js`) в границите; AI само пише брифове и обяснения.
- Нови реклами и спиране на кампании никога не стават автоматично.
- Всеки текст минава `compliance.lint` – без медицински твърдения, лични атрибути, „преди/след“; AI хора с етикет (AI Act чл. 50).
- Тайните само в Netlify env. Без лични данни на клиенти в базата.

## Тестове
```
cd pilot && npm install && npm test
node scripts/dev-server.mjs 8899   # парола local-pilot-password, демо
```
