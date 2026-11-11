# Задача: страницата на крема с марка Bee Venom и български етикет

Страницата е готова в `landing/sefudun/index.html` (клон `claude/tender-sagan-53bkha`), но продуктът на снимките е с английския етикет SEFUDUN.
Митко иска **марката да е Bee Venom** и **етикетът да е на български** – навсякъде: снимки, видеа и текст.

Започни от този клон: `git fetch origin claude/tender-sagan-53bkha` и вземи `landing/sefudun/`. Работи и качвай в своя клон.
Пиши на Митко на български, просто и без технически стъпки.

## Какво НЕ се пипа

- Структурата, зелените цветове, цените (15,90 / 22,90 / 29,90 €), офертите и бутоните към `/krem-checkout1`, `/krem-checkout2`, `/krem-checkout3`
  (страницата е стъпка във фунията на beevenombg.eu: `beevenombg.eu/krem-s-pchelna-otrova-za-stavi`; `checkout1–3` там са на гела).
- Офертата е **без пластири**: 3+2 е само 5 бурканчета, старата цена 89,50 €, −67%, „Спестяваш €59,60“.
- Махнатите неща остават махнати: отзивите и „30 000+ клиенти“ (те са за гела), CPNP, „50 ужилвания“, „10×“, „не мирише/не цапа“.
- Без „артрит“ и обещания за лечение – кремът е козметичен продукт.

## 1. Етикетът (главната снимка)

Готова е: `landing/sefudun/izvor/bee-venom-krem-bg.jpg`, в Higgsfield е job `b6945952-e786-492e-9991-cfde782c8048`.
Текстът на етикета (точно така):
- бурканче: лого **Bee Venom** · „УЛТРА СИЛНА ФОРМУЛА“ · „КРЕМ ЗА СТАВИ“ · оранжево „+ Пчелна отрова“ · жълта лента „100% НАТУРАЛНИ СЪСТАВКИ 30 г“;
- кутия: лого **Bee Venom** · „УЛТРА СИЛНА ФОРМУЛА“ · зелена лента „КРЕМ ЗА“ · голямо „СТАВИ“ · „+ Пчелна отрова“ · значка „НАТУРАЛНИ СЪСТАВКИ 100%“ · „Нето 30 г“.

## 2. Снимките на страницата (Higgsfield, `gpt_image_2_6`, quality `high`)

За всяка: image 1 = сегашната сцена (job по-долу), image 2 = главната снимка `b6945952-…`.
Промпт: „Recreate image 1 exactly – identical composition, scene, lighting and framing. The only change: the jar (and box) now carry the Bee Venom Bulgarian labels from image 2, reproduced exactly: …“ + текста от т. 1. Провери всяка снимка за правопис, преди да я ползваш.

| Файл в `media/` | Сцена (job) | Размер / бележка |
|---|---|---|
| `hero-scene-700/1200.webp` + `.avif` | `6c3287ac-deb2-4e97-9c7a-5483605dd10d` | `background: transparent`, 2k, 1:1; изрежи до съдържанието; ширини 700 и 1200; ако височината се смени, смени `height` в HTML (сега 1200×1123) |
| `pack-1.jpg` + `.mp4` | `8b19c4b8-08df-4319-a846-685dba89abae` | 5:4 → 640×512 |
| `pack-2.jpg` + `.mp4` | `2f94db1c-4c3b-4e0f-9e93-2cbc0d59ad48` | 5:4 → 640×512 |
| `pack-3.jpg` + `.mp4` | `072e8af3-c7f1-4580-b2bb-5ab4f8866ef6` | 5:4 → 640×512, **без пластири** |
| `kak-deistva.jpg` + `.mp4` | `e7e25035-a26f-4f97-b261-eb9a6f5445a9` | 2k, 9:16 → 720×1274; постерът = първият кадър на видеото |
| `ben-formula.jpg` + `.mp4` | `ebd21bf2-f576-4904-b1f6-2a8f24a0dbdd` | 4:3 → 640×480; постерът = първият кадър на видеото |
| `how-2.jpg` + `.mp4` | `d519ead3-055b-489d-83e6-6223df4745e3` | 1:1 → 600×600 |
| `final.webp` (прозрачен) + `final.jpg` (бял фон, за og:image) | `2f631db7-aa2b-4379-a12b-b4dc71bf9f8c` | 2k, 4:5; после `remove_background`; изрежи, ширина 880 в платно 960, 40 px отгоре/отдолу; смени `height` в HTML (сега 960×728) |
| `vs-jar.webp` | `8164b217-9ca0-4a94-8962-a159c813d4ef` | само бурканчето, `background: transparent`, най-дългата страна 220 |

Прозрачните PNG от модела имат алфа 252–253 вместо 255 и мъгла 1–3: направи ≤4 → 0, ≥240 → 255 и изрежи по съдържанието.

## 3. Видеата

`seedance_2_5`, `mode: omni_reference`, `start_image` = `end_image` = новата снимка (job id), `duration: 4`, `resolution: 480p`, `generate_audio: false`, `aspect_ratio: auto` (9:16 за kak-deistva, 4:3 за ben-formula, 1:1 за how-2). ~12 кредита всяко.
Промпт: „Locked-off static camera, seamless loop. Only subtle motion: … The jars, box and all label text stay perfectly still, sharp and unchanged.“
Кодиране:

```
ffmpeg -i in.mp4 -vf "scale=W:H:force_original_aspect_ratio=increase:flags=lanczos,crop=W:H,fps=24" -an -c:v libx264 -preset slow -crf 27 -pix_fmt yuv420p -profile:v high -movflags +faststart out.mp4
```

## 4. Адресите на снимките

Зареждат се от jsDelivr, заковани към commit: `https://cdn.jsdelivr.net/gh/mitko0oy-jpg/Mitko@<SHA>/landing/sefudun/media/<файл>`.
Качи новите файлове (commit + push), после в `index.html` смени SHA-то във всички адреси към `landing/sefudun/media/` (сега `8cc20558da5ef92feb2ba220ca76010fad09d748`) с новия. Провери, че всеки адрес връща 200.

## 5. Текстът на страницата

- Логото: `<span>SEFU<b>DUN</b></span>` → `<span>Bee<b>Venom</b></span>`, `aria-label="SEFUDUN – начало"` → `"Bee Venom – начало"`.
- Всяко „SEFUDUN“ → „Bee Venom“ (title, meta, JSON-LD `name` и `brand`, заглавията „Защо да избереш …“ и „Вземи своя пакет …“, alt текстовете, въпросите, долната част).
- „SEFUDUN Ultra Strength“ (значката в началото и етикетът над „Ултра силна формула…“) → „Bee Venom · крем за стави“.
- „Ultra Strength формула с 5 активни съставки“ → „Ултра силна формула с 5 активни съставки“; в meta/og „Ultra Strength“ → „ултра силна формула“.
- Въпросът „Какво представлява кремът …?“: „SEFUDUN Ultra Strength Joint Relief Cream е …“ → „Bee Venom крем за стави е …“.
- Долу: „SEFUDUN Joint Relief Cream“ → „Bee Venom – крем за стави с пчелна отрова“, „© 2026 SEFUDUN крем за стави“ → „© 2026 Bee Venom“.
- Обнови `README.md` (марка Bee Venom, български етикет).
- Накрая няма да има нито едно „SEFUDUN“ и нито една английска дума от етикета (Joint, Relief, Cream, Ultra, Strength, Arthritis).

## 6. Проверка и предаване

- Снимки на цялата страница (компютър 1440 и телефон) с Playwright; провери началото, офертите, сравнението, стъпка 2 и финала.
- Пусни страницата локално и виж, че в конзолата няма грешки (прекъснатите видеа при превъртане са нормални).
- Прати на Митко: новия `index.html`, снимка на началото и на офертите и трите снимки на офертите в пълен размер (1120×896 JPG: `paket-1-burkanche.jpg`, `paket-2-plus-1.jpg`, `paket-3-plus-2.jpg`).
- Кажи колко кредита в Higgsfield си похарчил (очаквано ~100).
