# Агент за потвърждение на поръчки по телефона

Отделен проект от Еду БЕЛ. Започва с магазина BeeVenom BG (beevenombg.eu).

## Къде работи

- Netlify проект `mitko-obazhdania` (site id `ed6a6cc4-9068-4e84-a563-d283d598d3f9`), https://mitko-obazhdania.netlify.app
- Деплой от тази папка: MCP `deploy-site` със site id-то по-горе, командата се пуска в `poruchki-agent/`. Промяна на env променлива влиза в сила чак след нов деплой.
- `CB_SITES` съдържа само BeeVenom BG. Ключът е копиран от проекта `mitko-prodazhbi`.
- ElevenLabs (план Starter): изходящ агент `agent_2201m7cgch0jex6tkg81fc95ch2h`, входящ агент `agent_3401m7cgdf60esk8043hz0vwvj68`, webhook за резултатите `37f9d6d5e36244a0bab21494bda7bcf5`. Глас: Elena – Energetic, Friendly, and Clear (`fSxb5mPM1l5zTVVtM3Vb`), избрана от Митко. Друг кандидат: Zori (`Q7y69QlBd8K0CLYUdS1m`), най-близка до демото. Настройки на гласа: stability 0.55, similarity 0.75, optimize_streaming_latency 1 (по-ясен глас), кодеци на линията PCMA, G722, PCMU.
- Номер на агента: Zadarma София +359 2 437 0192, вътрешен номер 605568-100 (изходящи през `pbxfr1.zadarma.com`, TCP). В ElevenLabs е `phnum_0401m7cqsxpqf439twk8p463dzxw`, входящите отиват при входящия агент. В Zadarma: CallerID на вътрешния номер = +35924370192, пренасочване „винаги“ към `+35924370192@sip.rtc.elevenlabs.io:5060;transport=tcp`.
- Известен проблем (18.11): част от сървърите на Zadarma (185.45.155.9/.10/.11/.12/.22/.23) „вдигат“ изходящото обаждане 2,5 секунди след набирането – преди клиентът да може да вдигне – и го прекъсват след ~4 секунди. Обажданията през 185.45.155.41/.42 минават нормално. Това се вижда в SIP съобщенията, които ElevenLabs пази (`/v1/convai/conversations/<id>/sip-messages`). Такова обаждане се повтаря след 3 минути и не се брои за опит (`lineFaults`, най-много 3). Записът, който се чува в тези обаждания: „These calls are only possible within the country“. От 19.11 изходящите са спрени с `CALLS_PAUSED=1` в Netlify (входящите работят), докато се оправи линията. Сигнал до Zadarma: От 18.11 изходящите обаждания на ElevenLabs отиват към френския сървър на Zadarma `pbxfr1.zadarma.com` (от Америка `pbx.zadarma.com` води до Ню Йорк, от България – до Франция).
- Входящата линия ще е 0988 88 05 07, пренасочена към +359 2 437 0192, когато никой не вдигне.
- Унгария (само ръчен тест засега, не е вързан към автоматичните обаждания): агент `agent_3701m7n7k5ate54a8564r2swg65g` от `agent/beevenom-hu.json`, глас Mária (`WNxHBFUm0NC5fojx98kr`, добавен в библиотеката от споделените гласове). Първи тест (17.11): клиентът затвори след 4 секунди – вероятно заради българския номер; за Унгария трябва унгарски номер.

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

## Обратна връзка и повторна поръчка

Агент `agent_9501m7qd1wgqe31tq2cf7r4v86m0` (`agent/feedback-bg.json`, гласът на Елена) звъни на клиенти 2–3 седмици след доставката: ползват ли гела, доволни ли са, и ако са доволни – предложение за повторна поръчка (3 гела за 15,90 € + 8 билкови пластира или 5 гела за 19,90 € + 16 пластира, доставка 4,50 €; първо се предлага пакетът, който отговаря на предишната поръчка). Ако искат по-късно, записваме кога; ако не искат – деликатно питаме защо и не ги търсим повече.

- Списъкът с клиенти се прави от Middleware (доставени преди 14–20 дни, без нова поръчка) и стои извън git.
- `ELEVENLABS_API_KEY=… EL_FEEDBACK_AGENT_ID=agent_9501m7qd1wgqe31tq2cf7r4v86m0 EL_PHONE_NUMBER_ID=phnum_0401m7cqsxpqf439twk8p463dzxw node scripts/feedback-calls.mjs <list.json>` – звъни един по един, само пон–съб 10:00–19:30. `--to +359…` е тест, `--dry` показва какво ще каже агентът.
- Резултатите идват в Телеграм („💬 Обратна връзка“) и се пазят 60 дни в `feedback/` (кой поръча, кога да звъннем, кой не иска обаждания).

## Middleware

`lib/middleware.mjs` чете от публичния API на Middleware (`api.middleware.bg/v1`, ключ `MW_TOKEN`, `MW_TENANT`, магазини `MW_STORES`). Номерът на поръчката в магазина е `label` в Middleware.
- Преди обаждане: ако екипът вече е потвърдил поръчката (`is_confirmed`) или тя не е `pending`, агентът не звъни.
- „Къде ми е пратката“: статусът и куриерът идват от Middleware.

Публичният ключ само чете. Създаването на поръчки и отбелязването „потвърдена“ не са в документацията (`api.middleware.bg/docs/public`). За тях трябва достъп от Middleware.

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
| `MW_TOKEN`, `MW_TENANT`, `MW_STORES` | достъп до Middleware (само четене) и id на магазина BeeVenom |
| `MODE` | начален режим: `off`, `test` или `live`. Митко го сменя от Telegram с `/rezhim test\|live\|off` (записва се в Blobs и важи само за поръчки след командата) |
| `TEST_PHONE` | номерът на Митко за тестовете |
| `CALL_HOURS`, `CALL_HOURS_SUNDAY`, `SHOP_NAME`, `DELIVERY_DAYS` | по желание |

Данните на клиентите се пазят в Netlify Blobs в региона Франкфурт (`eu-central-1`). Изтриват се 14 дни след последното обаждане.

## Команди

```
npm install
npm test
ELEVENLABS_API_KEY=… node scripts/setup-elevenlabs.mjs agent/beevenom-bg.json --webhook https://<сайт>/webhook/elevenlabs
```
