#!/usr/bin/env python3
"""„200 въпроса“ – the Еду БЕЛ gift: a printable, copy-protected PDF plus the online check.

The questions are content and never go into this public repository (they live in private/ and in the database).

  1) Questions → import file (numbers, balanced answer letters, module for /api/podarak):
       python3 scripts/podarak.py content private/podarak/parts private/podarak/podarak-import.json
  2) Import file (or `admin.mjs export` after the teacher's review) → PDF:
       python3 scripts/podarak.py pdf private/podarak/podarak-import.json private/podarak/Edu-BEL-200-vaprosa.pdf
     Options: --base https://app.edubel.site  (where the QR codes point)
              --for "Училище …"                      (a licence line on every page)
              --key                                  (teacher's copy: answers and explanations, not for children)
              --draft                                (a "draft" stamp on every page)
              --plain                                (no protection: for quick layout checks only)

Protection of the PDF: all text is turned into vector shapes (nothing to select, copy or extract),
the file is encrypted (AES-256; printing allowed, copying and editing not), a light watermark is on
every page, and the answer key is not in the file at all – it is only on the server.
Needs: reportlab, pypdf, fonttools + brotli (for the brand fonts), Ghostscript (`gs`).
"""
import argparse, json, os, random, re, secrets, shutil, subprocess, sys, tempfile
from collections import Counter
from xml.sax.saxutils import escape

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODULE = "podarak-200"
TITLE = "200 въпроса"
KICKER = "Голямото БЕЛ предизвикателство"
EDITION = "Подарък от Еду БЕЛ · ноември 2026"
DEFAULT_BASE = "https://app.edubel.site"

# The six parts: two per grade. Points: 1 = Знам, 2 = Разбирам, 3 = Мисля.
PARTS = [
    {"part": 1, "grade": 5, "section": "literature", "count": 33, "pts": {1: 11, 2: 11, 3: 11}, "minutes": 35},
    {"part": 2, "grade": 5, "section": "language", "count": 33, "pts": {1: 11, 2: 11, 3: 11}, "minutes": 35},
    {"part": 3, "grade": 6, "section": "literature", "count": 33, "pts": {1: 11, 2: 11, 3: 11}, "minutes": 35},
    {"part": 4, "grade": 6, "section": "language", "count": 33, "pts": {1: 11, 2: 11, 3: 11}, "minutes": 35},
    {"part": 5, "grade": 7, "section": "literature", "count": 34, "pts": {1: 11, 2: 12, 3: 11}, "minutes": 40},
    {"part": 6, "grade": 7, "section": "language", "count": 34, "pts": {1: 11, 2: 12, 3: 11}, "minutes": 40},
]
SECTION = {"literature": "Литература", "language": "Български език"}
LEVEL = {1: "Знам", 2: "Разбирам", 3: "Мисля"}
# Titles by the share of the maximum points (the same ladder is used online).
RANKS = [(90, "Будител"), (75, "Майстор на словото"), (60, "Летописец"), (40, "Книжовник"), (0, "Четец")]
LETTERS = "АБВГ"


def part_title(p):
    return f"{p['grade']}. клас · {SECTION[p['section']]}"


# ---------------------------------------------------------------- content

def fail(msg):
    print("ГРЕШКА:", msg, file=sys.stderr)
    sys.exit(1)


def balanced_letters(n, seed):
    """Correct letters for n questions: each letter about n/4 times, never three in a row."""
    rnd = random.Random(seed)
    for _ in range(1000):
        seq = [(i + seed) % 4 for i in range(n)]  # the extra letters of a part rotate between parts
        rnd.shuffle(seq)
        if all(not (seq[i] == seq[i - 1] == seq[i - 2]) for i in range(2, n)):
            return seq
    return seq


def content(parts_dir, out):
    units = {u["slug"]: u for u in json.load(open(os.path.join(ROOT, "curriculum/units.json"), encoding="utf-8"))["units"]}
    items, meta_parts, n = [], [], 0
    problems = []
    for p in PARTS:
        path = os.path.join(parts_dir, f"part-{p['part']}.json")
        if not os.path.exists(path):
            fail(f"липсва {path}")
        qs = json.load(open(path, encoding="utf-8"))["questions"]
        if len(qs) != p["count"]:
            problems.append(f"част {p['part']}: {len(qs)} въпроса вместо {p['count']}")
        got = Counter(q["pts"] for q in qs)
        if dict(got) != p["pts"]:
            problems.append(f"част {p['part']}: точки {dict(got)} вместо {p['pts']}")
        # Easy → hard; inside a level keep the author's order (the order of the programme).
        qs = sorted(qs, key=lambda q: q["pts"])
        letters = balanced_letters(len(qs), 2026 + p["part"])
        start = n + 1
        for k, q in enumerate(qs):
            n += 1
            where = f"част {p['part']}, {q.get('id')}"
            opts = q["o"]
            if len(opts) != 4 or len(set(opts)) != 4:
                problems.append(f"{where}: нужни са 4 различни отговора")
            u = units.get(q.get("unit"))
            if not u or u["grade"] != p["grade"] or u["section"] != p["section"]:
                problems.append(f"{where}: непозната тема {q.get('unit')}")
            text = q["q"] + q["e"] + "".join(opts) + (q.get("qt") or "")
            if '"' in text:
                problems.append(f"{where}: прави кавички")
            if re.search(r"(?<!\w)теза(?!\w)", text.lower()):
                problems.append(f"{where}: думата „теза“")
            # The right answer goes to its balanced letter; the wrong ones are shuffled around it.
            rnd = random.Random(f"{p['part']}-{q.get('id')}")
            wrong = opts[1:]
            rnd.shuffle(wrong)
            a = letters[k]
            shown = wrong[:a] + [opts[0]] + wrong[a:]
            data = {"n": n, "part": p["part"], "pts": q["pts"], "unit": q["unit"], "q": q["q"], "qt": q.get("qt") or None,
                    "o": shown, "a": a, "e": q["e"]}
            if q.get("check"):
                data["check"] = q["check"]
            items.append({"module": MODULE, "ext": f"q{n:03d}", "position": n, "data": data})
        part_items = [it for it in items if it["data"]["part"] == p["part"]]
        meta_parts.append({
            "part": p["part"], "grade": p["grade"], "section": p["section"], "title": part_title(p),
            "from": start, "to": n, "count": len(part_items), "max": sum(it["data"]["pts"] for it in part_items), "minutes": p["minutes"],
        })
    problems += font_problems(items)
    if problems:
        fail("\n  " + "\n  ".join(problems))
    total = sum(m["max"] for m in meta_parts)
    module = {
        "slug": MODULE, "grade": 0, "kind": "challenge", "title": f"{TITLE} – {KICKER}",
        "subtitle": "Подарък: 6 части за 5., 6. и 7. клас, проверка онлайн и класиране", "position": 0,
        "free_ratio": 1, "meta": {"parts": meta_parts, "max": total, "ranks": [{"min": m, "title": t} for m, t in RANKS]},
    }
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    json.dump({"modules": [module], "items": items}, open(out, "w", encoding="utf-8"), ensure_ascii=False)
    print(f"{len(items)} въпроса, до {total} точки →", out)
    print("Букви на верните отговори:", dict(Counter(LETTERS[it["data"]["a"]] for it in items)))


# ---------------------------------------------------------------- fonts

def font_problems(items):
    """Characters the brand fonts cannot print (they come out blank) and explanations that point at an
    answer by its place – the letters differ between the competition and the parents' PDF."""
    from fontTools.ttLib import TTFont
    brand_fonts()
    cmaps = {n: set(TTFont(os.path.join(FONT_DIR, f"{n}.ttf")).getBestCmap()) for n in ("Golos", "Golos-Bold", "Literata-Italic")}
    out = []
    for it in items:
        q = it["data"]
        fields = [(q["q"], "Golos-Bold"), (q["e"], "Golos"), (q.get("qt") or "", "Literata-Italic")] + [(o, "Golos") for o in q["o"]]
        bad = sorted({ch for text, font in fields for ch in text if ch not in " \n" and ord(ch) not in cmaps[font]})
        if bad:
            out.append(f"въпрос {q['n']}: знаци, които шрифтът няма: {' '.join(bad)}")
        if re.search(r"(последни(ят|я) (отговор|вариант)|първи(ят|я) (отговор|вариант)|вариант [АБВГ]\b|отговор [АБВГ]\b)", q["e"]):
            out.append(f"въпрос {q['n']}: обяснението сочи отговор по място – буквите се разбъркват")
    return out


FONT_DIR = os.path.join(ROOT, "tmp/podarak-fonts")
FONTS = {
    "Golos": ("golos-text-normal", {"wght": 400}),
    "Golos-Bold": ("golos-text-normal", {"wght": 700}),
    "Literata": ("literata-normal", {"wght": 400, "opsz": 12}),
    "Literata-Bold": ("literata-normal", {"wght": 700, "opsz": 36}),
    "Literata-Italic": ("literata-italic", {"wght": 400, "opsz": 12}),
}


def brand_fonts():
    """The site's variable woff2 subsets → static TTFs (Cyrillic + Latin merged) for ReportLab."""
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont as RLFont
    from reportlab.lib.fonts import addMapping
    os.makedirs(FONT_DIR, exist_ok=True)
    for name, (base, axes) in FONTS.items():
        path = os.path.join(FONT_DIR, f"{name}.ttf")
        if not os.path.exists(path):
            from fontTools.ttLib import TTFont
            from fontTools.varLib import instancer
            from fontTools.merge import Merger
            parts = []
            for i, sub in enumerate(("cyrillic", "latin")):
                f = TTFont(os.path.join(ROOT, f"public/fonts/{base}-{sub}.woff2"))
                f.flavor = None
                inst = instancer.instantiateVariableFont(f, axes)
                for t in ("GSUB", "GPOS", "GDEF", "STAT", "HVAR", "MVAR", "avar"):
                    if t in inst:
                        del inst[t]
                p = os.path.join(FONT_DIR, f"{name}.{i}.ttf")
                inst.save(p)
                parts.append(p)
            Merger().merge(parts).save(path)
            for p in parts:
                os.remove(p)
        add_i_grave(path)
        pdfmetrics.registerFont(RLFont(name, path))
    addMapping("Golos", 0, 0, "Golos")
    addMapping("Golos", 1, 0, "Golos-Bold")
    addMapping("Golos", 0, 1, "Golos")
    addMapping("Golos", 1, 1, "Golos-Bold")
    addMapping("Literata", 0, 0, "Literata")
    addMapping("Literata", 1, 0, "Literata-Bold")
    addMapping("Literata", 0, 1, "Literata-Italic")
    addMapping("Literata", 1, 1, "Literata-Bold")


def add_i_grave(path):
    """Golos Text has no „ѝ“ (U+045D) – it would print as a blank. Build it from the font's own „и“ and
    combining grave (U+0300), centred over the letter. Nothing to do when the font already has it."""
    from fontTools.ttLib import TTFont
    from fontTools.pens.ttGlyphPen import TTGlyphPen
    from fontTools.pens.transformPen import TransformPen
    from fontTools.pens.boundsPen import BoundsPen
    f = TTFont(path)
    cmap = f.getBestCmap()
    if 0x45D in cmap or 0x438 not in cmap or 0x300 not in cmap:
        return
    base, mark = cmap[0x438], cmap[0x300]
    glyf, hmtx = f["glyf"], f["hmtx"]  # load the tables before the glyph order changes
    vmtx = f["vmtx"] if "vmtx" in f else None
    gs = f.getGlyphSet()

    def bounds(g):
        bp = BoundsPen(gs)
        gs[g].draw(bp)
        return bp.bounds

    bx0, by0, bx1, by1 = bounds(base)
    mx0, my0, mx1, my1 = bounds(mark)
    dx = (bx0 + bx1) / 2 - (mx0 + mx1) / 2
    dy = max(0, by1 + 40 - my0)  # keep a small gap above the letter
    pen = TTGlyphPen(None)
    gs[base].draw(pen)
    gs[mark].draw(TransformPen(pen, (1, 0, 0, 1, dx, dy)))
    name = "uni045D"
    f.setGlyphOrder(f.getGlyphOrder() + [name])
    glyf[name] = pen.glyph()
    hmtx[name] = hmtx[base]
    if vmtx is not None:
        vmtx[name] = vmtx[base]
    for t in f["cmap"].tables:
        if t.isUnicode():
            t.cmap[0x45D] = name
    f.save(path)


# ---------------------------------------------------------------- pdf

def pdf(src, out, base, licensee, key, draft, plain):
    from reportlab.lib.colors import HexColor, white, Color
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.enums import TA_CENTER, TA_LEFT
    from reportlab.platypus import (BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, Table, TableStyle,
                                    KeepTogether, PageBreak, NextPageTemplate, Flowable, CondPageBreak)
    from reportlab.graphics.barcode import qr
    from reportlab.graphics.shapes import Drawing
    from reportlab.graphics import renderPDF

    brand_fonts()
    d = json.load(open(src, encoding="utf-8"))
    rows = [it for it in d["items"] if (it.get("module") or it.get("module_slug")) == MODULE and it.get("status", "review") != "hidden"]
    qs = sorted((it["data"] for it in rows), key=lambda x: x["n"])
    by_part = {p["part"]: [q for q in qs if q["part"] == p["part"]] for p in PARTS}

    INK, GOLD, GOLD_SOFT = HexColor("#1B2A4A"), HexColor("#C49A3C"), HexColor("#F4EAD3")
    PAPER, EDGE, MUTED, LINE, TEXT = HexColor("#FFFDF8"), HexColor("#E3DCCB"), HexColor("#5A6275"), HexColor("#D3D8E1"), HexColor("#1F2633")
    LVL = {1: HexColor("#3F7A8C"), 2: HexColor("#B88A2E"), 3: HexColor("#8C3F5A")}
    OK = HexColor("#2E7D4F")
    W, H = A4
    M = 40  # side margin
    CW = W - 2 * M
    LOGO = os.path.join(ROOT, "public/assets/logo.png")

    S = lambda **kw: ParagraphStyle("s", **{"fontName": "Golos", "fontSize": 10.5, "leading": 14.5, "textColor": TEXT, **kw})
    st = {
        "q": S(fontSize=11, leading=15.2, fontName="Golos-Bold", textColor=INK),
        "qt": S(fontName="Literata-Italic", fontSize=10.5, leading=14.5, textColor=TEXT),
        "opt": S(fontSize=10.5, leading=13.6),
        "h1": S(fontName="Literata-Bold", fontSize=26, leading=30, textColor=INK),
        "h2": S(fontName="Literata-Bold", fontSize=17, leading=21, textColor=INK, spaceBefore=6, spaceAfter=6),
        "h3": S(fontName="Golos-Bold", fontSize=11.5, leading=15, textColor=INK),
        "p": S(fontSize=10.5, leading=15),
        "small": S(fontSize=9, leading=12.5, textColor=MUTED),
        "key": S(fontSize=9.5, leading=13, textColor=OK),
        "center": S(alignment=TA_CENTER),
    }

    def P(text, style="p", **kw):
        s = st[style] if not kw else ParagraphStyle("x", parent=st[style], **kw)
        return Paragraph(text, s)

    def t(s):
        return escape(s).replace("\n", "<br/>")

    state = {"label": "", "page_of_part": {}}

    # ---- drawing helpers
    def star(c, cx, cy, r, color):
        import math
        p = c.beginPath()
        for i in range(10):
            a = math.pi / 2 + i * math.pi / 5
            rr = r if i % 2 == 0 else r * 0.45
            x, y = cx + rr * math.cos(a), cy + rr * math.sin(a)
            p.moveTo(x, y) if i == 0 else p.lineTo(x, y)
        p.close()
        c.setFillColor(color)
        c.drawPath(p, stroke=0, fill=1)

    def stars(c, x, y, n, r, color, gap=None, total=3, empty=None):
        gap = gap or r * 2.3
        for i in range(total):
            star(c, x + i * gap, y, r, color if i < n else (empty or LINE))

    def qr_drawing(url, size):
        w = qr.QrCodeWidget(url, barLevel="M")
        b = w.getBounds()
        bw, bh = b[2] - b[0], b[3] - b[1]
        dr = Drawing(size, size, transform=[size / bw, 0, 0, size / bh, 0, 0])
        dr.add(w)
        return dr

    def check_url(part):
        return f"{base}/podarak/proverka/?c={part}"

    class Label(Flowable):
        """Sets the running header text from the point where it is drawn."""
        def __init__(self, label):
            super().__init__()
            self.label = label
        def wrap(self, aw, ah):
            return 0, 0
        def draw(self):
            state["label"] = self.label

    class Mark(Flowable):
        """Remembers on which page a part starts (for the table of contents)."""
        def __init__(self, key):
            super().__init__()
            self.key = key
        def wrap(self, aw, ah):
            return 0, 0
        def draw(self):
            state["page_of_part"][self.key] = self.canv.getPageNumber()

    class Badge(Flowable):
        def __init__(self, n, pts):
            super().__init__()
            self.n, self.pts = n, pts
        def wrap(self, aw, ah):
            return 38, 46
        def draw(self):
            c = self.canv
            col = LVL[self.pts]
            c.setFillColor(col)
            c.roundRect(2, 14, 32, 30, 7, stroke=0, fill=1)
            c.setFillColor(white)
            c.setFont("Golos-Bold", 14 if self.n < 100 else 12.5)
            c.drawCentredString(18, 24, str(self.n))
            stars(c, 8, 7, self.pts, 4.2, col, gap=10)

    class Bubble(Flowable):
        def __init__(self, letter, filled=False, r=7.5):
            super().__init__()
            self.letter, self.filled, self.r = letter, filled, r
        def wrap(self, aw, ah):
            return self.r * 2 + 2, self.r * 2 + 1
        def draw(self):
            c = self.canv
            c.setLineWidth(0.9)
            c.setStrokeColor(OK if self.filled else INK)
            c.setFillColor(OK if self.filled else white)
            c.circle(self.r + 1, self.r, self.r, stroke=1, fill=1)
            c.setFillColor(white if self.filled else INK)
            c.setFont("Golos-Bold", self.r * 1.15)
            c.drawCentredString(self.r + 1, self.r - self.r * 0.4, self.letter)

    class Banner(Flowable):
        """The opener of a part: number, grade and section, numbers, points and the QR code."""
        def __init__(self, p, meta):
            super().__init__()
            self.p, self.meta = p, meta
        def wrap(self, aw, ah):
            self.w = aw
            return aw, 132
        def draw(self):
            c, p, m = self.canv, self.p, self.meta
            c.setFillColor(INK)
            c.roundRect(0, 0, self.w, 126, 14, stroke=0, fill=1)
            c.setFillColor(GOLD)
            c.rect(0, 0, 7, 126, stroke=0, fill=1)
            c.setFont("Golos-Bold", 10)
            c.drawString(26, 98, f"ЧАСТ {p['part']} ОТ 6")
            c.setFillColor(white)
            c.setFont("Literata-Bold", 25)
            c.drawString(26, 66, f"{p['grade']}. клас · {SECTION[p['section']]}")
            c.setFont("Golos", 10.5)
            c.setFillColor(HexColor("#D9DEE8"))
            c.drawString(26, 44, f"Въпроси {m['from']}–{m['to']}  ·  {m['count']} въпроса  ·  до {m['max']} точки  ·  около {p['minutes']} минути")
            x = 26
            for lv in (1, 2, 3):
                stars(c, x + 4, 22, lv, 4, GOLD, gap=9.5, total=lv)
                c.setFillColor(white)
                c.setFont("Golos", 9.5)
                lbl = f"{LEVEL[lv]} – {lv} т."
                c.drawString(x + 4 + lv * 9.5 + 2, 18.5, lbl)
                x += lv * 9.5 + c.stringWidth(lbl, "Golos", 9.5) + 30
            # QR on a white tile
            s = 78
            qx, qy = self.w - s - 26, 24
            c.setFillColor(white)
            c.roundRect(qx - 6, qy - 6, s + 12, s + 12, 8, stroke=0, fill=1)
            renderPDF.draw(qr_drawing(check_url(p["part"]), s), c, qx, qy)
            c.setFillColor(GOLD)
            c.setFont("Golos-Bold", 8.5)
            c.drawCentredString(qx + s / 2, qy + s + 12, "ПРОВЕРИ ОНЛАЙН")
            c.linkURL(check_url(p["part"]), (qx, qy, qx + s, qy + s), relative=1)

    class Divider(Flowable):
        def __init__(self, pts, count):
            super().__init__()
            self.pts, self.count = pts, count
        def wrap(self, aw, ah):
            self.w = aw
            return aw, 26
        def draw(self):
            c, col = self.canv, LVL[self.pts]
            stars(c, 6, 10, self.pts, 5, col, gap=12, total=self.pts)
            c.setFillColor(col)
            c.setFont("Golos-Bold", 11)
            txt = f"{LEVEL[self.pts]} · по {self.pts} {'точка' if self.pts == 1 else 'точки'} · {self.count} въпроса"
            x0 = 6 + self.pts * 12 + 4
            c.drawString(x0, 6, txt)
            c.setStrokeColor(col)
            c.setLineWidth(0.8)
            c.line(x0 + c.stringWidth(txt, "Golos-Bold", 11) + 10, 10, self.w, 10)

    def options_block(q, width):
        opts = q["o"]
        short = max(len(o) for o in opts) <= 30
        cell = lambda i: Table([[Bubble(LETTERS[i], filled=key and i == q["a"]), P(t(opts[i]), "opt")]],
                               colWidths=[20, (width / 2 if short else width) - 24],
                               style=[("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0),
                                      ("RIGHTPADDING", (0, 0), (-1, -1), 2), ("TOPPADDING", (0, 0), (-1, -1), 1.5),
                                      ("BOTTOMPADDING", (0, 0), (-1, -1), 1.5)])
        if short:
            data = [[cell(0), cell(1)], [cell(2), cell(3)]]
            cw = [width / 2, width / 2]
        else:
            data = [[cell(i)] for i in range(4)]
            cw = [width]
        return Table(data, colWidths=cw, style=[("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                                                ("TOPPADDING", (0, 0), (-1, -1), 1), ("BOTTOMPADDING", (0, 0), (-1, -1), 1)])

    def card(q):
        inner_w = CW - 46 - 20
        inner = [P(t(q["q"]), "q")]
        if q.get("qt"):
            inner.append(Spacer(1, 4))
            inner.append(Table([[P(t(q["qt"]), "qt")]], colWidths=[inner_w],
                               style=[("LINEBEFORE", (0, 0), (0, -1), 2.2, GOLD), ("BACKGROUND", (0, 0), (-1, -1), GOLD_SOFT),
                                      ("LEFTPADDING", (0, 0), (-1, -1), 9), ("TOPPADDING", (0, 0), (-1, -1), 5),
                                      ("BOTTOMPADDING", (0, 0), (-1, -1), 6)]))
        inner.append(Spacer(1, 5))
        inner.append(options_block(q, inner_w))
        if key:
            inner.append(Spacer(1, 4))
            inner.append(P(f"<b>Отговор: {LETTERS[q['a']]}</b> · {t(q['e'])}" + (f"<br/><font color='#B23A3A'>За проверка: {t(q['check'])}</font>" if q.get("check") else ""), "key"))
        tb = Table([[Badge(q["n"], q["pts"]), inner]], colWidths=[46, CW - 46],
                   style=[("VALIGN", (0, 0), (-1, -1), "TOP"), ("BACKGROUND", (0, 0), (-1, -1), PAPER),
                          ("BOX", (0, 0), (-1, -1), 0.7, EDGE), ("ROUNDEDCORNERS", [8, 8, 8, 8]),
                          ("LEFTPADDING", (0, 0), (0, 0), 6), ("LEFTPADDING", (1, 0), (1, 0), 4),
                          ("RIGHTPADDING", (0, 0), (-1, -1), 12), ("TOPPADDING", (0, 0), (-1, -1), 9),
                          ("BOTTOMPADDING", (0, 0), (-1, -1), 9)])
        return KeepTogether([tb, Spacer(1, 7)])

    def answer_sheet(p, meta, part_qs):
        story = [PageBreak(), Label(f"Част {p['part']} · Лист за отговори"),
                 P(f"Лист за отговори · Част {p['part']}", "h1"),
                 P(f"{part_title(p)}. Огради буквата, която избираш. Когато свършиш, сканирай кода и въведи отговорите – "
                   f"веднага ще видиш точките си, титлата и обяснение за всяка грешка.", "p", textColor=MUTED, spaceBefore=4, spaceAfter=12)]
        half = (len(part_qs) + 1) // 2
        def col(items):
            data = []
            for q in items:
                data.append([P(f"<b>{q['n']}</b>", "p", alignment=TA_CENTER, textColor=INK)] +
                            [Bubble(L, filled=key and i == q["a"], r=8) for i, L in enumerate(LETTERS)] + [Starline(q["pts"])])
            return Table(data, colWidths=[30, 23, 23, 23, 23, 40], rowHeights=[21.5] * len(items),
                         style=[("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LINEBELOW", (0, 0), (-1, -2), 0.4, LINE),
                                ("LEFTPADDING", (0, 0), (-1, -1), 2), ("RIGHTPADDING", (0, 0), (-1, -1), 2),
                                ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0)])
        grid = Table([[col(part_qs[:half]), col(part_qs[half:])]], colWidths=[CW / 2, CW / 2],
                     style=[("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0)])
        story.append(grid)
        story.append(Spacer(1, 12))
        story.append(SheetFooter(p, meta))
        return story

    class Starline(Flowable):
        def __init__(self, pts):
            super().__init__()
            self.pts = pts
        def wrap(self, aw, ah):
            return 36, 10
        def draw(self):
            stars(self.canv, 6, 5, self.pts, 3.4, LVL[self.pts], gap=8)

    class SheetFooter(Flowable):
        def __init__(self, p, meta):
            super().__init__()
            self.p, self.meta = p, meta
        def wrap(self, aw, ah):
            self.w = aw
            return aw, 118
        def draw(self):
            c, p, m = self.canv, self.p, self.meta
            c.setFillColor(GOLD_SOFT)
            c.roundRect(0, 0, self.w, 112, 12, stroke=0, fill=1)
            s = 88
            renderPDF.draw(qr_drawing(check_url(p["part"]), s), c, 12, 12)
            c.linkURL(check_url(p["part"]), (12, 12, 12 + s, 12 + s), relative=1)
            x = 118
            c.setFillColor(INK)
            c.setFont("Literata-Bold", 15)
            c.drawString(x, 84, "Провери отговорите си онлайн")
            c.setFont("Golos", 9.5)
            c.setFillColor(TEXT)
            c.drawString(x, 67, "Насочи камерата на телефона към кода или отвори:")
            c.setFont("Golos-Bold", 9.5)
            c.drawString(x, 54, check_url(p["part"]).replace("https://", ""))
            c.setFont("Golos", 9.5)
            c.drawString(x, 32, "Моите точки:")
            c.setStrokeColor(INK)
            c.setLineWidth(0.8)
            c.line(x + 62, 30, x + 112, 30)
            c.drawString(x + 116, 32, f"от {m['max']}")
            c.drawString(x + 170, 32, "Титла:")
            c.line(x + 204, 30, self.w - 16, 30)
            c.setFont("Golos", 8.5)
            c.setFillColor(MUTED)
            c.drawString(x, 14, "Първият опит влиза в класирането. После можеш да опитваш колкото искаш.")

    # ---- page decoration
    def watermark(c, doc):
        c.saveState()
        c.setFillColor(INK)
        c.setFillAlpha(0.035)
        c.translate(W / 2, H / 2)
        c.rotate(35)
        c.setFont("Literata-Bold", 92)
        c.drawCentredString(0, -30, "ЕДУ БЕЛ")
        c.restoreState()
        if draft:
            c.saveState()
            c.setFillColor(HexColor("#B23A3A"))
            c.setFillAlpha(0.18)
            c.translate(W / 2, H / 2 - 140)
            c.rotate(35)
            c.setFont("Golos-Bold", 40)
            c.drawCentredString(0, 0, "ЧЕРНОВА · ЗА ПРЕГЛЕД")
            c.restoreState()

    def header_footer(c, doc):
        c.saveState()
        # header: logo, brand, running part label
        c.drawImage(LOGO, M, H - 52, width=44, height=32, mask="auto")
        c.setFillColor(INK)
        c.setFont("Literata-Bold", 12.5)
        c.drawString(M + 52, H - 36, "Еду БЕЛ")
        c.setFont("Golos", 8.5)
        c.setFillColor(MUTED)
        c.drawString(M + 52, H - 48, f"{TITLE} · {KICKER}")
        c.setFont("Golos-Bold", 9)
        c.setFillColor(INK)
        c.drawRightString(W - M, H - 40, state["label"])
        c.setStrokeColor(GOLD)
        c.setLineWidth(0.8)
        c.line(M, H - 58, W - M, H - 58)
        # footer: brand, protection notice, page
        c.setStrokeColor(LINE)
        c.setLineWidth(0.5)
        c.line(M, 44, W - M, 44)
        c.setFont("Golos-Bold", 8)
        c.setFillColor(INK)
        c.drawString(M, 31, "© Еду БЕЛ · edubel.site")
        c.setFont("Golos", 7.5)
        c.setFillColor(MUTED)
        notice = "Безплатен подарък. Копирането, препечатването и разпространението на въпросите без разрешение е забранено."
        if key:
            notice = "ЕКЗЕМПЛЯР ЗА УЧИТЕЛЯ – С ОТГОВОРИ. Не се дава на ученици."
        c.drawCentredString(W / 2, 19, notice)
        c.setFont("Golos-Bold", 9)
        c.setFillColor(INK)
        c.drawRightString(W - M, 31, str(c.getPageNumber()))
        if licensee:
            c.setFont("Golos", 7.5)
            c.setFillColor(GOLD)
            c.drawCentredString(W / 2, 9, f"Лицензирано за: {licensee}")
        c.restoreState()

    def cover(c, doc):
        c.saveState()
        c.setFillColor(PAPER)
        c.rect(0, 0, W, H, stroke=0, fill=1)
        # gold frame
        c.setStrokeColor(GOLD)
        c.setLineWidth(1.2)
        c.roundRect(22, 22, W - 44, H - 44, 18, stroke=1, fill=0)
        c.setLineWidth(0.4)
        c.roundRect(28, 28, W - 56, H - 56, 15, stroke=1, fill=0)
        # logo
        c.drawImage(LOGO, W / 2 - 88, H - 200, width=176, height=128, mask="auto")
        c.setFillColor(GOLD)
        c.setFont("Golos-Bold", 11)
        c.drawCentredString(W / 2, H - 236, KICKER.upper())
        c.setFillColor(INK)
        c.setFont("Literata-Bold", 64)
        c.drawCentredString(W / 2, H - 306, TITLE)
        c.setFont("Literata", 15)
        c.setFillColor(TEXT)
        c.drawCentredString(W / 2, H - 336, "по български език и литература")
        # grade chips
        y = H - 396
        chips = ["5. клас", "6. клас", "7. клас · НВО"]
        widths = [c.stringWidth(x, "Golos-Bold", 13) + 36 for x in chips]
        x = W / 2 - (sum(widths) + 14 * (len(chips) - 1)) / 2
        for label, w in zip(chips, widths):
            c.setFillColor(INK)
            c.roundRect(x, y, w, 30, 15, stroke=0, fill=1)
            c.setFillColor(white)
            c.setFont("Golos-Bold", 13)
            c.drawCentredString(x + w / 2, y + 10, label)
            x += w + 14
        # numbers
        y = H - 486
        stats = [("6", "части"), ("3", "нива трудност"), ("400", "точки максимум")]
        cw = 150
        x0 = W / 2 - cw * 1.5
        for i, (big, small) in enumerate(stats):
            cx = x0 + cw * i + cw / 2
            c.setFillColor(GOLD)
            c.setFont("Literata-Bold", 38)
            c.drawCentredString(cx, y + 18, big)
            c.setFillColor(MUTED)
            c.setFont("Golos", 11)
            c.drawCentredString(cx, y, small)
        # how it works
        y = H - 640
        c.setFillColor(GOLD_SOFT)
        c.roundRect(64, y, W - 128, 110, 14, stroke=0, fill=1)
        steps = [("1", "Решаваш", "на хартия или на екрана"), ("2", "Сканираш", "QR кода на частта"), ("3", "Виждаш", "точките и защо")]
        sw = (W - 128) / 3
        for i, (num, a, b) in enumerate(steps):
            cx = 64 + sw * i + sw / 2
            c.setFillColor(INK)
            c.circle(cx, y + 76, 15, stroke=0, fill=1)
            c.setFillColor(white)
            c.setFont("Golos-Bold", 14)
            c.drawCentredString(cx, y + 71, num)
            c.setFillColor(INK)
            c.setFont("Golos-Bold", 13)
            c.drawCentredString(cx, y + 40, a)
            c.setFillColor(MUTED)
            c.setFont("Golos", 10)
            c.drawCentredString(cx, y + 24, b)
        # stars line
        y = H - 690
        x = W / 2 - 170
        for lv in (1, 2, 3):
            stars(c, x, y, lv, 5.5, LVL[lv], gap=13, total=lv)
            c.setFillColor(LVL[lv])
            c.setFont("Golos-Bold", 11)
            lbl = f"{LEVEL[lv]} · {lv} т."
            c.drawString(x + lv * 13 + 2, y - 4, lbl)
            x += lv * 13 + c.stringWidth(lbl, "Golos-Bold", 11) + 30
        # bottom
        c.setFillColor(INK)
        c.setFont("Literata-Italic", 12.5)
        c.drawCentredString(W / 2, 112, "Подарък за всяко дете, което обича да мисли.")
        c.setFont("Golos", 9.5)
        c.setFillColor(MUTED)
        c.drawCentredString(W / 2, 92, f"{EDITION} · edubel.site")
        if key:
            c.setFillColor(HexColor("#B23A3A"))
            c.setFont("Golos-Bold", 14)
            c.drawCentredString(W / 2, H - 560, "ЕКЗЕМПЛЯР ЗА УЧИТЕЛЯ – С ОТГОВОРИТЕ")
        if licensee:
            c.setFillColor(GOLD)
            c.setFont("Golos", 9)
            c.drawCentredString(W / 2, 74, f"Лицензирано за: {licensee}")
        c.restoreState()
        watermark_cover = draft
        if watermark_cover:
            watermark(c, doc)

    def normal_page(c, doc):
        watermark(c, doc)

    metas = {}
    for p in PARTS:
        pq = by_part[p["part"]]
        metas[p["part"]] = {"from": pq[0]["n"] if pq else 0, "to": pq[-1]["n"] if pq else 0, "count": len(pq), "max": sum(q["pts"] for q in pq)}
    total_max = sum(m["max"] for m in metas.values())

    def intro_pages(pages):
        s = [NextPageTemplate("normal"), PageBreak(), Label("Как се играе")]
        s.append(P("Как се играе", "h1"))
        s.append(P("Двеста въпроса по български език и литература, подредени в шест части – по две за всеки клас. "
                   "Във всяка част въпросите вървят от лесни към трудни. Колкото по-труден е въпросът, толкова повече точки носи.", "p", spaceBefore=6, spaceAfter=10))
        steps = [
            ("Избери частта", "5. клас решава части 1 и 2, 6. клас – части 3 и 4, 7. клас – части 5 и 6. "
                              "Седмокласниците могат да минат и през всички: творбите от 5. и 6. клас също са в НВО."),
            ("Реши честно", "Без учебник и без помощ. Огради буквата в листа за отговори в края на частта. Една част е около 35–40 минути."),
            ("Сканирай кода", "Всяка част има свой QR код. Въведи буквите – веднага ще видиш точките си, титлата и обяснение за всяка грешка."),
            ("Събери всичките 6 части", f"До {total_max} точки общо. В края те чака грамота с твоята титла."),
        ]
        rows = []
        for i, (a, b) in enumerate(steps, 1):
            rows.append([Circle(str(i)), [P(a, "h3"), P(b, "p", textColor=TEXT)]])
        s.append(Table(rows, colWidths=[40, CW - 40], style=[("VALIGN", (0, 0), (-1, -1), "TOP"), ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
                                                           ("LEFTPADDING", (0, 0), (-1, -1), 0)]))
        s.append(Spacer(1, 6))
        s.append(P("Точки за трудност", "h2"))
        lv_rows = [[Starline(1), P("<b>Знам</b> – 1 точка. Автор, жанр, герой, основно правило.")],
                   [Starline(2), P("<b>Разбирам</b> – 2 точки. Защо, как, кое средство, коя форма.")],
                   [Starline(3), P("<b>Мисля</b> – 3 точки. Анализ, сравнение, капани като на НВО.")]]
        s.append(Table(lv_rows, colWidths=[46, CW - 46], style=[("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LEFTPADDING", (0, 0), (-1, -1), 0),
                                                                ("BOTTOMPADDING", (0, 0), (-1, -1), 4)]))
        s.append(P("Титли", "h2"))
        rk = []
        prev = 101
        for mn, title in RANKS:
            rk.append([P(f"<b>{title}</b>", "p", textColor=INK), P(f"{mn}% и повече" if mn else "до 39%", "p", textColor=MUTED)])
        s.append(Table(rk, colWidths=[180, CW - 180], style=[("LINEBELOW", (0, 0), (-1, -2), 0.4, LINE), ("LEFTPADDING", (0, 0), (-1, -1), 0),
                                                             ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3)]))
        s.append(P("Титлата се дава за всяка част и за целия сборник – според дела от максималните точки.", "small", spaceBefore=4))
        s.append(Spacer(1, 10))
        box = [[[P("Състезание в класа", "h3"),
                 P(f"Учителят създава безплатно код за класа на <b>{escape(base.replace('https://', ''))}/podarak</b>. "
                   "Децата въвеждат кода при проверката и класът вижда своето класиране, а учителят – кои въпроси затрудняват класа най-много. "
                   "Първият опит за всяка част влиза в класирането.", "p")]]]
        s.append(Table(box, colWidths=[CW], style=[("BACKGROUND", (0, 0), (-1, -1), GOLD_SOFT), ("ROUNDEDCORNERS", [10, 10, 10, 10]),
                                                    ("LEFTPADDING", (0, 0), (-1, -1), 14), ("RIGHTPADDING", (0, 0), (-1, -1), 14),
                                                    ("TOPPADDING", (0, 0), (-1, -1), 10), ("BOTTOMPADDING", (0, 0), (-1, -1), 12)]))
        # contents
        s += [PageBreak(), Label("Съдържание"), P("Съдържание", "h1"), Spacer(1, 8)]
        rows = []
        for p in PARTS:
            m = metas[p["part"]]
            qrd = qr_drawing(check_url(p["part"]), 62)
            rows.append([P(f"<font size=22 name='Literata-Bold' color='#C49A3C'>{p['part']}</font>", "p"),
                         [P(part_title(p), "h3"), P(f"Въпроси {m['from']}–{m['to']} · {m['count']} въпроса · до {m['max']} точки", "small")],
                         P(f"стр. {pages.get(p['part'], '…')}", "p", textColor=INK), qrd])
        s.append(Table(rows, colWidths=[40, CW - 40 - 70 - 74, 70, 74], rowHeights=[82] * len(rows),
                       style=[("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LINEBELOW", (0, 0), (-1, -2), 0.5, LINE),
                              ("LEFTPADDING", (0, 0), (-1, -1), 0)]))
        s.append(Spacer(1, 10))
        s.append(P("Кодовете водят към проверката на всяка част. Можеш да ги сканираш и от листа за отговори в края на частта.", "small"))
        return s

    class Circle(Flowable):
        def __init__(self, txt):
            super().__init__()
            self.txt = txt
        def wrap(self, aw, ah):
            return 30, 28
        def draw(self):
            c = self.canv
            c.setFillColor(INK)
            c.circle(13, 13, 13, stroke=0, fill=1)
            c.setFillColor(white)
            c.setFont("Golos-Bold", 13)
            c.drawCentredString(13, 8.5, self.txt)

    class Certificate(Flowable):
        def wrap(self, aw, ah):
            self.w = aw
            return aw, 520
        def draw(self):
            c = self.canv
            w, h = self.w, 510
            c.setStrokeColor(GOLD)
            c.setLineWidth(2)
            c.roundRect(0, 0, w, h, 16, stroke=1, fill=0)
            c.setLineWidth(0.5)
            c.roundRect(7, 7, w - 14, h - 14, 12, stroke=1, fill=0)
            c.drawImage(LOGO, w / 2 - 55, h - 106, width=110, height=80, mask="auto")
            c.setFillColor(INK)
            c.setFont("Literata-Bold", 40)
            c.drawCentredString(w / 2, h - 160, "Грамота")
            c.setFont("Golos", 12)
            c.setFillColor(MUTED)
            c.drawCentredString(w / 2, h - 188, f"за участие в „{KICKER}“ – {TITLE}")
            c.setStrokeColor(INK)
            c.setLineWidth(0.8)
            c.setFillColor(TEXT)
            c.setFont("Golos", 12)
            c.drawCentredString(w / 2, h - 236, "се присъжда на")
            c.line(70, h - 272, w - 70, h - 272)
            c.drawString(70, h - 318, "ученик от")
            c.line(132, h - 320, 220, h - 320)
            c.drawString(226, h - 318, "клас, събрал")
            c.line(306, h - 320, 370, h - 320)
            c.drawString(376, h - 318, f"точки от {total_max}")
            c.drawCentredString(w / 2, h - 366, "и спечелил титлата")
            c.setFont("Literata-Bold", 20)
            c.line(110, h - 404, w - 110, h - 404)
            c.setFont("Golos", 9.5)
            c.setFillColor(MUTED)
            c.drawCentredString(w / 2, h - 428, " · ".join(title for _, title in reversed(RANKS)))
            c.setFont("Golos", 11)
            c.setFillColor(TEXT)
            c.drawString(70, 60, "Дата:")
            c.line(104, 58, 220, 58)
            c.drawString(w - 250, 60, "Подпис:")
            c.line(w - 200, 58, w - 70, 58)
            c.setFillColor(GOLD)
            c.setFont("Golos-Bold", 9)
            c.drawCentredString(w / 2, 26, "ЕДУ БЕЛ · EDUBEL.SITE")

    def outro():
        s = [PageBreak(), Label("Грамота"), P("Грамота", "h1"),
             P("Отпечатай я, когато минеш всичките шест части. Онлайн проверката ти дава и готова грамота с името и точките.", "p", textColor=MUTED, spaceAfter=12),
             Certificate()]
        s += [PageBreak(), Label("За родители и учители"), P("За родители и учители", "h1"), Spacer(1, 6)]
        blocks = [
            ("Какво е това", "Двеста въпроса по учебната програма на МОН за 5., 6. и 7. клас – литература и български език, "
                             "с точки според трудността. Подходящо за преговор у дома, за час в училище и като подготовка за НВО в 7. клас."),
            ("Защо отговорите не са в книжката", "Ключът е само онлайн. Така детето не може да надникне, а проверката дава повече: "
                                                  "точки, титла, обяснение за всяка грешка и темите, които си струва да се упражнят."),
            ("За учителя", f"Създайте безплатно код за класа на {escape(base.replace('https://', ''))}/podarak. Ще видите класирането "
                           "и кои въпроси са най-трудни за класа – готова диагностика за следващия час. Учителски екземпляр с отговорите изпращаме при поискване през edubel.site."),
            ("За родителя", "Еду БЕЛ е платформа по български език и литература за 5.–7. клас: литературни карти с преговор, "
                            "тренажор за задача 25, разговори с героите от творбите и отчет за родителя. Разгледайте програмата на edubel.site."),
            ("Лични данни", "За проверката не е нужна регистрация. Детето избира само псевдоним; не събираме име, имейл или телефон на дете."),
        ]
        for a, b in blocks:
            s.append(KeepTogether([P(a, "h3"), P(b, "p", spaceAfter=10)]))
        s.append(Spacer(1, 14))
        s.append(P("© Еду БЕЛ. Сборникът е безплатен подарък за лична и училищна употреба. Можете да го печатате за себе си и за своя клас. "
                   "Копирането на въпросите в други материали, сайтове и приложения, препродажбата и публикуването без писмено разрешение са забранени.", "small"))
        return s

    def build_story(pages):
        story = intro_pages(pages)
        for p in PARTS:
            pq = by_part[p["part"]]
            story += [PageBreak(), Label(f"Част {p['part']} · {part_title(p)}"), Mark(p["part"]), Banner(p, metas[p["part"]]), Spacer(1, 10)]
            for lv in (1, 2, 3):
                group = [q for q in pq if q["pts"] == lv]
                if not group:
                    continue
                story.append(CondPageBreak(150))
                story.append(Divider(lv, len(group)))
                story.append(Spacer(1, 4))
                story += [card(q) for q in group]
            story += answer_sheet(p, metas[p["part"]], pq)
        story += outro()
        return story

    def make(path, pages):
        doc = BaseDocTemplate(path, pagesize=A4, leftMargin=M, rightMargin=M, topMargin=72, bottomMargin=58,
                              title=f"{TITLE} – {KICKER} | Еду БЕЛ", author="Еду БЕЛ", subject="Български език и литература, 5.–7. клас",
                              creator="Еду БЕЛ", keywords="Еду БЕЛ, БЕЛ, НВО, 5. клас, 6. клас, 7. клас")
        frame = Frame(M, 58, CW, H - 72 - 58, id="f", leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
        doc.addPageTemplates([
            PageTemplate("cover", frames=[frame], onPage=cover),
            PageTemplate("normal", frames=[frame], onPage=normal_page, onPageEnd=header_footer),
        ])
        state["page_of_part"] = {}
        doc.build(build_story(pages))
        return dict(state["page_of_part"])

    work = tempfile.mkdtemp(prefix="podarak-")
    try:
        raw = os.path.join(work, "raw.pdf")
        pages = make(raw, {})
        pages = make(raw, pages)  # second pass: the table of contents knows the page numbers
        if plain:
            shutil.copy(raw, out)
        else:
            protect(raw, out, work)
    finally:
        shutil.rmtree(work, ignore_errors=True)
    from pypdf import PdfReader
    n_pages = len(PdfReader(out).pages)
    print(f"{len(qs)} въпроса, {n_pages} страници, {os.path.getsize(out) // 1024} KB →", out)


def protect(raw, out, work):
    """Text → vector outlines (Ghostscript), an invisible copyright layer, AES-256 with print-only permissions."""
    from pypdf import PdfReader, PdfWriter
    from pypdf.constants import UserAccessPermissions as UAP
    from reportlab.pdfgen import canvas
    from reportlab.lib.pagesizes import A4
    if not shutil.which("gs"):
        fail("нужен е Ghostscript (gs), за да се превърне текстът в криви")
    outlined = os.path.join(work, "outlined.pdf")
    subprocess.run(["gs", "-q", "-dSAFER", "-dBATCH", "-dNOPAUSE", "-sDEVICE=pdfwrite", "-dNoOutputFonts",
                    "-dCompatibilityLevel=1.7", "-dDetectDuplicateImages=true", "-dCompressPages=true",
                    f"-sOutputFile={outlined}", raw], check=True)
    # Whoever tries to copy or extract text gets only this notice.
    notice_pdf = os.path.join(work, "notice.pdf")
    c = canvas.Canvas(notice_pdf, pagesize=A4)
    c.setFont("Helvetica", 8)
    t = c.beginText(40, 400)
    t.setTextRenderMode(3)
    t.textLine("(c) Edu BEL - edubel.site. This content is protected. Copying is not allowed.")
    c.drawText(t)
    c.showPage()
    c.save()
    notice = PdfReader(notice_pdf).pages[0]
    r = PdfReader(outlined)
    w = PdfWriter()
    for page in r.pages:
        page.merge_page(notice)
        w.add_page(page).compress_content_streams(level=9)
    w.add_metadata({"/Title": f"{TITLE} – {KICKER} | Еду БЕЛ", "/Author": "Еду БЕЛ", "/Subject": "Български език и литература, 5.–7. клас",
                    "/Creator": "Еду БЕЛ", "/Producer": "Еду БЕЛ", "/Keywords": "Еду БЕЛ, edubel.site",
                    "/Copyright": "© Еду БЕЛ. Всички права запазени."})
    perms = UAP.PRINT | UAP.PRINT_TO_REPRESENTATION
    w.encrypt(user_password="", owner_password=secrets.token_urlsafe(24), permissions_flag=perms, algorithm="AES-256")
    with open(out, "wb") as f:
        w.write(f)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("content")
    a.add_argument("parts_dir")
    a.add_argument("out")
    b = sub.add_parser("pdf")
    b.add_argument("src")
    b.add_argument("out")
    b.add_argument("--base", default=DEFAULT_BASE)
    b.add_argument("--for", dest="licensee", default="")
    b.add_argument("--key", action="store_true")
    b.add_argument("--draft", action="store_true")
    b.add_argument("--plain", action="store_true")
    args = ap.parse_args()
    if args.cmd == "content":
        content(args.parts_dir, args.out)
    else:
        pdf(args.src, args.out, args.base.rstrip("/"), args.licensee, args.key, args.draft, args.plain)


if __name__ == "__main__":
    main()
