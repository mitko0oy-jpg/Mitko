# Агент за потвърждение на поръчки по телефона

Отделен проект от Еду БЕЛ. Започва с магазина BeeVenom BG (beevenombg.eu).

## Къде работи

- Netlify проект `mitko-obazhdania` (site id `ed6a6cc4-9068-4e84-a563-d283d598d3f9`), https://mitko-obazhdania.netlify.app
- Деплой от тази папка: MCP `deploy-site` със site id-то по-горе, командата се пуска в `poruchki-agent/`. Промяна на env променлива влиза в сила чак след нов деплой.
- `CB_SITES` съдържа само BeeVenom BG. Ключът е копиран от проекта `mitko-prodazhbi`.
- ElevenLabs (план Starter): изходящ агент `agent_2201m7cgch0jex6tkg81fc95ch2h`, входящ агент `agent_3401m7cgdf60esk8043hz0vwvj68`, webhook за резултатите `37f9d6d5e36244a0bab21494bda7bcf5`. Глас: Elena – Energetic, Friendly, and Clear (`fSxb5mPM1l5zTVVtM3Vb`), избрана от Митко. Друг кандидат: Zori (`Q7y69QlBd8K0CLYUdS1m`), най-близка до демото. Настройки на гласа: stability 0.55, similarity 0.75, optimize_streaming_latency 1 (по-ясен глас), кодеци на линията PCMA, G722, PCMU.
- Номер на агента: Zadarma София +359 2 437 0192, вътрешен номер 605568-100 (`pbx.zadarma.com`, TCP). В ElevenLabs е `phnum_0401m7cqsxpqf439twk8p463dzxw`, входящите отиват при входящия агент. В Zadarma: CallerID на вътрешния номер = +35924370192, пренасочване „винаги“ към `+35924370192@sip.rtc.elevenlabs.io:5060;transport=tcp`.
- Входящата линия ще е 0988 88 05 07, пренасочена към +359 2 437 0192, когато никой не вдигне.

## Как работи

1. На всеки 5 минути проверява ConvertBuilder за нови поръчки със статус „pending“ (`lib/convertbuilder.mjs`).
2. До 5 минути звъни на клиента през ElevenLabs Agents. Звъни само в часовете 09:00–21:00, а в неделя 10:00–19:00 (софийско време).
3. Агентът потвърждава продуктите, сумата и доставката. Сценарият е в `agent/beevenom-bg-prompt.md`, а настройките (първо изречение и полетата за резултата) са в `agent/beevenom-bg.json`.
4. След разговора ElevenLabs праща резултата на `/webhook/elevenlabs`. Митко получава съобщение в Telegram за всичко, което иска внимание.
5. Ако клиентът не вдигне, агентът опитва пак след 1 час и след 21 часа. След 3 опита пише на Митко.
6. Ако поръчката вече не е „pending“ в ConvertBuilder, агентът не звъни.

Фаза 1:
- Агентът не сменя статуса в ConvertBuilder или Middleware. Митко или колегата отбелязват потвърждението.
- Няма ъпсел.
- `MODE=test` звъни само на `TEST_PHONE` с данните на истинската поръчка, а не на клиента.

## Входяща линия

Вторият агент (`agent/inbound-bg.json`, `agent/inbound-bg-prompt.md`) отговаря на обаждания. По време на разговора вика функцията `/tools/<TOOLS_SECRET>/…`:
- `find-order` намира поръчките по номера на обаждащия се (`system__caller_id`) в ConvertBuilder за последните 45 дни.
- `quote-order` смята сумата по `agent/pricelist-bg.json`. Сумите никога не се смятат от AI.
- `submit-order` записва поръчката в Blobs (`phone-orders/…`) и я праща в Telegram.

ConvertBuilder API не може да създава поръчки, а само да ги чете и променя. Затова поръчката по телефона се въвежда в Middleware на ръка.

Ценоразписът е чернова, докато Митко не го потвърди. Доставката е 4,50 € до офис на Спиди или Еконт и 5,90 € до адрес със Спиди.

## Обаждания през Zadarma (callback)

Zadarma позволява на българския номер да звъни само от България. ElevenLabs звъни от сървъри в чужбина, затова изходящите през SIP trunk се спират със записа „These calls are only possible within the country“ (тикет №903425). Затова при `CALL_ROUTE=zadarma` посоката е обърната:

1. Двигателят записва данните на поръчката в Blobs (`pending/<номер>`) и вика Zadarma API `/v1/request/callback/` (`lib/zadarma.mjs`, `lib/callback.mjs`): `from` = нашият номер (`ZADARMA_FROM`), `to` = клиентът със „+“ отпред (иначе централата добавя 359 втори път), `sip` = вътрешният номер (`ZADARMA_SIP`), `predicted=1` (първо звъни на клиента).
2. Когато клиентът вдигне, Zadarma го свързва с +359 2 437 0192, а той е пренасочен към ElevenLabs. За ElevenLabs това е входящо обаждане към входящия агент.
3. Преди агентът да проговори, ElevenLabs пита `/webhook/el-init/<TOOLS_SECRET>` кой звъни (`caller_id`). Ако има чакащо обаждане за този номер (до 15 минути), отговорът носи променливите на поръчката, сценария, първото изречение и езика на агента за потвърждение (`EL_AGENT_ID`, чете се от ElevenLabs и се пази 10 минути). Иначе е нормалната входяща линия.
4. Резултатът идва както досега в `/webhook/elevenlabs` по `order_key`. Ако агентът не е свързан до 5 минути след обаждането, клиентът не е вдигнал („no-answer“) и агентът опитва пак по обичайния график.

Еднократна настройка:
- Zadarma: API ключ и тайна (Настройки → Интеграции и API) в `ZADARMA_KEY`, `ZADARMA_SECRET`. Тикет до поддръжката да изключат английското съобщение „моля, изчакайте“ при callback.
- Netlify: `CALL_ROUTE=zadarma`, `ZADARMA_FROM=+35924370192`, `ZADARMA_SIP=100`, после деплой.
- ElevenLabs: в Telegram командата `/callback_setup`. Тя насочва webhook-а за начало на разговор към сайта, разрешава на входящия агент да взима данни от него и да сменя сценария, първото изречение и езика, и добавя полетата за резултата от агента за потвърждение. Проверява какво е запазено и казва, ако нещо липсва.

## Middleware

`lib/middleware.mjs` чете от публичния API на Middleware (`api.middleware.bg/v1`, ключ `MW_TOKEN`, `MW_TENANT`, магазини `MW_STORES`). Номерът на поръчката в магазина е `label` в Middleware.
- Преди обаждане: ако екипът вече е потвърдил поръчката (`is_confirmed`) или тя не е `pending`, агентът не звъни.
- „Къде ми е пратката“: статусът и куриерът идват от Middleware.

Публичният ключ само чете. Създаването на поръчки и отбелязването „потвърдена“ не са в документацията (`api.middleware.bg/docs/public`). За тях трябва достъп от Middleware.

## Платформата „Поръчки“

Когато са зададени `PLATFORM_URL` и `PLATFORM_TOKEN`, агентът работи с платформата (`lib/platform.mjs`, API `/api/agent/…` на mitko-poruchki.netlify.app):
- Взима новите поръчки на магазините от `SITES` (пчелната отрова: `bg,max4,bioshop`) и всяка поръчка, за която Митко е натиснал „AI потвърждение“ (до 14 дни назад). Звъни 5 минути след поръчката (тикът е на 5 минути).
- Преди обаждане проверява, че поръчката още не е потвърдена, няма товарителница и не е архивирана.
- Казва на платформата кога звъни (`calling`) и резултата от всеки опит (`result`). Платформата пише бележка: „☎ AI звъня (опит 1) – не вдигна, ще опита пак около 17:58“, „AI потвърди по телефона. Корекция: …“; потвърждава като „AI агент“, добавя кутията пластири с цената от ценоразписа и, ако е включено в Настройки, създава товарителницата и я праща към „Печат“.
- Поръчките по телефона (входящата линия) влизат направо в платформата като потвърдени; Telegram казва номера им.
- Ако платформата не отговаря, агентът чете ConvertBuilder както преди. Отчетите към платформата никога не спират обажданията.

## Офиси по време на разговора

Входящият агент има инструмент `find_office` (куриер, град, думите на клиента) → `/api/agent/offices` на платформата → 1–3 най-подходящи офиса с код. Кодът отива в `submit_order` (`office_id`) и платформата прави товарителницата сама. Ако агентът не подаде код, платформата пак търси офиса по думите; без ясен офис пише „Избери офиса“ в бележката.

Промяна на инструментите в ElevenLabs без да се пипа друго: `ELEVENLABS_API_KEY=… TOOLS_SECRET=… node scripts/sync-tools.mjs agent/inbound-bg.json <agent_id> https://mitko-obazhdania.netlify.app`, текстът – `scripts/update-agents.mjs`.

## Telegram

Командите са `/stop`, `/pusni`, `/status`, `/test` и `/rezhim test|live|off`. Ботът слуша само чата, който се е регистрирал с `/start <TELEGRAM_SETUP_CODE>`.

## Променливи в Netlify (отделен проект)

| Променлива | Какво е |
|---|---|
| `CB_SITES` | JSON `[{"id":"bg","label":"BeeVenom BG","domain":"beevenombg.eu","key":"…"}]`, същият формат като в `mitko-prodazhbi` |
| `SITES` | на кои магазини да звъни: `bg,max4,bioshop` (пчелната отрова) |
| `PLATFORM_URL`, `PLATFORM_TOKEN` | `https://mitko-poruchki.netlify.app` и `AGENT_TOKEN` от платформата |
| `ELEVENLABS_API_KEY` | ключ от ElevenLabs |
| `EL_AGENT_ID`, `EL_PHONE_NUMBER_ID`, `EL_PHONE_PROVIDER` (`sip` или `twilio`) | от ElevenLabs |
| `EL_WEBHOOK_SECRET` | дава го `scripts/setup-elevenlabs.mjs` |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_SETUP_CODE` | бот от @BotFather; другите две са произволни дълги низове |
| `TOOLS_SECRET` | тайната част от адреса на инструментите |
| `EL_INBOUND_AGENT_ID` | id на входящия агент (за известията след разговор) |
| `MW_TOKEN`, `MW_TENANT`, `MW_STORES` | достъп до Middleware (само четене) и id на магазина BeeVenom |
| `MODE` | начален режим: `off`, `test` или `live`. Митко го сменя от Telegram с `/rezhim test\|live\|off` (записва се в Blobs и важи само за поръчки след командата) |
| `TEST_PHONE` | номерът на Митко за тестовете |
| `CALL_ROUTE` | `zadarma` (Zadarma звъни и свързва с агента) или `elevenlabs` (по подразбиране) |
| `ZADARMA_KEY`, `ZADARMA_SECRET` | API ключ и тайна от Zadarma (тайни) |
| `ZADARMA_FROM`, `ZADARMA_SIP` | `+35924370192` и вътрешният номер `100` |
| `CALL_HOURS`, `CALL_HOURS_SUNDAY`, `SHOP_NAME`, `DELIVERY_DAYS` | по желание |

Данните на клиентите се пазят в Netlify Blobs в региона Франкфурт (`eu-central-1`). Изтриват се 14 дни след последното обаждане.

## Команди

```
npm install
npm test
ELEVENLABS_API_KEY=… node scripts/setup-elevenlabs.mjs agent/beevenom-bg.json --webhook https://<сайт>/webhook/elevenlabs
```
