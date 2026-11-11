# Глас навсякъде: озвучени задачи, аудио уроци и говорещи герои

Проучване за Еду БЕЛ, 10.11.2026. Фактите са с източник (линк след твърдението). Нашите изводи са отбелязани с **НАША ПРЕПОРЪКА**. Цените са в щатски долари, без ДДС. Сметките са приблизителни и се опират на данните от заданието: 104 000 знака за 375-те задачи, 88 епизода по ~3 500 знака (~4 мин), 1,4 MB на епизод, 40 KB на клип към задача.

Ориентир за дължина: 3 500 знака ≈ 4 мин, т.е. ~14,6 знака в секунда. Така 104 000 знака ≈ 2 часа звук, а 88 епизода ≈ 5,9 часа.

---

## 0. Накратко

- Озвучаването е евтино при всички доставчици: всичко сега (412 000 знака) струва от **$0** (безплатните квоти на Azure или Google) до **~$33** (ElevenLabs директно) или **~$62–90** (ElevenLabs v4 през Higgsfield, гласът Benji, както досега).
- Скъпото е **доставката** през Netlify: 1 000 деца ≈ 40 GB на месец ≈ 860–930 кредита (почти целият месечен план), 10 000 деца ≈ 8 600–9 300 кредита (~$60–90 на месец). При Cloudflare R2 трафикът е безплатен, а при Bunny CDN е $1–4 на месец.
- Модерният невронен глас учи **приблизително толкова добре**, колкото човешкия. Старите роботски гласове учат по-зле. Говорещ герой дава малка полза (g ≈ 0,2) и повече при учениците до 12. клас, но лесно разсейва. Затова децата трябва да могат да спрат гласа, да пропуснат реплика и да сменят скоростта.
- Слушането е **приблизително равно на четенето** по разбиране, но при слушане умът се разсейва повече. Въпроси по средата на епизода намаляват разсейването наполовина. Най-подходяща дължина е 4–8 мин.
- Анимацията на героите е най-евтина така: един кратък говорещ клип за всеки герой (Higgsfield, ~10–15 кредита за 5 сек.) като MP4 до ~400 KB. По-евтин и по-гъвкав, но по-трудоемък вариант е Rive с усти по фонеми (така прави Duolingo).

---

## 1. Синтез на реч (TTS) за български

### 1.1 Факти по доставчици

**ElevenLabs (директно)**
- Абонаменти (уеб): Free 10 000 кредита (без търговски лиценз), Starter $6 / 30 000, Creator $22 / 121 000, Pro $99 / 600 000, Scale $299 / 1 800 000, Business $990 / 6 000 000. Неизползваните кредити се прехвърлят до 2 месеца. Starter дава Instant Voice Cloning, а Creator и нагоре дават и Professional Voice Cloning. [elevenlabs.io/pricing](https://elevenlabs.io/pricing)
- API се плаща в долари, не в кредити: **v4, v3 и Multilingual v2 струват $0,08 за 1 000 знака**, а Flash/Turbo (и v4 Turbo) струват $0,04. Абонаментът Creator ($22) дава ~275 000 знака v4 през API, Pro ($99) дава ~1 238 000. [elevenlabs.io/pricing/api](https://elevenlabs.io/pricing/api)
- Eleven v4 е пуснат на 28.09.2026 и поддържа 90+ езика (API модел `eleven_v4`). [elevenlabs.io/blog/eleven-v4](https://elevenlabs.io/blog/eleven-v4), [the-decoder](https://the-decoder.com/elevenlabs-new-v4-speech-model-makes-ai-voices-more-expressive-and-consistent/)
- Българският е в списъка на v3 и Multilingual v2, а Flash v2.5 поддържа всички езици на v2. За v4 официалната страница препраща към отделен списък. На практика репликите на Ерчо вече са направени на български с v4. [ElevenLabs – езици](https://elevenlabs.io/docs/help-center/other/what-languages-do-you-support)
- Клониране: изрично съгласие на човека, чийто глас се клонира, отговорността е на потребителя. Instant клонове не могат да се споделят в библиотеката. [ElevenLabs Safety Policy (обобщение)](https://conductatlas.com/platform/elevenlabs/elevenlabs-safety-policy/voice-cloning-consent-requirement/), [help.elevenlabs.io](https://help.elevenlabs.io/hc/en-us/articles/30192704002321-Can-I-share-an-AI-generated-voice-in-the-Voice-Library)

**Ерчо и гласът „Benji“ в Higgsfield**
- В Higgsfield Ерчо е предварителният глас **Benji** (male, `voice_id e6f9b893-51b1-51d3-afe9-9e0482cb7ac1`, [мостра](https://d1xarpci4ikg0w.cloudfront.net/audio_voice/e6f9b893-51b1-51d3-afe9-9e0482cb7ac1/preview-d7f1d3d8ca52125c.mp3)). Идентификаторите на Higgsfield са техни, не на ElevenLabs. Източник: списъкът с гласове в Higgsfield (`list_voices`), проверен днес.
- В библиотеката на ElevenLabs има поне два гласа с име „Benji“ (`qXguuHzwYUAXqe4Qq1CR` „Youthful and Raspy“ и `jyYV4jm5Wq39qXvc4ERa`, многоезичен). Данните са само от външен каталог, не са потвърдени като същия глас. [json2video 1](https://json2video.com/ai-voices/elevenlabs/voices/qXguuHzwYUAXqe4Qq1CR/), [json2video 2](https://json2video.com/ai-voices/elevenlabs/voices/jyYV4jm5Wq39qXvc4ERa/)
- В Higgsfield моделът „Eleven v4“ приема до 10 000 знака на заявка и до 10 различни гласа в една заявка (диалог). „v4 Turbo“ работи само с един глас. Това е удобно за епизод с Ерчо и герои. Източник: описанието на модела в Higgsfield (`models_explore`).
- Цена в Higgsfield (от заданието): ~0,0035 кредита за знак, минимум ~0,46 на реплика. Кредит на Higgsfield струва ~$0,033–0,0625 според плана и пакета. Цифрите са от външен анализ, не от официална страница. [krea.ai](https://www.krea.ai/blog/higgsfield-pricing-explained-2026-unlimited-credits-and-real-monthly-costs)

**Microsoft Azure AI Speech**
- Български невронни гласове: **bg-BG-KalinaNeural** (жена) и **bg-BG-BorislavNeural** (мъж). За bg-BG се поддържат и HD/многоезични гласове (DragonHD, *MultilingualNeural*) и **viseme събития** (кои форми на устата и кога) – полезно за анимация на уста. [learn.microsoft.com – language support](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support?tabs=tts)
- Цена (официален ценоразпис, West Europe): **Neural $15 за 1 млн. знака**, Neural HD $22 за 1 млн., Custom Neural $24 за 1 млн. [Azure Retail Prices API](https://prices.azure.com/api/retail/prices) (заявка днес, meter „S1 Neural Text To Speech Characters“)
- Безплатно ниво F0: 0,5 млн. знака на месец. [azure.microsoft.com – Speech pricing](https://azure.microsoft.com/pricing/details/cognitive-services/speech-services) (цифрата е потвърдена от външни източници; страницата зарежда цените с JS)

**Google Cloud Text-to-Speech**
- За bg-BG има **30 гласа Chirp 3 HD** (напр. bg-BG-Chirp3-HD-Achird, -Charon, -Puck, -Kore, -Aoede) и 1 стандартен (bg-BG-Standard-B). Няма WaveNet и Neural2 за български. [cloud.google.com – voices](https://docs.cloud.google.com/text-to-speech/docs/voices)
- Цена: **Chirp 3 HD $30 за 1 млн. знака, първият 1 млн. на месец е безплатен**. Standard/WaveNet струват $4 за 1 млн. (4 млн. безплатни), Instant custom voice $60 за 1 млн. [cloud.google.com – pricing](https://cloud.google.com/text-to-speech/pricing)
- Gemini TTS (гласът се управлява с текстова инструкция) поддържа български като **Preview**. Цената е на аудио токен, 25 токена в секунда: Gemini 3.8 Flash TTS струва $9 за 1 млн. изходни токена до 31.12.2026 и $18 от 1.01.2027. [pricing](https://cloud.google.com/text-to-speech/pricing), [gemini-tts](https://docs.cloud.google.com/text-to-speech/docs/gemini-tts)

**Amazon Polly**
- **Няма български.** Официалният списък има чешки, полски, румънски, руски, но не и bg-BG. [docs.aws.amazon.com – Polly languages](https://docs.aws.amazon.com/polly/latest/dg/supported-languages.html)

**OpenAI TTS**
- Българският е в списъка с поддържани езици, но OpenAI изрично пише, че гласовете са „оптимизирани за английски“. [OpenAI – Text to speech](https://developers.openai.com/api/docs/guides/text-to-speech)
- Цени: gpt-4o-mini-tts струва $0,60 за 1 млн. текстови токена + $12 за 1 млн. аудио токена (~$0,015 на минута по външни оценки). tts-1 струва $15 за 1 млн. знака, tts-1-hd $30. [OpenAI – gpt-4o-mini-tts](https://developers.openai.com/api/docs/models/gpt-4o-mini-tts), [tts-1](https://developers.openai.com/api/docs/models/tts-1.md)
- Според външен сайт tts-1, tts-1-hd и сегашните gpt-4o-mini-tts се спират на 6.01.2027. Не е потвърдено от OpenAI. [tokencost.app](https://tokencost.app/blog/tts-api-pricing-2026)

**Гласът на устройството (Web Speech API)** – вече се ползва в „Чуй задачата“ (CLAUDE.md). Безплатен е и не тежи на трафика. Качеството зависи от телефона, а част от устройствата нямат български глас.

### 1.2 Колко струва озвучаването сега

| Вариант | 375 задачи (104 000 зн.) | 88 епизода (308 000 зн.) | Общо (412 000 зн.) | Бележка |
|---|---|---|---|---|
| ElevenLabs v4 през Higgsfield (Benji) | ~364 кр. ≈ $16–23 | ~1 078 кр. ≈ $46–67 | ≈ **$62–90** | същият глас като досега |
| ElevenLabs v4 директно (API) | $8,32 | $24,64 | **$32,96** | или 2 месеца Creator ($44) |
| ElevenLabs v4 Turbo / Flash | $4,16 | $12,32 | $16,48 | по-малко изразителен |
| Azure Neural (Kalina/Borislav) | $1,56 | $4,62 | $6,18 → **$0** в безплатните 0,5 млн./мес. | по-„дикторски“ |
| Azure Neural HD | $2,29 | $6,78 | $9,06 | |
| Google Chirp 3 HD | $3,12 | $9,24 | $12,36 → **$0** в безплатния 1 млн./мес. | 30 бълг. гласа |
| Gemini 3.8 Flash TTS (bg – Preview) | $1,60 | $4,75 | $6,35 (2027: $12,71) | Preview, без гаранция |
| OpenAI gpt-4o-mini-tts | ~$1,78 | ~$5,28 | ~$7,06 | акцент, възможен край 01.2027 |
| Amazon Polly | – | – | – | няма български |

Сметките без повторения. Реално добави **+30–50%** за повторни генерации заради грешни ударения и интонация.

### 1.3 НАША ПРЕПОРЪКА (глас)

1. **Ерчо остава с един и същ глас.** Еднаквият глас е част от героя. При ~$60–90 за целия сегашен обем няма смисъл да се гони по-евтин доставчик. Продължи с **ElevenLabs v4 през Higgsfield, глас Benji**, и пускай по-дълги заявки (до 10 000 знака) с режим „диалог“ за епизодите с герои.
2. **Проба с ElevenLabs директно (по желание, 15 мин.):** чуй двата „Benji“ в библиотеката на ElevenLabs до мострата от Higgsfield. Ако единият е същият глас, директният API е ~2–3 пъти по-евтин ($0,08 за 1 000 зн.) и дава контрол на произношението. **Не клонирай** Benji от готови записи: гласът не е наш и правилата на ElevenLabs искат съгласие на собственика.
3. **Резервен вариант за огромен обем** (например хиляди нови задачи на месец): Google Chirp 3 HD или Azure Kalina/Borislav за „прочитане на задачата“. Почти безплатно е, но гласът е различен от Ерчо. Затова този глас трябва да е на „диктор“, а не на Ерчо.
4. **Ударенията:** TTS често греши ударенията в българския (омографи като „въ́лна/вълна́“, имена, старинни думи). Всеки нов звук минава през прегледа на учителя-проверител (както текстовете на `/pregled/`). Трудните думи се пишат с ударение или се преформулират.

---

## 2. Хостинг, доставка и защита

### 2.1 Обем на трафика (от заданието)

На дете на месец: 20 епизода × 1,4 MB + 300 клипа × 40 KB = **~40 MB**.
- 1 000 деца → **~40 GB** на месец, 320 000+ заявки.
- 10 000 деца → **~400 GB** на месец, 3,2 млн.+ заявки.

Целият каталог (88 епизода + ~750 клипа) е под **0,2 GB**. Съхранението на практика е безплатно навсякъде.

### 2.2 Netlify

- Трафик: **20 кредита за GB**. Уеб заявки: 2 кредита за 10 000. Деплой: 15 кредита. Personal план: 1 000 кредита на месец, допълнителни 500 за $5. Pro: 1 500 за $10. [docs.netlify.com – how credits work](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/)
- Сметка: 1 000 деца = 800 кр. за трафик + 64–128 кр. за заявки ≈ **860–930 кредита ≈ $8,6–9,3 на месец**. 10 000 деца ≈ **8 640–9 280 кредита ≈ $58–93 на месец**, според плана. Горната граница е, ако браузърът разделя всеки звук на 2 заявки (Range), както често правят телефоните.

### 2.3 Cloudflare R2

- Съхранение $0,015 за GB-месец. Class A $4,50 за млн. Class B (четене) $0,36 за млн. **Изходящият трафик е безплатен.** Безплатно всеки месец: 10 GB, 1 млн. Class A, 10 млн. Class B. [developers.cloudflare.com/r2/pricing](https://developers.cloudflare.com/r2/pricing/)
- **Подписани (presigned) връзки:** валидни от 1 сек. до 7 дни, работят за GET. Важи за всеки, който има връзката, до изтичането ѝ. **Не работят със собствен домейн**, само с `<ACCOUNT_ID>.r2.cloudflarestorage.com`. Подписват се с S3 клиент (напр. aws4fetch), който може да работи и в Netlify Function. [developers.cloudflare.com – presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/)
- Workers (ако искаме проверка на код на собствен домейн): безплатно 100 000 заявки на ден. Платеният план е $5 на месец с 10 млн. заявки. [developers.cloudflare.com – Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- Сметка: 1 000 деца ≈ 320 000 четения на месец, 10 000 деца ≈ 3,2 млн. Двете са в безплатните 10 млн. → **$0**. С Worker: при 10 000 деца ~107 000 заявки на ден → $5 на месец.

### 2.4 Bunny CDN (европейска фирма)

- Standard мрежа за Европа и Северна Америка: **$0,01 за GB**, Volume мрежа от $0,005 за GB, **минимум $1 на месец**, пробен период 14 дни, хранилище от $0,01 за GB. [bunny.net/pricing/cdn](https://bunny.net/pricing/cdn/)
- **Token authentication:** подпис с таен ключ + срок (UNIX време). Може подпис за цяла папка. При включване IPv6 се изключва. Не се препоръчва връзване към IP за мобилни мрежи. [bunny.net docs – token authentication](https://bunny.net/docs/cdn/security/token-authentication)
- Сметка: 1 000 деца → 40 GB → $0,40 → **$1** (минимумът). 10 000 деца → **$4 на месец**.

### 2.5 Backblaze B2 + Cloudflare

- $6,95 за TB на месец от 1.05.2026, първите 10 GB са безплатни. Безплатното изтегляне е до 3 пъти съхранения обем, през партньори (Cloudflare, bunny.net и др.) е без такса. [backblaze.com/cloud-storage/pricing](https://www.backblaze.com/cloud-storage/pricing), [usagepricing](https://www.usagepricing.com/blueprint/backblaze)
- При нашия малък каталог няма предимство пред R2, а настройката е по-сложна (два доставчика).

### 2.6 Формати и битрейт за реч

- **MP3** работи навсякъде. MDN: MP3 в режим MPEG-2 (16/22,05/24 kHz, 8–160 kbps) е „приемлив за реч“. [MDN – audio codecs](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Audio_codecs)
- **AAC** (m4a) е най-сигурен, ако се поддържа само един формат. Chrome го пуска в MP4 контейнер, а Firefox разчита на системата. [MDN](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Audio_codecs)
- **Opus** дава най-добро качество на бит за реч. В iOS Safari има **пълна поддръжка чак от iOS 18.4** (Ogg/WebM), от 11 до 18.3 е частична (само в CAF). Безопасен е само с резервен MP3/AAC източник. [caniuse – Opus](https://caniuse.com/opus), [Safari 17.4 – WebM на iOS](https://developer.apple.com/documentation/safari-release-notes/safari-17_4-release-notes)
- Ориентир за моно реч: Opus 24–32 kbps, HE-AAC ~32 kbps, MP3 48–64 kbps. Auphonic препоръчва 40/48 kbps моно за подкаст в Opus. Сравненията са на доставчици, не са контролирани тестове. [cococonvert](https://cococonvert.com/blog/mp3-vs-aac-vs-opus), [Auphonic](https://auphonic.com/blog/2012/09/26/opus-revolutionary-open-audio-codec-podcasts-and-internet-audio/)
- Сега репликите на Ерчо са MP3 моно 64 kbps (`tools/nvo-trener/voice.py`), 8–39 KB на реплика.

### 2.7 Слушане без интернет и iOS

- **Квота (Safari 17+, iOS 17+):** до 60% от диска за един сайт, общо до 80%. Същото важи и за приложение от началния екран. Изтриване по „най-отдавна ползван“ сайт. `navigator.storage.persist()` се одобрява по преценка на WebKit, например ако сайтът е добавен на началния екран. [webkit.org – Updates to Storage Policy](https://webkit.org/blog/14403/updates-to-storage-policy/)
- **7-дневно правило:** в раздел на Safari данните, записани от сайта, се трият след 7 дни без ползване. За приложение от началния екран се брои отделно. [mjtsai (Safari 13.1)](https://mjtsai.com/blog/2020/03/26/safari-13-1-third-party-cookie-blocking-and-7-day-script-writeable-storage/), [itnews](https://www.itnews.com.au/news/apple-cops-flak-for-deleting-local-browser-storage-after-7-days-539833)
- **Service worker и аудио:** трябва да отговаря на заявки с `Range`, иначе звукът не тръгва. Файлът се записва в кеша **предварително** (бутон „Изтегли“), а не докато се слуша. Елементът `<audio>` има нужда от атрибут `crossorigin`, дори за същия домейн. [Chrome for Developers – Workbox: serving cached audio and video](https://developer.chrome.com/docs/workbox/serving-cached-audio-and-video)
- **Заключен екран:** Media Session API (заглавие, картинка, бутони на заключения екран) има в iOS Safari от **15**. Работи с обикновен `<audio>` елемент, не с Web Audio API. [caniuse – Media Session](https://caniuse.com/mdn-api_mediasession), [useAudioPlayer issue](https://www.github.com/E-Kuerschner/useAudioPlayer/issues/129)
- **Известни бъгове:** в приложение от началния екран звукът понякога спира при заключване, а при пауза над ~5 сек. на заден план не може да продължи. Когато екранът е изгасен, JS спира и `ended` не се задейства, затова следващият епизод не тръгва сам. Web Audio заглъхва в PWA на iOS 26 (вероятно поправено в 26.2). [Discourse](https://meta.discourse.org/t/media-playback-with-pwa-keep-playing-when-phone-locked/182219/5), [WebKit 243258](https://auto-bugs.webkit.org/show_bug.cgi?id=243258), [WebKit 173332](https://bugs.webkit.org/show_bug.cgi?id=173332), [WebKit 291892](https://bugs.webkit.org/show_bug.cgi?id=291892)

### 2.8 НАША ПРЕПОРЪКА (хостинг и защита)

1. **Звукът да не минава през Netlify.** При 1 000 деца само звукът изяжда почти целия месечен план на Netlify. Сложи го в **частна кофа в Cloudflare R2**: трафикът е безплатен и сме в безплатното ниво дори при 10 000 деца. **Резервен вариант: Bunny CDN** с token authentication ($1–4 на месец, фирма от ЕС, по-проста настройка).
2. **Защита както при задачите:** браузърът иска списък със звуци от Netlify Function. Тя проверява кода или профила (както сега за `/t/`) и връща **подписани връзки** към R2 за 1–2 дни. Без валиден код няма връзка. Връзките са „на предявител“, затова срокът е кратък. Подписът да е с **фиксирано време за деня** (едни и същи `X-Amz-Date` и срок за всички заявки през деня), така че адресът да е еднакъв цял ден и браузърът да ползва кеша. Безплатните първи епизоди може да са без подпис. В CSP на `netlify.toml` трябва да се добави хостът на R2 в `media-src`.
3. **Формат:** засега само **MP3 моно** (вече имаме ffmpeg веригата): епизоди 48 kbps / 24 kHz (~1,4 MB за 4 мин), клипове 40–48 kbps. Opus би спестил ~40%, но при R2 трафикът е безплатен, а по-старите iPhone-и (под iOS 17.4/18.4) нямат пълна поддръжка. Връщаме се към Opus само ако родители се оплачат от мобилните данни.
4. **Без интернет:** бутон „Изтегли за път“ на всеки епизод (Cache API + Range). Детето вижда колко MB заема. Препоръчваме „Добави на началния екран“, за да не се трият изтеглените след 7 дни. Не обещаваме вечно пазене.
5. **В автобуса и преди сън:** обикновен `<audio>` + Media Session (име на епизода, картинка на Ерчо, бутони ±15 сек.). **Един епизод = един файл.** Без автоматично следващо пускане, защото на iOS не работи надеждно и не е добре преди сън. Таймер „спри след този епизод“.

---

## 3. Глас и герои в ученето: какво казват изследванията

### 3.1 Човешки или синтетичен глас

- **Класическият „принцип на гласа“:** Mayer, Sobko & Mautone (2003) показват, че с човешки глас се учи по-добре, отколкото с машинен (старите TTS от онова време). [J. Educational Psychology 95(2), DOI 10.1037/0022-0663.95.2.419](https://doi.org/10.1037/0022-0663.95.2.419)
- **С модерен TTS ефектът изчезва:** Craig & Schroeder (2017) сравняват човешки глас, модерен TTS и стар TTS при виртуален човек. Човешкият и модерният глас са еднакво надеждни и по-добри от стария, а модерният дава дори малко по-добър трансфер. [Computers & Education 114, 193–205 (обобщение в цитиращи статии)](https://www.researchgate.net/publication/318341059_Reconsidering_the_voice_effect_when_learning_from_a_virtual_human). При продължението (2019, без видим агент) няма разлика във възприятието, знанията и ефективността. [ERIC EJ1225297](https://eric.ed.gov/?id=EJ1225297)
- **По-ново, но малко и смесено:** проучване от 2024–25 с 30 студенти и невронни TTS гласове (официален и „сладък“) не намира разлика в персоната, но човешкият запис дава по-добри резултати и внимание. „Сладкият“ синтетичен глас пречи. [J. Experimental Education, DOI 10.1080/00220973.2024.2446169](https://www.tandfonline.com/doi/full/10.1080/00220973.2024.2446169). Zhao & Mayer (2025): емоционалният тон на компютърния глас почти не влияе на наученото. [„Limitations of Disembodied Computer-Generated Voice to Convey Emotion in Multimedia Lessons“ (каталожен запис)](https://vufind-test.katalog.k.utb.cz/SummonRecord/FETCH-LOGICAL-c310t-17eaf7da366f962eb9e8c0bfbb5d421034c267b11a3a98a9b62663f9862dc39e3/Details). Dinçer (2022) проверява отново ефекта за човешки, стар и модерен машинен глас. [J. Pedagogical Research 6(3)](https://doaj.org/article/a14435a205f54240bdd0b0db2fa06f91)

### 3.2 Говорещ герой (педагогически агент)

- Мета-анализ на 43 изследвания (3 088 участници): **малка, но значима полза** за ученето, **по-голяма при учениците от 1. до 12. клас**, отколкото при студентите. [Schroeder, Adesope & Gilbert 2013, JECR 49(1)](https://rex.libraries.wsu.edu/esploro/outputs/journalArticle/How-Effective-are-Pedagogical-Agents-for/99900601056901842). Wang et al. (2017) дават g = 0,51 за учениците. [обобщение](https://par.nsf.gov/servlets/purl/10591742)
- Castro-Alonso et al. (2021): g = 0,20 общо, **2D агенти g = 0,38 срещу 3D g = 0,11**. Гласът, движението и жестовете не променят значимо ефекта. [Educational Psychology Review 2021 (запис в Erasmus University)](https://repub.eur.nl/pub/133141)
- **„Принцип на образа“:** само образът на говорещия на екрана не помага сам по себе си. **„Принцип на въплъщението“:** помагат човешки жестове, които сочат точно това, за което се говори. [Mayer, Cambridge Handbook – social cues](https://www.cambridge.org/core/books/abs/cambridge-handbook-of-multimedia-learning/principles-based-on-social-cues-in-multimedia-learning/093C1CDE75CF486DACD4CABC325ABE47), [ETHE 2021](https://educationaltechnologyjournal.springeropen.com/articles/10.1186/s41239-021-00256-z)
- Агентът може да е „съблазнителен детайл“, който разсейва погледа при прости задачи, но дава мотивация. При ученици от средния курс **изборът на агент** подобрява трансфера. [Ozogul, Johnson, Atkinson & Reisslein](https://keep.lib.asu.edu/system/files/c160/Johson_Atkinson_Reisslein_CAE_APA_MatchChoice_55p.pdf)

### 3.3 Дислексия и четене на глас

- Мета-анализ на 22 изследвания (1995–2014): TTS и четене на глас подобряват разбирането при ученици с трудности в четенето, **d = 0,35** (95% CI 0,14–0,56). [Wood et al. 2018, J. Learning Disabilities 51(1)](https://pmc.ncbi.nlm.nih.gov/articles/PMC5494021)
- Четене + слушане едновременно дава малка полза пред само четене (g = 0,18), основно когато темпото е зададено отвън. Мета-анализ от 2023 в Educational Research: Theory and Practice, видян само в обобщение от търсене. [ERIC EJ1403866](https://files.eric.ed.gov/fulltext/EJ1403866.pdf)

### 3.4 Контрол на скоростта

- Студенти: скорост до 2× почти не вреди на разбирането (веднага и след седмица), над 2× рязко пада. [Murphy et al., Applied Cognitive Psychology 36(1)](https://castel.psych.ucla.edu/wp-content/uploads/sites/111/2022/03/Applied-Cognitive-Psychology-2021-Murphy-Learning-in-double-time-The-effect-of-lecture-video-speed-on-immediate-and.pdf). Данните са за студенти и за лесен материал, не за 11–14 г.

### 3.5 НАША ПРЕПОРЪКА (глас и герой)

- Гласът на Ерчо да е **топъл, естествен, без „сладко“ преиграване**: малко изследване показва, че „сладкият“ синтетичен глас пречи, а 11–14-годишните лесно го усещат като детски.
- **Пълен контрол в ръцете на детето** (вече има отделни бутони за звуци и глас):
  - глас вкл./изкл. (помни се);
  - „Пропусни“ на всяка реплика;
  - „Чуй задачата“ само при натискане, без автоматично пускане на задачите;
  - скорост 0,8× / 1× / 1,25× / 1,5× за епизодите (не повече от 1,5× при тази възраст);
  - субтитри или текстът винаги на екрана (полза при дислексия, без звук в час).
- **Ерчо говори рядко и по работа:** поздрав веднъж на ден (както сега), кратки реакции. Без коментари на всеки клик и без повторения на една и съща реплика в рамките на сесията. Иначе на 13–14 г. става досаден.
- Героите (2D/„плосък“ стил е поне толкова ефективен, колкото 3D) се появяват **веднъж при отваряне на темата**, после само при натискане. По време на задачите да не се движат.

---

## 4. Аудио уроци (подкасти)

### 4.1 Факти

- **Слушане ≈ четене** по разбиране: мета-анализ на 46 изследвания (N = 4 687), g = 0,07 (незначимо). Четенето печели леко само когато детето само определя темпото (g = 0,13). [Clinton-Lisell 2022, Review of Educational Research](https://www.x-mol.com/paper/1476650676912693248), [techlearning](https://www.techlearning.com/news/listen-without-guilt-audiobooks-offer-similar-comprehension-as-reading)
- **При слушане умът се разсейва най-много** (повече от тихо четене и четене на глас), а разсейването е свързано с по-слаба памет. [Varao Sousa, Carriere & Smilek 2013, Frontiers in Psychology](https://pmc.ncbi.nlm.nih.gov/articles/PMC3842750)
- **Въпроси по средата** на онлайн лекция намаляват разсейването от ~40% на ~20% и подобряват запомнянето. [Szpunar, Khan & Schacter 2013, PNAS 110(16)](https://pmc.ncbi.nlm.nih.gov/articles/PMC3631699)
- **Дължина:** при 6,9 млн. гледания в edX вниманието пада рязко след ~6 мин. [Guo, Kim & Rubin 2014](https://www.cs.rochester.edu/hci/pubs/pdfs/edX-MOOC-video-production-and-engagement_LAS-2014.pdf). Подкастите на BBC Bitesize за матурите по литература (GCSE, 14–16 г.) са **~10 мин.** на епизод, по една творба или умение. [BBC Bitesize (огледало)](https://nexl-bitesize-0.pages.dev/bitesize/articles/zbjhqyc), [educatemagazine](https://www.educatemagazine.com/?p=64111)
- **Сън:** учене → сън → преговор на следващия ден намалява нужното упражнение наполовина и подобрява запомнянето и след 6 месеца. [Mazza et al. 2016, Psychological Science](https://www.psychologicalscience.org/news/releases/sleep-makes-relearning-faster-and-longer-lasting.html). Това е за учене преди сън, не за „учене насън“.
- **Подкасти срещу текст и лекции:** резултатите са смесени и малки. Подкастите са общо взето колкото текста. [exercise physiology RCT](https://informahealthcare.com/doi/abs/10.3108/beej.10.8), [мета-анализ CAP (preprint)](https://sciety.org/articles/activity/10.35542/osf.io/6hnx2_v1)
- **Успешни примери за тази възраст:** Brains On! (8–13 г., наука по въпроси на слушатели), Short Wave (NPR, 11+), Tumble (8–14), Book Club for Kids (ученици обсъждат книги), Eleanor Amplified (сериал-загадка), Science Vs. [boredteachers](https://boredteachers.com/post/25-awesome-middle-school-podcasts), [screenwiseapp](https://screenwiseapp.com/guides/the-best-educational-podcasts-for-elementary-and-middle-school-kids), [oxfordlearning](https://oxfordlearning.com/15-podcasts-for-kids-and-teens/)

### 4.2 Авторско право при четене на литературни текстове

- В ЕС авторското право трае **70 години след смъртта на автора**, броени от 1 януари на следващата година. [Директива 2006/116/ЕО – EUR-Lex](https://eur-lex.europa.eu/EN/legal-content/summary/copyright-and-related-rights-term-of-protection.html), [BG текст](https://bamp-bg.org/pdf/Evropeisko%20zakonodatelstvo/6.Direktiva%20%202006%20116/Direktiva%202006%20116%20bg.pdf). Българският ЗАПСП следва директивата. [ЗАПСП (изм. 2024)](https://kttc.tu-sofia.bg/wp-content/uploads/2025/03/1_9_ЗАКОН-ЗА-АВТОРСКОТО-ПРАВО-С-ИЗМЕНЕНИЯТА-ОТ-2024.pdf)
- **Чужд запис на свободен текст не е свободен:** изпълнителите и продуцентите на звукозаписи имат собствени права, удължени от 50 на 70 години. Не ползваме записи от БНР, аудиокниги и други без лиценз. Нашият собствен TTS прочит на свободен текст е наш. [Директива 2011/77/ЕС](https://intellectualpropertyplanet.blogspot.com/2011/09/music-copyright-to-be-extended-to-70.html)
- **Изключението за дигитално обучение** (чл. 5 от Директива 2019/790) е само „под отговорността на учебно заведение“ и в защитена среда за неговите ученици. Частна платформа не може да разчита на него. [legislation.gov.uk – Art. 5](https://www.legislation.gov.uk/eudr/2019/790/article/5/data.html), [Kluwer Copyright Blog](https://legalblogs.wolterskluwer.com/copyright-blog/the-new-copyright-directive-digital-and-cross-border-teaching-exception-article-5/)
- Пример по правилото (наше изчисление, без източник): свободни са Вазов (†1921), Ботев (†1876), Йовков (†1937), Смирненски (†1923), Дебелянов (†1916), Яворов (†1914), Елин Пелин (†1949 → свободен от 1.01.2020). **Защитени** са Ангел Каралийчев (†1972 → до края на 2042), Николай Хайтов (†2002), Валери Петров (†2014). При преводи се гледа и **преводачът**, а при съвременни редакции на текста – кой е правил редакцията.

### 4.3 НАША ПРЕПОРЪКА (аудио уроци)

- **Дължина 4–7 мин.**, по една тема в епизод. Задачата е до 3 500 знака, а сме под 10-те мин. на BBC Bitesize.
- **Структура на епизод** (Ерчо води, героят гостува):
  1. „Кукичка“ (20–30 сек.): въпрос или кратка сцена с героя.
  2. Историята или правилото в 2–3 части.
  3. **Пауза за отговор:** „Спри и помисли: …“, 5 сек. тишина, после отговорът. Така няма нужда от натискане при заключен екран.
  4. Капанът на НВО (типичната грешка).
  5. Обобщение в 3 изречения.
  6. Един въпрос „за утре“, който детето вижда в приложението като карта за преговор (Leitner).
- **Преди сън:** спокоен епизод „преговор“ (без нов материал), без автоматично следващо пускане. На другия ден картите от този епизод в тренажора (ефектът на Mazza).
- **Не заменя четенето:** епизодът е за преговор и разбиране. Текстът на творбата и упражненията остават на екрана. В приложението епизодът има стенограма.
- **Цитати от защитени автори** (Каралийчев и др.) само кратки, за анализ. Цели текстове се четат само за автори, починали преди 70+ години. Правилото вече е в CLAUDE.md за модула `reading`.

---

## 5. Анимирани герои

### 5.1 Факти

- **Higgsfield (видео от картинка + глас):** „Higgsfield Intone“ прави говореща глава от картинка на герой и гласов запис (2–30 сек. глас, 480p–1080p). Wan 2.7 и Seedance 2.0 приемат аудио като референция. Източник: описанието на моделите в Higgsfield (`models_explore`), проверено днес.
- **Ориентировъчни цени (външни източници, не са официални):** Kling 3.0 720p ~6–10 кредита за 5 сек., Wan 2.7 720p ~8, **Higgsfield Speak 2.0 (lip-sync) 720p ~14 кредита за 5 сек.**, Seedance 2.0 ~17–25. [krea.ai](https://www.krea.ai/blog/higgsfield-pricing-explained-2026-unlimited-credits-and-real-monthly-costs), [saascrmreview](https://saascrmreview.com/?p=13747), [higgsfield.ai blog](https://higgsfield.ai/blog/ai-video-credits-explained)
- **Rive:** Duolingo анимира 10-те си героя в Rive с **над 20 форми на устата** на герой. Таймингът идва от тяхно разпознаване на речта, защото TTS не го дава. Данните са „много по-малко от малко филмче“. [blog.duolingo.com](https://blog.duolingo.com/world-character-visemes). Уеб изпълнението на Rive тежи **222 KB** (canvas-lite, brotli), 567 KB (canvas). [rive.app – runtime sizes](https://rive.app/docs/runtimes/runtime-sizes.md). Един .riv файл е в пъти по-малък от Lottie за същата анимация (18 KB срещу 182 KB, по данни на доставчици). [pixelpoint](https://pixelpoint-website-6l3rd8f5q-pixelpoint.vercel.app/blog/rive-react-optimizations), [callstack](https://callstack.com/blog/lottie-vs-rive-optimizing-mobile-app-animation)
- **Azure TTS дава viseme събития за bg-BG** (кога коя форма на устата), т.е. може да движи уста в Rive без собствено разпознаване на речта. [learn.microsoft.com](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support?tabs=tts)
- **Прозрачно видео:** Safari иска HEVC с алфа, Chrome и Firefox искат VP9 с алфа (WebM), затова трябват два файла. В тест на Jake Archibald клипът е 460 KB с VP9, а алфата добавя само ~8 KB. [jakearchibald.com](https://jakearchibald.com/2024/video-with-transparency/)
- **Нашите файлове сега:** `a-*.webp` са 30 кадъра, ~230×260 px, **240–350 KB**, без звук. `g-banner.mp4` е H.264 960×538, 4 сек., **368 KB**.

### 5.2 НАША ПРЕПОРЪКА (анимации)

- **Проверено на Бойчо Огнянов (ноември 2026):** Intone **изговаря текста наново по свой начин** и на български го разваля („Тазият вечер на Сисенена, в бела чердана“ вместо „Тази вечер на сцената в Бяла черква“), а и говори по-бавно. Работещият път: 1) чист глас с ElevenLabs (проверен с разпознаване на речта); 2) видео с движение от Intone (или друг модел); 3) **Sync Lipsync 3 (`sync_so`)** нагласява само устата по чистия глас – видео + аудио, `sync_mode: cut_off`, ~3,6 кредита/сек. (≈ 40 за 11 сек.); 4) в крайния файл слагаме чистия звук. Всяко видео на герой се проверява с разпознаване на речта, преди да се покаже.
- **Стъпка 1 (най-евтино, бързо):** за всеки от 24-те героя **една говореща реплика 3–5 сек.** с Higgsfield (движение + Sync Lipsync върху чистия глас, 480p–720p). Изход: **MP4 H.264 + AAC моно**, квадрат 360–480 px, ~**250–450 KB**, без прозрачност (фон в цвета на картата на героя). Пуска се при първото отваряне на темата, после само при натискане на героя. `preload="none"`. При `prefers-reduced-motion` се показва само картинката, а гласът е по избор.
- **Стъпка 2 (по желание, ако героите ще говорят много):** Ерчо в **Rive** с 8–12 форми на устата, водени от тайминг (Azure visemes или анализ на силата на звука). Тогава всяка нова реплика струва само звука (~30–50 KB), без ново видео. Изисква ръчна работа по рисунка в Rive, не може само с генериране.
- Анимираният WebP остава за „празни“ движения (махане, радост) до ~150–300 KB. Не е за говорене, защото няма звук и синхронът е лош.
- Бюджет на страница: **до ~0,5 MB** анимация + глас при отваряне на тема. 24 клипа × ~0,4 MB ≈ 10 MB за целия каталог. Пазим ги в R2 (не в Netlify) с ново име при промяна (браузърът пази `/media/` 30 дни).

---

## 6. Разходи за препоръчаната схема

**Схема:** ElevenLabs v4 през Higgsfield (глас Benji) за всичко на Ерчо. Звуците и клиповете в частен Cloudflare R2 с подписани връзки от Netlify Function. MP3 моно. 24 говорещи клипа на герои от Higgsfield. Кредит на Higgsfield ≈ $0,043–0,0625. Кредит на Netlify ≈ $0,01 (Personal допълване) или $0,0067 (Pro).

### Еднократно

| Позиция | Количество | Цена |
|---|---|---|
| Озвучаване на 375 задачи + обяснения | 104 000 зн. ≈ 364–400 кр. | $16–25 |
| 88 аудио урока (~4 мин.) | 308 000 зн. ≈ 1 078 кр. | $46–67 |
| Повторни генерации (ударения), +40% | ~575 кр. | $25–36 |
| 24 говорещи клипа на герои (реплика + 5 сек. видео, ~2 опита) | ~24 × 30 кр. ≈ 720 кр. | $31–45 |
| Настройка на R2 / Bunny, кода, плейъра | работа на Claude, без външна цена | $0 |
| **Общо еднократно** | | **≈ $120–175** |

### На месец

| Позиция | 1 000 активни деца | 10 000 активни деца |
|---|---|---|
| Трафик за звук (40 / 400 GB) в **R2** | $0 (egress безплатен) | $0 |
| Четения в R2 (0,3 / 3,2 млн. Class B) | $0 (до 10 млн. безплатно) | $0 |
| Съхранение в R2 (< 1 GB) | $0 | $0 |
| Подписване на връзки в Netlify Function (~30 заявки на дете) | ~6 кр. ≈ $0,06 | ~60 кр. ≈ $0,60 |
| Анимации на героите (~4 / 40 GB, ако са в R2) | $0 | $0 |
| Ново озвучаване (напр. +50 задачи и 4 епизода ≈ 28 000 зн.) | ~100 кр. Higgsfield ≈ $4–6 | същото (не зависи от децата) |
| **Общо на месец (R2)** | **≈ $5** (почти само ново съдържание) | **≈ $5–6** |
| *За сравнение: същият звук през Netlify* | *860–930 кр. ≈ $6–9* | *8 640–9 280 кр. ≈ $58–93* |
| *Вариант Bunny CDN вместо R2* | *$1* | *$4* |

Бележки към таблицата:
- Не са включени други разходи на Netlify за сайта (по CLAUDE.md ~0,3 кредита на дете на месец, т.е. ~300 / 3 000 кредита). При 10 000 деца Personal планът (1 000 кр.) не стига, независимо от звука.
- Ако Ерчо се премести на ElevenLabs директно (същият или подобен глас), еднократното озвучаване пада от ~$62–90 на **~$33** (+ повторения).
- Ако за „прочитане на задачата“ се ползва Google Chirp 3 HD или Azure в безплатната им квота, тази част е **$0**, но гласът не е на Ерчо.
