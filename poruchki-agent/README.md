# Агент за потвърждение на поръчки по телефона

Отделен проект от Еду БЕЛ. Започва с магазина BeeVenom BG (beevenombg.eu).

## Къде работи

- Netlify проект `mitko-obazhdania` (site id `ed6a6cc4-9068-4e84-a563-d283d598d3f9`), https://mitko-obazhdania.netlify.app
- Деплой от тази папка: MCP `deploy-site` със site id-то по-горе, командата се пуска в `poruchki-agent/`. Промяна на env променлива влиза в сила чак след нов деплой.
- `CB_SITES` съдържа само BeeVenom BG. Ключът е копиран от проекта `mitko-prodazhbi`.
- ElevenLabs (план Starter): изходящ агент `agent_2201m7cgch0jex6tkg81fc95ch2h`, входящ агент `agent_3401m7cgdf60esk8043hz0vwvj68`, webhook за резултатите `37f9d6d5e36244a0bab21494bda7bcf5`. Глас: Zori (`Q7y69QlBd8K0CLYUdS1m`), най-близък до демото, което Митко хареса.
- Входящата линия ще е 0988 88 05 07, пренасочена към номера на агента, когато никой не вдигне.

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

## Telegram

Командите са `/stop`, `/pusni`, `/status` и `/test`. Ботът слуша само чата, който се е регистрирал с `/start <TELEGRAM_SETUP_CODE>`.

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
| `MODE` | `test` (по подразбиране), `live` или `off` |
| `TEST_PHONE` | номерът на Митко за тестовете |
| `CALL_HOURS`, `CALL_HOURS_SUNDAY`, `SHOP_NAME`, `DELIVERY_DAYS` | по желание |

Данните на клиентите се пазят в Netlify Blobs в региона Франкфурт (`eu-central-1`). Изтриват се 14 дни след последното обаждане.

## Команди

```
npm install
npm test
ELEVENLABS_API_KEY=… node scripts/setup-elevenlabs.mjs agent/beevenom-bg.json --webhook https://<сайт>/webhook/elevenlabs
```
