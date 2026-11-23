#!/usr/bin/env python3
"""Интерактивен PDF „N въпроса“ на Еду Бел (телефонен формат, бутони с вътрешни връзки).

    python3 build_quiz_pdf.py <content.json> <out.pdf> [--fonts DIR] [--no-encrypt]

content.json: {"questions": [{"grade": 5, "subject": "Литература" | "Български език" | "Математика",
  "level": 1|2|3, "q": "...", "passage": ["ред", ...] | null, "passage_style": "italic"|"plain",
  "options": ["А", "Б", "В", "Г"], "correct": 0..3, "why": "...", "review": "..."}, ...]}

Съдържанието (въпросите) не е в git – пази се отделно (private/quiz/). Шрифтовете (Open Sans,
Noto Serif, OFL) се свалят от Google Fonts при първо пускане, ако ги няма в --fonts.
Нужно е: pip install reportlab pypdf cryptography
"""
import argparse, json, math, os, secrets, sys, urllib.request
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
}
FONTS = {  # name in PDF -> file
    'NotoSerif-Bold': 'NotoSerif-Bold.ttf', 'NotoSerif-Regular': 'NotoSerif-Regular.ttf',
    'NotoSerif-Italic': 'NotoSerif-Italic.ttf', 'OpenSans': 'OpenSans-Regular.ttf',
    'OpenSans-Semibold': 'OpenSans-Semibold.ttf', 'OpenSans-Bold': 'OpenSans-Bold.ttf',
}
SERIF_B, SERIF, SERIF_I = 'NotoSerif-Bold', 'NotoSerif-Regular', 'NotoSerif-Italic'
SANS, SANS_SB, SANS_B = 'OpenSans', 'OpenSans-Semibold', 'OpenSans-Bold'

C = {k: HexColor(v) for k, v in dict(
    bg='#f5f1e8', ink='#172e42', navy='#14293e', navy_lip='#0c1d2e', muted='#647581', line='#e1dcd1',
    gold='#b98d4f', gold_light='#ead5ac', gold_lip='#aa8048', card='#fffefb', card_lip='#dad4c8',
    light_lip='#d5d0c5', green='#286658', green_halo='#c7d5ca', red='#a6534f', red_halo='#e6c8bf',
    passage='#eee7d9', callout='#ebe4d3', chip='#e8e1d5', dark_card='#203a4e', dark_card_line='#38566b',
    dot_off='#4a6273', dark_text='#b7c9d3', cover_text='#d8e3e9', cover_note='#aabcc7',
    dark_footer='#9dadb7', dark_footer_line='#385164', shadow_text='#0b1a2a', medal_dark='#9e793d',
    medal_inner='#cfad70', ribbon_l='#9c7240', ribbon_r='#b58b50', title_row='#ece2cc',
).items()}
GRAD = (HexColor('#0e2033'), HexColor('#28465a'))
SUBJECT_COLOR = {'Литература': HexColor('#a77e47'), 'Български език': HexColor('#3d777a'),
                 'Математика': HexColor('#6b5e98')}
LEVELS = {1: ('Знам', '1 т.', HexColor('#e6ece5')), 2: ('Разбирам', '2 т.', HexColor('#e1ebe9')),
          3: ('Мисля', '3 т.', HexColor('#eae3d8'))}
TITLES = {
    'default': ['Будител', 'Майстор на словото', 'Летописец', 'Книжовник', 'Четец'],
    'Математика': ['Архимед', 'Майстор на числата', 'Откривател', 'Изчислител', 'Чирак'],
}
NUM_WORDS = {6: 'ШЕСТ', 7: 'СЕДЕМ', 8: 'ОСЕМ', 9: 'ДЕВЕТ', 10: 'ДЕСЕТ', 12: 'ДВАНАДЕСЕТ'}
SUBJECT_ORDER = ['Литература', 'Български език', 'Математика']


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
        self.text(24, 11.42, '© Еду Бел · edubel.site', SANS, 6.8, col)
        self.text(336, 11.42, f'{self.page_no:03d} / {self.total_pages:03d}', SANS, 6.8, col, align='right')
        self.c.showPage()


# ---------------------------------------------------------------- content model
def build_parts(questions):
    groups = {}
    for q in questions:
        groups.setdefault((q['grade'], q['subject']), []).append(q)
    keys = sorted(groups, key=lambda k: (k[0], SUBJECT_ORDER.index(k[1])))
    parts, n = [], 0
    for i, k in enumerate(keys, 1):
        qs = groups[k]
        for j, q in enumerate(qs):
            n += 1
            q['num'] = n
            q['pos'] = j + 1
        parts.append({'i': i, 'grade': k[0], 'subject': k[1], 'qs': qs,
                      'max': sum(q['level'] for q in qs), 'first': qs[0]['num'], 'last': qs[-1]['num']})
    return parts


def title_bands(mx):
    b = [math.ceil(mx * .9), math.ceil(mx * .75), math.ceil(mx * .6), math.ceil(mx * .4)]
    return [(b[0], mx), (b[1], b[0] - 1), (b[2], b[1] - 1), (b[3], b[2] - 1), (0, b[3] - 1)]


# ---------------------------------------------------------------- pages
def page_cover(d, total_q, subtitle_lines, book_lines):
    d.start('cover', dark=True)
    d.text(24, 547.62, 'ИНТЕРАКТИВЕН ПРЕГОВОР · 5.–7. КЛАС', SANS_SB, 9, C['gold_light'])
    d.text(24, 437.98, str(total_q), SERIF_B, 111, C['shadow_text'])
    d.text(21, 441.98, str(total_q), SERIF_B, 111, C['gold_light'])
    d.text(25, 384.02, 'въпроса', SERIF, 39, C['card'])
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
        if label != '7':
            d.text(lpos[0], lpos[1], label, SANS_SB, 9, lc)
    c.saveState()
    c.transform(1, .215, -.88, .37, -69, 612)
    d.text(6, 1, 'Еду Бел', SERIF_B, 23, C['gold_light'])
    yy = -17
    for ln in book_lines:
        d.text(6, yy, ln, SANS, 9, C['gold_light'])
        yy -= 14
    c.restoreState()
    d.text(-75, 597.62, '7', SANS_SB, 9, C['card'])
    c.restoreState()
    d.text(180, 138.16, 'Избери. Отговори. Разбери защо.', SANS, 12, C['cover_text'], align='center')
    d.button(24, 60, 312, 48, 'Започни', 'gold', link='parent')
    d.text(180, 40.03, 'Работи и без интернет · подарък от Еду Бел', SANS, 8.5, C['cover_note'], align='center')
    d.finish()


def steps_block(d, steps, y_top):
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
            cy = top - h - 34
            continue
        num, heading, body, size = st
        d.circle(38, cy, 14, fill=C['navy'])
        d.text(38, cy - 3.66, str(num), SANS_SB, 13, C['gold_light'], align='center')
        d.text(61, cy + 2.34, heading, SANS_SB, 13, C['ink'])
        p = d.para(body, SANS, size, size * 1.4, 275, C['muted'])
        p.drawOn(d.c, 61, cy - 8 - p.height_)
        cy = cy - 8 - p.height_ - 34
    return cy


def page_parent(d, step3):
    d.start('parent')
    d.text(24, 550.78, 'НАЧАЛО · 01 / 02', SANS_SB, 8.8, C['gold'])
    d.text(24, 511.04, 'За родителя', SERIF_B, 28, C['ink'])
    steps_block(d, [
        (1, 'Запазете файла', 'Изпратете го на телефона или таблета на детето и го запазете. След това може да се използва и без интернет.', 12.4),
        (2, 'Отворете като PDF', 'Ако бутоните не реагират в чата, отворете файла с PDF четец, например Adobe Acrobat Reader.', 12.4),
        (3, 'Изберете подходящия клас', step3, 12.0),
        (4, 'Отделяйте по 10 минути', 'Около 10 въпроса на ден са достатъчни. Обсъдете грешките и прочетете обясненията заедно.', 12.4),
    ], 468)
    d.button(24, 37, 312, 42, 'Как се играе', 'dark', link='howto')
    d.finish()


def page_howto(d):
    d.start('howto')
    d.text(24, 550.78, 'НАЧАЛО · 02 / 02', SANS_SB, 8.8, C['gold'])
    d.text(24, 511.04, 'Как се играе', SERIF_B, 28, C['ink'])
    steps_block(d, [
        (1, 'Избери част', 'Намери своя клас и натисни „Започни“.', 12.3),
        (2, 'Прочети и отговори', 'Докосни отговора, който смяташ за верен. После прочети обяснението.', 12.3),
        ('callout', 'ТОЧКИ САМО ПРИ ПЪРВИ ОПИТ', 'Запиши си 1, 2 или 3 точки само ако отговориш вярно от първия път. При „Опитай пак“ упражняваш знанията си, без нови точки. PDF файлът не ги брои автоматично.', 11.8),
        (3, 'Продължи напред', '„Части“ връща менюто. „Пропусни“ и „Следващ въпрос“ продължават напред.', 12.3),
        (4, 'Виж своята титла', 'В края събери точките от първите си верни отговори и намери резултата си.', 12.3),
    ], 477)
    d.button(24, 37, 312, 42, 'Към частите', 'dark', link='menu')
    d.finish()


def q_word(n):
    return f'{n} въпрос' if n == 1 else f'{n} въпроса'


def page_menu(d, parts):
    d.start('menu')
    d.text(24, 550.78, f'{NUM_WORDS.get(len(parts), str(len(parts)))} ЧАСТИ · ЕДНА СТЪПКА НАПРЕД', SANS_SB, 8.8, C['gold'])
    d.text(24, 511.04, 'Избери част', SERIF_B, 28, C['ink'])
    d.text(24, 479, 'Започни със своя клас. Учи в собствено темпо.', SANS, 12, C['muted'])
    many = len(parts) > 6
    h, gap, ggap = (35, 5, 13) if many else (47, 9, 9)
    y = 462 if many else 450
    prev_grade = None
    for p in parts:
        if prev_grade is not None and p['grade'] != prev_grade:
            y -= ggap - gap
        prev_grade = p['grade']
        top = y
        by = top - h
        col = SUBJECT_COLOR[p['subject']]
        d.card(24, by, 312, h)
        d.rrect(24, by, 4, h, 2, fill=col)
        cy = by + h / 2
        if many:
            d.text(43, cy - 5.6, f"{p['i']:02d}", SERIF_B, 16, col)
            d.text(80, cy + 1.6, f"{p['grade']}. клас · {p['subject']}", SANS_SB, 11.6, C['ink'])
            d.text(80, cy - 10.6, f"{q_word(len(p['qs']))} · до {p['max']} точки", SANS, 8.4, C['muted'])
        else:
            d.text(43, cy - 5.08, f"{p['i']:02d}", SERIF_B, 19, col)
            d.text(83, cy + 4.5, f"{p['grade']}. клас · {p['subject']}", SANS_SB, 12.2, C['ink'])
            d.text(83, cy - 12.88, f"{q_word(len(p['qs']))} · до {p['max']} точки", SANS, 9, C['muted'])
        d.arrow(320, cy, C['ink'])
        d.link(f"part{p['i']}", 24, by, 312, h)
        y = by - gap
    if not many:
        for x, w, lv in ((24, 90, 1), (122, 112, 2), (242, 94, 3)):
            d.rrect(x, 82, w, 22, 11, fill=C['chip'])
            d.text(x + w / 2, 91.19, f'{LEVELS[lv][0]} · {LEVELS[lv][1]}', SANS_SB, 8.3, C['ink'], align='center')
    d.button(24, 37, 312, 30, 'Инструкции', 'light', link='parent', center=True)
    d.finish()


def page_part_intro(d, p, nparts):
    d.start(f"part{p['i']}", dark=True)
    d.text(24, 540.8, f"ЧАСТ {p['i']:02d} / {nparts:02d}", SANS_SB, 10, C['gold_light'])
    d.text(247.21, 407.88, str(p['i']), SERIF_B, 166, C['card'], alpha=.075)
    d.text(24, 460.64, f"{p['grade']}. клас", SERIF, 48, C['card'])
    size = 28 if pdfmetrics.stringWidth(p['subject'], SERIF_B, 28) < 200 else 26
    d.text(26, 410.04 if size == 28 else 411.7, p['subject'], SERIF_B, size, C['card'])
    d.line(26, 380, 73, 380, C['gold_light'], 2)
    n = len(p['qs'])
    d.text(26, 345.7, f"{q_word(n)} · до {p['max']} точки", SANS_SB, 15, C['gold_light'])
    d.text(26, 321.98, f"Въпроси {p['first']}–{p['last']} · около {round(n * 35 / 33 / 5) * 5} минути", SANS, 11, C['dark_text'])
    d.card(24, 153, 312, 132, fill=C['dark_card'], border=C['dark_card_line'])
    for k, lv in enumerate((1, 2, 3)):
        cy = 260 - 34 * k
        for j in range(3):
            d.circle(43 + 11 * j, cy, 2.7, fill=C['gold_light'] if j < lv else C['dot_off'])
        d.text(87, cy - 3.66, LEVELS[lv][0], SANS_SB, 13, C['card'])
        d.text(316, cy - 4.02, points_word(lv), SANS, 11, C['gold_light'], align='right')
    pp = d.para('Записвай точки само за верен отговор от първия опит. В края ще откриеш своята титла.',
                SANS, 11, 15.4, 310, C['dark_text'])
    pp.drawOn(d.c, 26, 135 - pp.height_)
    d.button(24, 40, 196, 43, 'Започни', 'gold', link=f"q{p['first']}")
    d.button(231, 40, 105, 43, 'Части', 'light', link='menu', size=12, center=True)
    d.finish()


def q_header(d, p, q):
    d.text(24, 577.21, f"{p['grade']}. клас · {p['subject']}", SANS_SB, 9.5, C['muted'])
    n = len(p['qs'])
    d.text(336, 577.21, f"{q['pos']:02d} / {n:02d}", SANS_SB, 9.5, C['muted'], align='right')
    d.rrect(24, 563.5, 312, 2.5, 1, fill=C['line'])
    d.rrect(24, 563.5, 312 * q['pos'] / n, 2.5, 1, fill=SUBJECT_COLOR[p['subject']])


def layout_question(d, q):
    """Choose scale so that question, passage and options fit. Returns drawing plan."""
    style = q.get('passage_style', 'italic')
    pfont = {'italic': SERIF_I, 'plain': SANS, 'formula': SANS}[style]
    for s in (1, .95, .9, .85, .8, .75, .7):
        for min_h in ((52, 48, 43) if s == 1 else (43,)):
            qs = 16.6 * s
            qp = d.para(q['q'], SANS_SB, qs, qs * 1.32, 312, C['ink'])
            y = 495 - qp.height_
            plan = {'qp': (qp, 495 - qp.height_)}
            if q.get('passage'):
                if style == 'formula':
                    ps = 19 * s
                    pp = d.para('\n'.join(q['passage']), pfont, ps, ps * 1.35, 280, C['ink'], align=1)
                    pp.pad_ = 16
                else:
                    ps = 13.5 * s
                    pp = d.para('\n'.join(q['passage']), pfont, ps, ps * 1.4, 280, C['ink'])
                    pp.pad_ = 10
                box_top = y - 12
                box_h = pp.height_ + 2 * pp.pad_
                plan['passage'] = (pp, box_top, box_h)
                y = box_top - box_h
            os_ = 14.1 * s
            ops, hs = [], []
            for o in q['options']:
                op = d.para(o, SANS, os_, os_ * 1.34, 248, C['ink'])
                ops.append(op)
                hs.append(max(min_h, op.height_ + 22))
            total = sum(hs) + 8 * 3
            top = 97 + total
            if y - top >= 18:
                plan['ops'] = list(zip(ops, hs))
                plan['scale'] = s
                return plan
    raise SystemExit(f"въпрос {q['num']} не се побира: {q['q'][:60]}")


def page_question(d, p, q, next_key):
    d.start(f"q{q['num']}")
    q_header(d, p, q)
    name, pts, col = LEVELS[q['level']]
    d.rrect(224, 512, 112, 22, 11, fill=col)
    d.text(280, 520.37, f'{name} · {pts}', SANS_SB, 9.3, C['ink'], align='center')
    d.text(24, 517.5, f"Въпрос {q['num']:03d}", SERIF_B, 25, C['ink'])
    plan = layout_question(d, q)
    qp, qy = plan['qp']
    qp.drawOn(d.c, 24, qy)
    if 'passage' in plan:
        pp, top, bh = plan['passage']
        d.rrect(24, top - bh, 312, bh, 9, fill=C['passage'])
        d.rrect(24, top - bh + 10, 2, bh - 20, 1, fill=C['gold'])
        pp.drawOn(d.c, 41, top - pp.pad_ - pp.height_)
    y = 97 + sum(h for _, h in plan['ops']) + 24
    for k, (op, h) in enumerate(plan['ops']):
        by = y - h
        d.card(24, by, 312, h)
        cy = by + h / 2
        d.rrect(36, cy - 13.5, 27, 27, 8, fill=C['navy'])
        d.text(49.5, cy - 3.16, 'АБВГ'[k], SANS_SB, 13, C['card'], align='center')
        op.drawOn(d.c, 72, cy - op.height_ / 2)
        d.link(f"c{q['num']}" if k == q['correct'] else f"w{q['num']}", 24, by, 312, h)
        y = by - 8
    d.button(24, 37, 110, 41, 'Части', 'light', link='menu', size=12, center=True)
    d.button(146, 37, 190, 41, 'Пропусни', 'dark', link=next_key)
    d.finish()


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


def page_correct(d, p, q, next_key, is_last):
    d.start(f"c{q['num']}")
    q_header(d, p, q)
    d.circle(49, 522, 24, fill=C['green_halo'])
    d.circle(49, 525, 24, fill=C['green'])
    d.line(38, 525, 46, 517, C['card'], 2.3)
    d.line(46, 517, 60, 533, C['card'], 2.3)
    d.text(86, 523.04, 'Вярно!', SERIF_B, 28, C['green'])
    d.text(87, 498.23, f"+{points_word(q['level'])} при първи опит", SANS_SB, 10.7, C['muted'])
    answer_card(d, q, C['green'])
    d.button(24, 51, 312, 43, 'Към края на частта' if is_last else 'Следващ въпрос', 'dark', link=next_key)
    d.text(180, 32.8, 'Части', SANS_SB, 10, C['muted'], align='center')
    d.link('menu', 130, 30, 100, 18)
    d.finish()


def page_wrong(d, p, q, next_key, is_last):
    d.start(f"w{q['num']}")
    q_header(d, p, q)
    d.circle(49, 522, 24, fill=C['red_halo'])
    d.circle(49, 525, 24, fill=C['red'])
    d.line(42, 532, 56, 518, C['card'], 2)
    d.line(42, 518, 56, 532, C['card'], 2)
    d.text(86, 523.04, 'Не е вярно', SERIF_B, 28, C['red'])
    d.text(87, 498.72, 'Прочети обяснението и опитай пак.', SANS, 10.1, C['muted'])
    answer_card(d, q, C['red'])
    d.button(24, 73, 312, 40, 'Опитай пак', 'light', link=f"q{q['num']}")
    d.button(24, 32, 241, 31, 'Към края на частта' if is_last else 'Следващ въпрос', 'dark', link=next_key)
    d.text(288.14, 44.8, 'Части', SANS_SB, 10, C['muted'])
    d.link('menu', 277, 32, 59, 31)
    d.finish()


def page_part_end(d, p, next_part):
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
    d.text(180, 401.16, f"Завърши част {p['i']} · {p['grade']}. клас", SANS_SB, 12, C['muted'], align='center')
    d.text(180, 380.16, p['subject'], SANS, 12, C['muted'], align='center')
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
    d.text(180, 101.62, 'Брой само верните отговори от първия опит.', SANS, 9, C['muted'], align='center')
    if next_part:
        d.button(24, 37, 203, 41, f'Към част {next_part}', 'dark', link=f'part{next_part}')
    else:
        d.button(24, 37, 203, 41, 'За родителя', 'dark', link='final')
    d.button(238, 37, 98, 41, 'Части', 'light', link='menu', size=12, center=True)
    d.finish()


def page_final(d, sections, note):
    d.start('final')
    d.text(24, 550.78, 'МАЛКО ВСЕКИ ДЕН', SANS_SB, 8.8, C['gold'])
    d.text(24, 511.04, 'За родителя', SERIF_B, 28, C['ink'])
    y = 471.7
    for head, body in sections:
        d.text(24, y, head, SERIF_B, 15, C['ink'])
        p = d.para(body, SANS, 13, 18.3, 312, C['muted'])
        top = y - 16.6
        p.drawOn(d.c, 24, top - p.height_)
        y = top - p.height_ - 32.3
    line_y = y + 32.3 - 16
    d.line(24, line_y, 336, line_y, C['line'], .6)
    p = d.para(note, SANS, 9, 12.5, 312, C['muted'])
    p.drawOn(d.c, 24, line_y - 14 - p.height_)
    d.button(24, 37, 312, 42, 'Към частите', 'dark', link='menu')
    d.finish()


# ---------------------------------------------------------------- main
def build(content, out, fonts_dir, encrypt=True):
    cmaps = load_fonts(fonts_dir)
    questions = content['questions']
    parts = build_parts(questions)
    total = len(questions)
    subjects = {p['subject'] for p in parts}
    has_math = 'Математика' in subjects
    total_pages = 4 + len(parts) * 2 + total * 3 + 1
    title = f'{total} въпроса – интерактивен PDF | Еду БЕЛ'
    tmp = out + '.tmp'
    d = Doc(tmp, title, f'{total} ВЪПРОСА', cmaps)
    d.total_pages = total_pages

    by_grade = {}
    for p in parts:
        by_grade.setdefault(p['grade'], []).append(p['i'])
    rng = lambda xs: f'{xs[0]}–{xs[-1]}' if len(xs) > 1 else str(xs[0])
    gl = [f'{g}. клас: части {rng(v)}' for g, v in sorted(by_grade.items())]
    grade_txt = ' · '.join(gl[:2]) + ('\n' + ' · '.join(gl[2:]) if len(gl) > 2 else '')
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

    page_cover(d, total, cover_sub, book)
    page_parent(d, step3)
    page_howto(d)
    page_menu(d, parts)
    for idx, p in enumerate(parts):
        page_part_intro(d, p, len(parts))
        for j, q in enumerate(p['qs']):
            last = j == len(p['qs']) - 1
            nxt = f"end{p['i']}" if last else f"q{q['num'] + 1}"
            page_question(d, p, q, nxt)
            page_correct(d, p, q, nxt, last)
            page_wrong(d, p, q, nxt, last)
        page_part_end(d, p, p['i'] + 1 if idx + 1 < len(parts) else None)
    page_final(d, [
        ('Навик, който помага', 'По 10 въпроса на ден са достатъчни. След грешен отговор обсъдете обяснението и се върнете към посочената тема.'),
        ('Какво включва материалът', includes),
        ('Еду Бел', 'Материали по български език и литература за 5.–7. клас. Още възможности за преговор ще намерите на edubel.site.'),
    ], 'Подарък за лична употреба в семейството. Копирането на въпросите в други материали, сайтове и приложения и препродажбата са забранени.')
    assert d.page_no == total_pages, (d.page_no, total_pages)
    if d.overflow:
        for o in sorted(d.overflow):
            print('ПРЕЛИВА ОТ РЕДА', o, file=sys.stderr)
        raise SystemExit('има текст, който не се побира в реда')
    if d.missing:
        for m in sorted(d.missing)[:30]:
            print('ЛИПСВА ЗНАК', m, file=sys.stderr)
        raise SystemExit('има знаци, които ги няма в шрифта')
    d.c.save()
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
    return parts, total_pages


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('content')
    ap.add_argument('out')
    ap.add_argument('--fonts', default=os.path.join(os.path.dirname(os.path.abspath(__file__)), '.fonts'))
    ap.add_argument('--no-encrypt', action='store_true')
    a = ap.parse_args()
    content = json.load(open(a.content, encoding='utf-8'))
    parts, pages = build(content, a.out, a.fonts, encrypt=not a.no_encrypt)
    print(f'{a.out}: {pages} страници, {len(parts)} части, {sum(len(p["qs"]) for p in parts)} въпроса')
