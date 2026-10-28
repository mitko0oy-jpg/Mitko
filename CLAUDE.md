# Еду БЕЛ – платформа по български език и литература (5.–7. клас)

Основен контекст за Claude Code. Собственикът (Митко) не е програмист: обяснявай просто и на български и не го ангажирай с технически стъпки, които можеш да направиш сам.

## Важно: публично хранилище

Това хранилище е **публично**. Тук има само код.
- **Платеното съдържание** (карти, задачи, пробни изпити, PDF) **никога** не влиза в git. То живее в базата данни и се зарежда през `scripts/admin.mjs import`.
- Без тайни в кода. `ADMIN_TOKEN` е само в настройките на Netlify (`manage-env-vars`).
- `.gitignore` пази `private/`, `content/`, `*.pdf`, `*.docx`.

## Архитектура (всичко е в Netlify)

| Част | Къде |
|---|---|
| Страници (статичен HTML + JS модули, без build стъпка) | `public/` |
| API (Netlify Functions, TypeScript) | `netlify/functions/*.mts` |
| Обща сървърна логика | `netlify/lib/` (db, auth, access, ai, codes, http) |
| База данни (Netlify Database = Postgres) | миграции в `netlify/database/migrations/` |
| AI | Claude през Netlify AI Gateway (без отделен ключ); модели в `netlify/lib/ai.mts` |

- Netlify проект: `edubel-app` (site id `55509ac3-c1b8-48a7-b0f6-6bc120e685c9`), отбор `mitko0oy`.
- Деплой: MCP `deploy-site` дава команда `npx -y @netlify/mcp@latest --site-id … --proxy-path …`, която се пуска от корена. Всеки деплой е production и струва 15 кредита (безплатният план има 300 на месец), затова тествай локално и деплойвай рядко.
- Env променливи в Netlify: `ADMIN_TOKEN` (таен), `TEST_MODE=1` (показва и непрегледаното съдържание с банер). По желание: `AI_MODEL_FAST`, `AI_MODEL_STRONG`, `AI_FREE_TOTAL`, `AI_PAID_DAILY`, `AI_GLOBAL_DAILY`.

## Модел на данните

- `users` – родител / проверител (reviewer) / admin, с имейл и парола (scrypt).
- `children` – създава ги родителят: потребителско име + парола, клас. Без имейл на детето (под 14 г. е нужно съгласие на родител).
- `sessions` – бисквитка `eb_s`, в базата се пази само SHA-256. Родител може да „влезе като детето“ (сесия с user_id и child_id).
- `modules` + `items` – съдържанието. Видове модули: cards, diagnostic, t25, chars, pesho, exam, lesson, reading. `items.status`: draft / review / approved / hidden. Децата виждат само approved (в TEST_MODE и review).
- Пробната матура (`exam`) е по един елемент на част; ключът (`key`, `editing`) не се праща на браузъра, а се връща с резултата след „Предай“ (`POST /api/learn/exam`). Резултатът се пази в `progress.answer` като JSON.
- `units` – структурата на курса по програмата на МОН: клас → раздел (литература / език) → група → творба или тема. Ресурсите се свързват по заглавие (карти → `ws`, задача 25 → `w`, герои и Пешо → `work`). Източник: `curriculum/build-units.py` → `curriculum/units.json` (само заглавия, може да е в git); зарежда се с `admin.mjs import curriculum/units.json`. Страници: `/programa/` (публична карта), `/tema/?u=…` (стъпките на темата; за посетител – само структурата), `/urok/?u=…` (кратък урок), `/chetene/?u=…` (текст, аудио, думи). Стъпките винаги са в реда „Прочети и чуй“ → „Кратък урок“ → „Карти“ → „Задача 25“ → „Интервю с героя“ → „Научи Пешо“ (`STEP_ORDER` в `app.js`). Ненаписаните урок и текст показват празен шаблон (на децата – само в TEST_MODE).
- `progress` – отговорите + Leitner кутия за преговор (интервали 0, 1, 3, 7, 16, 35 дни).
- `entitlements` – платен достъп на родителя (`bel-all` или `bel7` и т.н.), важи за всичките му деца.
- `access_codes` – кодове (кутия, наложен платеж, тестери); вид `reviewer` прави профила проверител.
- `unlock_requests` – детето е стигнало края на безплатното; родителят го вижда с оферта.

## Магазин за картите (`/karti-nvo/`)

- Страници: `/karti-nvo/` (двете тестета), `/karti-nvo/literatura/`, `/karti-nvo/balgarski-ezik/`. Общ дизайн и ефекти: `public/assets/shop.css` и `shop.js` (без външни библиотеки заради CSP). Палитра по `<body data-deck="lit|ezik|hub">`.
- Цените и пакетите са **само** в `public/assets/shop-catalog.js` (евроценти). API-то за поръчки внася същия файл и смята сумата само на сървъра; тестът проверява, че цените в HTML съвпадат с каталога.
- Поръчка: наложен платеж, Еконт/Спиди офис или адрес → `POST /api/orders` → таблица `orders`. Администраторите ги виждат на `/poruchki/` (линк и от `/pregled/`); от командния ред: `admin.mjs orders`. Роля admin: `admin.mjs role <имейл> admin`.
- Медия (снимки и кратки видеа, генерирани с Higgsfield, и мостри на картите) е в `public/karti-nvo/media/`. Мострите са малко на брой – пълните тестета не влизат в git.

## Безплатно и платено

- Всеки модул има `free_count` или `free_ratio` (по подразбиране 30%). Сървърът връща само отключените елементи; заключените не стигат до браузъра.
- Когато детето реши безплатната част → екран „Покажи на родител“ → молба в родителския профил. **Никога не подканваме детето да купува** (забранено в ЕС); офертата е за родителя.
- AI: без достъп – 20 съобщения общо на дете; с достъп – 60 на ден; общ дневен таван.

## Работа със съдържанието

1. Източник: JSON от материалите на Еду БЕЛ (не са в git). `node scripts/build-content.mjs <data-dir> <out.json> [extra.json]` прави модулите; `extra.json` са допълнителни модули (напр. езиковите упражнения за 5.–7. клас), също извън git.
2. `EDUBEL_URL=https://edubel-app.netlify.app ADMIN_TOKEN=… node scripts/admin.mjs import out.json` – повторният импорт не пипа одобреното, ако съдържанието е същото; променените елементи се връщат за преглед.
3. Учителят-проверител одобрява или коментира на `/pregled/`.
4. `node scripts/admin.mjs comments` показва отворените коментари; поправката е с `node scripts/admin.mjs item <id> '{"data":{…},"resolution":"…"}'` и елементът пак отива за одобрение.
5. Правилата за съдържанието и AI безопасността: `docs/CONTENT_RULES.md`, `docs/AI_SAFETY.md`.
6. Кратък урок = модул `lesson` (напр. `bel7-uroci`), по един елемент на тема: `{"unit": "<slug>", "section": "literature|language", "sections": {…}}`. Разделите и подсказките са в `public/assets/lesson-view.js` (`LESSON_TEMPLATES`): литература – short, author, plot[], characters[{name,text}], ideas[], craft[], quotes[{q,why}], traps[], check[{q,a}]; език – short, steps[], examples[{ok,bad,why}], traps[], check[{q,a}]. Липсващ раздел се показва като празен шаблон.
7. Четене = модул `reading`: `{"unit": "<slug>", "text": "…", "glossary": [{"w","m"}], "audio": "<url>", "audioBy": "…", "source": "…"}` – само за автори, починали преди повече от 70 години. За аудио от друг домейн трябва `media-src` в CSP (`netlify.toml`).

## Тестове

```
node scripts/dev-server.mjs 8899        # локален сървър + Postgres в паметта
ADMIN_TOKEN=local-admin-token-local-admin-token-0000 EDUBEL_URL=http://localhost:8899 node scripts/admin.mjs import <content.json>
EDUBEL_URL=http://localhost:8899 npm test
```

## Бранд

Цветове и шрифтове – `public/assets/app.css` (Literata + Golos Text, хостнати при нас). Тон: топъл, ясен; типографски кавички „…“ и тире –. Не използвай думата „теза“ за задача 25 (официално: „задача с разширен свободен отговор“).

## Следващи стъпки

- Плащане с карта (Stripe) и имейли (Brevo) – изискват акаунти на Митко.
- Свой домейн `app.edubel.site` – един DNS запис в SuperHosting.bg.
- Още пробни матури, литература за 5. и 6. клас, после математика.
- Преди официалния старт: `TEST_MODE` махнат, юрист за условията, базата в ЕС регион.
