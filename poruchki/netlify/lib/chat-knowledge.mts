// Фактите за магазините по подразбиране за чата: продукти, цени, доставка, гаранция – от страниците на 28.11.2026
// (Black Friday до 30.11). Тук е само първоначалното съдържание; Митко ги сменя в OrderDesk → Чат → настройки.
import type { Lang } from "./chat.mts";

// vcelijed.eu – от страницата на 28.11.2026 (Black Friday).
const VCELIJED = `Obchod: BeeVenom – gél na kĺby s včelím jedom (vcelijed.eu), Slovensko. Kontakt: majstervcelar@gmail.com.

PRODUKT
- BeeVenom Care Gel: kozmetický gél na vonkajšie použitie, tuba 20 g ≈ 40 dávok. Obsahuje včelí jed (v množstve zodpovedajúcom asi 50 bodnutiam v jednej tube), kurkumu, zelený čaj a vitamín D3. Na oblasť kĺbov – kolená, kríže, ramená, lakte, krk, členky.
- Pocit: najprv jemne schladí, potom príde príjemné teplo. Rýchlo sa vstrebáva, nie je mastný, nemá zápach, nešpiní oblečenie.
- Použitie: malé množstvo (veľkosti hrášku) na čistú a suchú pokožku, masírovať krúživými pohybmi 30–60 sekúnd, kým sa nevstrebe; 2–3-krát denne alebo večer pred spaním. Po použití umyť ruky, vyhnúť sa očiam a slizniciam, nenanášať na poranenú ani podráždenú pokožku.
- Nie je to liek a nenahrádza liečbu predpísanú lekárom; predpísanú liečbu neprerušovať. Ľahkosť v pohybe sa buduje pravidelným používaním (dni a týždne), každý organizmus je iný.
- Alergia na včelí jed alebo včelie produkty: nepoužívať, kým sa neporadí s lekárom alebo alergológom. Citlivá pokožka: najprv test na malej ploche (vnútorná strana predlaktia) a počkať 24 hodín. Tehotenstvo a dojčenie: pred použitím sa poradiť s lekárom. Výrobok je pre dospelých, uchovávať mimo dosahu detí. S inými prípravkami na rovnakú oblasť nechať medzi nimi odstup; pri liekoch na pokožku alebo pri pochybnosti sa poradiť s lekárom alebo lekárnikom.
- Certifikácia: kozmetický výrobok podľa nariadenia (ES) č. 1223/2009, prešiel hodnotením bezpečnosti, notifikovaný v portáli CPNP, úplné zloženie je na obale.
- Výdrž: 1 tuba ≈ 40 dávok; balík 2 je približne 30-dňová kúra, balík 3 je 45–60-dňová kúra (viac oblastí alebo celá rodina).

PONUKY – BLACK FRIDAY (platí do pondelka 30. 11. 2026, 23:59)
- 1 tuba (balík 1, na vyskúšanie): 17,90 € + doprava 4,00 €.
- 2 + 1 zadarmo (balík 2, 3 tuby): 21,90 € + darček 8 náplastí na kĺby + doprava 4,00 €.
- 3 + 2 zadarmo (balík 3, 5 túb): 29,90 € + darček 16 náplastí na kĺby + doprava zadarmo.
- Doplnky so zľavou k objednávke: bylinné náplasti na kĺby (12 ks) 3,90 €; tibetské náplasti (8 ks, so 6 druhmi živočíšnych jedov) 2,90 €; náplasti s včelím jedom a bylinkami 2,90 €; sprej s včelím jedom (100 ml, arnika, mentol, MSM) 9,90 €.
- Náplasti v darčeku: na kĺby, svaly a šľachy, nalepiť na čistú a suchú pokožku a nosiť až 8 hodín. K 1 tube nie sú.
- Po skončení akcie platia ceny uvedené na stránke. Ak si cenou nie si istý, odkáž zákazníka na ponuky na stránke.

OBJEDNÁVKA, DORUČENIE, PLATBA, ZÁRUKA
- Objednáva sa formulárom na stránke: vybrať balík, vyplniť meno, telefón a adresu a potvrdiť objednávku. Celkovú cenu vrátane dopravy zákazník vidí pred odoslaním.
- Platba na dobierku – platí sa až pri prevzatí zásielky, nič vopred.
- Doručenie kuriérom na adresu kdekoľvek na Slovensku. Doprava 4,00 €, pri balíku 3 zadarmo. Termín doručenia závisí od dopravcu a miesta doručenia.
- 30-dňová skúšobná lehota: ak produkt nevyhovuje, zákazník napíše na majstervcelar@gmail.com a peniaze vrátime. Zo zákona má aj 14 dní na odstúpenie od zmluvy bez udania dôvodu.`;


const SL = `Trgovina: BeeVenom – gel za sklepe s čebeljim strupom, Slovenija. Kontakt: zdravecnatura@gmail.com.

IZDELEK
- BeeVenom gel za sklepe: kozmetični gel za zunanjo uporabo, tuba 20 g ≈ 40 odmerkov. Vsebuje čebelji strup (v količini približno 50 pikov v eni tubi), kurkumo, zeleni čaj in vitamin D3. Za predel sklepov – kolena, križ, ramena, komolci, vrat, gležnji.
- Občutek: najprej nežno ohladi, nato pride prijetna toplota. Hitro se vpije, nima vonja, ne maže in ne pušča madežev na oblačilih.
- Uporaba: količina v velikosti graha na čisto in suho kožo, masiraj z nežnimi krožnimi gibi 30–60 sekund, dokler se ne vpije; 2–3-krat na dan ali zvečer pred spanjem. Po uporabi si umij roke, izogibaj se stiku z očmi in sluznicami, ne nanašaj na poškodovano ali razdraženo kožo.
- Ni zdravilo in ne nadomešča zdravljenja, ki ga je predpisal zdravnik; predpisanega zdravljenja se ne prekinja. Lahkotnost gibanja se gradi z redno uporabo (dneve in tedne), vsak organizem je drugačen.
- Alergija na čebelji strup ali čebelje izdelke: gela ne uporabljati, dokler se ne posvetuje z zdravnikom ali alergologom. Občutljiva koža: najprej preizkus na majhni površini (notranja stran podlakti) in počakati 24 ur; ob draženju uporabo prekiniti. Nosečnost in dojenje: pred uporabo posvet z zdravnikom. Izdelek je za odrasle, hraniti izven dosega otrok. Z drugimi pripravki na istem predelu pustiti nekaj časa med nanosoma; pri zdravilih na koži ali ob dvomu posvet z zdravnikom ali farmacevtom.
- Certifikacija: kozmetični izdelek po uredbi (ES) št. 1223/2009, opravljena ocena varnosti, prijavljen na portalu CPNP, celoten seznam sestavin je na embalaži.
- Trajanje: 1 tuba ≈ 40 odmerkov; paket 2 je približno 30-dnevna kura, paket 3 je 45–60-dnevna kura (več predelov ali vsa družina).

PONUDBA – BLACK FRIDAY (velja do ponedeljka, 30. 11. 2026, do 23:59)
- 1 tuba (paket 1, za preizkus): 17,90 € + dostava 4,00 €.
- 2 + 1 brezplačno (paket 2, 3 tube): 21,90 € + darilo 8 obližev za sklepe + dostava 4,00 €.
- 3 + 2 brezplačno (paket 3, 5 tub): 29,90 € + darilo 16 obližev za sklepe + brezplačna dostava.
- Dodatki s popustom k naročilu: zeliščni obliži za sklepe (12 kos) 3,90 €; tibetanski obliži (8 kos, s 6 vrstami živalskih strupov) 2,90 €; obliži s čebeljim strupom in zelišči 2,90 €; pršilo s čebeljim strupom (100 ml, arnika, mentol, MSM) 9,90 €. Če k naročilu dodaš pršilo, je dostava brezplačna.
- Obliži v darilu: za sklepe, mišice in kite; nalepiti na čisto in suho kožo in nositi do 8 ur, enega na dan. K 1 tubi niso vključeni.
- Po koncu akcije veljajo cene na strani. Če cene nisi gotov, stranko napoti na ponudbo v obrazcu na strani.

NAROČILO, DOSTAVA, PLAČILO, GARANCIJA
- Naroča se z obrazcem na strani: izbrati paket, vpisati ime, telefon in naslov ter potrditi naročilo. Skupno ceno z dostavo stranka vidi pred oddajo.
- Plačilo po povzetju – plača šele ob prevzemu pošiljke, nič vnaprej.
- Dostava s kurirjem na naslov kjerkoli v Sloveniji. Dostava 4,00 €, pri paketu 3 brezplačna. Rok dostave je odvisen od prevoznika in kraja dostave.
- 30-dnevno preizkusno obdobje: če izdelek ne ustreza, stranka piše na zdravecnatura@gmail.com in vrnemo denar. Po zakonu ima tudi 14 dni za odstop od pogodbe brez navedbe razloga.`;

const HU = `Üzlet: BeeVenom – méhmérges ízületi gél, Magyarország. Kapcsolat: zdravecnatura@gmail.com.

TERMÉK
- BeeVenom ízületi gél: külsőleges kozmetikai gél, 20 g-os tubus ≈ 40 adag. Méhmérget (egy tubusban kb. 50 méhcsípésnek megfelelő mennyiségben), kurkumát, zöld teát és D3-vitamint tartalmaz. Az ízületek környékére – térd, derék, váll, könyök, nyak, boka.
- Érzet: először finoman hűsít, majd kellemes melegség jön. Gyorsan beszívódik, szagtalan, nem zsíros, nem hagy foltot a ruhán.
- Használat: borsónyi mennyiség tiszta, száraz bőrre, finom körkörös mozdulatokkal 30–60 másodpercig masszírozni, amíg be nem szívódik; naponta 2–3-szor vagy este lefekvés előtt. Használat után kezet mosni, kerülni a szemet és a nyálkahártyát, nem szabad sérült vagy irritált bőrre kenni.
- Nem gyógyszer, és nem helyettesíti az orvos által előírt kezelést; az előírt kezelést nem szabad abbahagyni. A könnyebb mozgás rendszeres használattal épül fel (napok, hetek alatt), minden szervezet más.
- Méhméreg- vagy méhtermék-allergia: ne használja, amíg nem konzultált orvossal vagy allergológussal. Érzékeny bőr: előbb próba egy kis felületen (alkar belső oldala), és 24 órát várni; irritáció esetén abbahagyni. Terhesség és szoptatás: használat előtt orvossal konzultálni. Felnőtteknek készült, gyermekektől elzárva tartandó. Ha ugyanarra a területre más készítményt is használ, hagyjon időt a kettő között; bőrre kenendő gyógyszereknél vagy kétség esetén kérdezze meg orvosát vagy gyógyszerészét.
- Tanúsítás: kozmetikai termék az 1223/2009/EK rendelet szerint, biztonsági értékelésen esett át, be van jelentve a CPNP portálon, a teljes összetevőlista a csomagoláson van.
- Kiszerelés: 1 tubus ≈ 40 adag; a 2. csomag kb. 30 napos kúra, a 3. csomag 45–60 napos kúra (több terület vagy az egész család).

AJÁNLATOK – BLACK FRIDAY (2026. 11. 30-án, hétfőn 23:59-ig)
- 1 tubus (1. csomag, kipróbálásra): 6 490 Ft + szállítás.
- 2 + 1 ingyen (2. csomag, 3 tubus): 7 890 Ft + ajándék 8 ízületi tapasz + szállítás.
- 3 + 2 ingyen (3. csomag, 5 tubus): 10 790 Ft + ajándék 16 ízületi tapasz + ingyenes szállítás.
- Kiegészítők kedvezménnyel a rendeléshez: gyógynövényes ízületi tapaszok (12 db) 1 390 Ft; tibeti tapaszok (8 db, 6 féle állati méreggel) 1 090 Ft; méhmérges-gyógynövényes tapaszok 1 090 Ft; méhmérges spray (100 ml, árnika, mentol, MSM) 3 590 Ft. Ha a rendeléshez hozzáadja a sprayt, a szállítás ingyenes.
- Az ajándék tapaszok: ízületekre, izmokra és inakra; tiszta, száraz bőrre ragasztani, és legfeljebb 8 órán át viselni, naponta egyet. Az 1 tubushoz nem jár.
- Az akció után az oldalon feltüntetett árak érvényesek. Ha nem biztos az árban, irányítsa a vásárlót az oldal rendelési űrlapjához.

RENDELÉS, SZÁLLÍTÁS, FIZETÉS, GARANCIA
- Rendelés az oldal űrlapján: csomag kiválasztása, név, telefonszám és cím megadása, majd a rendelés elküldése. A teljes árat a szállítással együtt a vásárló még elküldés előtt látja.
- Fizetés utánvéttel – csak a csomag átvételekor, előre semmit.
- Szállítás futárral házhoz vagy csomagpontra Magyarországon. Házhoz 1 700 Ft, csomagpontra 1 670 Ft, a 3. csomagnál ingyenes. A kézbesítés ideje a futárszolgálattól és a címtől függ.
- 30 napos kipróbálási idő: ha a termék nem válik be, a vásárló írjon a zdravecnatura@gmail.com címre, és visszaadjuk a pénzét. A törvény szerint 14 napon belül indoklás nélkül is elállhat a vásárlástól.`;

const ZDRAVETS = `Магазин: Здравец Натура (zdravets.eu) – натурална козметика с пчелна отрова и билки, България. Фирма: „ДД Димитров 26“ ЕООД, гр. София.
Контакти: телефон 0988 88 05 07 – денонощно, всеки ден; отговаря Стела, дигиталният асистент на телефона: при нея може да се поръча или да се провери поръчка. Имейл zdravecnatura@gmail.com – отговаряме до 1 работен ден.

ВАЖНО ЗА ОТГОВОРИТЕ
- Всички продукти са козметика за външна употреба или пластири – не са лекарства. Не обещаваш ефект (облекчаване, лечение, отслабване, енергия, либидо и т.н.); казваш какво съдържат, за какво се ползват и как.
- Цените по-долу са по време на Черния петък (20–30.11.2026). След 30.11 важат цените на сайта; ако не си сигурен в цена, насочваш към продуктовата страница или кошницата.

СТАВИ И МУСКУЛИ (цена за 1 бр.; пакети на продуктовата страница)
- BeeVenom Гел за стави с пчелна отрова – 20 г, около 40 нанасяния, 15,90 €. Пчелна отрова, куркума, зелен чай и витамин D3. Количество колкото грахово зърно върху чиста и суха кожа, масажира се леко до попиване, 2–3 пъти на ден; вечер може и с билков пластир. Пакети: 2 гела 19,90 €; 3 гела 22,90 € (+ подарък 12 пластира за стави); 5 гела 34,90 € (+ 3 плика пластири за стави подарък и безплатна доставка до офис; до адрес +5,90 €).
- BeeVenom Спрей за стави с пчелна отрова – 17,90 €. Пчелна отрова, арника, ментол, магнезий и алантоин; нанася се без допир, не цапа ръцете. Разклаща се, пръска се от около 10 см, разнася се леко, до 3 пъти на ден. Пакети: 2 спрея 27,90 €; 3 спрея 34,90 € (безплатна доставка).
- Хиалуронов крем за стави – 19,90 €. Хиалуронова киселина, мента и джинджифил, лека формула за хидратация на кожата около ставите; 1–2 пъти на ден или вечер след гела. Пакети: 2 – 29,90 €; 3 – 39,90 € (безплатна доставка).
- Крем за стави с пчелна отрова – ултра силна формула, 30 г (пчелна отрова, глюкозамин, хондроитин, арника, витамин K2; за вечерен масаж) – продава се само в комплекта „Гел + крем за стави“.
- Пластири за стави (12 бр., голям пластир 7 × 10 см) – 14,90 €. Екстракти от традиционни китайски билки, борнеол, ментол, камфор и масло от гаултерия; топлина и свежест за гръб, кръст, рамене, колене и врат. Залепва се на чиста и суха кожа, сменя се на 12–24 часа. Не е подходящ при бременност, върху наранена кожа и при алергия към съставките (маслото от гаултерия съдържа салицилат). Пакети: 2 плика 24,90 €; 3 плика 29,90 €.
- BeeHerb Билкови пластири за стави (12 бр.) – 9,90 €. Пелин, джинджифил, шафранка, нотоженшен и лют червен пипер. Слага се на чиста и суха кожа, носи се до 8 часа. Пакети: 2 кутии 17,90 €; 3 кутии 24,90 €.
- Пластири с пчелна отрова (8 бр.) – 9,90 €. Пчелна отрова, ментол и капсаицин – свежест и топлина 6–8 часа. Не се превързва стегнато и не се ползва с грейка; не върху наранена или раздразнена кожа, далеч от очите. Пакети: 2 кутии 17,90 €; 3 кутии 24,90 €.
- Тибетски пластири с 6 вида животински отрови (8 бр.) – 7,90 €. По тибетска рецептура, с ментол, камфор, капсаицин, билка плаун и далечно инфрачервен магнитен прах – силно усещане за топлина. 1 пластир на ден, до 8 часа. Не е подходящ за деца, при бременност и при поставен пейсмейкър. Пакети: 2 кутии 14,90 €; 3 кутии 22,90 €.

КРАКА
- Крем за вени с конски кестен – 12,90 €. За свежест и лекота на уморените крака; вечер с леки движения от глезена нагоре, може и сутрин. Пакети: 2 – 17,90 €; 3 – 24,90 €.
- Спрей с пчелна отрова за нокти – 9,90 €. Пчелна отрова и растителни масла за грижа за ноктите и кожата около тях; 2 пъти на ден върху чист и сух нокът. Пакети: 2 – 17,90 €; 3 – 24,90 €.

КОЖА
- BeeVenom Крем за проблемна кожа – 30 г, 15,90 €. Билкова формула с пчелна отрова – успокоява, подхранва и хидратира. Тънък слой върху почистена кожа 1–2 пъти на ден, без зоната около очите и устните; при чувствителна кожа или алергии – първо проба на малък участък. Пакети: 2 – 19,90 €; 3 – 22,90 €; 5 – 34,90 € (безплатна доставка).
- Балсам за суха и зряла кожа с GHK-Cu и метиленово синьо – 19,90 €. Меден пептид GHK-Cu, метиленово синьо (от него е синият цвят на балсама), телешка лой и мед. Затопля се малко между пръстите и се нанася върху сухите участъци 1–2 пъти на ден. Пакети: 2 – 29,90 €; 3 – 39,90 € (безплатна доставка; подаръкът към 3 балсама е още един продукт по избор с −50%: крем за кожа, крем за вени или гел).

ЛЕПЕНКИ ЗА ВСЕКИ ДЕН (кутия 30 пластира за 1 месец, по 14,90 €)
- Видове: за контрол на апетита (берберин, нар, канела, витамини от група B и L-глутамин); с берберин за апетит и метаболизъм (същите, но без L-глутамин); за енергия и тонус; за стрес и напрежение; NAD+ за жизненост (с NMN и ресвератрол); за фокус и концентрация (L-теанин и лъвска грива); за добро настроение; за желание и либидо.
- Употреба: сутрин върху чиста, суха кожа без косми (рамо, вътрешната страна на китката, корем или хълбок), носи се до 8 часа, всеки ден нов пластир на различно място.
- Комплект 2 кутии по избор – 22,90 €; 3 кутии по избор – 29,90 € (+ 1 кутия подарък по избор по време на Черния петък). Кутиите може да са еднакви или различни.

КОМПЛЕКТИ ЧЕРЕН ПЕТЪК
- 2 гела за стави 19,90 €; 3 гела 22,90 € + 12 пластира за стави подарък; 5 гела 34,90 € + 3 плика пластири подарък и безплатна доставка до офис.
- Комплект „Грижа за тялото“ (гел за стави + крем за вени + крем за кожа) – 22,90 € + 12 пластира подарък.
- Спрей + гел за стави – 27,90 € + 12 пластира подарък.
- Гел + крем за стави (ултра силна формула) – 23,90 € + 12 пластира подарък.
- 3 крема за кожа – 22,90 €; 5 крема – 34,90 € и безплатна доставка.
- В кошницата може да се добавят със същата пратка: пластири с пчелна отрова (8 бр.) за 4,90 € и спрей за стави за 9,90 €.

ОТСТЪПКИ
- Подарък по време на Черния петък: към поръчка от 3 и повече броя – 12 пластира за стави (2 броя – без подарък). Лепенките за всеки ден и балсамът имат свой подарък (виж по-горе).
- Половин цена: при поръчка над 34,90 € всеки следващ продукт е на половин цена; кошницата го смята сама. Комплектите и лепенките за всеки ден не участват.

ДОСТАВКА И ПЛАЩАНЕ
- До офис на Еконт 4,90 €, до офис на Спиди 4,90 €, до адрес 5,90 €. При поръчка от 34,90 € нагоре (напр. 5 гела или 3 спрея) доставката до офис е безплатна.
- Поръчва се от сайта (кошница → данни → потвърждение) или по телефона 0988 88 05 07. Поръчката се потвърждава по телефона – обажда се Александра, дигиталният ни асистент; на нея може да се каже, ако нещо трябва да се промени или добави.
- Изпращаме до 1 работен ден след потвърждението, куриерът доставя за 1–2 работни дни.
- Плащане с наложен платеж – при получаване, нищо предварително, не трябва банкова карта.

ГАРАНЦИЯ И ВРЪЩАНЕ
- Гаранция 30 дни: ако продуктът не хареса в рамките на 30 дни от получаването, клиентът се обажда на 0988 88 05 07 или пише на zdravecnatura@gmail.com; казваме как да го върне и възстановяваме платената за продукта сума до 14 дни, след като го получим.
- Законово право на отказ 14 дни (Закон за защита на потребителите): без да посочва причина; връщаме сумата за продукта и стандартната доставка до 14 дни. Отворен продукт по хигиенни съображения се връща по 30-дневната гаранция (чл. 57 от ЗЗП).
- Повредена или грешна пратка: пратката се преглежда пред куриера; ако нещо не е наред, оправяме го за наша сметка (предай на колега).
- Надзорен орган: Комисия за защита на потребителите – kzp.bg, гореща линия 0700 111 22.`;

export type ShopDefaults = { lang: Lang; title: string; email: string; color: string; knowledge: string };

export const SHOP_DEFAULTS: Record<string, ShopDefaults> = {
  vcelijed: { lang: "sk", title: "BeeVenom", email: "majstervcelar@gmail.com", color: "#c8811a", knowledge: VCELIJED },
  sl: { lang: "sl", title: "BeeVenom", email: "zdravecnatura@gmail.com", color: "#c8811a", knowledge: SL },
  hu: { lang: "hu", title: "BeeVenom", email: "zdravecnatura@gmail.com", color: "#c8811a", knowledge: HU },
  zdravets: { lang: "bg", title: "Здравец Натура", email: "zdravecnatura@gmail.com", color: "#2c5a2c", knowledge: ZDRAVETS },
};
