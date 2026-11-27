#!/usr/bin/env python3
"""Интерактивен PDF „N въпроса“ / „N задачи по математика“ на Еду Бел (телефонен формат, бутони с вътрешни връзки).

    python3 build_quiz_pdf.py <content.json> <out.pdf> [--fonts DIR] [--no-encrypt]

БЕЛ – content.json: {"questions": [{"grade": 5, "subject": "Литература" | "Български език" | "Математика",
  "level": 1|2|3, "q": "...", "passage": ["ред", ...] | null, "passage_style": "italic"|"plain",
  "options": ["А", "Б", "В", "Г"], "correct": 0..3, "why": "...", "review": "..."}, ...]}

Математика – content.json: {"parts": [{"id", "grade", "title"}, ...],
  "questions": [{"n", "part", "grade", "subject": "Математика", "level", "q", "options", "correct",
  "hint", "steps": [{"do", "why"}], "answer", "trap", "card", "review"}, ...]}
  Частите идват от "parts" (по реда им), задачите – от полето "part", без пренареждане.
Литература / български език в същия вид (части без клас): {"title": "200 въпроса по литература",
  "cards": "по желание – име на кутията с карти", "parts": [{"id", "title"}, ...],
  "questions": [{"n", "part", "subject": "Литература" | "Български език", "level", "q",
  "passage": null | ["ред", ...], "options", "correct", "hint", "why", "review"}, ...]}
  Отговорът е „Защо“ (why); дълъг откъс или обяснение продължава на следваща страница.
  В текста {a/b} е дроб (рисува се като двуетажна дроб); {2; 3} без „/“ е множество и остава както е.
  Решението е на страниците „Вярно!“ / „Не е вярно“ и продължава на следваща страница, ако не се побира.

Съдържанието не е в git – пази се отделно (private/). Шрифтовете (Open Sans, Noto Serif, Noto Sans Math,
OFL) се свалят от Google Fonts при първо пускане, ако ги няма в --fonts.
Нужно е: pip install reportlab pypdf cryptography
"""
import argparse, io, json, math, os, re, secrets, sys, urllib.request
from xml.sax.saxutils import escape

from reportlab import rl_config
from reportlab.lib.colors import HexColor, Color
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph
from reportlab.lib.styles import ParagraphStyle

W, H = 360, 640
rl_config.useA85 = 0  # по-малък файл

FONT_URLS = {
    'NotoSerif-Bold.ttf': 'https://fonts.gstatic.com/s/notoserif/v33/ga6iaw1J5X9T9RW6j9bNVls-hfgvz8JcMofYTa32J4wsL2JAlAhZT1ejwA.ttf',
    'NotoSerif-Regular.ttf': 'https://fonts.gstatic.com/s/notoserif/v33/ga6iaw1J5X9T9RW6j9bNVls-hfgvz8JcMofYTa32J4wsL2JAlAhZqFCjwA.ttf',
    'NotoSerif-Italic.ttf': 'https://fonts.gstatic.com/s/notoserif/v33/ga6saw1J5X9T9RW6j9bNfFIMZhhWnFTyNZIQD1-_FXP0RgnaOg9MYBNLg8cP.ttf',
    'OpenSans-Regular.ttf': 'https://fonts.gstatic.com/s/opensans/v44/memSYaGs126MiZpBA-UvWbX2vVnXBbObj2OVZyOOSr4dVJWUgsjZ0C4n.ttf',
    'OpenSans-Semibold.ttf': 'https://fonts.gstatic.com/s/opensans/v44/memSYaGs126MiZpBA-UvWbX2vVnXBbObj2OVZyOOSr4dVJWUgsgH1y4n.ttf',
    'OpenSans-Bold.ttf': 'https://fonts.gstatic.com/s/opensans/v44/memSYaGs126MiZpBA-UvWbX2vVnXBbObj2OVZyOOSr4dVJWUgsg-1y4n.ttf',
    # математически знаци, които ги няма в Open Sans (∠ ∥ ∩ ∪ ≅ ⊥ ∈ → ↔)
    'NotoSansMath-Regular.ttf': 'https://fonts.gstatic.com/s/notosansmath/v19/7Aump_cpkSecTWaHRlH2hyV5UHkG.ttf',
}
FONTS = {  # name in PDF -> file
    'NotoSerif-Bold': 'NotoSerif-Bold.ttf', 'NotoSerif-Regular': 'NotoSerif-Regular.ttf',
    'NotoSerif-Italic': 'NotoSerif-Italic.ttf', 'OpenSans': 'OpenSans-Regular.ttf',
    'OpenSans-Semibold': 'OpenSans-Semibold.ttf', 'OpenSans-Bold': 'OpenSans-Bold.ttf',
    'NotoSansMath': 'NotoSansMath-Regular.ttf',
}
SERIF_B, SERIF, SERIF_I = 'NotoSerif-Bold', 'NotoSerif-Regular', 'NotoSerif-Italic'
SANS, SANS_SB, SANS_B = 'OpenSans', 'OpenSans-Semibold', 'OpenSans-Bold'
MATH = 'NotoSansMath'
BOLD_FONTS = {SANS_SB, SANS_B, SERIF_B}

C = {k: HexColor(v) for k, v in dict(
    bg='#f5f1e8', ink='#172e42', navy='#14293e', navy_lip='#0c1d2e', muted='#647581', line='#e1dcd1',
    gold='#b98d4f', gold_light='#ead5ac', gold_lip='#aa8048', card='#fffefb', card_lip='#dad4c8',
    light_lip='#d5d0c5', green='#286658', green_halo='#c7d5ca', red='#a6534f', red_halo='#e6c8bf',
    passage='#eee7d9', callout='#ebe4d3', chip='#e8e1d5', dark_card='#203a4e', dark_card_line='#38566b',
    dot_off='#4a6273', dark_text='#b7c9d3', cover_text='#d8e3e9', cover_note='#aabcc7',
    dark_footer='#9dadb7', dark_footer_line='#385164', shadow_text='#0b1a2a', medal_dark='#9e793d',
    medal_inner='#cfad70', ribbon_l='#9c7240', ribbon_r='#b58b50', title_row='#ece2cc',
    answer_box='#e6ece5', trap_box='#f3e7d3', trap_ink='#8a6431', hint_box='#ebe4d3',
).items()}
GRAD = (HexColor('#0e2033'), HexColor('#28465a'))
SUBJECT_COLOR = {'Литература': HexColor('#a77e47'), 'Български език': HexColor('#3d777a'),
                 'Математика': HexColor('#6b5e98')}
PART_COLORS = [HexColor('#6b5e98'), HexColor('#3d777a')]  # математика: части „а“ и „б“ на всеки клас
BEL_PART_COLORS = [HexColor('#a77e47'), HexColor('#3d777a')]  # литература / език: редуват се по части
SUBJECT_WORD = {'Литература': 'литература', 'Български език': 'български език'}
LEVELS = {1: ('Знам', '1 т.', HexColor('#e6ece5')), 2: ('Разбирам', '2 т.', HexColor('#e1ebe9')),
          3: ('Мисля', '3 т.', HexColor('#eae3d8'))}
TITLES = {
    'default': ['Будител', 'Майстор на словото', 'Летописец', 'Книжовник', 'Четец'],
    'Математика': ['Архимед', 'Майстор на числата', 'Откривател', 'Изчислител', 'Чирак'],
}
NUM_WORDS = {6: 'ШЕСТ', 7: 'СЕДЕМ', 8: 'ОСЕМ', 9: 'ДЕВЕТ', 10: 'ДЕСЕТ', 12: 'ДВАНАДЕСЕТ'}
SUBJECT_ORDER = ['Литература', 'Български език', 'Математика']

# Думите, които се сменят между „въпроси“ (БЕЛ) и „задачи“ (математика).
WORDS = {
    'bel': dict(one='въпрос', many='въпроса', Item='Въпрос', Items='Въпроси', next='Следващ въпрос',
                cover='въпроса', tagline='Избери. Отговори. Разбери защо.', min_per_item=35 / 33,
                end_note='Брой само верните отговори от първия опит.'),
    'math': dict(one='задача', many='задачи', Item='Задача', Items='Задачи', next='Следваща задача',
                 cover='задачи', tagline='Избери. Реши. Разбери защо.', min_per_item=1.5,
                 end_note='Броят се само верните отговори от първия опит.'),
}


def points_word(n):
    return f'{n} точка' if n == 1 else f'{n} точки'


# ---------------------------------------------------------------- fonts
def load_fonts(fdir):
    os.makedirs(fdir, exist_ok=True)
    cmaps = {}
    for name, fn in FONTS.items():
        path = os.path.join(fdir, fn)
        if not os.path.exists(path):
            print('сваляне на шрифт', fn, file=sys.stderr)
            urllib.request.urlretrieve(FONT_URLS[fn], path)
        f = TTFont(name, path)
        pdfmetrics.registerFont(f)
        cmaps[name] = set(f.face.charToGlyph.keys())
    return cmaps


# ---------------------------------------------------------------- rich text (дроби, степени, резервен шрифт)
SUP = dict(zip('⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼ⁿ', '0123456789+−=n'))
SUB = dict(zip('₀₁₂₃₄₅₆₇₈₉₊₋₌', '0123456789+−='))
SUP_SIZE, SUP_RISE, SUB_RISE = .6, .416, -.13      # като собствените горни индекси на Open Sans
MATH_RISE = {c: .07 for c in '→↔≅∈∉∩∪∥∖⊂⊆≡'}       # Noto Sans Math има по-ниска ос от Open Sans
FRAC = .8                                          # размер на числителя/знаменателя спрямо текста
FRAC_RE = re.compile(r'\{([^{}/]*)/([^{}]*)\}')
OPS = set('=−+·:→↔<>≤≥≈≠–—×;,.)…%°!?')             # дума само от тези знаци не започва ред
UNITS = {'cm', 'm', 'km', 'mm', 'dm', 'g', 'kg', 'h', 'min', 's', 'L', 'ml', 'l', 't', '€', '%', '°',
         'cm²', 'dm²', 'm²', 'km²', 'mm²', 'cm³', 'dm³', 'm³', 'km/h', 'm/s', 'm/min', 'лв.', 'ст.', 'т.'}
GLUE_AFTER = set('вскуоиаВСКУОИА')                 # еднобуквени думи не остават в края на реда
DESC_CHARS = set('()[]|,;gjpqyQрудцщфДЦЩ') | set(SUB)


class Rich:
    """Многоредов текст с дроби {a/b}, горни/долни индекси и резервен шрифт за математическите знаци.
    runs: str или [(текст, шрифт, цвят), ...]. Има .height_, .first_base и .drawOn(canvas, x, y) като Paragraph."""

    def __init__(self, d, runs, size, leading, width, font=SANS, color=None):
        if isinstance(runs, str):
            runs = [(runs, font, color or C['ink'])]
        self.d, self.s, self.L, self.width = d, size, leading, width
        words = self._words(runs)
        self.lines = self._wrap(words)
        pad = (leading - size) / 2
        self.height_ = sum(ln['asc'] + ln['desc'] + 2 * pad for ln in self.lines)
        self.first_base = pad + self.lines[0]['asc'] if self.lines else 0

    # glyph runs ---------------------------------------------------------
    def _glyphs(self, text, font, color, base):
        """text -> [[(font, size, rise, fake_bold, color), str], ...] при основен размер base."""
        cm, out = self.d.cmaps, []
        for ch in text:
            if ord(ch) in cm[font]:
                key, g = (font, base, 0), ch
            elif ch in SUP and ord(SUP[ch]) in cm[font]:
                key, g = (font, base * SUP_SIZE, base * SUP_RISE), SUP[ch]
            elif ch in SUB and ord(SUB[ch]) in cm[font]:
                key, g = (font, base * SUP_SIZE, base * SUB_RISE), SUB[ch]
            elif ord(ch) in cm[MATH]:
                key, g = (MATH, base, base * MATH_RISE.get(ch, 0)), ch
            else:
                self.d.missing.add((font, ch, text[:60]))
                key, g = (font, base, 0), '?'
            key = key + (key[0] == MATH and font in BOLD_FONTS, color)
            if out and out[-1][0] == key:
                out[-1][1] += g
            else:
                out.append([key, g])
        return out

    @staticmethod
    def _gw(glyphs):
        return sum(pdfmetrics.stringWidth(g, k[0], k[1]) for k, g in glyphs)

    def _frac(self, num, den, font, color):
        s = self.s
        fs = s * FRAC
        num_g, den_g = self._glyphs(num.strip(), font, color, fs), self._glyphs(den.strip(), font, color, fs)
        wn, wd = self._gw(num_g), self._gw(den_g)
        pad = .14 * fs
        axis, t, gap = .352 * s, max(.55, .06 * s), .1 * s
        nb = axis + t / 2 + gap + (.2 * fs if set(num) & DESC_CHARS else 0)
        db = axis - t / 2 - gap - .73 * fs
        top = nb + (.86 if set(num) & set(SUP) else .76) * fs
        bottom = -db + (.2 * fs if set(den) & DESC_CHARS else 0)
        w = max(wn, wd) + 2 * pad
        return dict(kind='f', num=num_g, den=den_g, wn=wn, wd=wd, w=w, nb=nb, db=db, axis=axis, t=t,
                    asc=top, desc=bottom, color=color, pad=pad)

    def _words(self, runs):
        atoms = []  # ('c', ch, font, color) | ('f', num, den, font, color) | ('sp', font) | ('nl',)
        for text, font, color in runs:
            pos = 0
            for m in list(FRAC_RE.finditer(text)) + [None]:
                chunk = text[pos:m.start()] if m else text[pos:]
                for ch in chunk:
                    if ch == '\n':
                        atoms.append(('nl',))
                    elif ch in ' \t ':
                        atoms.append(('sp', font))
                    else:
                        atoms.append(('c', ch, font, color))
                if m:
                    atoms.append(('f', m.group(1), m.group(2), font, color))
                    pos = m.end()
        words, cur, spaces, hard, sp_font = [], None, 0, False, SANS
        for a in atoms:
            if a[0] in ('sp', 'nl'):
                if cur:
                    words.append(cur)
                    cur = None
                if a[0] == 'nl':
                    hard, spaces = True, 0
                else:
                    spaces += 1
                    sp_font = a[1]
                continue
            if cur is None:
                cur = dict(atoms=[], spaces=spaces, hard=hard, sp_font=sp_font)
                spaces, hard = 0, False
            cur['atoms'].append(a)
        if cur:
            words.append(cur)
        s = self.s
        for w in words:
            items, plain = [], ''
            for a in w['atoms']:
                if a[0] == 'f':
                    items.append(self._frac(a[1], a[2], a[3], a[4]))
                    plain += '#'
                else:
                    plain += a[1]
                    g = self._glyphs(a[1], a[2], a[3], s)
                    if items and items[-1]['kind'] == 't':
                        items[-1]['g'].extend(g)
                    else:
                        items.append(dict(kind='t', g=g))
            for it in items:
                if it['kind'] == 't':  # слепи съседните парчета с еднакъв ключ
                    merged = []
                    for k, g in it['g']:
                        if merged and merged[-1][0] == k:
                            merged[-1][1] += g
                        else:
                            merged.append([k, g])
                    it['g'] = merged
                    it['w'] = self._gw(merged)
                    it['asc'], it['desc'] = .76 * s, .24 * s
            w['items'] = items
            w['plain'] = plain
            w['w'] = sum(it['w'] for it in items)
            w['asc'] = max([.76 * s] + [it['asc'] for it in items])
            w['desc'] = max([.24 * s] + [it['desc'] for it in items])
            sp = pdfmetrics.stringWidth(' ', w['sp_font'], s)
            w['glue'] = sp * min(w['spaces'], 2) * (.9 if w['spaces'] >= 2 else 1)
        # къде може да се пренася
        for i, w in enumerate(words):
            if i == 0 or w['hard']:
                w['brk'] = True
                continue
            prev = words[i - 1]['plain']
            core = w['plain'].rstrip(',.;:)')
            w['brk'] = not (all(ch in OPS for ch in w['plain']) or core in UNITS or prev in GLUE_AFTER)
        return words

    def _wrap(self, words):
        lines, i, n, maxw = [], 0, len(words), self.width
        while i < n:
            j, x = i + 1, words[i]['w']
            if x > maxw + .5:
                self.d.overflow.add(words[i]['plain'][:70])
            while j < n and not words[j]['hard'] and x + words[j]['glue'] + words[j]['w'] <= maxw:
                x += words[j]['glue'] + words[j]['w']
                j += 1
            if j < n and not words[j]['hard'] and not words[j]['brk']:
                k = j
                while k > i + 1 and not words[k]['brk']:
                    k -= 1
                if words[k]['brk'] and k > i:
                    j = k
            ws = words[i:j]
            lines.append(dict(words=ws, asc=max(w['asc'] for w in ws), desc=max(w['desc'] for w in ws)))
            i = j
        return lines

    # splitting -------------------------------------------------------------
    def line_h(self, ln):
        return ln['asc'] + ln['desc'] + (self.L - self.s)

    def sub(self, lines):
        """Same text object with only these lines (for continuing on the next page)."""
        r = object.__new__(Rich)
        r.__dict__.update(self.__dict__)
        r.lines = lines
        r.height_ = sum(self.line_h(ln) for ln in lines)
        r.first_base = (self.L - self.s) / 2 + lines[0]['asc'] if lines else 0
        return r

    def chunks(self, first_avail, rest_avail):
        """Split into pieces of whole lines: the first fits first_avail, the others rest_avail."""
        out, cur, h, avail = [], [], 0, first_avail
        for ln in self.lines:
            lh = self.line_h(ln)
            if cur and h + lh > avail:
                out.append(self.sub(cur))
                cur, h, avail = [], 0, rest_avail
            cur.append(ln)
            h += lh
        if cur:
            out.append(self.sub(cur))
        return out

    # drawing --------------------------------------------------------------
    def _draw_glyphs(self, c, glyphs, x, y):
        for (font, size, rise, fb, color), g in glyphs:
            c.saveState()
            c.setFillColor(color)
            t = c.beginText(x, y + rise)
            t.setFont(font, size)
            if fb:  # резервният шрифт е само нормален – удебеляваме с контур
                c.setStrokeColor(color)
                c.setLineWidth(size * .035)
                t.setTextRenderMode(2)
            t.textOut(g)
            c.drawText(t)
            c.restoreState()
            x += pdfmetrics.stringWidth(g, font, size)
        return x

    def drawOn(self, c, x0, y0):
        pad = (self.L - self.s) / 2
        top = y0 + self.height_
        for ln in self.lines:
            base = top - pad - ln['asc']
            x = x0
            for k, w in enumerate(ln['words']):
                if k:
                    x += w['glue']
                for it in w['items']:
                    if it['kind'] == 't':
                        self._draw_glyphs(c, it['g'], x, base)
                    else:
                        self._draw_glyphs(c, it['num'], x + (it['w'] - it['wn']) / 2, base + it['nb'])
                        self._draw_glyphs(c, it['den'], x + (it['w'] - it['wd']) / 2, base + it['db'])
                        c.saveState()
                        c.setFillColor(it['color'])
                        c.rect(x + it['pad'] * .45, base + it['axis'] - it['t'] / 2, it['w'] - it['pad'] * .9,
                               it['t'], stroke=0, fill=1)
                        c.restoreState()
                    x += it['w']
            top -= ln['asc'] + ln['desc'] + 2 * pad


# ---------------------------------------------------------------- drawing helpers
class Doc:
    def __init__(self, path, title, total_label, cmaps, encrypt=None):
        self.c = canvas.Canvas(path, pagesize=(W, H), pageCompression=1, encrypt=encrypt)
        self.c.setTitle(title)
        self.c.setAuthor('Еду БЕЛ')
        self.c.setProducer('Еду БЕЛ')
        self.c.setCreator('Еду БЕЛ')
        self.total_label = total_label
        self.page_no = 0
        self.total_pages = 0
        self.cmaps = cmaps
        self.missing = set()
        self.overflow = set()
        self.keys = []  # ключ на всяка страница по ред (за проверка на връзките)

    # text ------------------------------------------------------------
    def check(self, font, text):
        cm = self.cmaps[font]
        for ch in text:
            if ord(ch) not in cm and ch not in '\n':
                self.missing.add((font, ch, text[:60]))

    def text(self, x, y, s, font, size, color, align='left', alpha=None):
        self.check(font, s)
        c = self.c
        c.saveState()
        c.setFillColor(color)
        if alpha is not None:
            c.setFillAlpha(alpha)
        c.setFont(font, size)
        if align == 'left':
            c.drawString(x, y, s)
        elif align == 'right':
            c.drawRightString(x, y, s)
        else:
            c.drawCentredString(x, y, s)
        c.restoreState()

    def para(self, text, font, size, leading, width, color, hard_breaks=True, align=0):
        """Returns a wrapped Paragraph (call .drawOn). Hard line breaks kept as <br/>."""
        self.check(font, text)
        st = ParagraphStyle('p', fontName=font, fontSize=size, leading=leading, textColor=color, alignment=align)
        markup = '<br/>'.join(escape(t) for t in text.split('\n')) if hard_breaks else escape(text)
        p = Paragraph(markup, st)
        w, h = p.wrap(width, 10000)
        p.height_ = h
        for ln in getattr(p.blPara, 'lines', []):
            extra = ln[0] if isinstance(ln, tuple) else getattr(ln, 'extraSpace', 0)
            if extra < -3:
                self.overflow.add(text[:70])
        return p

    def rich(self, runs, size, leading, width, font=SANS, color=None):
        return Rich(self, runs, size, leading, width, font, color)

    # shapes ----------------------------------------------------------
    def rrect(self, x, y, w, h, r, fill=None, stroke=None, lw=0.5, fill_alpha=None, stroke_alpha=None):
        c = self.c
        c.saveState()
        c.setLineWidth(lw)
        if fill is not None:
            c.setFillColor(fill)
        c.setStrokeColor(stroke if stroke is not None else (fill or C['ink']))
        if fill_alpha is not None:
            c.setFillAlpha(fill_alpha)
        if stroke_alpha is not None:
            c.setStrokeAlpha(stroke_alpha)
        c.roundRect(x, y, w, h, r, stroke=1 if stroke is not None else 0, fill=1 if fill is not None else 0)
        c.restoreState()

    def line(self, x1, y1, x2, y2, color, lw, alpha=None):
        c = self.c
        c.saveState()
        c.setStrokeColor(color)
        if alpha is not None:
            c.setStrokeAlpha(alpha)
        c.setLineWidth(lw)
        c.line(x1, y1, x2, y2)
        c.restoreState()

    def circle(self, cx, cy, r, fill=None, stroke=None, lw=0.6, stroke_alpha=None):
        c = self.c
        c.saveState()
        c.setLineWidth(lw)
        if fill is not None:
            c.setFillColor(fill)
        if stroke is not None:
            c.setStrokeColor(stroke)
        if stroke_alpha is not None:
            c.setStrokeAlpha(stroke_alpha)
        c.circle(cx, cy, r, stroke=1 if stroke is not None else 0, fill=1 if fill is not None else 0)
        c.restoreState()

    def shadow(self, x, y, w, h, r, strength):
        for spread, drop, k in ((5, 3, .24), (3, 2, .36), (1.4, 1, .48), (0, 0, .5)):
            self.rrect(x - spread, y - spread - drop, w + 2 * spread, h + 2 * spread, r + spread,
                       fill=C['navy'], fill_alpha=strength * k)

    def card(self, x, y, w, h, fill=None, border=None):
        self.shadow(x, y - 2, w, h, 12, .06)
        self.rrect(x, y - 2, w, h, 12, fill=C['card_lip'])
        self.rrect(x, y, w, h, 12, fill=fill or C['card'], stroke=border or C['line'], lw=.55)
        self.line(x + 12, y + h - .8, x + w - 12, y + h - .8, HexColor('#ffffff'), .7)

    def arrow(self, x, y, color):
        for a in ((x - 10, y, x, y), (x, y, x - 4, y + 4), (x, y, x - 4, y - 4)):
            self.line(*a, color, 1.3)

    def button(self, x, y, w, h, label, style, link=None, arrow=True, size=13, center=False):
        face, lip, ink = {'dark': (C['navy'], C['navy_lip'], C['card']),
                          'light': (C['card'], C['light_lip'], C['ink']),
                          'gold': (C['gold_light'], C['gold_lip'], C['ink'])}[style]
        self.shadow(x, y - 2, w, h, 11, .07)
        self.rrect(x, y - 3, w, h, 11, fill=lip)
        self.rrect(x, y, w, h, 11, fill=face)
        self.line(x + 12, y + h - 1, x + w - 12, y + h - 1, C['card'], .7, alpha=.22)
        cy = y + h / 2
        if center:
            self.text(x + w / 2, cy - .2366 * size, label, SANS_SB, size, ink, align='center')
        else:
            self.text(x + 16, cy - .2431 * size, label, SANS_SB, size, ink)
        if arrow and not center:
            self.arrow(x + w - 15, cy, ink)
        if link:
            self.link(link, x, y, w, h)

    def link(self, dest, x, y, w, h):
        self.c.linkRect('', dest, (x, y, x + w, y + h), relative=0, thickness=0)

    def book_icon(self, x, y, scale, color):
        c = self.c
        c.saveState()
        c.transform(scale, 0, 0, scale, x, y)
        c.setStrokeColor(color)
        c.setLineWidth(1.2)
        p = c.beginPath()
        p.moveTo(0, -3); p.curveTo(5, 0, 10, 0, 14, -3); p.curveTo(18, 0, 23, 0, 28, -3)
        p.lineTo(28, -19); p.curveTo(23, -16, 18, -16, 14, -19); p.curveTo(10, -16, 5, -16, 0, -19); p.close()
        c.drawPath(p, stroke=1, fill=0)
        for a in ((14, -3, 14, -19), (3, -7, 10, -7), (18, -7, 25, -7)):
            c.line(*a)
        c.restoreState()

    # page frame --------------------------------------------------------
    def start(self, key, dark=False):
        self.page_no += 1
        self.keys.append(key)
        c = self.c
        c.bookmarkPage(key, fit='Fit')
        if dark:
            c.setFillColor(C['navy'])
            c.rect(0, 0, W, H, stroke=0, fill=1)
            c.saveState()
            p = c.beginPath(); p.rect(0, 0, W, H)
            c.clipPath(p, stroke=0, fill=0)
            c.linearGradient(0, 0, W, H, GRAD, extend=True)
            c.restoreState()
            for r in (98, 138, 180, 224, 270):
                self.circle(370, 410, r, stroke=C['gold_light'], lw=.5, stroke_alpha=.18)
            self.book_icon(24, 612, .7, C['gold_light'])
            self.text(51, 599.88, 'Еду Бел', SERIF_B, 16, C['card'])
            self.text(336, 601.36, self.total_label, SANS_SB, 8.1, C['gold_light'], align='right')
        else:
            c.setFillColor(C['bg'])
            c.rect(0, 0, W, H, stroke=0, fill=1)
            self.book_icon(24, 614, .7, C['gold'])
            self.text(51, 601.88, 'Еду Бел', SERIF_B, 16, C['ink'])
            self.text(336, 603.36, self.total_label, SANS_SB, 8.1, C['muted'], align='right')
        self.dark = dark

    def finish(self):
        dark = self.dark
        self.line(24, 26, 336, 26, C['dark_footer_line'] if dark else C['line'], .5)
        col = C['dark_footer'] if dark else C['muted']
        self.text(24, 11.42, '© Еду Бел · edubel.bg', SANS, 6.8, col)
        self.text(336, 11.42, f'{self.page_no:03d} / {self.total_pages:03d}', SANS, 6.8, col, align='right')
        self.c.showPage()


# ---------------------------------------------------------------- content model
def build_parts(content):
    questions = content['questions']
    if content.get('parts'):  # математика: частите са дадени изрично, задачите – по полето part
        by_id = {}
        for q in questions:
            by_id.setdefault(q['part'], []).append(q)
        parts, n = [], 0
        per_grade = {}
        for i, pd in enumerate(content['parts'], 1):
            qs = by_id.pop(pd['id'], [])
            if not qs:
                raise SystemExit(f"част {pd['id']} няма задачи")
            for j, q in enumerate(qs):
                n += 1
                q['num'] = n
                q['pos'] = j + 1
            grade = pd.get('grade')
            k = per_grade.get(grade, 0)
            per_grade[grade] = k + 1
            subject = qs[0].get('subject', 'Математика')
            if subject == 'Математика':
                color = PART_COLORS[k % len(PART_COLORS)]
            else:  # частите се редуват – злато и синьо-зелено, като се започва с цвета на предмета
                pal = BEL_PART_COLORS if subject != 'Български език' else BEL_PART_COLORS[::-1]
                li = sum(1 for x in parts if x['subject'] == subject) + 1
                color = pal[(li - 1) % len(pal)]
            for q in qs:
                q['_flow'] = True  # отговорът – по новия начин (с подсказка и продължение)
            parts.append({'i': i, 'li': i, 'grade': grade, 'subject': subject, 'title': pd['title'], 'qs': qs,
                          'color': color,
                          'max': sum(q['level'] for q in qs), 'first': qs[0]['num'], 'last': qs[-1]['num']})
        if by_id:
            raise SystemExit(f'задачи без част: {sorted(by_id)}')
        subjects = list(dict.fromkeys(p['subject'] for p in parts))
        for p in parts:  # номер на частта в предмета; при няколко предмета – меню за всеки предмет
            same = [x for x in parts if x['subject'] == p['subject']]
            p['li'], p['ln'] = same.index(p) + 1, len(same)
            if len(subjects) > 1:
                p['si'] = subjects.index(p['subject']) + 1
                p['menu'] = f"menu{p['si']}"
                p['wd'] = WORDS['math'] if p['subject'] == 'Математика' else WORDS['bel']
        for q in questions:  # номерът в PDF трябва да съвпада с номера онлайн
            if 'n' in q and q['n'] != q['num']:
                raise SystemExit(f"задача {q['n']} е на място {q['num']} – провери реда")
        return parts
    groups = {}
    for q in questions:
        groups.setdefault((q['grade'], q['subject']), []).append(q)
    # (старият вид БЕЛ без "parts": номерът на частта е общ, менюто е едно)
    keys = sorted(groups, key=lambda k: (k[0], SUBJECT_ORDER.index(k[1])))
    parts, n = [], 0
    for i, k in enumerate(keys, 1):
        qs = groups[k]
        for j, q in enumerate(qs):
            n += 1
            q['num'] = n
            q['pos'] = j + 1
        parts.append({'i': i, 'li': i, 'grade': k[0], 'subject': k[1], 'title': k[1], 'qs': qs,
                      'color': SUBJECT_COLOR[k[1]],
                      'max': sum(q['level'] for q in qs), 'first': qs[0]['num'], 'last': qs[-1]['num']})
    return parts


def title_bands(mx):
    b = [math.ceil(mx * .9), math.ceil(mx * .75), math.ceil(mx * .6), math.ceil(mx * .4)]
    return [(b[0], mx), (b[1], b[0] - 1), (b[2], b[1] - 1), (b[3], b[2] - 1), (0, b[3] - 1)]


# ---------------------------------------------------------------- pages
def page_cover(d, total_q, cover_word, subtitle_lines, book_lines, tagline,
               eyebrow='ИНТЕРАКТИВЕН ПРЕГОВОР · 5.–7. КЛАС', book_grades=True):
    d.start('cover', dark=True)
    d.text(24, 547.62, eyebrow, SANS_SB, 9, C['gold_light'])
    d.text(24, 437.98, str(total_q), SERIF_B, 111, C['shadow_text'])
    d.text(21, 441.98, str(total_q), SERIF_B, 111, C['gold_light'])
    d.text(25, 384.02, cover_word, SERIF, min(39, 310 / pdfmetrics.stringWidth(cover_word, SERIF, 1)), C['card'])
    y = 344.0
    for ln in subtitle_lines:
        d.text(27, y, ln, SANS, 17, C['cover_text'])
        y -= 23
    # стек от книги
    c = d.c
    c.saveState()
    c.transform(.98, 0, 0, .98, 180, -330.2)
    c.saveState(); c.setFillColor(HexColor('#061321')); c.setFillAlpha(.22)
    c.ellipse(1.5 - 113.5, 513 - 15, 1.5 + 113.5, 513 + 15, stroke=0, fill=1); c.restoreState()

    def poly(pts, fill, stroke=None, lw=.7):
        c.saveState()
        c.setFillColor(fill); c.setStrokeColor(stroke or fill); c.setLineWidth(lw if stroke is None else .5)
        p = c.beginPath(); p.moveTo(*pts[0])
        for pt in pts[1:]:
            p.lineTo(*pt)
        p.close()
        c.drawPath(p, stroke=1, fill=1)
        c.restoreState()

    def pages_lines(x0, y0, x1, y1):
        for k in range(3):
            c.saveState(); c.setStrokeColor(HexColor('#cbbfad')); c.setLineWidth(.5)
            c.line(x0, y0 - 3 * k, x1, y1 - 3 * k); c.restoreState()

    books = [  # (dx, dy, spine, cover, label colour, label)
        (0, 0, '#254d54', '#4e7c7c', C['card'], '5', (-78, 539.62)),
        (-9, 28, '#95733e', '#d8bd87', C['navy'], '6', (-87, 567.62)),
        (3, 58, '#17394f', '#355970', C['card'], '7', (-75, 597.62)),
    ]
    for dx, dy, spine, cover, lc, label, lpos in books:
        poly([(-10 + dx, 517 + dy), (104 + dx, 543 + dy), (104 + dx, 528 + dy), (-10 + dx, 502 + dy)], HexColor('#eee4d0'))
        pages_lines(-6 + dx, 513 + dy, 101 + dx, 539 + dy)
        poly([(-98 + dx, 556 + dy), (-10 + dx, 517 + dy), (-10 + dx, 502 + dy), (-98 + dx, 541 + dy)], HexColor(spine))
        poly([(-98 + dx, 556 + dy), (15 + dx, 580 + dy), (104 + dx, 543 + dy), (-10 + dx, 517 + dy)], HexColor(cover))
        poly([(-94 + dx, 554 + dy), (15 + dx, 577 + dy), (99 + dx, 543 + dy), (-10 + dx, 521 + dy)], HexColor(cover),
             stroke=C['gold_light'])
        if label != '7' and book_grades:
            d.text(lpos[0], lpos[1], label, SANS_SB, 9, lc)
    c.saveState()
    c.transform(1, .215, -.88, .37, -69, 612)
    d.text(6, 1, 'Еду Бел', SERIF_B, 23, C['gold_light'])
    yy = -17
    for ln in book_lines:
        d.text(6, yy, ln, SANS, 9, C['gold_light'])
        yy -= 14
    c.restoreState()
    if book_grades:
        d.text(-75, 597.62, '7', SANS_SB, 9, C['card'])
    c.restoreState()
    d.text(180, 138.16, tagline, SANS, 12, C['cover_text'], align='center')
    d.button(24, 60, 312, 48, 'Започни', 'gold', link='parent')
    d.text(180, 40.03, 'Работи и без интернет · подарък от Еду Бел', SANS, 8.5, C['cover_note'], align='center')
    d.finish()


def steps_block(d, steps, y_top, gap=34):
    """steps: list of (num, heading, body, size) or ('callout', title, body, size). y_top = cy of first circle."""
    cy = y_top
    for st in steps:
        if st[0] == 'callout':
            _, title, body, size = st
            p = d.para(body, SANS, size, size * 1.373, 280, C['ink'])
            h = p.height_ + 35.4
            top = cy + 16
            d.card(24, top - h, 312, h, fill=C['callout'])
            d.text(40, top - 22.2, title, SANS_B, 10, C['ink'])
            p.drawOn(d.c, 40, top - 22.2 - 12 - p.height_ + 0)
            cy = top - h - gap
            continue
        num, heading, body, size = st
        d.circle(38, cy, 14, fill=C['navy'])
        d.text(38, cy - 3.66, str(num), SANS_SB, 13, C['gold_light'], align='center')
        d.text(61, cy + 2.34, heading, SANS_SB, 13, C['ink'])
        p = d.para(body, SANS, size, size * 1.4, 275, C['muted'])
        p.drawOn(d.c, 61, cy - 8 - p.height_)
        cy = cy - 8 - p.height_ - gap
    if cy + gap < 92:
        d.overflow.add(f'инструкциите не се побират на страницата {d.page_no} ({cy + gap:.0f})')
    return cy


def page_parent(d, steps):
    d.start('parent')
    d.text(24, 550.78, 'НАЧАЛО · 01 / 02', SANS_SB, 8.8, C['gold'])
    d.text(24, 511.04, 'За родителя', SERIF_B, 28, C['ink'])
    steps_block(d, steps, 468)
    d.button(24, 37, 312, 42, 'Как се играе', 'dark', link='howto')
    d.finish()


def page_howto(d, steps, gap=34):
    d.start('howto')
    d.text(24, 550.78, 'НАЧАЛО · 02 / 02', SANS_SB, 8.8, C['gold'])
    d.text(24, 511.04, 'Как се играе', SERIF_B, 28, C['ink'])
    steps_block(d, steps, 477, gap)
    d.button(24, 37, 312, 42, 'Към частите', 'dark', link='menu')
    d.finish()


def page_menu(d, parts, wd, key='menu', subject=None):
    """Менюто с частите. subject – при няколко предмета: менюто на този предмет с бутон „Всички предмети“."""
    def items_word(n):
        return f"{n} {wd['one'] if n == 1 else wd['many']}"

    d.start(key)
    eyebrow = f'{NUM_WORDS.get(len(parts), str(len(parts)))} ЧАСТИ · ЕДНА СТЪПКА НАПРЕД'
    if subject:
        eyebrow = f'{subject.upper()} · {NUM_WORDS.get(len(parts), str(len(parts)))} ЧАСТИ'
    d.text(24, 550.78, eyebrow, SANS_SB, 8.8, C['gold'])
    d.text(24, 511.04, 'Избери част', SERIF_B, 28, C['ink'])
    graded = any(p['grade'] is not None for p in parts)
    d.text(24, 479, 'Започни със своя клас. Учи в собствено темпо.' if graded else
           'Започни с темата, която учиш. Учи в собствено темпо.', SANS, 12, C['muted'])
    many = len(parts) > 6
    titled = any(p['title'] != p['subject'] for p in parts)  # части с име (математика)
    h, gap, ggap = (35, 5, 13) if many else (47, 9, 9)
    if titled and not many:
        h, gap, ggap = 46, 7, 13
    y = 462 if many else 450
    # общ размер за заглавията на частите, така че и най-дългото да се побере на един ред;
    # ако и при 10,6 pt не се побира, това заглавие минава на два реда
    t_size = 12.2
    t_lines = {}
    if titled:
        longest = max(pdfmetrics.stringWidth(p['title'], SANS_SB, 1) for p in parts)
        t_size = min(11.6 if many else 12.2, max(10.6, 226 / longest))
        for p in parts:
            t_lines[p['i']] = wrap_words(p['title'], SANS_SB, t_size, 226)
    prev_grade = None
    for p in parts:
        if prev_grade is not None and p['grade'] != prev_grade:
            y -= ggap - gap
        prev_grade = p['grade']
        top = y
        extra = (len(t_lines.get(p['i'], [''])) - 1) * (t_size + 2)
        by = top - h - extra
        col = p['color']
        d.card(24, by, 312, h + extra)
        d.rrect(24, by, 4, h + extra, 2, fill=col)
        cy = by + (h + extra) / 2
        if titled:
            meta = f"{items_word(len(p['qs']))} · до {p['max']} точки"
            if p['grade'] is not None:
                meta = f"{p['grade']}. клас · {meta}"
            tl = t_lines[p['i']]
            if many:
                d.text(43, cy - 5.6, f"{p['li']:02d}", SERIF_B, 16, col)
                y1, y2 = cy + 1.6, cy - 10.6
            else:
                d.text(43, cy - 5.08, f"{p['li']:02d}", SERIF_B, 19, col)
                y1, y2 = cy + 3.6, cy - 12.4
            off = extra / 2
            for li, ln in enumerate(tl):
                d.text(76, y1 + off - li * (t_size + 2), ln, SANS_SB, t_size, C['ink'])
            d.text(76, y2 - off, meta, SANS, 9 if not many else 8.4, C['muted'])
        elif many:
            d.text(43, cy - 5.6, f"{p['li']:02d}", SERIF_B, 16, col)
            d.text(80, cy + 1.6, f"{p['grade']}. клас · {p['subject']}", SANS_SB, 11.6, C['ink'])
            d.text(80, cy - 10.6, f"{items_word(len(p['qs']))} · до {p['max']} точки", SANS, 8.4, C['muted'])
        else:
            d.text(43, cy - 5.08, f"{p['li']:02d}", SERIF_B, 19, col)
            d.text(83, cy + 4.5, f"{p['grade']}. клас · {p['subject']}", SANS_SB, 12.2, C['ink'])
            d.text(83, cy - 12.88, f"{items_word(len(p['qs']))} · до {p['max']} точки", SANS, 9, C['muted'])
        d.arrow(320, cy, C['ink'])
        d.link(f"part{p['i']}", 24, by, 312, h + extra)
        y = by - gap
    if not many:
        for x, w, lv in ((24, 90, 1), (122, 112, 2), (242, 94, 3)):
            d.rrect(x, 82, w, 22, 11, fill=C['chip'])
            d.text(x + w / 2, 91.19, f'{LEVELS[lv][0]} · {LEVELS[lv][1]}', SANS_SB, 8.3, C['ink'], align='center')
        if y + gap < 112:
            d.overflow.add(f'менюто не се побира ({y + gap:.0f})')
    elif y + gap < 76:
        d.overflow.add(f'менюто не се побира ({y + gap:.0f})')
    if subject:
        d.button(24, 37, 190, 30, 'Всички предмети', 'dark', link='menu', size=12, center=True)
        d.button(222, 37, 114, 30, 'Инструкции', 'light', link='parent', size=12, center=True)
    else:
        d.button(24, 37, 312, 30, 'Инструкции', 'light', link='parent', center=True)
    d.finish()


def subject_icon(d, cx, cy, subject, color):
    d.circle(cx, cy, 19, fill=color)
    if subject == 'Математика':
        d.text(cx, cy - 7, 'π', SERIF_B, 21, C['card'], align='center')
    elif subject == 'Литература':
        d.book_icon(cx - 11.2, cy + 6.6, .8, C['card'])
    else:
        d.text(cx, cy - 5.6, 'Аа', SERIF_B, 15.5, C['card'], align='center')


def page_main_menu(d, groups):
    """Главното меню при няколко предмета: голяма карта за всеки предмет -> менюто на предмета."""
    d.start('menu')
    n = len(groups)
    words = {2: 'ДВА', 3: 'ТРИ', 4: 'ЧЕТИРИ'}
    d.text(24, 550.78, f'{words.get(n, str(n))} ПРЕДМЕТА · ЕДНА СТЪПКА НАПРЕД', SANS_SB, 8.8, C['gold'])
    d.text(24, 511.04, 'Избери предмет', SERIF_B, 28, C['ink'])
    d.text(24, 479, 'Всеки предмет има свои части. Учи в собствено темпо.', SANS, 12, C['muted'])
    h, gap = 92, 13
    y = 458
    for g in groups:
        subj, gparts, wd = g['subject'], g['parts'], g['wd']
        nq = sum(len(p['qs']) for p in gparts)
        pts = sum(p['max'] for p in gparts)
        col = SUBJECT_COLOR.get(subj, C['navy'])
        by = y - h
        d.card(24, by, 312, h)
        d.rrect(24, by, 6, h, 3, fill=col)
        cy = by + h / 2
        subject_icon(d, 62, cy, subj, col)
        d.text(94, cy + 4, subj, SERIF_B, 21, C['ink'])
        meta = f"{nq} {wd['many']} · {len(gparts)} части · до {pts} точки"
        d.text(94, cy - 16, meta, SANS, 10.2, C['muted'])
        d.arrow(320, cy, C['ink'])
        d.link(g['key'], 24, by, 312, h)
        y = by - gap
    for x, w, lv in ((24, 90, 1), (122, 112, 2), (242, 94, 3)):
        d.rrect(x, 82, w, 22, 11, fill=C['chip'])
        d.text(x + w / 2, 91.19, f'{LEVELS[lv][0]} · {LEVELS[lv][1]}', SANS_SB, 8.3, C['ink'], align='center')
    if y + gap < 112:
        d.overflow.add('главното меню не се побира')
    d.button(24, 37, 312, 30, 'Инструкции', 'light', link='parent', center=True)
    d.finish()


def page_part_intro(d, p, nparts, wd):
    d.start(f"part{p['i']}", dark=True)
    d.text(24, 540.8, f"ЧАСТ {p['li']:02d} / {p.get('ln', nparts):02d}", SANS_SB, 10, C['gold_light'])
    d.text(247.21, 407.88, str(p['li']), SERIF_B, 166, C['card'], alpha=.075)
    n = len(p['qs'])
    items = f"{n} {wd['one'] if n == 1 else wd['many']}"
    minutes = max(5, round(n * wd['min_per_item'] / 5) * 5)
    if p['grade'] is not None:
        big, big_size = f"{p['grade']}. клас", 48
    else:  # части без клас – големият ред е предметът
        big = p['subject']
        big_size = min(48, 300 / pdfmetrics.stringWidth(big, SERIF, 1))
    if p['title'] == p['subject'] and p['grade'] is not None:
        d.text(24, 460.64, f"{p['grade']}. клас", SERIF, 48, C['card'])
        size = 28 if pdfmetrics.stringWidth(p['subject'], SERIF_B, 28) < 200 else 26
        d.text(26, 410.04 if size == 28 else 411.7, p['subject'], SERIF_B, size, C['card'])
        y_line = 380
    else:  # заглавие на част, което може да е на два реда
        for size in (27, 26, 25, 24, 23, 22):  # заглавието – най-много на два реда
            tp = d.rich(p['title'], size, size * 1.18, 300, SERIF_B, C['card'])
            if len(tp.lines) <= 2:
                break
        two = len(tp.lines) > 1
        y_grade = 478 if two else 460.64
        d.text(24, y_grade, big, SERIF, big_size, C['card'])
        tp.drawOn(d.c, 26, y_grade - 22 - tp.height_)
        y_line = y_grade - 22 - tp.height_ - 22
    d.line(26, y_line, 73, y_line, C['gold_light'], 2)
    d.text(26, y_line - 34.3, f"{items} · до {p['max']} точки", SANS_SB, 15, C['gold_light'])
    d.text(26, y_line - 58, f"{wd['Items']} {p['first']}–{p['last']} · около {minutes} минути", SANS, 11, C['dark_text'])
    if y_line - 58 < 296:
        d.overflow.add(f"заглавието на част {p['i']} не се побира")
    d.card(24, 153, 312, 132, fill=C['dark_card'], border=C['dark_card_line'])
    for k, lv in enumerate((1, 2, 3)):
        cy = 260 - 34 * k
        for j in range(3):
            d.circle(43 + 11 * j, cy, 2.7, fill=C['gold_light'] if j < lv else C['dot_off'])
        d.text(87, cy - 3.66, LEVELS[lv][0], SANS_SB, 13, C['card'])
        d.text(316, cy - 4.02, points_word(lv), SANS, 11, C['gold_light'], align='right')
    pp = d.para('Записвай точки само за верен отговор от първия опит. В края на частта ще откриеш своята титла.',
                SANS, 11, 15.4, 310, C['dark_text'])
    pp.drawOn(d.c, 26, 135 - pp.height_)
    d.button(24, 40, 196, 43, 'Започни', 'gold', link=f"q{p['first']}")
    d.button(231, 40, 105, 43, 'Части', 'light', link=p.get('menu', 'menu'), size=12, center=True)
    d.finish()


def q_header(d, p, q):
    if p['grade'] is not None:
        d.text(24, 577.21, f"{p['grade']}. клас · {p['title']}", SANS_SB, 9.5, C['muted'])
    else:  # „Част 3 · заглавие“; при дълго заглавие – само заглавието, при нужда съкратено
        t = f"Част {p['li']} · {p['title']}"
        if pdfmetrics.stringWidth(t, SANS_SB, 9.5) > 262:
            t = p['title']
        size = max(8.5, min(9.5, 262 / pdfmetrics.stringWidth(t, SANS_SB, 1)))
        while pdfmetrics.stringWidth(t, SANS_SB, size) > 262 and ' ' in t:
            t = t.rstrip('…').rsplit(' ', 1)[0].rstrip(' ,–') + '…'
        d.text(24, 577.21, t, SANS_SB, size, C['muted'])
    n = len(p['qs'])
    d.text(336, 577.21, f"{q['pos']:02d} / {n:02d}", SANS_SB, 9.5, C['muted'], align='right')
    d.rrect(24, 563.5, 312, 2.5, 1, fill=C['line'])
    d.rrect(24, 563.5, 312 * q['pos'] / n, 2.5, 1, fill=p['color'])


PASSAGE_MIN = 10.2  # откъсът не се смалява под този размер


def passage_rich(d, q, size):
    style = q.get('passage_style', 'italic')
    font = {'italic': SERIF_I, 'plain': SANS}.get(style, SANS)
    return d.rich('\n'.join(q['passage']), size, size * 1.4, 280, font)


# ---- фигури на страницата с въпроса: таблица, стълбчеста и кръгова диаграма
FIG_COLORS = [HexColor('#6b5e98'), HexColor('#b98d4f'), HexColor('#3d777a'), HexColor('#a6534f'),
              HexColor('#647581'), HexColor('#8aa37b')]
GRID = HexColor('#d9d2c4')


def fig_block(d, fig, color, extra=0):
    """-> (height, draw(top)) за фигурата; ширина 312 от x=24. extra – допълнителна височина (стълбчета)."""
    kind = fig.get('type')
    if kind == 'table':
        head, rows = fig['head'], fig['rows']
        ncol = len(head)
        tw = min(312, max(200, 120 * ncol))
        x0 = 24 + (312 - tw) / 2
        rh, hh = 23, 25
        h = hh + rh * len(rows)

        def draw(top):
            cw = tw / ncol
            d.rrect(x0, top - hh, tw, hh, 0, fill=C['navy'])
            for k, t in enumerate(head):
                d.text(x0 + cw * (k + .5), top - hh + 8.3, str(t), SANS_SB, 11.5, C['card'], align='center')
            for r, row in enumerate(rows):
                y = top - hh - rh * (r + 1)
                d.rrect(x0, y, tw, rh, 0, fill=C['card'] if r % 2 == 0 else HexColor('#f8f4ec'))
                for k, t in enumerate(row):
                    d.text(x0 + cw * (k + .5), y + 7.4, str(t), SANS, 12.5, C['ink'], align='center')
            c = d.c
            c.saveState()
            c.setStrokeColor(HexColor('#b9b1a2'))
            c.setLineWidth(.7)
            c.rect(x0, top - h, tw, h, stroke=1, fill=0)
            for r in range(len(rows)):
                y = top - hh - rh * r
                c.line(x0, y, x0 + tw, y)
            for k in range(1, ncol):
                c.line(x0 + cw * k, top - h, x0 + cw * k, top)
            c.restoreState()
        return h, draw
    if kind == 'bar':
        labels, values = fig['labels'], fig['values']
        step, mx = fig.get('step', 10), fig.get('max', max(values))
        h = 178 + extra

        def draw(top):
            d.card(24, top - h, 312, h)
            if fig.get('title'):
                d.text(36, top - 17, fig['title'], SANS_SB, 10.5, C['ink'])
            px0, px1 = 24 + 34, 336 - 12
            py0, py1 = top - h + 24, top - 30
            n_int = int(round(mx / step))
            gap_y = (py1 - py0) / n_int
            fs = 8.4 if gap_y >= 12.5 else 8 if gap_y >= 10.5 else 7.6
            for k in range(n_int + 1):
                v = k * step
                y = py0 + (py1 - py0) * v / mx
                d.line(px0, y, px1, y, GRID if k else C['ink'], .5 if k else .9)
                d.line(px0 - 3, y, px0, y, C['ink'], .7)
                lab = f'{v:g}'.replace('.', ',')
                d.text(px0 - 5, y - fs * .36, lab, SANS, fs, C['muted'], align='right')
            d.line(px0, py0, px0, py1, C['ink'], .9)
            slot = (px1 - px0) / len(values)
            bw = slot * .56
            for k, (lab, v) in enumerate(zip(labels, values)):
                bx = px0 + slot * k + (slot - bw) / 2
                bh = (py1 - py0) * v / mx
                d.rrect(bx, py0, bw, bh, 1.5, fill=color)
                d.text(bx + bw / 2, py0 - 12.5, str(lab), SANS_SB, 9.5, C['ink'], align='center')
        return h, draw
    if kind == 'pie':
        sectors = fig['sectors']
        total = sum(s_['deg'] for s_ in sectors) or 360
        h = max(150, 52 + 22 * len(sectors))

        def draw(top):
            d.card(24, top - h, 312, h)
            if fig.get('title'):
                d.text(36, top - 17, fig['title'], SANS_SB, 10.5, C['ink'])
            r = 50
            cx, cy = 24 + 16 + r + 6, top - 28 - (h - 28) / 2
            c = d.c
            ang = 90.0
            for k, sec in enumerate(sectors):
                ext = 360 * sec['deg'] / total
                c.saveState()
                c.setFillColor(FIG_COLORS[k % len(FIG_COLORS)])
                c.setStrokeColor(C['card'])
                c.setLineWidth(1.4)
                c.wedge(cx - r, cy - r, cx + r, cy + r, ang - ext, ext, stroke=1, fill=1)
                c.restoreState()
                mid = math.radians(ang - ext / 2)
                if ext >= 40:
                    d.text(cx + .62 * r * math.cos(mid), cy + .62 * r * math.sin(mid) - 3.3,
                           f"{sec['deg']}°", SANS_B, 9.5, C['card'], align='center')
                ang -= ext
            lx = cx + r + 22
            ly = cy + (len(sectors) - 1) * 11
            for k, sec in enumerate(sectors):
                y = ly - 22 * k
                d.rrect(lx, y - 4.5, 11, 11, 2.5, fill=FIG_COLORS[k % len(FIG_COLORS)])
                d.text(lx + 17, y - 2.6, sec['label'], SANS_SB, 11, C['ink'])
                d.text(336 - 14, y - 2.6, f"{sec['deg']}°", SANS, 11, C['muted'], align='right')
        return h, draw
    raise SystemExit(f'непознат вид фигура: {kind}')


def layout_question(d, q, color=None):
    """Choose scale so that question, passage, figure and options fit. Returns drawing plan or None."""
    style = q.get('passage_style', 'italic')
    fig = fig_block(d, q['fig'], color or C['navy']) if q.get('fig') else None
    # с фигура и кратки отговори – отговорите са в две колони (2 × 2)
    grid = bool(fig) and len(q['options']) == 4 and all(
        len(d.rich(o, 13, 13 * 1.3, 106, SANS).lines) == 1 for o in q['options'])
    scales = (1, .95, .9, .85, .8, .75, .7, .66)
    for s in scales:
        for min_h in ((52, 48, 43) if s == 1 else (43,) if s >= .8 else (36,)):
            qs = 16.6 * s
            qp = d.rich(q['q'], qs, qs * 1.32, 312, SANS_SB)
            y = 495 - qp.height_
            plan = {'qp': (qp, 495 - qp.height_)}
            if q.get('passage'):
                if style == 'formula':
                    ps = 19 * s
                    pp = d.para('\n'.join(q['passage']), SANS, ps, ps * 1.35, 280, C['ink'], align=1)
                    pp.pad_ = 16
                else:
                    pp = passage_rich(d, q, max(PASSAGE_MIN, 13.5 * s))
                    pp.pad_ = 10
                box_top = y - 12
                box_h = pp.height_ + 2 * pp.pad_
                plan['passage'] = (pp, box_top, box_h)
                y = box_top - box_h
            if fig:
                plan['fig'] = (fig[1], y - 14)
                y = y - 14 - fig[0]
            if grid:
                os_ = max(10.6, 13.6 * s)
                ops = [d.rich(o, os_, os_ * 1.3, 106, SANS) for o in q['options']]
                hs = [max(44 if s >= .8 else 38, max(op.height_ for op in ops) + 20)] * 2
                ogap = 8
            else:
                os_ = max(10.6, 14.1 * s)
                opad = 22 if s >= .8 else 15
                ops, hs = [], []
                for o in q['options']:
                    op = d.rich(o, os_, os_ * 1.34, 252, SANS)
                    ops.append(op)
                    hs.append(max(min_h, op.height_ + opad))
                ogap = 8 if s >= .8 else 6
            total = sum(hs) + ogap * (len(hs) - 1)
            top = 97 + total
            if y - top >= (18 if s >= .8 else 12):
                if fig and q['fig'].get('type') == 'bar':  # свободното място – за по-висока диаграма
                    extra = max(0, min(60, y - top - 22))
                    fb = fig_block(d, q['fig'], color or C['navy'], extra)
                    plan['fig'] = (fb[1], plan['fig'][1])
                plan['ops'] = list(zip(ops, hs)) if not grid else ops
                plan['rows'] = hs
                plan['grid'] = grid
                plan['gap'] = ogap
                plan['scale'] = s
                return plan
    return None


def q_top(d, p, q, wd, second=False):
    q_header(d, p, q)
    name, pts, col = LEVELS[q['level']]
    title = f"{wd['Item']} {q['num']:03d}"
    if second:  # втори опит: ясен чип „Втори опит“ вместо чипа с точките
        x = 336
        chips = [('Втори опит', C['navy'], C['card'], None, 9.3)]
        if q.get('adv'):
            chips.append(('За напреднали', C['card'], C['trap_ink'], C['gold'], 8.6))
        for label_, fill, ink, stroke, size in chips:
            w = pdfmetrics.stringWidth(label_, SANS_SB, size) + 24
            x -= w
            d.rrect(x, 512, w, 22, 11, fill=fill, stroke=stroke, lw=.8)
            d.text(x + w / 2, 520.37 + (9.3 - size) * .25, label_, SANS_SB, size, ink, align='center')
            x -= 6
        size = min(25, (x - 4 - 24) / pdfmetrics.stringWidth(title, SERIF_B, 1))
        d.text(24, 517.5, title, SERIF_B, size, C['ink'])
        return
    if q.get('adv'):  # „За напреднали“ – дискретен чип до чипа за нивото
        lt = f'{name} · {pts}'
        lw = pdfmetrics.stringWidth(lt, SANS_SB, 9.3) + 22
        aw = pdfmetrics.stringWidth('За напреднали', SANS_SB, 8.6) + 18
        lx = 336 - lw
        ax = lx - 6 - aw
        d.rrect(lx, 512, lw, 22, 11, fill=col)
        d.text(lx + lw / 2, 520.37, lt, SANS_SB, 9.3, C['ink'], align='center')
        d.rrect(ax, 512, aw, 22, 11, fill=C['card'], stroke=C['gold'], lw=.8)
        d.text(ax + aw / 2, 520.6, 'За напреднали', SANS_SB, 8.6, C['trap_ink'], align='center')
        size = min(25, (ax - 10 - 24) / pdfmetrics.stringWidth(title, SERIF_B, 1))
        d.text(24, 517.5, title, SERIF_B, size, C['ink'])
        return
    d.rrect(224, 512, 112, 22, 11, fill=col)
    d.text(280, 520.37, f'{name} · {pts}', SANS_SB, 9.3, C['ink'], align='center')
    d.text(24, 517.5, title, SERIF_B, 25, C['ink'])


def passage_box(d, pp, top, pad=10):
    bh = pp.height_ + 2 * pad
    d.rrect(24, top - bh, 312, bh, 9, fill=C['passage'])
    d.rrect(24, top - bh + 10, 2, bh - 20, 1, fill=C['gold'])
    pp.drawOn(d.c, 41, top - pad - pp.height_)


def option_target(q, k, second=False):
    """Първи опит: верният -> „Вярно!“ (c), грешните -> подсказката (h) или старата страница (w).
    Втори опит: верният -> „Вярно от втория опит!“ (v), грешните -> решението/обяснението (s)."""
    if second:
        return f"v{q['num']}" if k == q['correct'] else f"s{q['num']}"
    if k == q['correct']:
        return f"c{q['num']}"
    return f"h{q['num']}" if q.get('_flow') else f"w{q['num']}"


def draw_options(d, q, plan, second=False):
    gap = plan['gap']
    if plan.get('grid'):
        rh = plan['rows'][0]
        cw = (312 - gap) / 2
        for k, op in enumerate(plan['ops']):
            row, col = divmod(k, 2)
            bx = 24 + col * (cw + gap)
            by = 97 + (1 - row) * (rh + gap)
            d.card(bx, by, cw, rh)
            cy = by + rh / 2
            d.rrect(bx + 10, cy - 13.5, 27, 27, 8, fill=C['navy'])
            d.text(bx + 23.5, cy - 3.16, 'АБВГ'[k], SANS_SB, 13, C['card'], align='center')
            op.drawOn(d.c, bx + 46, cy - op.height_ / 2)
            d.link(option_target(q, k, second), bx, by, cw, rh)
        return
    y = 97 + sum(h for _, h in plan['ops']) + gap * (len(plan['ops']) - 1)
    for k, (op, h) in enumerate(plan['ops']):
        by = y - h
        d.card(24, by, 312, h)
        cy = by + h / 2
        d.rrect(36, cy - 13.5, 27, 27, 8, fill=C['navy'])
        d.text(49.5, cy - 3.16, 'АБВГ'[k], SANS_SB, 13, C['card'], align='center')
        op.drawOn(d.c, 72, cy - op.height_ / 2)
        d.link(option_target(q, k, second), 24, by, 312, h)
        y = by - gap


def page_question(d, p, q, next_key, wd, second=False):
    """Страницата с въпроса; second – вторият опит (ключ r…, без точки, верният -> v, грешните -> s)."""
    plan = layout_question(d, q, p['color'])
    if plan is None:
        if not q.get('passage') or q.get('passage_style') == 'formula':
            raise SystemExit(f"{q['num']} не се побира: {q['q'][:60]}")
        return page_question_split(d, p, q, next_key, wd, second)
    d.start(f"{'r' if second else 'q'}{q['num']}")
    q_top(d, p, q, wd, second)
    q['_scale'] = plan['scale']
    qp, qy = plan['qp']
    qp.drawOn(d.c, 24, qy)
    if 'passage' in plan:
        pp, top, bh = plan['passage']
        passage_box(d, pp, top, pp.pad_)
    if 'fig' in plan:
        draw, top = plan['fig']
        draw(top)
    draw_options(d, q, plan, second)
    d.button(24, 37, 110, 41, 'Части', 'light', link=p.get('menu', 'menu'), size=12, center=True)
    d.button(146, 37, 190, 41, 'Пропусни', 'dark', link=next_key)
    d.finish()


def page_question_split(d, p, q, next_key, wd, second=False):
    """Дълъг откъс: въпросът и откъсът на една или няколко страници, отговорите – на следващата."""
    qp = d.rich(q['q'], 15, 15 * 1.32, 312, SANS_SB)
    pp = passage_rich(d, q, 12.4)
    first_top = 495 - qp.height_ - 12
    bottom = 92  # над бутоните отдолу
    chunks = pp.chunks(first_top - 20 - bottom, 470 - 20 - bottom)
    opt_plan = layout_question(d, dict(q, passage=None), p['color'])
    if opt_plan is None:
        raise SystemExit(f"{q['num']} не се побира: {q['q'][:60]}")
    q['_scale'] = ('split', len(chunks))
    pre = 'r' if second else 'q'
    keys = [f"{pre}{q['num']}"] + [f"{pre}{q['num']}_{k}" for k in range(2, len(chunks) + 2)]
    for ci, ch in enumerate(chunks):
        d.start(keys[ci])
        q_top(d, p, q, wd, second)
        if ci == 0:
            qp.drawOn(d.c, 24, 495 - qp.height_)
            passage_box(d, ch, first_top)
        else:
            d.text(24, 488, 'Откъсът продължава', SANS_SB, 10.5, C['muted'])
            passage_box(d, ch, 470)
        d.button(24, 37, 110, 41, 'Части', 'light', link=p.get('menu', 'menu'), size=12, center=True)
        last_chunk = ci == len(chunks) - 1
        d.button(146, 37, 190, 41, 'Към отговорите' if last_chunk else 'Откъсът продължава', 'dark',
                 link=keys[ci + 1], size=12.5)
        d.finish()
    d.start(keys[-1])
    q_top(d, p, q, wd, second)
    qp2, qy = opt_plan['qp']
    qp2.drawOn(d.c, 24, qy)
    if 'fig' in opt_plan:
        draw, top = opt_plan['fig']
        draw(top)
    draw_options(d, q, opt_plan, second)
    d.button(24, 37, 96, 41, 'Откъсът', 'light', link=keys[0], size=12, center=True)
    d.button(128, 37, 86, 41, 'Части', 'light', link=p.get('menu', 'menu'), size=12, center=True)
    d.button(222, 37, 114, 41, 'Пропусни', 'dark', link=next_key, size=12.5)
    d.finish()


# ---- БЕЛ: кратко обяснение „Защо“ на една страница
def answer_card(d, q, color):
    letter = 'АБВГ'[q['correct']]
    for s in (1, .97, .94, .91, .88, .85, .82, .79, .76, .73, .7):
        ap = d.para(f"{letter}) {q['options'][q['correct']]}", SANS_SB, 15.1 * s, 15.1 * s * 1.34, 280, C['ink'])
        ep = d.para(q['why'], SANS, 14.2 * s, 14.2 * s * 1.4, 280, C['ink'])
        rp = d.para(f"Преговори: {q['review']}", SANS_SB, 11, 15.18, 280, C['muted']) if q.get('review') else None
        a_bottom = 425 - ap.height_
        div = a_bottom - 15
        zashto = div - 23.38
        e_top = zashto - 11.62
        e_bottom = e_top - ep.height_
        last = e_bottom
        if rp:
            last = e_bottom - 16 - rp.height_
        card_bottom = last - 14
        if card_bottom >= 130:
            break
    else:
        raise SystemExit(f"обяснението на въпрос {q['num']} не се побира")
    d.card(24, card_bottom, 312, 465 - card_bottom)
    d.rrect(24, 461, 312, 4, 2, fill=color)
    d.text(40, 437.62, 'ВЕРНИЯТ ОТГОВОР', SANS_B, 9, color)
    ap.drawOn(d.c, 40, a_bottom)
    d.line(40, div, 320, div, C['line'], .6)
    d.text(40, zashto, 'ЗАЩО', SANS_B, 9, C['gold'])
    ep.drawOn(d.c, 40, e_bottom)
    if rp:
        rp.drawOn(d.c, 40, e_bottom - 16 - rp.height_)


def status_correct(d, q):
    d.circle(49, 522, 24, fill=C['green_halo'])
    d.circle(49, 525, 24, fill=C['green'])
    d.line(38, 525, 46, 517, C['card'], 2.3)
    d.line(46, 517, 60, 533, C['card'], 2.3)
    d.text(86, 523.04, 'Вярно!', SERIF_B, 28, C['green'])
    d.text(87, 498.23, f"+{points_word(q['level'])} при първи опит", SANS_SB, 10.7, C['muted'])


def status_wrong(d, sub):
    d.circle(49, 522, 24, fill=C['red_halo'])
    d.circle(49, 525, 24, fill=C['red'])
    d.line(42, 532, 56, 518, C['card'], 2)
    d.line(42, 518, 56, 532, C['card'], 2)
    d.text(86, 523.04, 'Не е вярно', SERIF_B, 28, C['red'])
    d.text(87, 498.72, sub, SANS, 10.1, C['muted'])


def page_correct(d, p, q, next_key, is_last, wd):
    if q.get('steps') or q.get('_flow'):
        return solution_pages(d, p, q, next_key, is_last, wd, 'c')
    d.start(f"c{q['num']}")
    q_header(d, p, q)
    status_correct(d, q)
    answer_card(d, q, C['green'])
    d.button(24, 51, 312, 43, 'Към края на частта' if is_last else wd['next'], 'dark', link=next_key)
    d.text(180, 32.8, 'Части', SANS_SB, 10, C['muted'], align='center')
    d.link(p.get('menu', 'menu'), 130, 30, 100, 18)
    d.finish()


def page_wrong(d, p, q, next_key, is_last, wd):
    if q.get('_flow'):  # подсказка (h) -> втори опит (r) -> „Вярно от втория опит!“ (v) или решение (s)
        page_hint(d, p, q, wd)
        page_question(d, p, q, next_key, wd, second=True)
        page_second_right(d, p, q, next_key, is_last, wd)
        return solution_pages(d, p, q, next_key, is_last, wd, 's')
    if q.get('steps'):
        return solution_pages(d, p, q, next_key, is_last, wd, 'w')
    d.start(f"w{q['num']}")
    q_header(d, p, q)
    status_wrong(d, 'Прочети обяснението и опитай пак.')
    answer_card(d, q, C['red'])
    d.button(24, 73, 312, 40, 'Опитай пак', 'light', link=f"q{q['num']}")
    d.button(24, 32, 241, 31, 'Към края на частта' if is_last else wd['next'], 'dark', link=next_key)
    d.text(288.14, 44.8, 'Части', SANS_SB, 10, C['muted'])
    d.link(p.get('menu', 'menu'), 277, 32, 59, 31)
    d.finish()


# ---- Математика: подробно решение стъпка по стъпка (може да продължи на следваща страница)
CX, CW = 40, 280          # вътрешност на картата
CARD_PAD_T, CARD_PAD_B = 19, 15
P1_TOP = 482              # горен ръб на първата карта (под „Вярно!“ / „Не е вярно“)
CONT_TOP = 482            # горен ръб на картата на страница „Решение – продължение“
BOTTOM = {'c': 82, 'w': 82, 'w_multi': 130, 'more': 88}  # долен ръб на картата според бутоните отдолу
TRY_H = 36                # бутон „Опитай пак“ под подсказката


def label(d, x, y, txt, color):
    d.text(x, y, txt, SANS_B, 9, color)


def block(h, draw, gap=0, h_first=None):
    """Блок в картата с решението: gap – отстъп преди него (пада, ако е пръв на страницата);
    h_first – височина, ако е пръв (напр. без разделителна черта)."""
    return dict(h=h, draw=draw, gap=gap, h_first=h if h_first is None else h_first)


def answer_block(d, q, s, color, size):
    """„ВЕРНИЯТ ОТГОВОР  Б) …“ – на един ред с етикета, ако се побира."""
    letter = 'АБВГ'[q['correct']]
    runs = [(f'{letter}) ', SANS_B, C['ink']), (q['options'][q['correct']], SANS_SB, C['ink'])]
    lw = pdfmetrics.stringWidth('ВЕРНИЯТ ОТГОВОР', SANS_B, 9) + 10
    ap = d.rich(runs, size * s, size * s * 1.3, CW - lw)
    inline = len(ap.lines) == 1
    if not inline:
        ap = d.rich(runs, size * s, size * s * 1.3, CW)

    def draw_answer(top, first):
        if inline:
            label(d, CX, top - ap.first_base, 'ВЕРНИЯТ ОТГОВОР', color)
            ap.drawOn(d.c, CX + lw, top - ap.height_)
        else:
            label(d, CX, top - 6.6, 'ВЕРНИЯТ ОТГОВОР', color)
            ap.drawOn(d.c, CX, top - 11 - ap.height_)
    return block(ap.height_ if inline else 11 + ap.height_, draw_answer)


def why_groups(d, q, s, color):
    """Литература / език: верният отговор, „Защо“ (може да се раздели по редове) и „Преговори“."""
    groups = [[answer_block(d, q, s, color, 14.4)]]

    def draw_label(top, first):
        if not first:
            d.line(CX, top, CX + CW, top, C['line'], .6)
            top -= 14
        label(d, CX, top - 6.6, 'ЗАЩО', C['gold'])
    why_label = block(14 + 9, draw_label, gap=12, h_first=9)
    wp = d.rich(q['why'], 13.4 * s, 13.4 * s * 1.4, CW, SANS)
    lines = [wp.sub([ln]) for ln in wp.lines]

    def line_block(r, gap):
        return block(r.height_, lambda top, first, r=r: r.drawOn(d.c, CX, top - r.height_), gap=gap)
    blocks = [line_block(r, 0) for r in lines]
    blocks[0]['gap'] = 7
    # заглавието остава с първите два реда, последните два реда не се разделят
    head = [why_label] + blocks[:2]
    rest = blocks[2:]
    tail = []
    if q.get('review'):
        vp = d.rich([('Преговори: ', SANS_B, C['muted']), (q['review'], SANS_SB, C['muted'])], 11, 15, CW)
        tail = [block(vp.height_, lambda top, first: vp.drawOn(d.c, CX, top - vp.height_), gap=14)]
    if len(rest) >= 2:
        groups.append(head)
        groups.extend([b] for b in rest[:-2])
        groups.append(rest[-2:] + tail)
    else:
        groups.append(head + rest + tail)
    return groups


def solution_groups(d, q, s, color):
    """Блоковете в картата с решението, групирани така, че група не се разделя между страници."""
    if not q.get('steps'):
        return why_groups(d, q, s, color)
    letter = 'АБВГ'[q['correct']]
    groups = []

    # Верният отговор – на един ред с етикета, ако се побира
    runs = [(f'{letter}) ', SANS_B, C['ink']), (q['options'][q['correct']], SANS_SB, C['ink'])]
    lw = pdfmetrics.stringWidth('ВЕРНИЯТ ОТГОВОР', SANS_B, 9) + 10
    ap = d.rich(runs, 13.6 * s, 13.6 * s * 1.3, CW - lw)
    inline = len(ap.lines) == 1
    if not inline:
        ap = d.rich(runs, 13.6 * s, 13.6 * s * 1.3, CW)

    def draw_answer(top, first, ap=ap, inline=inline):
        if inline:
            label(d, CX, top - ap.first_base, 'ВЕРНИЯТ ОТГОВОР', color)
            ap.drawOn(d.c, CX + lw, top - ap.height_)
        else:
            label(d, CX, top - 6.6, 'ВЕРНИЯТ ОТГОВОР', color)
            ap.drawOn(d.c, CX, top - 11 - ap.height_)
    if q.get('err'):  # „Намери грешния ред“: най-горе – кой ред е грешен и как е вярно
        ep = d.rich(f'Грешката е в ред {letter}', 14 * s, 14 * s * 1.3, CW, SANS_B, C['red'])
        fp = d.rich([('Вярно е: ', SANS_B, C['green']), (q['err']['fix'], SANS_SB, C['ink'])],
                    13 * s, 13 * s * 1.32, CW)

        def draw_err(top, first):
            ep.drawOn(d.c, CX, top - ep.height_)
            fp.drawOn(d.c, CX, top - ep.height_ - 3 - fp.height_)
        groups.append([block(ep.height_ + 3 + fp.height_, draw_err)])
    else:
        groups.append([block(ap.height_ if inline else 11 + ap.height_, draw_answer)])

    def draw_sol_label(top, first):
        if not first:
            d.line(CX, top, CX + CW, top, C['line'], .6)
            top -= 13
        label(d, CX, top - 6.6, 'РЕШЕНИЕ СТЪПКА ПО СТЪПКА', C['gold'])
    sol_label = block(13 + 9, draw_sol_label, gap=10, h_first=9)

    sx, sw = CX + 24, CW - 24
    steps = []
    for k, st in enumerate(q['steps'], 1):
        dp = d.rich(st['do'], 12.2 * s, 12.2 * s * 1.3, sw, SANS_SB)
        wp = d.rich(st['why'], 11 * s, 11 * s * 1.36, sw, SANS, C['muted']) if st.get('why') else None
        h = dp.height_ + ((1.5 + wp.height_) if wp else 0)

        def draw_step(top, first, dp=dp, wp=wp, k=k):
            cy = top - dp.first_base + 4.1 * s
            d.circle(CX + 9, cy, 9, fill=C['navy'])
            d.text(CX + 9, cy - 3.3, str(k), SANS_B, 9.5, C['gold_light'], align='center')
            dp.drawOn(d.c, sx, top - dp.height_)
            if wp:
                wp.drawOn(d.c, sx, top - dp.height_ - 1.5 - wp.height_)
        steps.append(block(h, draw_step, gap=10 * s))
    steps[0]['gap'] = 8
    groups.append([sol_label, steps[0]])
    groups.extend([st] for st in steps[1:])

    # „Отговор: …“ в зелена кутийка
    rp = d.rich([('Отговор: ', SANS_B, C['green']), (q['answer'], SANS_SB, C['ink'])],
                12.2 * s, 12.2 * s * 1.3, CW - 24)

    def draw_final(top, first, rp=rp):
        h = rp.height_ + 12
        d.rrect(CX, top - h, CW, h, 8, fill=C['answer_box'])
        rp.drawOn(d.c, CX + 12, top - 6 - rp.height_)
    groups.append([block(rp.height_ + 12, draw_final, gap=12)])

    # Уловката и картата за преговор – заедно
    tail = []
    if q.get('trap'):
        tp = d.rich([('Уловката: ', SANS_B, C['trap_ink']), (q['trap'], SANS, C['ink'])],
                    11 * s, 11 * s * 1.36, CW - 26)
        th = tp.height_ + 16

        def draw_trap(top, first, tp=tp, th=th):
            d.rrect(CX, top - th, CW, th, 8, fill=C['trap_box'])
            d.rrect(CX, top - th + 8, 3, th - 16, 1.5, fill=C['gold'])
            tp.drawOn(d.c, CX + 14, top - 8 - tp.height_)
        tail.append(block(th, draw_trap, gap=9))
    if q.get('review'):
        vp = d.rich([('Преговори: ', SANS_B, C['muted']), (q['review'], SANS_SB, C['muted'])], 10.6, 14.2, CW)

        def draw_review(top, first, vp=vp):
            vp.drawOn(d.c, CX, top - vp.height_)
        tail.append(block(vp.height_, draw_review, gap=9))
    if tail:
        groups.append(tail)
    return groups


def group_h(g, first):
    h = 0
    for k, b in enumerate(g):
        f = first and k == 0
        h += b['h_first'] if f else b['h'] + b['gap']
    return h


def paginate(groups, first_top, kind):
    """-> list of pages, each a list of groups. first_top: горен ръб на картата на първата страница."""
    pages, i, top = [], 0, first_top
    while i < len(groups):
        avail_top = top - CARD_PAD_T
        rest = groups[i:]
        need = sum(group_h(g, k == 0) for k, g in enumerate(rest))
        last_bottom = BOTTOM['c'] if kind in 'cs' else (BOTTOM['w'] if not pages else BOTTOM['w_multi'])
        if avail_top - need >= last_bottom + CARD_PAD_B:
            pages.append(rest)
            return pages
        j, y = i, avail_top
        while j < len(groups) and y - group_h(groups[j], j == i) >= BOTTOM['more'] + CARD_PAD_B:
            y -= group_h(groups[j], j == i)
            j += 1
        if j == len(groups):
            j -= 1
        if j == i and pages:
            raise SystemExit('блок от решението е по-висок от страницата')
        pages.append(groups[i:j])
        i, top = j, CONT_TOP
    return pages


def hint_zone(d, q, s):
    hp = d.rich([('Подсказка: ', SANS_B, C['ink']), (q['hint'], SANS, C['ink'])], 11.6 * s, 11.6 * s * 1.36, CW)
    return hp, hp.height_ + 24


def page_hint(d, p, q, wd):
    """Една страница за трите грешни отговора: само „Не е вярно“, подсказката и два бутона."""
    math_mode = bool(q.get('steps'))
    d.start(f"h{q['num']}")
    q_header(d, p, q)
    status_wrong(d, 'Прочети подсказката.')
    hp = d.rich([('Подсказка: ', SANS_B, C['ink']), (q['hint'], SANS, C['ink'])], 13.2, 13.2 * 1.4, CW)
    hh = hp.height_ + 30
    d.card(24, P1_TOP - hh, 312, hh, fill=C['hint_box'])
    hp.drawOn(d.c, CX, P1_TOP - 15 - hp.height_)
    note = ('Реши задачата отново на лист, като използваш подсказката. Имаш още един опит.' if math_mode else
            'Прочети въпроса отново, като използваш подсказката. Имаш още един опит.')
    np_ = d.rich(note, 11.5, 16, 312, SANS, C['muted'])
    np_.drawOn(d.c, 24, P1_TOP - hh - 20 - np_.height_)
    if P1_TOP - hh - 20 - np_.height_ < 100:
        d.overflow.add(f"подсказката на {q['num']} не се побира")
    d.button(24, 38, 312, 46, 'Опитай пак', 'gold', link=f"r{q['num']}", size=13.5)
    d.finish()


def page_second_right(d, p, q, next_key, is_last, wd):
    """Вярно от втория опит: без точки; „Виж решението“ и следващата задача."""
    math_mode = bool(q.get('steps'))
    d.start(f"v{q['num']}")
    q_header(d, p, q)
    d.circle(180, 462, 34, fill=C['green_halo'])
    d.circle(180, 466, 34, fill=C['green'])
    d.line(165, 466, 176, 455, C['card'], 3)
    d.line(176, 455, 196, 477, C['card'], 3)
    title = 'Вярно от втория опит!'
    size = min(27, 300 / pdfmetrics.stringWidth(title, SERIF_B, 1))
    d.text(180, 384, title, SERIF_B, size, C['green'], align='center')
    d.text(180, 356, 'Точки се дават само при първия опит.', SANS_SB, 12.5, C['muted'], align='center')
    msg = ('Браво, че опита пак! Виж решението, за да провериш пътя си.' if math_mode else
           'Браво, че опита пак! Виж обяснението, за да провериш защо.')
    mp = d.rich(msg, 11.5, 16, 280, SANS, C['muted'])
    mp.drawOn(d.c, 40, 330 - mp.height_)
    d.button(24, 98, 312, 46, 'Виж решението' if math_mode else 'Виж обяснението', 'light',
             link=f"s{q['num']}", size=13.5)
    d.button(24, 38, 312, 46, 'Към края на частта' if is_last else wd['next'], 'dark', link=next_key, size=13.5)
    d.finish()


def solution_pages(d, p, q, next_key, is_last, wd, kind):
    """kind: c – „Вярно!“, s – неутрално „Решение“ (след подсказката), w – старата страница „Не е вярно“."""
    color = {'c': C['green'], 's': C['gold'], 'w': C['red']}[kind]
    has_hint = kind == 'w' and q.get('hint')
    best = None
    math_mode = bool(q.get('steps'))
    for s in ((1, .955, .91) if math_mode else (1, .95, .9, .85, .8)):
        groups = solution_groups(d, q, s, C['green'] if kind == 's' else color)
        top = P1_TOP
        if has_hint:
            hp, hh = hint_zone(d, q, s)
            top = P1_TOP - hh - 11 - TRY_H - 16
        pages = paginate(groups, top, kind)
        if best is None or len(pages) < len(best[2]):
            best = (s, groups, pages, top)
        if len(pages) == 1:
            break
    s, groups, pages, top = best
    if has_hint:
        hp, hh = hint_zone(d, q, s)
    base_key = f"{kind}{q['num']}"
    keys = [base_key] + [f'{base_key}_{k}' for k in range(2, len(pages) + 1)]
    q.setdefault('_pages', {})[kind] = (len(pages), s)
    for pi, pg in enumerate(pages):
        last = pi == len(pages) - 1
        d.start(keys[pi])
        q_header(d, p, q)
        if pi == 0:
            if kind == 'c':
                status_correct(d, q)
            elif kind == 's':
                d.text(24, 516, 'Решение' if math_mode else 'Обяснение', SERIF_B, 28, C['ink'])
                d.text(24, 497.5, f"{wd['Item']} {q['num']:03d}", SANS_SB, 10.2, C['muted'])
            else:
                status_wrong(d, 'Прочети подсказката и опитай пак.' if has_hint else 'Прочети решението и опитай пак.')
                if has_hint:
                    d.card(24, P1_TOP - hh, 312, hh, fill=C['hint_box'])
                    hp.drawOn(d.c, CX, P1_TOP - 12 - hp.height_)
                    d.button(24, P1_TOP - hh - 11 - TRY_H, 312, TRY_H, 'Опитай пак', 'light',
                             link=f"q{q['num']}", size=12.5)
            card_top = top
        else:
            d.text(24, 516, 'Решение – продължение' if math_mode else 'Обяснение – продължение', SERIF_B, 22, C['ink'])
            sub = {'c': ' · Вярно!', 's': '', 'w': ' · Не е вярно'}[kind]
            d.text(24, 497.5, f"{wd['Item']} {q['num']:03d}{sub}", SANS_SB, 10.2, C['muted'])
            card_top = CONT_TOP
        if pg:
            h_content = sum(group_h(g, gi == 0) for gi, g in enumerate(pg))
            card_bottom = card_top - CARD_PAD_T - h_content - CARD_PAD_B
            d.card(24, card_bottom, 312, card_top - card_bottom)
            d.rrect(24, card_top - 4, 312, 4, 2, fill=color)
            y = card_top - CARD_PAD_T
            for gi, g in enumerate(pg):
                for bi, b in enumerate(g):
                    first = gi == 0 and bi == 0
                    if not first:
                        y -= b['gap']
                    b['draw'](y, first)
                    y -= b['h_first'] if first else b['h']
        nxt_label = 'Към края на частта' if is_last else wd['next']
        if not last:
            d.button(24, 36, 312, 38, 'Решението продължава' if math_mode else 'Обяснението продължава', 'dark',
                     link=keys[pi + 1], size=12.5)
        else:
            if kind == 'w' and len(pages) > 1:
                d.button(24, 80, 312, 36, 'Опитай пак', 'light', link=f"q{q['num']}", size=12.5)
            d.button(24, 32, 241, 36, nxt_label, 'dark', link=next_key, size=12.5)
            d.text(300.5, 46.5, 'Части', SANS_SB, 10.5, C['muted'], align='center')
            d.link(p.get('menu', 'menu'), 268, 30, 68, 40)
        d.finish()


def page_part_end(d, p, nav, wd):
    """nav: ((надпис, ключ) на тъмния бутон, (надпис, ключ) на светлия бутон)."""
    d.start(f"end{p['i']}")
    c = d.c
    for pts, col in (([(160, 509), (173, 513), (172, 482), (163, 490), (154, 487)], C['ribbon_l']),
                     ([(187, 513), (200, 509), (206, 487), (197, 490), (188, 482)], C['ribbon_r'])):
        c.saveState(); c.setFillColor(col); c.setStrokeColor(col); c.setLineWidth(.7)
        path = c.beginPath(); path.moveTo(*pts[0])
        for pt in pts[1:]:
            path.lineTo(*pt)
        path.close(); c.drawPath(path, stroke=1, fill=1); c.restoreState()
    d.circle(180, 523, 33, fill=C['medal_dark'])
    d.circle(180, 525, 33, fill=C['gold_light'])
    d.circle(180, 525, 27, fill=C['medal_inner'], stroke=C['card'], lw=.5)
    d.book_icon(166, 535, 1, C['navy'])
    d.text(180, 434.12, 'Браво!', SERIF_B, 34, C['ink'], align='center')
    done = f"Завърши част {p['li']}" + (f" · {p['grade']}. клас" if p['grade'] is not None else '')
    d.text(180, 401.16, done, SANS_SB, 12, C['muted'], align='center')
    for k, ln in enumerate(wrap_words(p['title'], SANS, 12, 300)[:2]):
        d.text(180, 380.16 - 15 * k, ln, SANS, 12, C['muted'], align='center')
    d.text(180, 342.16, f"Събра до {p['max']} точки. Открий своята титла.", SANS_SB, 12, C['ink'], align='center')
    d.card(24, 127, 312, 192)
    d.rrect(33, 278, 294, 33, 7, fill=C['title_row'])
    titles = TITLES.get(p['subject'], TITLES['default'])
    for k, (name, (lo, hi)) in enumerate(zip(titles, title_bands(p['max']))):
        y = 292.59 - 36 * k
        d.text(45, y, name, SANS_SB, 12.7, C['ink'])
        d.text(316, y + .39, f'{lo}–{hi} т.', SANS_SB, 11, C['gold'] if k == 0 else C['muted'], align='right')
        if k >= 1 and k < 4:
            d.line(42, y - 14.59, 318, y - 14.59, C['line'], .4)
    d.text(180, 101.62, wd['end_note'], SANS, 9, C['muted'], align='center')
    (l1, k1), (l2, k2) = nav
    if l2 == 'Части':
        d.button(24, 37, 203, 41, l1, 'dark', link=k1)
        d.button(238, 37, 98, 41, l2, 'light', link=k2, size=12, center=True)
    else:  # „Всички предмети“ – по-широк светъл бутон
        d.button(24, 37, 184, 41, l1, 'dark', link=k1, size=12)
        d.button(216, 37, 120, 41, l2, 'light', link=k2, size=11.5, center=True)
    d.finish()


def page_final(d, sections, note, body_size=13):
    d.start('final')
    d.text(24, 550.78, 'МАЛКО ВСЕКИ ДЕН', SANS_SB, 8.8, C['gold'])
    d.text(24, 511.04, 'За родителя', SERIF_B, 28, C['ink'])
    y = 471.7
    for head, body in sections:
        d.text(24, y, head, SERIF_B, 15, C['ink'])
        p = d.para(body, SANS, body_size, body_size * 1.408, 312, C['muted'])
        top = y - 16.6
        p.drawOn(d.c, 24, top - p.height_)
        y = top - p.height_ - 32.3
    line_y = y + 32.3 - 16
    d.line(24, line_y, 336, line_y, C['line'], .6)
    p = d.para(note, SANS, 9, 12.5, 312, C['muted'])
    p.drawOn(d.c, 24, line_y - 14 - p.height_)
    if line_y - 14 - p.height_ < 92:
        d.overflow.add('последната страница не се побира')
    d.button(24, 37, 312, 42, 'Към частите', 'dark', link='menu')
    d.finish()


# ---------------------------------------------------------------- texts
def wrap_words(text, font, size, width, glue=False):
    """glue: еднобуквена дума („и“, „в“…) не остава в края на реда."""
    lines = []
    for w in text.split():
        if lines and pdfmetrics.stringWidth(lines[-1] + ' ' + w, font, size) <= width:
            lines[-1] += ' ' + w
        else:
            if glue and lines and ' ' in lines[-1] and lines[-1].rsplit(' ', 1)[1] in GLUE_AFTER:
                head, tail = lines[-1].rsplit(' ', 1)
                lines[-1] = head
                w = tail + ' ' + w
            lines.append(w)
    return lines


def texts(content, parts, total):
    """Всички текстове на началните и крайната страница според предмета."""
    subjects = {p['subject'] for p in parts}
    by_grade = {}
    for p in parts:
        if p['grade'] is not None:
            by_grade.setdefault(p['grade'], []).append(p['i'])
    rng = lambda xs: f'{xs[0]}–{xs[-1]}' if len(xs) > 1 else str(xs[0])
    gl = [f'{g}. клас: части {rng(v)}' for g, v in sorted(by_grade.items())]
    grade_txt = ' · '.join(gl[:2]) + ('\n' + ' · '.join(gl[2:]) if len(gl) > 2 else '')
    if subjects == {'Математика'}:
        wd = WORDS['math']
        return dict(
            wd=wd, title=f'{total} задачи по математика – интерактивен PDF | Еду БЕЛ', label=f'{total} ЗАДАЧИ',
            cover_sub=['по математика'], book=['МАТЕМАТИКА'],
            parent=[
                (1, 'Запазете файла', 'Изпратете го на телефона или таблета на детето и го запазете. След това може да се използва и без интернет.', 12.4),
                (2, 'Отворете като PDF', 'Ако бутоните не реагират в чата, отворете файла с PDF четец, например Adobe Acrobat Reader.', 12.4),
                (3, 'Изберете подходящия клас', f'{grade_txt}. Точките и титлата се броят отделно за всяка част. Задачите са полезни и за НВО.', 12.0),
                (4, 'Дайте лист и молив', 'Детето решава на лист и после избира отговор. При грешка вижда подсказка и опитва пак; след втора грешка вижда решението.', 12.4),
            ],
            howto=[
                (1, 'Избери част', 'Намери своя клас и натисни „Започни“. „Части“ връща менюто.', 12.0),
                (2, 'Реши на лист', 'Първо реши задачата на лист. После докосни отговора, който получи.', 12.0),
                ('callout', 'ТОЧКИ САМО ПРИ ПЪРВИ ОПИТ', 'Запиши си 1, 2 или 3 точки само ако отговориш вярно от първия път. Точките и титлата се броят отделно за всяка част.', 11.6),
                (3, 'Сгреши ли – имаш втори опит', 'Прочети подсказката и натисни „Опитай пак“. След втора грешка ще видиш решението стъпка по стъпка.', 12.0),
                (4, 'Преговори с картите', 'Всяка задача сочи карта от кутията „Еду БЕЛ – Математика“. В края на частта виж титлата си.', 12.0),
            ],
            howto_gap=27,
            final=[
                ('Навик, който помага', 'По 5–10 задачи на ден са достатъчни. Нека детето решава на лист, а след грешка прочетете заедно решението и уловката.'),
                ('Какво включва материалът', f'{total} задачи по математика за 5., 6. и 7. клас, от лесни към трудни. Всяка има подсказка, решение стъпка по стъпка и уловка. Полезни са и за подготовката за НВО.'),
                ('Картите на Еду Бел', 'Под всяко решение пише коя карта от кутията „Еду БЕЛ – Математика“ да прегледате. Още материали ще намерите на edubel.bg.'),
            ],
            final_size=12.4,
            note='Подарък за лична употреба в семейството. Копирането на задачите в други материали, сайтове и приложения и препродажбата са забранени.',
        )
    if content.get('parts') and len(subjects) > 1:
        return texts_combined(content, parts, total, by_grade)
    if content.get('parts') and subjects <= set(SUBJECT_WORD):
        return texts_bel_parts(content, parts, total, subjects, by_grade, grade_txt)
    wd = WORDS['bel']
    has_math = 'Математика' in subjects
    if has_math:
        step3 = f'{grade_txt}. Материалът е за преговор по БЕЛ и математика в 5.–7. клас и включва задачи, полезни за подготовката за НВО.'
        cover_sub = ['по български език,', 'литература и математика']
        book = ['БЕЛ И МАТЕМАТИКА']
        n_bel = sum(len(p['qs']) for p in parts if p['subject'] != 'Математика')
        n_math = total - n_bel
        includes = (f'{total} въпроса за 5., 6. и 7. клас – {n_bel} по български език и литература и {n_math} '
                    'по математика, от лесни към трудни. Материалът е за преговор и включва задачи, полезни за '
                    'подготовката за НВО.')
    else:
        step3 = f'{grade_txt}. Материалът е за преговор по БЕЛ в 5.–7. клас и включва задачи, полезни за подготовката за НВО.'
        cover_sub = ['по български език', 'и литература']
        book = ['БЪЛГАРСКИ ЕЗИК', 'И ЛИТЕРАТУРА']
        includes = (f'{total} въпроса по български език и литература за 5., 6. и 7. клас, от лесни към трудни. '
                    'Материалът е за преговор по БЕЛ в 5.–7. клас и включва задачи, полезни за подготовката за НВО.')
    return dict(
        wd=wd, title=f'{total} въпроса – интерактивен PDF | Еду БЕЛ', label=f'{total} ВЪПРОСА',
        cover_sub=cover_sub, book=book,
        parent=[
            (1, 'Запазете файла', 'Изпратете го на телефона или таблета на детето и го запазете. След това може да се използва и без интернет.', 12.4),
            (2, 'Отворете като PDF', 'Ако бутоните не реагират в чата, отворете файла с PDF четец, например Adobe Acrobat Reader.', 12.4),
            (3, 'Изберете подходящия клас', step3, 12.0),
            (4, 'Отделяйте по 10 минути', 'Около 10 въпроса на ден са достатъчни. Обсъдете грешките и прочетете обясненията заедно.', 12.4),
        ],
        howto=[
            (1, 'Избери част', 'Намери своя клас и натисни „Започни“.', 12.3),
            (2, 'Прочети и отговори', 'Докосни отговора, който смяташ за верен. После прочети обяснението.', 12.3),
            ('callout', 'ТОЧКИ САМО ПРИ ПЪРВИ ОПИТ', 'Запиши си 1, 2 или 3 точки само ако отговориш вярно от първия път. При „Опитай пак“ упражняваш знанията си, без нови точки. PDF файлът не ги брои автоматично.', 11.8),
            (3, 'Продължи напред', '„Части“ връща менюто. „Пропусни“ и „Следващ въпрос“ продължават напред.', 12.3),
            (4, 'Виж своята титла', 'В края събери точките от първите си верни отговори и намери резултата си.', 12.3),
        ],
        howto_gap=34,
        final=[
            ('Навик, който помага', 'По 10 въпроса на ден са достатъчни. След грешен отговор обсъдете обяснението и се върнете към посочената тема.'),
            ('Какво включва материалът', includes),
            ('Еду Бел', 'Материали по български език и литература за 5.–7. клас. Още възможности за преговор ще намерите на edubel.bg.'),
        ],
        final_size=13,
        note='Подарък за лична употреба в семейството. Копирането на въпросите в други материали, сайтове и приложения и препродажбата са забранени.',
    )


def texts_bel_parts(content, parts, total, subjects, by_grade, grade_txt):
    """„200 въпроса по литература“ / „… по български език“ – части по теми, обяснение „Защо“."""
    wd = WORDS['bel']
    if len(subjects) == 1:
        subj = next(iter(subjects))
        sub_word = SUBJECT_WORD[subj]
        book = [subj.upper()]
    else:
        sub_word = 'български език и литература'
        book = ['БЪЛГАРСКИ ЕЗИК', 'И ЛИТЕРАТУРА']
    title = content.get('title') or f'{total} въпроса по {sub_word}'
    m = re.match(rf'\s*{total}\s+въпроса\s+(.+)$', title)
    cover_sub = wrap_words(m.group(1) if m else f'по {sub_word}', SANS, 17, 300)
    cards = f"картите „{content['cards']}“" if content.get('cards') else f'картите на Еду БЕЛ по {sub_word}'
    grades = sorted(by_grade) or sorted({q['grade'] for q in content['questions'] if q.get('grade')})
    if content.get('eyebrow'):
        eyebrow = content['eyebrow']
    elif grades:
        eyebrow = 'ИНТЕРАКТИВЕН ПРЕГОВОР · ' + (f'{grades[0]}.–{grades[-1]}. КЛАС' if len(grades) > 1 else f'{grades[0]}. КЛАС')
    else:
        eyebrow = f'ИНТЕРАКТИВЕН ПРЕГОВОР · {sub_word.upper()}'
    if by_grade:
        step3 = ('Изберете подходящия клас', f'{grade_txt}. Точките и титлата се броят отделно за всяка част.')
        pick = 'Намери своя клас и натисни „Започни“. „Части“ връща менюто.'
    else:
        step3 = ('Изберете част', f'Материалът има {len(parts)} части – всяка е отделна тема. Започнете с темата, '
                                  'която детето учи сега. Точките и титлата се броят отделно за всяка част.')
        pick = 'Избери тема и натисни „Започни“. „Части“ връща менюто.'
    return dict(
        wd=wd, title=f'{title} – интерактивен PDF | Еду БЕЛ', label=f'{total} ВЪПРОСА',
        cover_sub=cover_sub, book=book, eyebrow=eyebrow, book_grades=bool(grades),
        parent=[
            (1, 'Запазете файла', 'Изпратете го на телефона или таблета на детето и го запазете. След това може да се използва и без интернет.', 12.4),
            (2, 'Отворете като PDF', 'Ако бутоните не реагират в чата, отворете файла с PDF четец, например Adobe Acrobat Reader.', 12.4),
            (3, step3[0], step3[1], 12.0),
            (4, 'Отделяйте по 10 минути', 'Около 10 въпроса на ден са достатъчни. При грешка детето вижда подсказка и опитва пак; след втора грешка – обяснението.', 12.4),
        ],
        howto=[
            (1, 'Избери част', pick, 12.0),
            (2, 'Прочети и отговори', 'Прочети въпроса и откъса, ако има такъв. Докосни отговора, който смяташ за верен.', 12.0),
            ('callout', 'ТОЧКИ САМО ПРИ ПЪРВИ ОПИТ', 'Запиши си 1, 2 или 3 точки само ако отговориш вярно от първия път. Точките и титлата се броят отделно за всяка част.', 11.6),
            (3, 'Сгреши ли – имаш втори опит', 'Прочети подсказката и натисни „Опитай пак“. След втора грешка ще видиш обяснението „Защо“.', 12.0),
            (4, 'Преговори с картите', f'Под всяко обяснение пише коя от {cards} да прегледаш. В края събери точките и виж титлата си.', 12.0),
        ],
        howto_gap=27,
        final=[
            ('Навик, който помага', 'По 10 въпроса на ден са достатъчни. След грешка прочетете заедно подсказката и обяснението „Защо“.'),
            ('Какво включва материалът', f'{total} въпроса по {sub_word} в {len(parts)} части, от лесни към трудни. Всеки въпрос има подсказка, обяснение „Защо“ и тема за преговор.'),
            ('Картите на Еду Бел', f'Под всяко обяснение пише коя от {cards} да прегледате. Още материали ще намерите на edubel.bg.'),
        ],
        final_size=12.4,
        note='Подарък за лична употреба в семейството. Копирането на въпросите в други материали, сайтове и приложения и препродажбата са забранени.',
    )


def texts_combined(content, parts, total, by_grade):
    """Една книга с няколко предмета (напр. „600 въпроса и задачи“): общи начални и крайна страница."""
    subjects = list(dict.fromkeys(p['subject'] for p in parts))
    title = content.get('title') or f'{total} въпроса и задачи'
    m = re.match(rf'\s*{total}\s+(.+)$', title)
    cover_word = m.group(1) if m else 'въпроса и задачи'
    names = {'Математика': 'математика', 'Литература': 'литература', 'Български език': 'български език'}
    subj_txt = ', '.join(names.get(x, x.lower()) for x in subjects[:-1]) + ' и ' + names.get(subjects[-1], subjects[-1].lower())
    math_parts = [p for p in parts if p['subject'] == 'Математика']
    grade_line = ''
    if math_parts and by_grade:
        mg = {}
        for p in math_parts:
            mg.setdefault(p['grade'], []).append(p['li'])
        grade_line = 'Математика: ' + ', '.join(f'{g}. клас – части {v[0]}–{v[-1]}' if len(v) > 1 else f'{g}. клас – част {v[0]}'
                                                 for g, v in sorted(mg.items())) + '. '
    others = [x for x in subjects if x != 'Математика']
    other_txt = ''
    if others:
        other_txt = (' и '.join(names.get(x, x) for x in others)).capitalize() + ' – части по теми. '
    counts = []
    for x in subjects:
        n = sum(len(p['qs']) for p in parts if p['subject'] == x)
        counts.append(f"{n} по {names.get(x, x)}")
    grades = sorted(by_grade)
    eyebrow = content.get('eyebrow') or ('ИНТЕРАКТИВЕН ПРЕГОВОР · ' + (f'{grades[0]}.–{grades[-1]}. КЛАС' if len(grades) > 1 else
                                                                     f'{grades[0]}. КЛАС' if grades else 'ТРИ ПРЕДМЕТА'))
    return dict(
        wd=WORDS['bel'], title=f'{title} – интерактивен PDF | Еду БЕЛ', label=title.upper(),
        cover_word=cover_word, cover_sub=wrap_words(f'по {subj_txt}', SANS, 17, 300, glue=True),
        book=['МАТЕМАТИКА И БЕЛ'] if len(subjects) == 3 else [x.upper() for x in subjects],
        tagline='Избери. Отговори. Разбери защо.', eyebrow=eyebrow, book_grades=bool(grades),
        parent=[
            (1, 'Запазете файла', 'Изпратете го на телефона или таблета на детето и го запазете. След това може да се използва и без интернет.', 12.4),
            (2, 'Отворете като PDF', 'Ако бутоните не реагират в чата, отворете файла с PDF четец, например Adobe Acrobat Reader.', 12.4),
            (3, 'Изберете предмет и част', f'{grade_line}{other_txt}Точките и титлата се броят отделно за всяка част.', 12.0),
            (4, 'Отделяйте по 10 минути', 'По 5–10 задачи или въпроса на ден са достатъчни. При грешка детето опитва пак; след втора грешка вижда решението или обяснението.', 12.0),
        ],
        howto=[
            (1, 'Избери предмет и част', 'Натисни „Започни“. „Части“ връща менюто на предмета.', 12.0),
            (2, 'Реши или отговори', 'По математика първо реши задачата на лист. После докосни своя отговор.', 12.0),
            ('callout', 'ТОЧКИ САМО ПРИ ПЪРВИ ОПИТ', 'Запиши си 1, 2 или 3 точки само ако отговориш вярно от първия път. Точките и титлата се броят отделно за всяка част.', 11.6),
            (3, 'Сгреши ли – имаш втори опит', 'Прочети подсказката и натисни „Опитай пак“. След втора грешка ще видиш решението или обяснението.', 12.0),
            (4, 'Преговори с картите', 'Под всяко решение и обяснение пише коя карта да прегледаш. В края на частта виж титлата си.', 12.0),
        ],
        howto_gap=27,
        final=[
            ('Навик, който помага', 'По 5–10 задачи или въпроса на ден са достатъчни. След грешка прочетете заедно подсказката и решението или обяснението.'),
            ('Какво включва материалът', f'{total} {cover_word} за 5.–7. клас – {", ".join(counts[:-1])} и {counts[-1]}, от лесни към трудни. Всеки има подсказка и решение или обяснение.'),
            ('Картите на Еду Бел', 'Под всяко решение и обяснение пише коя карта за преговор да прегледате. Още материали ще намерите на edubel.bg.'),
        ],
        final_size=12.4,
        note='Подарък за лична употреба в семейството. Копирането на въпросите и задачите в други материали, сайтове и приложения и препродажбата са забранени.',
    )


# ---------------------------------------------------------------- main
NEXT_SUBJECT = {'Математика': 'Към математиката', 'Литература': 'Към литературата', 'Български език': 'Към българския език'}


def render(path, content, parts, cmaps, total_pages):
    total = len(content['questions'])
    t = texts(content, parts, total)
    wd = t['wd']
    d = Doc(path, t['title'], t['label'], cmaps)
    d.total_pages = total_pages
    page_cover(d, total, t.get('cover_word', wd['cover']), t['cover_sub'], t['book'], t.get('tagline', wd['tagline']),
               **{k: t[k] for k in ('eyebrow', 'book_grades') if k in t})
    page_parent(d, t['parent'])
    page_howto(d, t['howto'], t['howto_gap'])
    multi = any('menu' in p for p in parts)
    groups = []
    if multi:  # главно меню; менюто на всеки предмет стои пред неговите части
        for p in parts:
            if not groups or groups[-1]['subject'] != p['subject']:
                groups.append(dict(subject=p['subject'], key=p['menu'], wd=p['wd'], parts=[]))
            groups[-1]['parts'].append(p)
        page_main_menu(d, groups)
    else:
        page_menu(d, parts, wd)
    for idx, p in enumerate(parts):
        pw = p.get('wd', wd)
        if multi and p['li'] == 1:
            page_menu(d, [x for x in parts if x['subject'] == p['subject']], pw, key=p['menu'], subject=p['subject'])
        page_part_intro(d, p, len(parts), pw)
        for j, q in enumerate(p['qs']):
            last = j == len(p['qs']) - 1
            nxt = f"end{p['i']}" if last else f"q{q['num'] + 1}"
            page_question(d, p, q, nxt, pw)
            page_correct(d, p, q, nxt, last, pw)
            page_wrong(d, p, q, nxt, last, pw)
        nxt_part = parts[idx + 1] if idx + 1 < len(parts) else None
        if not multi:
            first = (f"Към част {p['i'] + 1}", f"part{p['i'] + 1}") if nxt_part else ('За родителя', 'final')
            nav = (first, ('Части', 'menu'))
        elif nxt_part and nxt_part['subject'] == p['subject']:
            nav = ((f"Към част {nxt_part['li']}", f"part{nxt_part['i']}"), ('Части', p['menu']))
        elif nxt_part:  # краят на предмета – следващият предмет и главното меню
            nav = ((NEXT_SUBJECT.get(nxt_part['subject'], f"Към {nxt_part['subject']}"), nxt_part['menu']),
                   ('Всички предмети', 'menu'))
        else:
            nav = (('За родителя', 'final'), ('Всички предмети', 'menu'))
        page_part_end(d, p, nav, pw)
    page_final(d, t['final'], t['note'], t['final_size'])
    return d, t


def build(content, out, fonts_dir, encrypt=True, draft=False):
    cmaps = load_fonts(fonts_dir)
    parts = build_parts(content)
    # първо пускане без запис – само за да се преброят страниците (решенията може да заемат по няколко)
    dry, _ = render(io.BytesIO(), content, parts, cmaps, 0)
    if dry.overflow:
        for o in sorted(dry.overflow):
            print('ПРЕЛИВА', o, file=sys.stderr)
        if not draft:
            raise SystemExit('има текст, който не се побира')
    if dry.missing:
        for m in sorted(dry.missing)[:30]:
            print('ЛИПСВА ЗНАК', m, file=sys.stderr)
        raise SystemExit('има знаци, които ги няма в шрифтовете')
    total_pages = dry.page_no
    tmp = out + '.tmp'
    d, t = render(tmp, content, parts, cmaps, total_pages)
    assert d.page_no == total_pages, (d.page_no, total_pages)
    assert len(set(d.keys)) == len(d.keys), 'повтарящ се ключ на страница'
    d.c.save()
    title = t['title']
    if encrypt:
        # AES-256, само печат – без копиране и промени (като предишния подаръчен файл).
        from pypdf import PdfReader, PdfWriter
        from pypdf.constants import UserAccessPermissions as P
        sys.setrecursionlimit(20000)  # връзките между страниците правят дълбоко дърво при копиране
        w = PdfWriter(clone_from=PdfReader(tmp))
        w.add_metadata({'/Title': title, '/Author': 'Еду БЕЛ', '/Producer': 'Еду БЕЛ', '/Creator': 'Еду БЕЛ'})
        w.encrypt(user_password='', owner_password=secrets.token_hex(16),
                  permissions_flag=P.PRINT | P.PRINT_TO_REPRESENTATION, algorithm='AES-256')
        with open(out, 'wb') as f:
            w.write(f)
        os.remove(tmp)
    else:
        os.replace(tmp, out)
    return parts, total_pages, d


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('content')
    ap.add_argument('out')
    ap.add_argument('--fonts', default=os.path.join(os.path.dirname(os.path.abspath(__file__)), '.fonts'))
    ap.add_argument('--no-encrypt', action='store_true')
    ap.add_argument('--draft', action='store_true', help='не спирай при преливане (само за преглед)')
    ap.add_argument('--keys', help='запиши ключа на всяка страница (JSON) – за проверка на връзките')
    a = ap.parse_args()
    content = json.load(open(a.content, encoding='utf-8'))
    parts, pages, d = build(content, a.out, a.fonts, encrypt=not a.no_encrypt, draft=a.draft)
    if a.keys:
        json.dump(d.keys, open(a.keys, 'w'))
    n = sum(len(p['qs']) for p in parts)
    print(f'{a.out}: {pages} страници, {len(parts)} части, {n} задачи/въпроса')
