# Агент за потвърждение на поръчки по телефона

Отделен проект от Еду БЕЛ. Започва с магазина BeeVenom BG (beevenombg.eu).

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
