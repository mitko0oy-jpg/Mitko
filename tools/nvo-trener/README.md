# НВО тренажор по БЕЛ

200 задачи в 10 модула по формата на НВО за 7. клас: оценка след всеки модул, бележник с дати, прогноза за НВО, пробна матура с таймер, тетрадка с грешки, изпращане на родител, нулиране. Прогресът се пази в браузъра (`localStorage`, ключ `edubel-nvo-trener-v1`).

Работи по два начина: на сайта (`/t/`, отваря се с личен код от PDF или стикер, оценките се пазят на сървъра към кода, до 3 устройства) и като самостоятелен файл (задачите са вътре, оценките – в браузъра). И двата ползват `public/assets/trener.js` и `trener.css`.

Тук е само кодът. **Задачите са платено съдържание и не влизат в git** – стоят в `private/nvo-trener/bank/*.json` (форматът е в `SCHEMA.md`).

```
python3 -I tools/nvo-trener/validate.py private/nvo-trener/bank/*.json   # проверка на задачите
python3 -I tools/nvo-trener/build.py                                     # -> private/nvo-trener/nvo-trener.html и nvo-trener-file.html
```

- `nvo-trener.html` е за публикуване като Artifact (без `<html>`/`<head>` – добавят се при публикуване).
- `nvo-trener-file.html` е пълен документ за изпращане на клиенти.
- `bank-all.json` (също в `private/`) е за сайта: `node scripts/admin.mjs trener-bank private/nvo-trener/bank-all.json`.
- `print.mjs` прави PDF-и за печат за кодове от живия сайт (през `/kodove/` на локален сървър): `node tools/nvo-trener/print.mjs pdf out.pdf КОД1,КОД2 --each` (по един PDF на клиент), `sheet` (A4 стикери) или `single`.
- Ако папката със задачите липсва (нов контейнер), `extract.py` ги вади обратно от готов файл.
