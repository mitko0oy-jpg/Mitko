# Агент за потвърждение на поръчки по телефона

Отделен проект от Еду БЕЛ. Започва с магазина BeeVenom BG (beevenombg.eu).

## Къде работи

- Netlify проект `mitko-obazhdania` (site id `ed6a6cc4-9068-4e84-a563-d283d598d3f9`), https://mitko-obazhdania.netlify.app
- Деплой от тази папка: MCP `deploy-site` със site id-то по-горе, командата се пуска в `poruchki-agent/`. Промяна на env променлива влиза в сила чак след нов деплой.
- `CB_SITES` съдържа само BeeVenom BG. Ключът е копиран от проекта `mitko-prodazhbi`.
- ElevenLabs (план Starter): изходящ и входящ агент на български, глас Elena. Идентификаторите на агентите, номерата и webhook-а са в env променливите на Netlify и в таблата на ElevenLabs и Zadarma – не ги пиши тук, хранилището е публично.
- Номерата идват от Zadarma: за всяка държава отделен местен номер на отделен вътрешен номер в централата, с CallerID = този номер и пренасочване към ElevenLabs (SIP).

## Словакия (vcelijed.eu)

Агентът звъни на словаците на словашки, от словашки номер, в словашко време (09:00–20:00, неделя 10:00–18:00). Сценарият е в `agent/beevenom-sk-prompt.md` и `agent/style-sk.md`, настройките – в `agent/beevenom-sk.json`. Обобщенията в Telegram са на български.

За да тръгне:
1. Митко купува словашки номер в Zadarma и го слага като CallerID на нов вътрешен номер.
2. Номерът се добавя в ElevenLabs (Phone numbers → SIP trunk) → id-то отива в `EL_PHONE_NUMBER_ID_SK`.
3. `node scripts/setup-elevenlabs.mjs agent/beevenom-sk.json --voice <словашки глас> --webhook-id <същия webhook>` → `EL_AGENT_ID_SK`.
4. `SITES=bg,vcelijed`, деплой, после `/test sk` в Telegram.

## Как работи

1. На всеки 5 минути проверява ConvertBuilder за нови поръчки със статус „pending“ (`lib/convertbuilder.mjs`).
2. До 5 минути звъни на клиента през ElevenLabs Agents. Звъни само в часовете 09:00–21:00, а в неделя 10:00–19:00 (местно време на държавата).
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

## Telegram

Командите са `/stop`, `/pusni`, `/status`, `/test` и `/rezhim test|live|off`. Ботът слуша само чата, който се е регистрирал с `/start <TELEGRAM_SETUP_CODE>`.

## Променливи в Netlify (отделен проект)

| Променлива | Какво е |
|---|---|
| `CB_SITES` | JSON `[{"id":"bg","label":"BeeVenom BG","domain":"beevenombg.eu","key":"…"}]`, същият формат като в `mitko-prodazhbi` |
| `SITES` | на кои магазини да звъни, напр. `bg` |
| `ELEVENLABS_API_KEY` | ключ от ElevenLabs |
| `EL_AGENT_ID`, `EL_PHONE_NUMBER_ID`, `EL_PHONE_PROVIDER` (`sip` или `twilio`) | от ElevenLabs |
| `EL_WEBHOOK_SECRET` | дава го `scripts/setup-elevenlabs.mjs` |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_SETUP_CODE` | бот от @BotFather; другите две са произволни дълги низове |
| `TOOLS_SECRET` | тайната част от адреса на инструментите |
| `EL_INBOUND_AGENT_ID` | id на входящия агент (за известията след разговор) |
| `MODE` | начален режим: `off`, `test` или `live`. Митко го сменя от Telegram с `/rezhim test\|live\|off` (записва се в Blobs и важи само за поръчки след командата) |
| `TEST_PHONE` | номерът на Митко за тестовете |
| `CALL_HOURS`, `CALL_HOURS_SUNDAY`, `SHOP_NAME`, `DELIVERY_DAYS` | по желание |
| `EL_AGENT_ID_SK`, `EL_PHONE_NUMBER_ID_SK` | словашкият агент и словашкият номер в ElevenLabs |
| `CALL_HOURS_SK`, `CALL_HOURS_SUNDAY_SK`, `SHOP_NAME_SK`, `DELIVERY_DAYS_SK` | по желание (словашко време) |
| `SITE_COUNTRIES` | по желание, напр. `vcelijed:sk`; по подразбиране `bg`→България, `vcelijed`→Словакия |

Данните на клиентите се пазят в Netlify Blobs в региона Франкфурт (`eu-central-1`). Изтриват се 14 дни след последното обаждане.

## Команди

```
npm install
npm test
ELEVENLABS_API_KEY=… node scripts/setup-elevenlabs.mjs agent/beevenom-bg.json --webhook https://<сайт>/webhook/elevenlabs
```
