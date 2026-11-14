# Кошер – рекламното приложение (папка pilot/)

Отделно приложение от Еду БЕЛ в същото хранилище. Собственикът (Митко) не е програмист: обяснявай на български, просто.

## Бизнесът
BeeVenom (гел/крем/пластири с пчелна отрова) + Bio, наложен платеж, лендинги в ConvertBuilder (сайтове bg, max4, sk, vcelijed, sl, hu, bioshop). Мета акаунти: BeeVenom (BG), Словакия, Словения, Унгария, Bio – в EUR. Изискване: марж след реклама ≥ 25–30%. Другото приложение „Табло Печалба“ (репо tablo-app) пази себестойности и месечни разходи – внасят се от архива му.

## Архитектура
- `public/core/` – споделено ядро (чист JS, без зависимости): `metrics` (печалба за наложен платеж), `fatigue`, `diversity` (Андромеда), `regime` (пазар), `rules` (автопилот), `learning`, `studio`, `needs` (кои реклами да се сменят, структури на банерите, поръчката към модела), `compliance` (твърдения, AI етикет), `calendar`, `simulator` + `demo-source` (демо), `service` (целият API).
- `public/assets/` – интерфейс без build стъпка; `api.js` избира сървър или демо в браузъра.
- `netlify/functions/` – `api` (`/api/*`), `sync` (на 15 мин.), `daily` (04:37 UTC).
- `netlify/lib/` – `meta` (Graph API v27), `sales` (формат v1 / уебхук), `ai` (Claude през AI Gateway), `higgsfield` (банери с GPT Image 2.5 през Ads Studio + видео Kling 3.0), `market` (GDELT, новини, Trends, библиотека с реклами), `live-source`, `sync`, `auth`.
- Postgres: `docs` (общо хранилище), `insights`, `orders`, `site_sessions`, `auth_sessions`, `meta_writes`.

## Правила
- Парите се местят само от детерминирани правила (`rules.js`) в границите; AI само пише брифове и обяснения.
- Нови реклами и спиране на кампании никога не стават автоматично. „Нови реклами“: Кошер предлага коя реклама да се смени и с каква НОВА идея (различна по ≥3 от 5 оси спрямо адсета + структура на банера); Митко натиска „Направи“ → 4 банера → „Пусни“ (старата се спира).
- Всеки текст минава `compliance.lint` – без медицински твърдения, лични атрибути, „преди/след“; AI хора с етикет (AI Act чл. 50).
- Тайните само в Netlify env. Без лични данни на клиенти в базата.

## Netlify
- Проект: `kosher-reklami` (преди `pilot-reklami`) (site id `48cad0d2-7c73-46f2-8f0f-98145b887ba3`), отбор `mitko0oy`, адрес https://kosher-reklami.netlify.app.
- Сайтът е зад вход с Netlify акаунта на отбора (team login) + паролата на приложението (`APP_PASSWORD`). Преди уебхуците (поръчки, Мета) да заработят, защитата трябва да е само за непродукционни деплои.
- Деплой: MCP `deploy-site` дава команда `npx -y @netlify/mcp@latest --site-id … --proxy-path …`, която се пуска **от папка `pilot/`**. Всеки деплой е 15 кредита – тествай локално.
- Env: зададени са `APP_PASSWORD`, `SALES_MCP_URL` (адресът на MCP сървъра за продажби от проекта `mitko-prodazhbi`, с ключа му – с изричното съгласие на Митко) и `META_TOKEN` (системен потребител „Tablo App“, приложение beevenom, права ads_management, ads_read, business_management, pages_show_list, pages_read_engagement; само Production). Предстои `META_APP_SECRET` (нужен е вход с профила, създал приложението); за банерите и видеата `HIGGSFIELD_API_KEY` ("id:secret" от console.higgsfield.ai; по избор `HIGGSFIELD_IMAGE_MODE=flare`, `HIGGSFIELD_VIDEO_MODEL`); по избор `SERPAPI_KEY`, `META_WEBHOOK_VERIFY`.
- Направления: акаунтът „Bio“ върти Еду БЕЛ (карти НВО) и BeeVenom BG; „Словения“ – BeeVenom SI. Кампаниите се разпределят по ключови думи в имената (`public/core/lines.js`, редактируемо в Настройки). Сумите в HUF се превръщат в EUR по курса от сървъра за продажби.
- Себестойностите са от вградения списък на „Табло Печалба“ и се броят за цялата поръчка (с доставката); куриерът е 0 по подразбиране. Чакат потвърждение от Митко.
- Поръчките се теглят от `mitko-prodazhbi` (MCP `get_sales`, формат v1) при всяка проверка на 15 мин.; веднъж дневно – последните 60 дни.

## Тестове
```
cd pilot && npm install && npm test
node scripts/dev-server.mjs 8899   # парола local-pilot-password, демо
```
