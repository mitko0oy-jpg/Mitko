# НВО тренажор по БЕЛ (самостоятелен HTML файл)

200 задачи в 10 модула по формата на НВО за 7. клас: оценка след всеки модул, бележник с дати, прогноза за НВО, пробна матура с таймер, тетрадка с грешки, изпращане на родител, нулиране. Прогресът се пази в браузъра (`localStorage`, ключ `edubel-nvo-trener-v1`).

Тук е само кодът. **Задачите са платено съдържание и не влизат в git** – стоят в `private/nvo-trener/bank/*.json` (форматът е в `SCHEMA.md`).

```
python3 -I tools/nvo-trener/validate.py private/nvo-trener/bank/*.json   # проверка на задачите
python3 -I tools/nvo-trener/build.py                                     # -> private/nvo-trener/nvo-trener.html и nvo-trener-file.html
```

- `nvo-trener.html` е за публикуване като Artifact (без `<html>`/`<head>` – добавят се при публикуване).
- `nvo-trener-file.html` е пълен документ за изпращане на клиенти.
- Ако папката с задачите липсва (нов контейнер), `extract.py` ги вади обратно от готов файл.
