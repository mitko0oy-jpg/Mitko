#!/usr/bin/env python3
"""„200 въпроса“ for parents: an interactive PDF for the phone, like the 90 literature cards.

The child taps an answer and the PDF jumps to a page with „Вярно!“ or „Не е вярно“, the right answer,
why, and what to revise. No internet, no account, no points sent anywhere – it works in every PDF viewer
because it uses only internal links (no JavaScript).

  python3 scripts/podarak_interaktiven.py private/podarak/podarak-import.json private/podarak/Edu-BEL-200-vaprosa-interaktiven.pdf

The answer key is inside this file (that is the point of it), so the letters are moved to other places
than in the competition PDF: a child cannot copy a letter key from one into the other.
Protection: the text cannot be copied (no Unicode map in the fonts – a copy gives nonsense), the file is
encrypted with print-only permissions, and the brand and a light watermark are on every page.
Options: --plain (no protection, for checking the layout).
"""
import argparse, json, math, os, secrets, sys
from xml.sax.saxutils import escape

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from podarak import LETTERS, LEVEL, MODULE, PARTS, RANKS, ROOT, SECTION, brand_fonts, part_title  # noqa: E402

W, H = 360, 640  # a phone screen (9:16)
M = 20


def new_letters(qs):
    """The right answer moves to another letter than in the competition PDF (so a letter key from one is useless
    in the other), spread evenly over А–Г and never three times in a row. Returns {n: new index}."""
    used, out, last = [0, 0, 0, 0], {}, []
    for q in sorted(qs, key=lambda x: x["n"]):
        options = [i for i in range(4) if i != q["a"] and not (len(last) >= 2 and last[-1] == last[-2] == i)]
        a = min(options, key=lambda i: (used[i], (i - q["n"]) % 4))
        used[a] += 1
        last.append(a)
        out[q["n"]] = a
    return out


def shuffled_letters(q, a):
    """The options with the right one moved to index a; the wrong ones keep their order."""
    right = q["o"][q["a"]]
    wrong = [o for i, o in enumerate(q["o"]) if i != q["a"]]
    return wrong[:a] + [right] + wrong[a:], a


def build(src, out, plain):
    from reportlab.lib.colors import HexColor, white
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.enums import TA_CENTER
    from reportlab.platypus import Paragraph
    from reportlab.pdfgen import canvas

    brand_fonts()
    d = json.load(open(src, encoding="utf-8"))
    rows = [it for it in d["items"] if (it.get("module") or it.get("module_slug")) == MODULE and it.get("status", "review") != "hidden"]
    qs = sorted((dict(it["data"]) for it in rows), key=lambda x: x["n"])
    letters = new_letters(qs)
    for q in qs:
        q["o"], q["a"] = shuffled_letters(q, letters[q["n"]])
    units = {u["slug"]: u["title"] for u in json.load(open(os.path.join(ROOT, "curriculum/units.json"), encoding="utf-8"))["units"]}
    by_part = {p["part"]: [q for q in qs if q["part"] == p["part"]] for p in PARTS}
    order = [q["n"] for q in qs]

    INK, GOLD, GOLD_SOFT = HexColor("#1B2A4A"), HexColor("#C49A3C"), HexColor("#F4EAD3")
    PAPER, EDGE, MUTED, LINE, TEXT = HexColor("#FFFDF8"), HexColor("#E3DCCB"), HexColor("#5A6275"), HexColor("#D3D8E1"), HexColor("#1F2633")
    OK, OK_SOFT, BAD, BAD_SOFT = HexColor("#2E7D4F"), HexColor("#E5F2EA"), HexColor("#B23A3A"), HexColor("#FBECEC")
    LVL = {1: HexColor("#3F7A8C"), 2: HexColor("#B88A2E"), 3: HexColor("#8C3F5A")}
    LOGO = os.path.join(ROOT, "public/assets/logo.png")
    raw = out + ".raw.pdf" if not plain else out
    c = canvas.Canvas(raw, pagesize=(W, H))
    c.setTitle("200 въпроса – интерактивен PDF | Еду БЕЛ")
    c.setAuthor("Еду БЕЛ")
    c.setSubject("Български език и литература, 5.–7. клас")
    c.setCreator("Еду БЕЛ")

    def P(text, size=13, font="Golos", color=TEXT, leading=None, align=0):
        return Paragraph(text, ParagraphStyle("p", fontName=font, fontSize=size, leading=leading or size * 1.32, textColor=color, alignment=align))

    def t(s):
        return escape(s).replace("\n", "<br/>")

    def draw(p, x, y, w):
        """Draws a paragraph with its top at y; returns the y below it."""
        h = p.wrap(w, 2000)[1]
        p.drawOn(c, x, y - h)
        return y - h

    def height(p, w):
        return p.wrap(w, 2000)[1]

    def star(cx, cy, r, color):
        p = c.beginPath()
        for i in range(10):
            a = math.pi / 2 + i * math.pi / 5
            rr = r if i % 2 == 0 else r * 0.45
            x, y = cx + rr * math.cos(a), cy + rr * math.sin(a)
            p.moveTo(x, y) if i == 0 else p.lineTo(x, y)
        p.close()
        c.setFillColor(color)
        c.drawPath(p, stroke=0, fill=1)

    def stars(x, y, n, r, color, total=3):
        for i in range(total):
            star(x + i * r * 2.3, y, r, color if i < n else LINE)

    def icon(kind, x, y, sz, color):
        """Small vector icons (the brand fonts have no arrows): next, back, menu, retry. (x, y) = left middle."""
        c.saveState()
        c.setStrokeColor(color)
        c.setFillColor(color)
        c.setLineWidth(max(1.6, sz * 0.13))
        c.setLineCap(1)
        c.setLineJoin(1)
        if kind in ("next", "back"):
            a, b = (x, x + sz) if kind == "next" else (x + sz, x)
            d = 1 if kind == "next" else -1
            c.line(a, y, b, y)
            c.line(b, y, b - d * sz * 0.42, y + sz * 0.38)
            c.line(b, y, b - d * sz * 0.42, y - sz * 0.38)
        elif kind == "menu":
            for k in (-1, 0, 1):
                c.line(x, y + k * sz * 0.32, x + sz, y + k * sz * 0.32)
        elif kind == "retry":
            r = sz * 0.42
            cx, cy = x + sz / 2, y
            c.arc(cx - r, cy - r, cx + r, cy + r, 70, 290)
            ax, ay = cx + r * math.cos(math.radians(70)), cy + r * math.sin(math.radians(70))
            pth = c.beginPath()
            pth.moveTo(ax + sz * 0.22, ay + sz * 0.02)
            pth.lineTo(ax - sz * 0.06, ay + sz * 0.2)
            pth.lineTo(ax - sz * 0.02, ay - sz * 0.16)
            pth.close()
            c.drawPath(pth, stroke=0, fill=1)
        c.restoreState()

    def label_with_icons(cx, cy, label, font, size, color, before=None, after=None):
        """Draws a label centred at (cx, cy) with an optional icon before or after it."""
        isz = size * 0.95
        tw = c.stringWidth(label, font, size)
        total = tw + (isz + 8 if before else 0) + (isz + 8 if after else 0)
        x = cx - total / 2
        if before:
            icon(before, x, cy, isz, color)
            x += isz + 8
        c.setFillColor(color)
        c.setFont(font, size)
        c.drawString(x, cy - size * 0.36, label)
        if after:
            icon(after, x + tw + 8, cy, isz, color)

    def button(x, y, w, h, label, dest, fill=INK, color=white, size=14, stroke=None, before=None, after=None):
        c.setFillColor(fill)
        c.setStrokeColor(stroke or fill)
        c.setLineWidth(1.4)
        c.roundRect(x, y, w, h, h / 2 if h <= 50 else 14, stroke=1 if stroke else 0, fill=1)
        label_with_icons(x + w / 2, y + h / 2, label, "Golos-Bold", size, color, before, after)
        c.linkRect("", dest, (x, y, x + w, y + h), relative=0)

    def navlink(x, y, label, dest, before=None, after=None, right=False):
        """A quiet text link at the bottom of a page."""
        tw = c.stringWidth(label, "Golos-Bold", 11) + 20
        x0 = x - tw if right else x
        label_with_icons(x0 + tw / 2, y, label, "Golos-Bold", 11, MUTED, before, after)
        c.linkRect("", dest, (x0 - 6, y - 13, x0 + tw + 6, y + 13), relative=0)

    def page(top_label="", progress=None):
        """Background, watermark, the brand bar and the footer of every page."""
        c.setFillColor(PAPER)
        c.rect(0, 0, W, H, stroke=0, fill=1)
        c.saveState()
        c.setFillColor(INK)
        c.setFillAlpha(0.03)
        c.translate(W / 2, H / 2)
        c.rotate(55)
        c.setFont("Literata-Bold", 64)
        c.drawCentredString(0, -20, "ЕДУ БЕЛ")
        c.restoreState()
        c.drawImage(LOGO, M, H - 46, width=37, height=27, mask="auto")
        c.setFillColor(INK)
        c.setFont("Literata-Bold", 11.5)
        c.drawString(M + 43, H - 32, "Еду БЕЛ")
        c.setFont("Golos", 8)
        c.setFillColor(MUTED)
        c.drawString(M + 43, H - 42, "200 въпроса")
        if top_label:
            c.setFont("Golos-Bold", 9)
            c.setFillColor(INK)
            c.drawRightString(W - M, H - 37, top_label)
        c.setStrokeColor(GOLD)
        c.setLineWidth(0.7)
        c.line(M, H - 52, W - M, H - 52)
        if progress is not None:
            c.setStrokeColor(LINE)
            c.setLineWidth(3)
            c.line(M, H - 52, W - M, H - 52)
            c.setStrokeColor(GOLD)
            c.line(M, H - 52, M + (W - 2 * M) * progress, H - 52)
        c.setFont("Golos", 7)
        c.setFillColor(MUTED)
        c.drawCentredString(W / 2, 12, "© Еду БЕЛ · edubel.site · Копирането и разпространението е забранено.")

    def next_dest(n):
        i = order.index(n)
        q = qs[i]
        last = by_part[q["part"]][-1]["n"]
        return f"e{q['part']}" if n == last else f"q{order[i + 1]}"

    # ---------------- cover
    page()
    c.setStrokeColor(GOLD)
    c.setLineWidth(1)
    c.roundRect(12, 24, W - 24, H - 36, 14, stroke=1, fill=0)
    c.drawImage(LOGO, W / 2 - 66, H - 205, width=132, height=96, mask="auto")
    c.setFillColor(GOLD)
    c.setFont("Golos-Bold", 9)
    c.drawCentredString(W / 2, H - 228, "ИНТЕРАКТИВЕН PDF · 5.–7. КЛАС")
    c.setFillColor(INK)
    c.setFont("Literata-Bold", 44)
    c.drawCentredString(W / 2, H - 278, "200 въпроса")
    c.setFont("Literata", 13)
    c.setFillColor(TEXT)
    c.drawCentredString(W / 2, H - 300, "по български език и литература")
    y = draw(P("Докосни отговора – веднага разбираш дали е верен и защо.", 14, "Golos-Bold", INK, align=TA_CENTER), 40, H - 330, W - 80)
    x = W / 2 - 3 * 62 / 2 - 8
    for g in (5, 6, 7):
        c.setFillColor(INK)
        c.roundRect(x, y - 44, 62, 26, 13, stroke=0, fill=1)
        c.setFillColor(white)
        c.setFont("Golos-Bold", 11.5)
        c.drawCentredString(x + 31, y - 35, f"{g}. клас")
        x += 70
    button(50, 150, W - 100, 50, "Започни", "upotreba1", fill=GOLD, color=white, size=16, after="next")
    c.setFillColor(MUTED)
    c.setFont("Golos", 10)
    c.drawCentredString(W / 2, 118, "Без интернет · на всеки телефон")
    c.drawCentredString(W / 2, 102, "Подарък от Еду БЕЛ · edubel.site")
    c.showPage()

    # ---------------- instructions for use: right after the cover, before anything else
    GUIDE = [
        ("Инструкции за употреба", "ЗА РОДИТЕЛЯ", [
            "Изпратете файла на телефона или таблета на детето – по Viber, имейл или WhatsApp – и го запазете. Не трябва интернет, приложение или регистрация.",
            "Отворете го с програма за PDF. Ако бутоните не реагират (някои чатове показват файла само като картинка), отворете го с Adobe Acrobat Reader, „Файлове“ на iPhone или Google Drive.",
            "Покажете на детето частите за неговия клас: 5. клас – части 1 и 2, 6. клас – части 3 и 4, 7. клас – части 5 и 6. Седмокласниците могат да минат през всички – творбите от 5. и 6. клас също са в НВО.",
            "По 10 въпроса на ден са достатъчни – около 10 минути. После попитайте детето за грешките: обяснението казва защо и какво да преговори.",
        ], ("Нататък: как се играе", "upotreba2")),
        ("Как се играе", "ЗА ДЕТЕТО", [
            "Избери частта за своя клас и натисни „Започни“.",
            "Прочети въпроса и докосни отговора, който смяташ за верен.",
            "Зелено „Вярно!“ – печелиш 1, 2 или 3 точки според звездичките на въпроса. Записвай си ги на лист – файлът не ги брои.",
            "Червено „Не е вярно“ – прочети защо. После „Опитай пак“ или „Следващ въпрос“.",
            "„Части“ долу вляво те връща в менюто, а „Пропусни“ долу вдясно прескача въпроса.",
            "В края на частта събери точките и виж своята титла.",
        ], ("Към частите", "menu")),
    ]
    for k, (title, kicker, items, (btn, dest)) in enumerate(GUIDE, 1):
        page(f"Инструкции {k} / {len(GUIDE)}")
        c.bookmarkPage(f"upotreba{k}")
        c.setFillColor(INK)
        c.setFont("Literata-Bold", 23)
        c.drawString(M, H - 92, title)
        c.setFillColor(GOLD)
        c.setFont("Golos-Bold", 10)
        c.drawString(M, H - 112, kicker)
        tw = W - 2 * M - 38
        for s_ in (1, 0.94, 0.88, 0.82, 0.76):
            ps = [P(t(x), 12.5 * s_, "Golos", TEXT) for x in items]
            if sum(height(x, tw) + 12 * s_ for x in ps) <= H - 126 - 132:
                break
        y = H - 126
        for i, para in enumerate(ps, 1):
            h = height(para, tw)
            c.setFillColor(INK)
            c.circle(M + 12, y - 9, 11, stroke=0, fill=1)
            c.setFillColor(white)
            c.setFont("Golos-Bold", 11)
            c.drawCentredString(M + 12, y - 13, str(i))
            draw(para, M + 34, y - 1, tw)
            y -= h + 12 * s_
        button(M, 62, W - 2 * M, 48, btn, dest, fill=GOLD if dest == "menu" else INK, size=15, after="next")
        c.showPage()

    # ---------------- menu
    page("Части")
    c.bookmarkPage("menu")
    c.setFillColor(INK)
    c.setFont("Literata-Bold", 24)
    c.drawString(M, H - 92, "Избери част")
    draw(P("Докосни отговора – после „Следващ въпрос“. Най-добре по 10 въпроса на ден.", 11.5, color=MUTED), M, H - 104, W - 2 * M)
    y = H - 150
    for p in PARTS:
        pq = by_part[p["part"]]
        h = 58
        c.setFillColor(white)
        c.setStrokeColor(EDGE)
        c.setLineWidth(1)
        c.roundRect(M, y - h, W - 2 * M, h, 12, stroke=1, fill=1)
        c.setFillColor(INK)
        c.roundRect(M + 10, y - h + 11, 36, 36, 9, stroke=0, fill=1)
        c.setFillColor(white)
        c.setFont("Literata-Bold", 18)
        c.drawCentredString(M + 28, y - h + 22, str(p["part"]))
        c.setFillColor(INK)
        c.setFont("Literata-Bold", 14.5)
        c.drawString(M + 56, y - 25, part_title(p))
        c.setFillColor(MUTED)
        c.setFont("Golos", 10)
        c.drawString(M + 56, y - 41, f"{len(pq)} въпроса · до {sum(q['pts'] for q in pq)} точки")
        icon("next", W - M - 30, y - h / 2, 16, GOLD)
        c.linkRect("", f"p{p['part']}", (M, y - h, W - M, y), relative=0)
        y -= h + 8
    y -= 6
    for lv in (1, 2, 3):
        stars(M + 6, y - 4, lv, 4.5, LVL[lv], total=lv)
        c.setFillColor(TEXT)
        c.setFont("Golos", 10.5)
        c.drawString(M + 6 + lv * 10.5 + 4, y - 8, f"{LEVEL[lv]} – {lv} {'точка' if lv == 1 else 'точки'}")
        y -= 17
    navlink(W - M, 42, "Инструкции", "upotreba1", before="menu", right=True)
    c.showPage()

    # ---------------- parts
    for p in PARTS:
        pq = by_part[p["part"]]
        mx = sum(q["pts"] for q in pq)
        # part start
        page(f"Част {p['part']}")
        c.bookmarkPage(f"p{p['part']}")
        c.setFillColor(INK)
        c.roundRect(M, H - 250, W - 2 * M, 176, 16, stroke=0, fill=1)
        c.setFillColor(GOLD)
        c.setFont("Golos-Bold", 10)
        c.drawString(M + 18, H - 104, f"ЧАСТ {p['part']} ОТ 6")
        c.setFillColor(white)
        c.setFont("Literata-Bold", 25)
        c.drawString(M + 18, H - 140, f"{p['grade']}. клас")
        c.drawString(M + 18, H - 170, SECTION[p["section"]])
        c.setFont("Golos", 11)
        c.setFillColor(HexColor("#D9DEE8"))
        c.drawString(M + 18, H - 198, f"{len(pq)} въпроса · до {mx} точки")
        c.drawString(M + 18, H - 216, f"Въпроси {pq[0]['n']}–{pq[-1]['n']} · около {p['minutes']} минути")
        y = H - 280
        c.setFillColor(INK)
        c.setFont("Golos-Bold", 12)
        c.drawString(M, y, "Въпросите вървят от лесни към трудни:")
        y -= 22
        for lv in (1, 2, 3):
            stars(M + 6, y + 4, lv, 5, LVL[lv], total=lv)
            c.setFillColor(TEXT)
            c.setFont("Golos", 11.5)
            c.drawString(M + 6 + lv * 11.5 + 6, y, f"{LEVEL[lv]} – {lv} {'точка' if lv == 1 else 'точки'} за верен отговор")
            y -= 21
        draw(P("Брой си точките: на всяка зелена страница „Вярно!“ пише колко точки печелиш. В края на частта ще видиш своята титла.", 11, color=MUTED), M, y - 6, W - 2 * M)
        button(M, 110, W - 2 * M, 50, "Започни", f"q{pq[0]['n']}", fill=GOLD, size=16, after="next")
        button(M, 62, W - 2 * M, 38, "Всички части", "menu", fill=PAPER, color=INK, size=12.5, stroke=LINE, before="back")
        c.showPage()

        for k, q in enumerate(pq):
            n = q["n"]
            label = f"Част {p['part']} · {k + 1} / {len(pq)}"
            col = LVL[q["pts"]]
            # ---- the question: shrink the text until everything fits
            for s in (1, 0.94, 0.88, 0.82, 0.76, 0.7):
                qp = P(t(q["q"]), 15 * s, "Golos-Bold", INK)
                qtp = P(t(q["qt"]), 13 * s, "Literata-Italic", TEXT) if q.get("qt") else None
                ops = [P(t(o), 13.5 * s, "Golos", TEXT) for o in q["o"]]
                bw = W - 2 * M - 50
                oh = [max(40 * s + 4, height(o, bw) + 18 * s) for o in ops]
                need = height(qp, W - 2 * M) + (height(qtp, W - 2 * M - 22) + 18 if qtp else 0) + 14 + sum(oh) + 8 * 3
                if need <= H - 110 - 92:
                    break
            page(label, progress=(k + 1) / len(pq))
            c.bookmarkPage(f"q{n}")
            y = H - 74
            stars(M + 5, y - 2, q["pts"], 5, col)
            c.setFillColor(col)
            c.setFont("Golos-Bold", 10.5)
            c.drawString(M + 40, y - 6, f"{LEVEL[q['pts']]} · {q['pts']} {'точка' if q['pts'] == 1 else 'точки'}")
            c.setFillColor(MUTED)
            c.setFont("Golos", 10)
            c.drawRightString(W - M, y - 6, f"Въпрос {n}")
            y -= 20
            y = draw(qp, M, y, W - 2 * M)
            if qtp:
                h = height(qtp, W - 2 * M - 22)
                c.setFillColor(GOLD_SOFT)
                c.roundRect(M, y - h - 16, W - 2 * M, h + 12, 6, stroke=0, fill=1)
                c.setFillColor(GOLD)
                c.rect(M, y - h - 16, 3, h + 12, stroke=0, fill=1)
                draw(qtp, M + 13, y - 10, W - 2 * M - 22)
                y -= h + 18
            y -= 14
            for i, (o, h) in enumerate(zip(ops, oh)):
                c.setFillColor(white)
                c.setStrokeColor(LINE)
                c.setLineWidth(1.3)
                c.roundRect(M, y - h, W - 2 * M, h, 12, stroke=1, fill=1)
                c.setFillColor(INK)
                c.circle(M + 20, y - h / 2, 12, stroke=0, fill=1)
                c.setFillColor(white)
                c.setFont("Golos-Bold", 12)
                c.drawCentredString(M + 20, y - h / 2 - 4.3, LETTERS[i])
                oph = height(o, bw)
                draw(o, M + 40, y - (h - oph) / 2, bw)
                c.linkRect("", f"ok{n}" if i == q["a"] else f"no{n}", (M, y - h, W - M, y), relative=0)
                y -= h + 8
            # bottom navigation
            navlink(M, 42, "Части", "menu", before="menu")
            navlink(W - M, 42, "Пропусни", next_dest(n), after="next", right=True)
            c.showPage()

            # ---- „Вярно!“ and „Не е вярно“
            for ok in (True, False):
                page(label, progress=(k + 1) / len(pq))
                c.bookmarkPage(f"{'ok' if ok else 'no'}{n}")
                y = H - 84
                c.setFillColor(OK if ok else BAD)
                c.circle(W / 2, y - 26, 26, stroke=0, fill=1)
                c.setStrokeColor(white)
                c.setLineWidth(4.5)
                c.setLineCap(1)
                c.setLineJoin(1)
                if ok:
                    pth = c.beginPath()
                    pth.moveTo(W / 2 - 11, y - 26)
                    pth.lineTo(W / 2 - 3, y - 35)
                    pth.lineTo(W / 2 + 12, y - 17)
                    c.drawPath(pth, stroke=1, fill=0)
                else:
                    c.line(W / 2 - 9, y - 35, W / 2 + 9, y - 17)
                    c.line(W / 2 - 9, y - 17, W / 2 + 9, y - 35)
                c.setFillColor(OK if ok else BAD)
                c.setFont("Literata-Bold", 26)
                c.drawCentredString(W / 2, y - 82, "Вярно!" if ok else "Не е вярно")
                y -= 96
                if ok:
                    lbl = f"+{q['pts']} {'точка' if q['pts'] == 1 else 'точки'}"
                    w = c.stringWidth(lbl, "Golos-Bold", 12) + 26
                    c.setFillColor(OK_SOFT)
                    c.roundRect(W / 2 - w / 2, y - 22, w, 22, 11, stroke=0, fill=1)
                    c.setFillColor(OK)
                    c.setFont("Golos-Bold", 12)
                    c.drawCentredString(W / 2, y - 15.5, lbl)
                    y -= 34
                # right answer, why, revise – shrink to fit above the buttons
                bottom = 170 if not ok else 120
                for s in (1, 0.92, 0.85, 0.78, 0.7):
                    ra = P(f"<b>{LETTERS[q['a']]})</b> {t(q['o'][q['a']])}", 14 * s, "Golos", INK)
                    why = P(t(q["e"]), 12.5 * s, "Golos", TEXT)
                    rev = units.get(q["unit"], "")
                    rv = P(f"<b>Преговори:</b> {t(rev)}", 11.5 * s, "Golos", HexColor("#3F7A8C")) if rev else None
                    need = 16 + height(ra, W - 2 * M - 24) + 20 + 16 + height(why, W - 2 * M - 24) + 22 + (height(rv, W - 2 * M) + 10 if rv else 0)
                    if need <= y - bottom:
                        break
                c.setFillColor(MUTED)
                c.setFont("Golos-Bold", 9.5)
                c.drawString(M, y - 8, "ВЕРНИЯТ ОТГОВОР")
                y -= 14
                h = height(ra, W - 2 * M - 24)
                c.setFillColor(OK_SOFT)
                c.roundRect(M, y - h - 14, W - 2 * M, h + 14, 10, stroke=0, fill=1)
                draw(ra, M + 12, y - 7, W - 2 * M - 24)
                y -= h + 24
                c.setFillColor(MUTED)
                c.setFont("Golos-Bold", 9.5)
                c.drawString(M, y - 8, "ЗАЩО")
                y -= 14
                h = height(why, W - 2 * M - 24)
                c.setFillColor(GOLD_SOFT)
                c.roundRect(M, y - h - 16, W - 2 * M, h + 16, 10, stroke=0, fill=1)
                draw(why, M + 12, y - 8, W - 2 * M - 24)
                y -= h + 26
                if rv:
                    draw(rv, M, y, W - 2 * M)
                nxt = next_dest(n)
                last = nxt.startswith("e")
                button(M, 62, W - 2 * M, 48, "Към края на частта" if last else "Следващ въпрос", nxt, fill=INK, size=15, after="next")
                if not ok:
                    button(M, 118, W - 2 * M, 40, "Опитай пак", f"q{n}", fill=PAPER, color=INK, size=13, stroke=LINE, before="retry")
                navlink(M, 38, "Части", "menu", before="menu")
                c.showPage()

        # part end
        page(f"Част {p['part']} · край")
        c.bookmarkPage(f"e{p['part']}")
        y = H - 92
        for i in range(3):
            star(W / 2 - 34 + i * 34, y - 18, 14, GOLD)
        c.setFillColor(INK)
        c.setFont("Literata-Bold", 26)
        c.drawCentredString(W / 2, y - 70, "Браво!")
        c.setFont("Golos", 13)
        c.setFillColor(TEXT)
        c.drawCentredString(W / 2, y - 92, f"Завърши част {p['part']} · {part_title(p)}")
        y -= 130
        c.setFillColor(INK)
        c.setFont("Golos-Bold", 12.5)
        c.drawCentredString(W / 2, y, f"Колко точки събра от {mx}? Твоята титла:")
        y -= 14
        for mn, title in RANKS:
            lo = math.ceil(mx * mn / 100)
            c.setStrokeColor(LINE)
            c.setLineWidth(0.6)
            c.line(M + 20, y - 26, W - M - 20, y - 26)
            c.setFillColor(INK)
            c.setFont("Literata-Bold", 14)
            c.drawString(M + 24, y - 19, title)
            c.setFillColor(MUTED)
            c.setFont("Golos", 11.5)
            c.drawRightString(W - M - 24, y - 19, f"{lo}+ т." if mn else f"до {math.ceil(mx * 40 / 100) - 1} т.")
            y -= 28
        nxt = next((x for x in PARTS if x["part"] == p["part"] + 1), None)
        if nxt:
            button(M, 110, W - 2 * M, 50, f"Към част {nxt['part']}", f"p{nxt['part']}", fill=GOLD, size=15, after="next")
        else:
            button(M, 110, W - 2 * M, 50, "За родителя", "rod", fill=GOLD, size=15, after="next")
        button(M, 62, W - 2 * M, 38, "Всички части", "menu", fill=PAPER, color=INK, size=12.5, stroke=LINE, before="menu")
        c.showPage()

    # ---------------- for the parent
    page("За родителя")
    c.bookmarkPage("rod")
    c.setFillColor(INK)
    c.setFont("Literata-Bold", 24)
    c.drawString(M, H - 92, "За родителя")
    y = H - 108
    for head, body in [
        ("Как да го ползвате", "Пратете файла на телефона на детето. По 10 въпроса на ден са достатъчни – след „Не е вярно“ обяснението казва защо и коя тема да се преговори."),
        ("Какво има вътре", "200 въпроса по програмата на МОН за 5., 6. и 7. клас – литература и български език, от лесни към трудни. За 7. клас всички части са преговор за НВО."),
        ("Еду БЕЛ", "Платформа по български език и литература за 5.–7. клас: литературни карти с преговор, тренажор за НВО и отчет за родителя. Вижте edubel.site."),
    ]:
        y = draw(P(head, 13, "Golos-Bold", INK), M, y - 8, W - 2 * M)
        y = draw(P(body, 11.5, "Golos", TEXT), M, y - 4, W - 2 * M)
    draw(P("© Еду БЕЛ. Подарък за лична употреба в семейството. Копирането на въпросите в други материали, сайтове и приложения и препродажбата са забранени.", 9, color=MUTED), M, 140, W - 2 * M)
    button(M, 62, W - 2 * M, 40, "Към частите", "menu", fill=INK, size=13, before="menu")
    c.showPage()
    c.save()

    if not plain:
        protect(raw, out)
        os.remove(raw)
    from pypdf import PdfReader
    r = PdfReader(out)
    links = sum(len(pg.get("/Annots") or []) for pg in r.pages)
    print(f"{len(qs)} въпроса, {len(r.pages)} страници, {links} връзки, {os.path.getsize(out) // 1024} KB →", out)


def protect(raw, out):
    """No Unicode map in the fonts (a copy gives nonsense), AES-256 with print-only permissions.
    pikepdf (qpdf) handles the 600 linked pages without pypdf's recursion limit."""
    import pikepdf
    with pikepdf.open(raw) as pdf:
        seen = set()
        for pg in pdf.pages:
            fonts = pg.Resources.get("/Font", {})
            for name in list(fonts.keys()):
                f = fonts[name]
                key = f.objgen
                if key in seen:
                    continue
                seen.add(key)
                if "/ToUnicode" in f:
                    del f["/ToUnicode"]
        with pdf.open_metadata(set_pikepdf_as_editor=False) as meta:
            meta["dc:title"] = "200 въпроса – интерактивен PDF | Еду БЕЛ"
            meta["dc:creator"] = ["Еду БЕЛ"]
            meta["dc:rights"] = "© Еду БЕЛ. Всички права запазени."
        pdf.docinfo["/Producer"] = "Еду БЕЛ"
        pdf.docinfo["/Copyright"] = "© Еду БЕЛ. Всички права запазени."
        allow = pikepdf.Permissions(accessibility=False, extract=False, modify_annotation=False, modify_assembly=False,
                                    modify_form=False, modify_other=False, print_lowres=True, print_highres=True)
        pdf.save(out, encryption=pikepdf.Encryption(owner=secrets.token_urlsafe(24), user="", R=6, allow=allow),
                 compress_streams=True, object_stream_mode=pikepdf.ObjectStreamMode.generate)


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("src")
    ap.add_argument("out")
    ap.add_argument("--plain", action="store_true")
    a = ap.parse_args()
    build(a.src, a.out, a.plain)
