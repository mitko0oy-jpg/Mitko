#!/usr/bin/env python3
"""Учителски комплект по БЕЛ (Еду БЕЛ, 5.–7. клас): PDF за печат (A4), викторини за проектора (16:9) и таблица
за резултатите от тестовете (xlsx).

    python3 -I scripts/teacher-pdf/build_kit.py <grade-dir> <out-dir> [--for "Име / училище"] [--no-encrypt] [--draft]

<grade-dir> (напр. private/uchiteli/g5, извън git) съдържа JSON файлове във формата от check.py: работни листове
(`sheets`), викторини (`quizzes`), мисии (`missions`), тестове (`tests` + `skills`). Класът се взима от името на папката
(g5 → 5). Буквите на отговорите се определят от id-тата и номерата – едни и същи при всяко сглобяване (ключът, PDF-ът
и проекторът съвпадат). --draft: печат „Чернова“ на всяка страница (за прегледа от учител).
Нужно е: pip install reportlab pypdf cryptography openpyxl (шрифтовете – като build_quiz_pdf.py)."""
import argparse
import glob
import hashlib
import io
import json
import os
import random
import re
import secrets
import sys
from xml.sax.saxutils import escape

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'quiz-pdf'))
from build_quiz_pdf import load_fonts  # noqa: E402

from reportlab.lib.colors import HexColor, white  # noqa: E402
from reportlab.lib.enums import TA_CENTER, TA_RIGHT  # noqa: E402
from reportlab.lib.pagesizes import A4, landscape  # noqa: E402
from reportlab.lib.styles import ParagraphStyle  # noqa: E402
from reportlab.lib.units import mm  # noqa: E402
from reportlab.pdfbase.pdfmetrics import registerFontFamily, stringWidth  # noqa: E402
from reportlab.pdfgen import canvas as rl_canvas  # noqa: E402
from reportlab.platypus import (BaseDocTemplate, CondPageBreak, Flowable, Frame, KeepTogether, NextPageTemplate,  # noqa: E402
                                PageBreak, PageTemplate, Paragraph, Spacer, Table, TableStyle)
from reportlab.platypus.tableofcontents import TableOfContents  # noqa: E402

SERIF_B, SERIF, SERIF_I = 'NotoSerif-Bold', 'NotoSerif-Regular', 'NotoSerif-Italic'
SANS, SANS_SB, SANS_B = 'OpenSans', 'OpenSans-Semibold', 'OpenSans-Bold'
HX = HexColor
INK, NAVY, MUTED, LINE, PAPER = HX('#172e42'), HX('#14293e'), HX('#5d6d79'), HX('#cfc8bb'), HX('#fffefb')
GOLD, PASSAGE, SOFT = HX('#b98d4f'), HX('#f1ece2'), HX('#f6f2ea')
SEC = {  # цвят на всяка част
    'literature': HX('#a77e47'), 'language': HX('#3d777a'), 'quiz': HX('#b5643c'),
    'mission': HX('#2f4a63'), 'test': HX('#6b5e98'), 'intro': HX('#14293e'),
}
LEVEL = {0: ('Знам', HX('#286658')), 1: ('Разбирам', HX('#2f6f73')), 2: ('Мисля', HX('#8a6431'))}
ABC = 'АБВГ'
LOWER = 'абвгдежзик'
DECOY = 'АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЮЯ'
PW, PH = A4
MARGIN = 16 * mm
CW = PW - 2 * MARGIN  # ширина на текста


def st(name, font=SANS, size=10.5, leading=None, color=INK, **kw):
    return ParagraphStyle(name, fontName=font, fontSize=size, leading=leading or size * 1.38, textColor=color, **kw)


S = {
    'body': st('body'), 'q': st('q', SANS_SB), 'small': st('small', size=8.5, color=MUTED),
    'tiny': st('tiny', size=7.5, color=MUTED), 'h1': st('h1', SERIF_B, 22, 27, NAVY),
    'h2': st('h2', SERIF_B, 15, 19, NAVY), 'h3': st('h3', SERIF_B, 12, 15.5, NAVY),
    'pass': st('pass', SERIF, 10.5, 15), 'key': st('key', size=9.2, leading=12.6),
    'keyw': st('keyw', size=8.6, leading=11.8, color=MUTED), 'cell': st('cell', size=9.5, leading=12.5),
    'cellc': st('cellc', SANS_SB, 9.5, 12.5, alignment=TA_CENTER), 'right': st('right', size=8.5, color=MUTED, alignment=TA_RIGHT),
    'center': st('center', alignment=TA_CENTER), 'lead': st('lead', size=11.5, leading=16.5),
}


def X(s):
    """Plain text → Paragraph markup (keeps line breaks)."""
    return '<br/>'.join(escape(str(x)) for x in str(s).split('\n'))


def P(text, style='body', raw=False):
    return Paragraph(text if raw else X(text), S[style] if isinstance(style, str) else style)


def rng(seed):
    return random.Random(int(hashlib.md5(seed.encode('utf8')).hexdigest(), 16))


def balanced(n, seed):
    """Positions 0–3 for the right answer of n questions: each letter about n/4 times, shuffled."""
    pos = [i % 4 for i in range(n)]
    rng(seed).shuffle(pos)
    return pos


def mc_order(right_pos, seed):
    """Display order of the 4 options (indices into o, o[0] is right) with the right one at right_pos."""
    wrong = [1, 2, 3]
    rng(seed).shuffle(wrong)
    return wrong[:right_pos] + [0] + wrong[right_pos:]


def shuffled(n, seed):
    """A shuffle of range(n) that is never the identity."""
    idx = list(range(n))
    r = rng(seed)
    for _ in range(20):
        r.shuffle(idx)
        if idx != list(range(n)):
            break
    if idx == list(range(n)):
        idx = idx[1:] + idx[:1]
    return idx


# ---------------------------------------------------------------- small flowables
class Mark(Flowable):
    """Zero-size: sets the running header and (optionally) a TOC entry / bookmark."""

    def __init__(self, section=None, color=None, toc=None, level=0, key=None):
        super().__init__()
        self.section, self.color, self.toc, self.level, self.key = section, color, toc, level, key
        self.width = self.height = 0

    def wrap(self, *a):
        return 0, 0

    def draw(self):
        doc = self.canv._doctemplate
        if self.section is not None:
            doc.section, doc.color = self.section, self.color


class Lines(Flowable):
    def __init__(self, n, width=CW, gap=21):
        super().__init__()
        self.n, self.width, self.gap = n, width, gap

    def wrap(self, *a):
        return self.width, self.n * self.gap + 4

    def draw(self):
        c = self.canv
        c.setStrokeColor(LINE)
        c.setLineWidth(.6)
        for i in range(self.n):
            y = self.n * self.gap - (i + 1) * self.gap + 4
            c.line(0, y, self.width, y)


class Boxes(Flowable):
    """A row of letter boxes; `marks` – the 1-based boxes to shade, `labels` – small numbers under the boxes."""

    def __init__(self, n, size=24, marks=(), labels=None, color=GOLD, gap=4):
        super().__init__()
        self.n, self.size, self.marks, self.labels, self.color, self.gap = n, size, set(marks), labels, color, gap
        self.width = n * (size + gap)

    def wrap(self, *a):
        return self.width, self.size + (11 if self.labels else 2)

    def draw(self):
        c = self.canv
        y0 = 11 if self.labels else 2
        for i in range(self.n):
            x = i * (self.size + self.gap)
            if i + 1 in self.marks:
                c.setFillColor(self.color)
                c.setFillAlpha(.25)
                c.rect(x, y0, self.size, self.size, stroke=0, fill=1)
                c.setFillAlpha(1)
            c.setStrokeColor(INK if i + 1 in self.marks else MUTED)
            c.setLineWidth(1.2 if i + 1 in self.marks else .7)
            c.rect(x, y0, self.size, self.size, stroke=1, fill=0)
            if self.labels:
                c.setFillColor(MUTED)
                c.setFont(SANS, 7)
                c.drawCentredString(x + self.size / 2, 1, str(self.labels[i]))


class Band(Flowable):
    """Coloured title band at the top of a sheet / part page."""

    def __init__(self, kicker, title, subtitle='', color=NAVY, width=CW):
        super().__init__()
        self.kicker, self.title, self.subtitle, self.color, self.width = kicker, title, subtitle, color, width
        self.pt = Paragraph(X(title), st('bt', SERIF_B, 17, 21, white))
        self.ps = Paragraph(X(subtitle), st('bs', SANS, 9.5, 12.5, HX('#f3ede2'))) if subtitle else None

    def wrap(self, aw, ah):
        inner = self.width - 28
        h = 14 + 12 + self.pt.wrap(inner, 1000)[1]
        if self.ps:
            h += 3 + self.ps.wrap(inner, 1000)[1]
        self.h = h + 12
        return self.width, self.h

    def draw(self):
        c = self.canv
        c.setFillColor(self.color)
        c.roundRect(0, 0, self.width, self.h, 8, stroke=0, fill=1)
        c.setFillColor(HX('#f3ede2'))
        c.setFont(SANS_B, 7.8)
        c.drawString(14, self.h - 19, self.kicker.upper())
        y = self.h - 27
        _, h = self.pt.wrap(self.width - 28, 1000)
        self.pt.drawOn(c, 14, y - h)
        y -= h
        if self.ps:
            _, h2 = self.ps.wrap(self.width - 28, 1000)
            self.ps.drawOn(c, 14, y - 3 - h2)


class Cut(Flowable):
    """Dashed line with scissors text – between clue cards."""

    def wrap(self, aw, ah):
        self.width = aw
        return aw, 10

    def draw(self):
        c = self.canv
        c.setStrokeColor(MUTED)
        c.setDash(3, 3)
        c.setLineWidth(.6)
        c.line(0, 5, self.width - 60, 5)
        c.setDash()
        c.setFillColor(MUTED)
        c.setFont(SANS, 7)
        c.drawRightString(self.width, 3, 'изрежете тук')


def box(flows, bg=PASSAGE, border=None, pad=8, width=CW):
    t = Table([[flows]], colWidths=[width])
    style = [('BACKGROUND', (0, 0), (-1, -1), bg), ('LEFTPADDING', (0, 0), (-1, -1), pad), ('RIGHTPADDING', (0, 0), (-1, -1), pad),
             ('TOPPADDING', (0, 0), (-1, -1), pad - 2), ('BOTTOMPADDING', (0, 0), (-1, -1), pad)]
    if border:
        style.append(('BOX', (0, 0), (-1, -1), .8, border))
    t.setStyle(TableStyle(style))
    return t


def grid(rows, widths, header=False, center_cols=(), pad=4, line=LINE, bg_header=SOFT, align='CENTER', heights=None):
    t = Table(rows, colWidths=widths, repeatRows=1 if header else 0, hAlign=align, rowHeights=heights)
    style = [('GRID', (0, 0), (-1, -1), .5, line), ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
             ('TOPPADDING', (0, 0), (-1, -1), pad), ('BOTTOMPADDING', (0, 0), (-1, -1), pad),
             ('LEFTPADDING', (0, 0), (-1, -1), 5), ('RIGHTPADDING', (0, 0), (-1, -1), 5)]
    if header:
        style.append(('BACKGROUND', (0, 0), (-1, 0), bg_header))
    for col in center_cols:
        style.append(('ALIGN', (col, 0), (col, -1), 'CENTER'))
    t.setStyle(TableStyle(style))
    return t


# ---------------------------------------------------------------- tasks
class Task:
    """One task laid out for students (flows) and for the key (answer)."""

    def __init__(self, t, seed, right_pos=None, letters=None):
        self.t, self.seed = t, seed
        self.type = t.get('type', 'mc')
        if self.type == 'mc':
            pos = right_pos if right_pos is not None else rng(seed + ':pos').randrange(4)
            self.order = mc_order(pos, seed)
            self.labels = letters or list(ABC)
        elif self.type == 'match':
            self.right = shuffled(len(t['pairs']), seed)
        elif self.type == 'order':
            self.shown = shuffled(len(t['items']), seed)
        elif self.type == 'fill' and t.get('bank'):
            self.bank = [t['bank'][i] for i in shuffled(len(t['bank']), seed)]

    def right_label(self):
        return self.labels[self.order.index(0)]

    # student side ---------------------------------------------------
    def flows(self, num, tag, width=CW):
        t = self.t
        head = Table([[P((f'<b>{num}.</b> ' if num != '' else '') + X(t['q']), 'q', raw=True), P(tag, 'right', raw=True)]],
                     colWidths=[width - 30 * mm, 30 * mm])
        head.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'TOP'), ('LEFTPADDING', (0, 0), (-1, -1), 0),
                                  ('RIGHTPADDING', (0, 0), (-1, -1), 0), ('TOPPADDING', (0, 0), (-1, -1), 0),
                                  ('BOTTOMPADDING', (0, 0), (-1, -1), 3)]))
        out = [head]
        if t.get('passage'):
            out += [Spacer(1, 2), box([P('<br/>'.join(X(x) for x in t['passage']), 'pass', raw=True)], width=width), Spacer(1, 4)]
        out += getattr(self, 'body_' + self.type)(width)
        return out

    def body_mc(self, width):
        opts = [self.t['o'][i] for i in self.order]
        cells = [P(f'<b>{self.labels[k]})</b>  {X(o)}', 'body', raw=True) for k, o in enumerate(opts)]
        short = max(stringWidth(str(o), SANS, 10.5) for o in opts) < width / 2 - 40
        rows = [[cells[0], cells[1]], [cells[2], cells[3]]] if short else [[c] for c in cells]
        t = Table(rows, colWidths=[width / 2 - 6, width / 2 - 6] if short else [width - 12])
        t.setStyle(TableStyle([('LEFTPADDING', (0, 0), (-1, -1), 12), ('TOPPADDING', (0, 0), (-1, -1), 1.5),
                               ('BOTTOMPADDING', (0, 0), (-1, -1), 1.5), ('VALIGN', (0, 0), (-1, -1), 'TOP')]))
        return [t]

    def body_tf(self, width):
        rows = [[P('', 'cell'), P('Твърдение', 'cellc'), P('Вярно', 'cellc'), P('Невярно', 'cellc')]]
        for i, it in enumerate(self.t['items'], 1):
            rows.append([P(f'{i}.', 'cell'), P(it['s'], 'cell'), '', ''])
        return [grid(rows, [9 * mm, width - 9 * mm - 44 * mm, 22 * mm, 22 * mm], header=True)]

    def body_match(self, width):
        pairs = self.t['pairs']
        rows = []
        for i in range(len(pairs)):
            rows.append([P(f'<b>{i + 1}.</b> {X(pairs[i][0])}', 'cell', raw=True),
                         P(f'<b>{LOWER[i]})</b> {X(pairs[self.right[i]][1])}', 'cell', raw=True)])
        t = grid(rows, [width * .42, width * .58])
        ans = '   '.join(f'{i + 1} – ____' for i in range(len(pairs)))
        return [t, Spacer(1, 3), P(f'Отговор:   {ans}', 'small')]

    def body_order(self, width):
        items = self.t['items']
        rows = [[P(f'<b>{ABC[k] if k < 4 else "ДЕ"[k - 4]})</b> {X(items[i])}', 'cell', raw=True)] for k, i in enumerate(self.shown)]
        t = grid(rows, [width])
        return [t, Spacer(1, 4), Table([[P('Правилният ред:', 'small'), Boxes(len(items), 18)]], colWidths=[30 * mm, None],
                                       style=[('LEFTPADDING', (0, 0), (-1, -1), 0), ('VALIGN', (0, 0), (-1, -1), 'MIDDLE')], hAlign='LEFT')]

    def body_fill(self, width):
        out = []
        if getattr(self, 'bank', None):
            out += [box([P('<b>Думи за избор:</b>  ' + '   ·   '.join(X(b) for b in self.bank), 'cell', raw=True)], bg=SOFT, width=width),
                    Spacer(1, 4)]
        parts = str(self.t['text']).split('___')
        txt = X(parts[0])
        for k, p in enumerate(parts[1:], 1):
            num = f'<font size="7" color="#5d6d79">({k})</font>' if len(parts) > 2 else ''
            txt += f'{num}<font color="#5d6d79">_______________</font>' + X(p)
        out.append(P(txt, st('fill', leading=20), raw=True))
        return out

    def body_open(self, width):
        return [Lines(self.t['lines'], width)]

    # key side ---------------------------------------------------------
    def answer(self):
        t = self.t
        if self.type == 'mc':
            return f'<b>{self.right_label()})</b> {X(t["o"][0])}'
        if self.type == 'tf':
            return ', '.join(f'{i} – <b>{"В" if it["v"] else "Н"}</b>' for i, it in enumerate(t['items'], 1))
        if self.type == 'match':
            inv = {r: k for k, r in enumerate(self.right)}
            return ', '.join(f'{i + 1} – <b>{LOWER[inv[i]]}</b>' for i in range(len(t['pairs'])))
        if self.type == 'order':
            lab = [ABC[k] if k < 4 else 'ДЕ'[k - 4] for k in range(len(self.shown))]
            pos = {i: lab[k] for k, i in enumerate(self.shown)}
            return '<b>' + ', '.join(pos[i] for i in range(len(t['items']))) + '</b>'
        if self.type == 'fill':
            a = t['answers']
            return '; '.join((f'({k}) ' if len(a) > 1 else '') + f'<b>{X(x)}</b>' for k, x in enumerate(a, 1))
        if self.type == 'open':
            crit = ' '.join(f'• {X(c)}' for c in t.get('crit') or [])
            return f'<i>Примерен отговор:</i> {X(t["answer"])}<br/><font color="#5d6d79">Критерии: {crit}</font>'
        return ''


def level_tag(t, pts=None):
    name, col = LEVEL.get(t.get('lv', 0), LEVEL[0])
    s = f'<font color="{col.hexval().replace("0x", "#")}"><b>{name}</b></font>'
    if pts:
        s += f' · {pts} т.'
    return s


def key_rows(tasks, numbered=True, pts=False):
    """Rows for a key table: № | answer + why (| points)."""
    rows = []
    for i, tk in enumerate(tasks, 1):
        cell = [P(tk.answer(), 'key', raw=True)]
        if tk.t.get('why'):
            cell.append(P(tk.t['why'], 'keyw'))
        row = [P(f'<b>{i}.</b>', 'key', raw=True), cell]
        if pts:
            row.append(P(str(tk.t.get('pts', '')), 'cellc'))
        rows.append(row)
    return rows


# ---------------------------------------------------------------- the document
class KitDoc(BaseDocTemplate):
    def __init__(self, path, kit, **kw):
        super().__init__(path, pagesize=A4, leftMargin=MARGIN, rightMargin=MARGIN, topMargin=20 * mm, bottomMargin=17 * mm,
                         title=kit['title'], author='Еду БЕЛ', creator='Еду БЕЛ', producer='Еду БЕЛ', **kw)
        self.kit, self.section, self.color = kit, '', NAVY
        fr = Frame(MARGIN, 17 * mm, CW, PH - 37 * mm, id='f', leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
        cover = Frame(MARGIN, 14 * mm, CW, PH - 28 * mm, id='c', leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
        LW, LH = landscape(A4)
        land = Frame(MARGIN, 15 * mm, LW - 2 * MARGIN, LH - 33 * mm, id='l', leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
        self.addPageTemplates([PageTemplate('cover', [cover], onPageEnd=self.deco_cover),
                               PageTemplate('page', [fr], onPageEnd=self.deco),
                               PageTemplate('land', [land], pagesize=landscape(A4), onPageEnd=self.deco)])

    def afterFlowable(self, f):
        if isinstance(f, Mark) and f.toc:
            key = f.key or f'k{id(f)}'
            self.canv.bookmarkPage(key)
            self.canv.addOutlineEntry(f.toc, key, f.level, closed=f.level > 0)
            self.notify('TOCEntry', (f.level, f.toc, self.page, key))

    def watermark(self, c, w, h):
        if self.kit.get('draft'):
            c.saveState()
            c.setFillColor(HX('#b5643c'))
            c.setFillAlpha(.12)
            c.setFont(SANS_B, 70)
            c.translate(w / 2, h / 2)
            c.rotate(40)
            c.drawCentredString(0, 0, 'ЧЕРНОВА')
            c.restoreState()

    def deco_cover(self, c, doc):
        self.watermark(c, *c._pagesize)

    def deco(self, c, doc):
        w, h = c._pagesize
        c.saveState()
        c.setFillColor(self.color)
        c.rect(MARGIN, h - 12 * mm, 22 * mm, 1.6 * mm, stroke=0, fill=1)
        c.setFillColor(MUTED)
        c.setFont(SANS_SB, 7.6)
        c.drawString(MARGIN, h - 10 * mm + 2, f'ЕДУ БЕЛ · УЧИТЕЛСКИ КОМПЛЕКТ · {self.kit["grade"]}. КЛАС')
        c.drawRightString(w - MARGIN, h - 10 * mm + 2, self.section.upper())
        c.setStrokeColor(LINE)
        c.setLineWidth(.5)
        c.line(MARGIN, 12 * mm, w - MARGIN, 12 * mm)
        c.setFont(SANS, 7.2)
        lic = f'Лицензирано за: {self.kit["for"]} · ' if self.kit.get('for') else ''
        c.drawString(MARGIN, 8 * mm, f'{lic}© Еду БЕЛ · edubel.bg · Копиране само за собствените ви класове')
        c.setFont(SANS_SB, 8)
        c.drawRightString(w - MARGIN, 8 * mm, str(doc.page))
        c.restoreState()
        self.watermark(c, w, h)


def part_page(kicker, title, lead, items, color, key):
    out = [NextPageTemplate('page'), PageBreak(), Mark(title, color, toc=title, level=0, key=key),
           Band(kicker, title, '', color), Spacer(1, 12), P(lead, 'lead'), Spacer(1, 8)]
    for it in items:
        out += [P(f'•  {it}', 'body', raw=True), Spacer(1, 3)]
    return out


def name_line(extra=''):
    t = Table([[P('Име: ' + '_' * 38, 'cell'), P('Клас: ______', 'cell'), P('Дата: ____________', 'cell')]],
              colWidths=[CW * .55, CW * .18, CW * .27])
    t.setStyle(TableStyle([('LEFTPADDING', (0, 0), (-1, -1), 0), ('TOPPADDING', (0, 0), (-1, -1), 6)]))
    return t


def task_block(tk, num, tag, width=CW):
    return KeepTogether(tk.flows(num, tag, width) + [Spacer(1, 10)])


# ---- 1. worksheets
def sheets_story(kit):
    story = part_page('Част 1', 'Работни листове', 'По един лист за всяка творба и тема от учебната програма на МОН – около 20 минути, '
                      'в три нива. Ключът с кратко обяснение на всяка задача е в края на частта.',
                      ['<b>Знам</b> – разпознаване (автор, жанр, правило); <b>Разбирам</b> – прилагане; '
                       '<b>Мисля</b> – като на НВО (тълкуване, свободен отговор, редактиране).',
                       'Листовете се принтират черно-бели; всеки е на отделна страница.',
                       'Задачите със свободен отговор имат примерен отговор и критерии в ключа.'], SEC['intro'], 'p1')
    keys = []
    for n, s in enumerate(kit['sheets'], 1):
        color = SEC[s['section']]
        sec = 'Литература' if s['section'] == 'literature' else 'Български език'
        tasks = [Task(t, f'{s["id"]}:{i}', right_pos=p) for i, (t, p) in
                 enumerate(zip(s['tasks'], balanced(len(s['tasks']), s['id'])), 1)]
        story += [PageBreak(), Mark(f'Работни листове · {sec}', color, toc=f'{n}. {s["title"]}', level=1, key=f'ws{n}'),
                  Band(f'Работен лист {n} · {sec}', s['title'], s.get('subtitle', ''), color), Spacer(1, 4), name_line(), Spacer(1, 10)]
        for i, tk in enumerate(tasks, 1):
            story.append(task_block(tk, i, level_tag(tk.t)))
        keys.append((n, s, tasks))
    story += [PageBreak(), Mark('Ключ към работните листове', SEC['intro'], toc='Ключ към работните листове', level=1, key='wskey'),
              P('Ключ към работните листове', 'h2'), Spacer(1, 6)]
    for n, s, tasks in keys:
        head = [P(f'{n}. {s["title"]}', 'h3'), P(s.get('goal', ''), 'keyw'), Spacer(1, 3)]
        story += [CondPageBreak(60 * mm), KeepTogether(head + [grid(key_rows(tasks), [9 * mm, CW - 9 * mm], pad=3)]), Spacer(1, 10)]
    return story


# ---- 2. quizzes (print side; the slides are in the projector PDF)
def quiz_tasks(z):
    pos = balanced(len(z['questions']), z['id'])
    return [Task({'type': 'mc', **q}, f'{z["id"]}:{i}', right_pos=p) for i, (q, p) in enumerate(zip(z['questions'], pos), 1)]


def quizzes_story(kit, proj_name):
    qz = kit['quizzes']
    story = part_page('Част 2', 'Викторини за класа', f'{len(qz)} викторини по {len(qz[0]["questions"]) if qz else 12} въпроса – за отборна игра в часа '
                      '(преговор, последен час преди ваканция, „ден на БЕЛ“).',
                      [f'Пуснете файла <b>„{escape(proj_name)}“</b> на цял екран (проектор или интерактивна дъска). '
                       'Във всеки въпрос щракнете <b>„Покажи отговора“</b> – верният се оцветява и се показва кратко обяснение.',
                       'Разделете класа на 4–6 отбора. Всеки отбор отбелязва отговора в „Листа на отбора“ или вдига картон А, Б, В или Г '
                       '(картоните са в края на частта – един комплект за отбор).',
                       'Точкуване: 1 точка за верен отговор; последните въпроси („Мисля“) може да струват 2 точки. Около 1 минута на въпрос.',
                       'Работи и без интернет – файлът е само с вътрешни връзки.'], SEC['quiz'], 'p2')
    for z, tasks in ((z, quiz_tasks(z)) for z in qz):
        story += [CondPageBreak(90 * mm), Spacer(1, 6),
                  Mark('Викторини за класа', SEC['quiz'], toc=f'Викторина: {z["title"]}', level=1, key=f'qz{z["id"]}'),
                  P(f'Викторина „{X(z["title"])}“ – ключ', 'h3', raw=True), P(z['topic'], 'keyw'), Spacer(1, 4),
                  grid(key_rows(tasks), [9 * mm, CW - 9 * mm], pad=3), Spacer(1, 8)]
    n = max((len(z['questions']) for z in qz), default=12)
    rows = [[P('№', 'cellc'), P('А', 'cellc'), P('Б', 'cellc'), P('В', 'cellc'), P('Г', 'cellc'), P('Точки', 'cellc')]]
    rows += [[P(str(i), 'cellc'), '', '', '', '', ''] for i in range(1, n + 1)]
    rows.append([P('Общо', 'cellc'), '', '', '', '', ''])
    story += [PageBreak(), Mark('Викторини за класа', SEC['quiz'], toc='Лист за отбора и картони А–Г', level=1, key='qzsheet'),
              Band('Викторина', 'Лист за отбора', 'Оградете буквата на отговора, който избира отборът.', SEC['quiz']), Spacer(1, 10),
              P('Отбор: ' + '_' * 40 + '      Викторина: ' + '_' * 30, 'cell'), Spacer(1, 10),
              grid(rows, [16 * mm] + [24 * mm] * 4 + [30 * mm], header=True, center_cols=range(6), pad=6)]
    for L in ABC:
        story += [PageBreak(), BigLetter(L, SEC['quiz'])]
    return story


class BigLetter(Flowable):
    def __init__(self, letter, color):
        super().__init__()
        self.letter, self.color = letter, color

    def wrap(self, aw, ah):
        self.width, self.height = aw, ah - 6
        return self.width, self.height

    def draw(self):
        c = self.canv
        c.setStrokeColor(self.color)
        c.setLineWidth(3)
        c.roundRect(10, 10, self.width - 20, self.height - 20, 24, stroke=1, fill=0)
        c.setFillColor(self.color)
        c.setFont(SERIF_B, 430)
        c.drawCentredString(self.width / 2, self.height / 2 - 150, self.letter)


# ---- 3. missions
def clue_flows(c, i, m, width):
    t = c['task']
    out = [P(f'<b>{X(c["title"])}</b>', st('ct', SERIF_B, 12, 15, NAVY), raw=True), P(c['story'], st('cs', SANS, 9.8, 13.5, MUTED)), Spacer(1, 4)]
    if t.get('type') == 'word':
        out += [P(t['q'], 'q'), Spacer(1, 4)]
        if t.get('passage'):
            out += [box([P('<br/>'.join(X(x) for x in t['passage']), 'pass', raw=True)], width=width - 20), Spacer(1, 4)]
        out += [Boxes(len(t['answer']), 20, marks=[t['pick']]), Spacer(1, 2),
                P('Буквата в оцветеното квадратче отива в кода.', 'tiny')]
    else:
        out += clue_task(c, m, i).flows('', '', width - 20)
        out.append(P('Буквата пред верния отговор отива в кода.', 'tiny'))
    return out


def clue_task(c, m, i):
    seed = f'{m["id"]}:{i}'
    r = rng(seed + ':letters')
    pool = [x for x in DECOY if x != c['letter'].upper()]
    decoys = r.sample(pool, 3)
    letters = sorted([c['letter'].upper()] + decoys, key=DECOY.index)
    right_pos = letters.index(c['letter'].upper())
    tk = Task({'type': 'mc', **c['task']}, seed, right_pos=right_pos, letters=letters)
    return tk


def clue_answer(c, m, i):
    t = c['task']
    if t.get('type') == 'word':
        a = t['answer']
        return f'<b>{X(a)}</b> → {t["pick"]}. буква: <b>{X(a[t["pick"] - 1].upper())}</b>'
    tk = clue_task(c, m, i)
    return f'<b>{tk.right_label()})</b> {X(t["o"][0])}'


def missions_story(kit):
    ms = kit['missions']
    story = part_page('Част 3', 'Детективски мисии', 'Игри-разследвания за целия клас по отбори (около 40 минути). Учителят чете историята, '
                      'отборите решават уликите – всяка улика е учебна задача, а верният отговор дава една буква от тайния код.',
                      ['За всеки отбор принтирайте „Досието“ (историята и уликите) и „Листа на отбора“. Уликите може да се изрежат и да се '
                       'раздават една по една или да се скрият в стаята.',
                       'Отборът записва буквите в квадратчетата и разгадава кода. Първият отбор с верен код разкрива случая; '
                       'накрая учителят чете развръзката.',
                       'Историята и развръзката може да се покажат и на проектора (файлът с викторините).',
                       'В края на частта има „Удостоверение за детектив“ за отборите.'], SEC['intro'], 'p3')
    for n, m in enumerate(ms, 1):
        color = SEC['mission']
        cl = m['clues']
        rows = [[P(f'<b>{i}.</b>', 'key', raw=True), [P(clue_answer(c, m, i), 'key', raw=True), P(c['task'].get('why', ''), 'keyw')],
                 P(f'<b>{X(c["letter"].upper())}</b>', 'cellc', raw=True)] for i, c in enumerate(cl, 1)]
        story += [PageBreak(), Mark('Детективски мисии', color, toc=f'Мисия {n}: {m["title"]}', level=1, key=f'm{n}'),
                  Band(f'Детективска мисия {n} · за учителя', m['title'], f'{m["topic"]} · около {m["minutes"]} минути', color), Spacer(1, 8)]
        if m.get('teacher'):
            story += [P('<b>Как се провежда.</b> ' + X(m['teacher']), 'body', raw=True), Spacer(1, 6)]
        story += [P(f'<b>Тайният код:</b> <font size="14" color="#2f4a63"><b>{"  ".join(X(m["code"].upper()))}</b></font>', 'body', raw=True),
                  Spacer(1, 6), P('Ключ към уликите', 'h3'), grid(rows, [9 * mm, CW - 25 * mm, 16 * mm], center_cols=[2], pad=3), Spacer(1, 8),
                  KeepTogether([P('Развръзката (прочетете след разкриването)', 'h3'), box([P(m['finale'], 'pass')])])]
        # dossier for the teams
        story += [PageBreak(), Mark('Детективски мисии', color),
                  Band(f'Строго секретно · досие на мисия {n}', m['title'], 'За детективите от отбора', color), Spacer(1, 8),
                  box([P(m['intro'], 'pass')]), Spacer(1, 10)]
        for i, c in enumerate(cl, 1):
            card = box(clue_flows(c, i, m, CW), bg=PAPER, border=color, pad=10)
            story += [KeepTogether([card, Spacer(1, 4), Cut(), Spacer(1, 6)])]
        story += [PageBreak(), Mark('Детективски мисии', color),
                  Band(f'Мисия {n} · лист на отбора', m['title'], 'Запишете буквата от всяка улика в квадратчето с нейния номер.', color),
                  Spacer(1, 14), P('Отбор: ' + '_' * 50, 'cell'), Spacer(1, 8), P('Детективи: ' + '_' * 80, 'cell'), Spacer(1, 22),
                  Boxes(len(cl), 40, labels=[f'улика {i}' for i in range(1, len(cl) + 1)], gap=10), Spacer(1, 24),
                  P('Кодът е: ' + '_' * 40, st('code', SANS_SB, 13, 18)), Spacer(1, 12),
                  P('Разкрихме случая в ______ ч. ______ мин.', 'cell'), Spacer(1, 30),
                  P('Бележки на детективите:', 'small'), Lines(8)]
    story += [PageBreak(), Mark('Детективски мисии', SEC['mission'], toc='Удостоверение за детектив', level=1, key='cert'), Certificate()]
    return story


class Certificate(Flowable):
    def wrap(self, aw, ah):
        self.width, self.height = aw, ah - 6
        return self.width, self.height

    def draw(self):
        c, w, h = self.canv, self.width, self.height
        c.setStrokeColor(GOLD)
        c.setLineWidth(3)
        c.roundRect(8, 8, w - 16, h - 16, 18, stroke=1, fill=0)
        c.setLineWidth(.8)
        c.roundRect(18, 18, w - 36, h - 36, 12, stroke=1, fill=0)
        c.setFillColor(SEC['mission'])
        c.setFont(SANS_B, 11)
        c.drawCentredString(w / 2, h - 90, 'ЕДУ БЕЛ · ДЕТЕКТИВСКО БЮРО НА СЛОВОТО')
        c.setFont(SERIF_B, 40)
        c.setFillColor(NAVY)
        c.drawCentredString(w / 2, h - 165, 'Удостоверение')
        c.setFont(SERIF, 16)
        c.drawCentredString(w / 2, h - 205, 'за детектив на словото')
        c.setFont(SANS, 12)
        c.setFillColor(INK)
        y = h - 290
        for label in ('Удостоверява се, че', '', 'разкри случая', ''):
            if label:
                c.drawCentredString(w / 2, y, label)
            else:
                c.setStrokeColor(MUTED)
                c.setLineWidth(.6)
                c.line(w / 2 - 170, y - 4, w / 2 + 170, y - 4)
            y -= 52
        c.drawCentredString(w / 2, y, 'с наблюдателност, знания и отборен дух.')
        c.setFont(SANS, 10)
        c.setFillColor(MUTED)
        c.drawString(70, 120, 'Дата: ____________')
        c.drawRightString(w - 70, 120, 'Учител: ____________________')
        c.setFillColor(GOLD)
        c.circle(w / 2, 150, 34, stroke=0, fill=1)
        c.setFillColor(white)
        c.setFont(SERIF_B, 30)
        c.drawCentredString(w / 2, 140, 'Ъ')


# ---- 4. tests
def test_tasks(test, var):
    tasks = test[var]
    mc = [i for i, t in enumerate(tasks) if t.get('type', 'mc') == 'mc']
    pos = dict(zip(mc, balanced(len(mc), f'{test["id"]}:{var}')))
    return [Task(t, f'{test["id"]}:{var}:{i}', right_pos=pos.get(i)) for i, t in enumerate(tasks)]


GRADES = [(2, 'Слаб'), (3, 'Среден'), (4, 'Добър'), (5, 'Много добър'), (6, 'Отличен')]


def grade_of(p, mx):
    g = 2 + 4 * p / mx
    return g, (2 if g < 3 else 3 if g < 3.5 else 4 if g < 4.5 else 5 if g < 5.5 else 6)


def scale_rows(mx):
    by = {}
    for p in range(mx + 1):
        by.setdefault(grade_of(p, mx)[1], []).append(p)
    return [[P(f'{name} {g}', 'cell'), P(f'{by[g][0]}–{by[g][-1]} т.' if g in by else '–', 'cellc')] for g, name in GRADES]


def tests_story(kit, xlsx_name):
    skills = {s['id']: s['t'] for s in kit.get('skills', [])}
    story = part_page('Част 4', 'Входен и изходен тест', 'Входният тест показва откъде тръгва класът, изходният – докъде е стигнал. '
                      'Всеки тест е в два успоредни варианта (А и Б): една и съща задача по номер проверява едно и също умение '
                      'със същите точки, но с различни изречения и въпроси – за съседите по чин.',
                      ['Ключът с точките и критериите за свободните отговори е след всеки тест.',
                       'Оценка = 2 + 4 × точки ÷ максимума (таблицата е под ключа; може да я промените).',
                       f'Таблицата <b>„{escape(xlsx_name)}“</b> смята сама сбора, оценката и процента по всяко умение – '
                       'така се вижда кое да се преговори с целия клас. За печат има и празна таблица.'], SEC['intro'], 'p4')
    color = SEC['test']
    for test in kit['tests']:
        mx = sum(t.get('pts', 0) for t in test['A'])
        for var, vname in (('A', 'А'), ('B', 'Б')):
            tasks = test_tasks(test, var)
            story += [PageBreak(), Mark(test['title'], color, toc=f'{test["title"]} – вариант {vname}', level=1, key=f't{test["id"]}{var}'),
                      Band(f'{test["title"]} · вариант {vname} · {kit["grade"]}. клас', test['title'],
                           f'{test["covers"]} · {test["minutes"]} минути · {mx} точки', color),
                      Spacer(1, 4), name_line(), Spacer(1, 10)]
            for i, tk in enumerate(tasks, 1):
                story.append(task_block(tk, i, level_tag(tk.t, tk.t.get('pts'))))
            story += [KeepTogether([Spacer(1, 6), grid([[P('<b>Точки:</b>  ______ / ' + str(mx), 'cell', raw=True),
                                                         P('<b>Оценка:</b>  ______________', 'cell', raw=True)]], [CW / 2, CW / 2], pad=8)])]
        story += [PageBreak(), Mark(test['title'], color, toc=f'{test["title"]} – ключ и оценки', level=1, key=f't{test["id"]}key'),
                  P(f'{X(test["title"])} – ключ', 'h2', raw=True), Spacer(1, 6)]
        for var, vname in (('A', 'А'), ('B', 'Б')):
            tasks = test_tasks(test, var)
            rows = [[P('№', 'cellc'), P('Отговор и критерии', 'cell'), P('Т.', 'cellc')]] + key_rows(tasks, pts=True)
            story += [CondPageBreak(45 * mm), P(f'Вариант {vname}', 'h3'), grid(rows, [9 * mm, CW - 21 * mm, 12 * mm], header=True, center_cols=[2], pad=3), Spacer(1, 10)]
        sk_rows = [[P('Умение', 'cell'), P('Задачи', 'cell'), P('Точки', 'cellc')]]
        for sid, name in skills.items():
            nums = [i for i, t in enumerate(test['A'], 1) if t.get('skill') == sid]
            if nums:
                sk_rows.append([P(name, 'cell'), P(', '.join(map(str, nums)), 'cell'),
                                P(str(sum(test['A'][i - 1].get('pts', 0) for i in nums)), 'cellc')])
        story += [KeepTogether([P('Умения по задачи (еднакви за А и Б)', 'h3'), grid(sk_rows, [CW * .55, CW * .3, CW * .15], header=True, center_cols=[2], pad=3)]),
                  Spacer(1, 10),
                  KeepTogether([P('Оценка по точките (2 + 4 × точки ÷ ' + str(mx) + ')', 'h3'),
                                grid([[P('Оценка', 'cell'), P('Точки', 'cellc')]] + scale_rows(mx), [CW * .5, CW * .2], header=True, pad=3, align='LEFT')])]
        # results table (landscape)
        n = len(test['A'])
        LW = landscape(A4)[0] - 2 * MARGIN
        head = [P('№', 'cellc'), P('Име', 'cell'), P('Вар.', st('v', SANS_SB, 8, 9, alignment=TA_CENTER))] + [P(str(i), st('h', SANS_SB, 7.5, 9, alignment=TA_CENTER)) for i in range(1, n + 1)] + \
               [P('Общо', 'cellc'), P('Оц.', 'cellc')]
        sub = [P('', 'tiny'), P('макс. точки →', 'tiny'), P('', 'tiny')] + [P(str(t.get('pts', '')), st('m', SANS, 7, 8, MUTED, alignment=TA_CENTER)) for t in test['A']] + \
              [P(str(mx), st('m2', SANS, 7, 8, MUTED, alignment=TA_CENTER)), P('', 'tiny')]
        rows = [head, sub] + [[P(str(i), st('rn', SANS, 7.5, 9, MUTED, alignment=TA_CENTER))] + [''] * (n + 4) for i in range(1, 31)]
        fixed = 9 * mm + 48 * mm + 11 * mm + 14 * mm + 11 * mm
        w = (LW - fixed) / n
        story += [NextPageTemplate('land'), PageBreak(), Mark(test['title'], color, toc=f'{test["title"]} – таблица за резултатите', level=1, key=f't{test["id"]}tab'),
                  P(f'{X(test["title"])} – резултати на класа ({kit["grade"]}. клас ____)', 'h3', raw=True), Spacer(1, 4),
                  grid(rows, [9 * mm, 48 * mm, 11 * mm] + [w] * n + [14 * mm, 11 * mm], header=True, center_cols=range(2, n + 5), pad=2,
                       heights=[None, None] + [13.6] * 30),
                  NextPageTemplate('page')]
    return story


# ---- cover, how-to, contents
class Cover(Flowable):
    def __init__(self, kit):
        super().__init__()
        self.kit = kit

    def wrap(self, aw, ah):
        self.width, self.height = aw, ah - 4
        return aw, self.height

    def draw(self):
        c, w, h, k = self.canv, self.width, self.height, self.kit
        c.setFillColor(NAVY)
        c.roundRect(0, h * .42, w, h * .58, 18, stroke=0, fill=1)
        c.setFillColor(GOLD)
        c.circle(w - 70, h - 70, 34, stroke=0, fill=1)
        c.setFillColor(white)
        c.setFont(SERIF_B, 32)
        c.drawCentredString(w - 70, h - 81, 'Ъ')
        c.setFont(SANS_B, 11)
        c.setFillColor(HX('#ead5ac'))
        c.drawString(30, h - 60, 'ЕДУ БЕЛ · ЗА УЧИТЕЛЯ')
        c.setFillColor(white)
        c.setFont(SERIF_B, 38)
        c.drawString(30, h - 150, 'Учителски комплект')
        c.setFont(SERIF, 24)
        c.drawString(30, h - 185, 'по български език и литература')
        c.setFont(SERIF_B, 64)
        c.setFillColor(HX('#ead5ac'))
        c.drawString(30, h - 275, f'{k["grade"]}. клас')
        c.setFont(SANS, 12)
        c.setFillColor(HX('#d8e3e9'))
        c.drawString(30, h * .42 + 40, 'По учебната програма на МОН · с ключ и обяснения · готово за печат')
        y = h * .42 - 40
        for label, n, col in k['summary']:
            c.setFillColor(col)
            c.roundRect(0, y - 6, 8, 30, 3, stroke=0, fill=1)
            c.setFillColor(INK)
            c.setFont(SERIF_B, 17)
            c.drawString(20, y + 8, label)
            c.setFont(SANS, 10.5)
            c.setFillColor(MUTED)
            c.drawString(20, y - 6, n)
            y -= 52
        c.setFont(SANS, 9)
        c.setFillColor(MUTED)
        if k.get('for'):
            c.drawString(0, 10, f'Лицензирано за: {k["for"]}')
        c.drawRightString(w, 10, 'edubel.bg')


def howto_story(kit, files):
    toc = TableOfContents(dotsMinLevel=1)
    toc.levelStyles = [st('t0', SERIF_B, 12, 18, NAVY, spaceBefore=6), st('t1', SANS, 9.5, 13, INK, leftIndent=14)]
    lines = [
        'Всичко е <b>по учебната програма на МОН</b> за класа – творбите и езиковите теми са в реда на програмата.',
        'Всяка задача е в едно от <b>трите нива</b>: <b>Знам</b> · <b>Разбирам</b> · <b>Мисля</b> (като на НВО) – лесно се дава '
        'различна работа на различни ученици.',
        '<b>Ключ с обяснение</b> на всяка задача: не само буквата, а защо и кой е капанът; при свободните отговори – примерен отговор и критерии.',
        'Тестовете са в <b>два успоредни варианта</b>, с точки, скала за оценка и таблица, която сама показва слабите умения на класа.',
        'Викторините се играят <b>на проектора</b> (отделният файл) – щракване показва отговора; без интернет.',
    ]
    story = [NextPageTemplate('page'), PageBreak(), Mark('Как да ползвате комплекта', SEC['intro']),
             P('Как да ползвате комплекта', 'h1'), Spacer(1, 8)]
    story += [P(f'•  {x}', 'lead', raw=True) for x in lines]
    story += [Spacer(1, 10), P('Файловете в комплекта', 'h3')]
    story += [P(f'•  <b>{escape(a)}</b> – {escape(b)}', 'body', raw=True) for a, b in files]
    story += [Spacer(1, 10), P('Лиценз', 'h3'),
              P('Комплектът е за един учител: може да принтирате и копирате листовете колкото пъти е нужно за собствените ви класове и '
                'да ги показвате в часа. Не го разпространявайте и не го качвайте в интернет. Видяхте грешка? Пишете ни – поправяме '
                'и изпращаме новата версия безплатно.', 'body'),
              PageBreak(), P('Съдържание', 'h1'), Spacer(1, 6), toc]
    return story


# ---------------------------------------------------------------- projector (16:9, internal links)
SW, SH = 960, 540


class Slides:
    def __init__(self, path, kit, encrypt):
        self.c = rl_canvas.Canvas(path, pagesize=(SW, SH), pageCompression=1, encrypt=encrypt)
        self.c.setTitle(f'Викторини за класа – {kit["grade"]}. клас')
        self.c.setAuthor('Еду БЕЛ')
        self.kit, self.pages = kit, 0

    def page(self, key, bg=PAPER):
        c = self.c
        if self.pages:
            c.showPage()
        self.pages += 1
        c.bookmarkPage(key, fit='Fit')
        c.setFillColor(bg)
        c.rect(0, 0, SW, SH, stroke=0, fill=1)
        if self.kit.get('draft'):
            c.saveState()
            c.setFillColor(HX('#b5643c'))
            c.setFillAlpha(.1)
            c.setFont(SANS_B, 90)
            c.drawCentredString(SW / 2, SH / 2 - 30, 'ЧЕРНОВА')
            c.restoreState()

    def fit(self, text, x, y_top, w, h, font, size, color, min_size=12, leading=1.25, align=0, raw=False):
        """Draws text in the box (top-left at x, y_top), shrinking the font until it fits."""
        s = size
        while True:
            p = Paragraph(text if raw else X(text), st('s', font, s, s * leading, color, alignment=align))
            pw, ph = p.wrap(w, 10000)
            if ph <= h or s <= min_size:
                break
            s -= 1
        p.drawOn(self.c, x, y_top - ph)
        return ph

    def button(self, label, dest, x, y, w=210, h=46, fill=NAVY, color=white, size=17):
        c = self.c
        c.setFillColor(fill)
        c.roundRect(x, y, w, h, h / 2, stroke=0, fill=1)
        c.setFillColor(color)
        while size > 9 and stringWidth(label, SANS_B, size) > w - 24:
            size -= .5
        c.setFont(SANS_B, size)
        c.drawCentredString(x + w / 2, y + h / 2 - size * .36, label)
        c.linkRect('', dest, (x, y, x + w, y + h), relative=0, thickness=0)

    def header(self, left, right, color):
        c = self.c
        c.setFillColor(color)
        c.rect(0, SH - 8, SW, 8, stroke=0, fill=1)
        c.setFillColor(MUTED)
        c.setFont(SANS_SB, 13)
        c.drawString(36, SH - 40, left)
        c.drawRightString(SW - 36, SH - 40, right)

    def menu_link(self):
        self.button('Меню', 'menu', SW - 136, 22, 100, 34, fill=HX('#e6e0d4'), color=INK, size=13)

    def build(self, kit):
        qz, ms = kit['quizzes'], kit['missions']
        self.page('menu', NAVY)
        c = self.c
        c.setFillColor(HX('#ead5ac'))
        c.setFont(SANS_B, 14)
        c.drawString(50, SH - 60, f'ЕДУ БЕЛ · {kit["grade"]}. КЛАС')
        c.setFillColor(white)
        c.setFont(SERIF_B, 40)
        c.drawString(50, SH - 110, 'Викторини и мисии за класа')
        c.setFont(SANS_B, 14)
        c.setFillColor(HX('#ead5ac'))
        c.drawString(50, SH - 165, 'ВИКТОРИНИ')
        c.drawString(500, SH - 165, 'ДЕТЕКТИВСКИ МИСИИ')
        y = SH - 230
        for z in qz:
            self.button(z['title'], f'q-{z["id"]}', 50, y, 410, 48, fill=SEC['quiz'], size=17)
            y -= 62
        y2 = SH - 230
        for n, m in enumerate(ms, 1):
            self.button(f'{n}. {m["title"]}', f'm-{m["id"]}', 500, y2, 410, 48, fill=HX('#38566b'), size=17)
            y2 -= 62
        for z in qz:
            self.quiz(z)
        for n, m in enumerate(ms, 1):
            self.mission(m, n)
        c.showPage()

    def quiz(self, z):
        tasks = quiz_tasks(z)
        col = SEC['quiz']
        self.page(f'q-{z["id"]}')
        self.header('Викторина', f'{len(tasks)} въпроса', col)
        self.fit(z['title'], 60, SH - 110, SW - 120, 120, SERIF_B, 46, NAVY, align=TA_CENTER)
        self.fit(z['topic'], 100, SH - 240, SW - 200, 60, SANS, 20, MUTED, align=TA_CENTER)
        self.fit('Отборите избират отговор. Щракнете „Покажи отговора“, за да видите верния и защо.', 120, SH - 320, SW - 240, 60,
                 SANS, 17, INK, align=TA_CENTER)
        self.button('Започни', f'q-{z["id"]}-1', SW / 2 - 110, 90, 220, 52, fill=col, size=19)
        self.menu_link()
        for i, tk in enumerate(tasks, 1):
            for reveal in (False, True):
                self.question(z, tk, i, len(tasks), reveal)
        self.page(f'q-{z["id"]}-end', NAVY)
        c = self.c
        c.setFillColor(white)
        c.setFont(SERIF_B, 52)
        c.drawCentredString(SW / 2, SH / 2 + 40, 'Край на викторината!')
        c.setFont(SANS, 22)
        c.setFillColor(HX('#d8e3e9'))
        c.drawCentredString(SW / 2, SH / 2 - 10, 'Пребройте точките на отборите.')
        self.button('Към менюто', 'menu', SW / 2 - 110, 110, 220, 52, fill=GOLD, size=19)

    def question(self, z, tk, i, n, reveal):
        q = tk.t
        col = SEC['quiz']
        key = f'q-{z["id"]}-{i}' + ('a' if reveal else '')
        self.page(key)
        self.header(f'{z["title"]} · въпрос {i} от {n}', LEVEL[q.get('lv', 0)][0], col)
        y = SH - 62
        top_h = 150 if q.get('passage') else 170
        h = self.fit(q['q'], 50, y, SW - 100, 100 if q.get('passage') else top_h, SANS_B, 30, INK, min_size=18)
        y -= h + 10
        if q.get('passage'):
            c = self.c
            ph = Paragraph('<br/>'.join(X(x) for x in q['passage']), st('pp', SERIF_I, 19, 24, INK))
            pw, pph = ph.wrap(SW - 140, 1000)
            pph = min(pph, 120)
            c.setFillColor(PASSAGE)
            c.roundRect(50, y - pph - 16, SW - 100, pph + 16, 10, stroke=0, fill=1)
            self.fit('<br/>'.join(X(x) for x in q['passage']), 70, y - 8, SW - 140, 120, SERIF_I, 19, INK, min_size=13, raw=True)
            y -= pph + 26
        # 2×2 option tiles
        opts = [q['o'][k] for k in tk.order]
        bottom = 140 if reveal else 92
        tile_h = min(88, (y - bottom - 12) / 2)
        tw = (SW - 100 - 16) / 2
        right = tk.order.index(0)
        for k, o in enumerate(opts):
            x = 50 + (k % 2) * (tw + 16)
            ty = y - (k // 2 + 1) * tile_h - (k // 2) * 12
            fill, ink = HX('#f1ece2'), INK
            if reveal:
                fill, ink = (HX('#286658'), white) if k == right else (HX('#f3f0ea'), HX('#a9b2b8'))
            c = self.c
            c.setFillColor(fill)
            c.roundRect(x, ty, tw, tile_h, 14, stroke=0, fill=1)
            c.setFillColor(ink if reveal else col)
            c.setFont(SERIF_B, 30)
            c.drawString(x + 18, ty + tile_h / 2 - 11, ABC[k])
            self.fit(o, x + 62, ty + tile_h / 2 + 22, tw - 78, tile_h - 10, SANS_SB, 22, ink, min_size=13)
        if reveal:
            self.fit('<b>Защо:</b> ' + X(q.get('why', '')), 50, 128, SW - 300, 100, SANS, 17, INK, min_size=11, raw=True)
            nxt = f'q-{z["id"]}-{i + 1}' if i < n else f'q-{z["id"]}-end'
            self.button('Следващ въпрос' if i < n else 'Край', nxt, SW - 260, 70, 220, 50, fill=col, size=18)
        else:
            self.button('Покажи отговора', key + 'a', SW / 2 - 130, 22, 260, 52, fill=NAVY, size=19)
        self.menu_link()

    def mission(self, m, n):
        col = SEC['mission']
        self.page(f'm-{m["id"]}')
        self.header(f'Детективска мисия {n}', m['topic'], col)
        self.fit(m['title'], 60, SH - 70, SW - 120, 90, SERIF_B, 40, NAVY, align=TA_CENTER)
        self.fit(m['intro'], 80, SH - 165, SW - 160, 270, SERIF, 21, INK, min_size=13)
        self.button('Развръзка', f'm-{m["id"]}-end', SW / 2 - 110, 26, 220, 50, fill=col, size=18)
        self.menu_link()
        self.page(f'm-{m["id"]}-end', NAVY)
        c = self.c
        c.setFillColor(HX('#ead5ac'))
        c.setFont(SANS_B, 16)
        c.drawCentredString(SW / 2, SH - 70, 'ТАЙНИЯТ КОД')
        c.setFillColor(white)
        c.setFont(SERIF_B, 64)
        c.drawCentredString(SW / 2, SH - 150, ' '.join(m['code'].upper()))
        self.fit(m['finale'], 100, SH - 200, SW - 200, 230, SERIF, 21, HX('#e8eef3'), min_size=13)
        self.button('Към менюто', 'menu', SW / 2 - 110, 30, 220, 50, fill=GOLD, size=18)


# ---------------------------------------------------------------- results workbook
def workbook(kit, path):
    from openpyxl import Workbook
    from openpyxl.formatting.rule import CellIsRule
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.utils import get_column_letter as L
    wb = Workbook()
    wb.remove(wb.active)
    skills = {s['id']: s['t'] for s in kit.get('skills', [])}
    bold, head = Font(bold=True), PatternFill('solid', fgColor='EEE7D9')
    for test in kit['tests']:
        ws = wb.create_sheet(test['title'][:28])
        n, mx = len(test['A']), sum(t['pts'] for t in test['A'])
        rows = 30
        ws['A1'] = f'{test["title"]} · {kit["grade"]}. клас · въведете точките на всяка задача (вариант А или Б – еднакви по точки и умения)'
        ws['A1'].font = Font(bold=True, size=12)
        hdr = ['№', 'Име', 'Вариант'] + [f'{i}' for i in range(1, n + 1)] + ['Общо', 'Оценка']
        for j, v in enumerate(hdr, 1):
            ws.cell(3, j, v).font = bold
            ws.cell(3, j).fill = head
            ws.cell(3, j).alignment = Alignment(horizontal='center')
        ws.cell(4, 2, 'макс. точки')
        for i, t in enumerate(test['A'], 1):
            ws.cell(4, 3 + i, t['pts']).alignment = Alignment(horizontal='center')
            ws.cell(2, 3 + i, skills.get(t['skill'], t['skill'])).alignment = Alignment(text_rotation=90, horizontal='center')
        ws.cell(4, 4 + n, mx)
        first, last = 5, 4 + rows
        tot, grd = 4 + n, 5 + n
        for r in range(first, last + 1):
            ws.cell(r, 1, r - 4)
            a, b = f'{L(4)}{r}', f'{L(3 + n)}{r}'
            ws.cell(r, tot, f'=IF(COUNT({a}:{b})=0,"",SUM({a}:{b}))')
            ws.cell(r, grd, f'=IF({L(tot)}{r}="","",ROUND(2+4*{L(tot)}{r}/{mx},2))')
            ws.cell(r, grd).number_format = '0.00'
        ws.column_dimensions['B'].width = 26
        for j in range(4, 4 + n):
            ws.column_dimensions[L(j)].width = 4.5
        ws.row_dimensions[2].height = 110
        r = last + 2
        ws.cell(r, 2, 'Среден резултат').font = bold
        for j in range(4, 4 + n):
            ws.cell(r, j, f'=IF(COUNT({L(j)}{first}:{L(j)}{last})=0,"",ROUND(100*AVERAGE({L(j)}{first}:{L(j)}{last})/{L(j)}4,0))')
        ws.cell(r, 3, '% от макс.')
        ws.cell(r, grd, f'=IF(COUNT({L(grd)}{first}:{L(grd)}{last})=0,"",ROUND(AVERAGE({L(grd)}{first}:{L(grd)}{last}),2))')
        red = PatternFill('solid', fgColor='F2C9C2')
        ws.conditional_formatting.add(f'{L(4)}{r}:{L(3 + n)}{r}', CellIsRule(operator='lessThan', formula=['50'], fill=red))
        # skills
        r += 3
        ws.cell(r, 2, 'По умения').font = Font(bold=True, size=12)
        ws.cell(r + 1, 2, 'Умение').font = bold
        ws.cell(r + 1, 3, 'Задачи').font = bold
        ws.cell(r + 1, 4, '% от макс.').font = bold
        rr = r + 2
        for sid, name in skills.items():
            cols = [3 + i for i, t in enumerate(test['A'], 1) if t['skill'] == sid]
            if not cols:
                continue
            ws.cell(rr, 2, name)
            ws.cell(rr, 3, ', '.join(str(c - 3) for c in cols))
            got = '+'.join(f'SUM({L(c)}{first}:{L(c)}{last})' for c in cols)
            cnt = f'COUNT({L(tot)}{first}:{L(tot)}{last})'
            maxs = '+'.join(f'{L(c)}4' for c in cols)
            ws.cell(rr, 4, f'=IF({cnt}=0,"",ROUND(100*({got})/(({maxs})*{cnt}),0))')
            ws.conditional_formatting.add(f'D{rr}', CellIsRule(operator='lessThan', formula=['50'], fill=red))
            rr += 1
        ws.cell(rr + 1, 2, 'Под 50% – оцветено: тези умения си струва да се преговорят с целия клас.').font = Font(italic=True, color='5D6D79')
        ws.freeze_panes = 'D5'
    wb.save(path)


# ---------------------------------------------------------------- main
def load_kit(src):
    kit = {'sheets': [], 'quizzes': [], 'missions': [], 'tests': [], 'skills': []}
    for f in sorted(glob.glob(os.path.join(src, '*.json'))):
        d = json.load(open(f, encoding='utf8'))
        for k in kit:
            kit[k] += d.get(k) or []
    kit['sheets'].sort(key=lambda s: (s['section'] != 'literature', s['id']))
    kit['quizzes'].sort(key=lambda z: z['id'])
    kit['missions'].sort(key=lambda m: m['id'])
    kit['tests'].sort(key=lambda t: t['id'] != 'vhoden')
    seen = set()
    kit['skills'] = [s for s in kit['skills'] if not (s['id'] in seen or seen.add(s['id']))]
    m = re.search(r'g(\d)', os.path.basename(os.path.normpath(src)))
    kit['grade'] = int(m.group(1)) if m else 0
    return kit


def protect(path, title):
    from pypdf import PdfReader, PdfWriter
    from pypdf.constants import UserAccessPermissions as Perm
    sys.setrecursionlimit(20000)
    w = PdfWriter(clone_from=PdfReader(path))
    w.add_metadata({'/Title': title, '/Author': 'Еду БЕЛ', '/Producer': 'Еду БЕЛ', '/Creator': 'Еду БЕЛ'})
    w.encrypt(user_password='', owner_password=secrets.token_hex(16), permissions_flag=Perm.PRINT | Perm.PRINT_TO_REPRESENTATION,
              algorithm='AES-256')
    tmp = path + '.enc'
    with open(tmp, 'wb') as f:
        w.write(f)
    os.replace(tmp, path)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src')
    ap.add_argument('out')
    ap.add_argument('--for', dest='lic', default='')
    ap.add_argument('--no-encrypt', action='store_true')
    ap.add_argument('--draft', action='store_true')
    ap.add_argument('--fonts', default=os.path.join(HERE, '..', 'quiz-pdf', '.fonts'))
    a = ap.parse_args()
    cmaps = load_fonts(a.fonts)
    registerFontFamily(SANS, normal=SANS, bold=SANS_B, italic=SANS, boldItalic=SANS_B)
    registerFontFamily(SERIF, normal=SERIF, bold=SERIF_B, italic=SERIF_I, boldItalic=SERIF_B)
    kit = load_kit(a.src)
    used = set()
    for part in ('sheets', 'quizzes', 'missions', 'tests', 'skills'):
        used |= set(json.dumps(kit[part], ensure_ascii=False))
    missing = sorted(ch for ch in used if ch not in '\n\t' and not all(ord(ch) in cmaps[f] for f in (SANS, SERIF, SERIF_I, SANS_B)))
    if missing:
        sys.exit('Знаци, които ги няма в шрифтовете: ' + ' '.join(f'{ch} (U+{ord(ch):04X})' for ch in missing))
    kit.update({'for': a.lic, 'draft': a.draft})
    g = kit['grade']
    kit['title'] = f'Учителски комплект по БЕЛ – {g}. клас'
    os.makedirs(a.out, exist_ok=True)
    names = {'pdf': f'EDU_BEL_Uchitelski_komplekt_{g}_klas.pdf', 'proj': f'EDU_BEL_Viktorini_proektor_{g}_klas.pdf',
             'xlsx': f'EDU_BEL_Rezultati_testove_{g}_klas.xlsx'}
    proj_h, xlsx_h = f'Викторини за проектора – {g}. клас', f'Резултати от тестовете – {g}. клас'
    nt = sum(len(s['tasks']) for s in kit['sheets'])
    nq = sum(len(z['questions']) for z in kit['quizzes'])
    kit['summary'] = [
        ('Работни листове с ключ', f'{len(kit["sheets"])} листа · {nt} задачи в три нива', SEC['literature']),
        ('Викторини за класа', f'{len(kit["quizzes"])} викторини · {nq} въпроса · за проектора и на хартия', SEC['quiz']),
        ('Детективски мисии', f'{len(kit["missions"])} игри-разследвания по отбори', SEC['mission']),
        ('Входен и изходен тест', 'варианти А и Б · ключ · оценки · таблица по умения', SEC['test']),
    ]
    files = [(names['pdf'], 'този файл: листовете, ключовете, мисиите, тестовете (за печат)'),
             (names['proj'], 'викторините и мисиите за проектора или интерактивната дъска'),
             (names['xlsx'], 'таблица за резултатите от тестовете – смята оценките и уменията')]
    story = [Cover(kit)] + howto_story(kit, files)
    if kit['sheets']:
        story += sheets_story(kit)
    if kit['quizzes']:
        story += quizzes_story(kit, names['proj'])
    if kit['missions']:
        story += missions_story(kit)
    if kit['tests']:
        story += tests_story(kit, names['xlsx'])
    pdf = os.path.join(a.out, names['pdf'])
    doc = KitDoc(pdf, kit)
    doc.multiBuild(story)
    if not a.no_encrypt:
        protect(pdf, kit['title'])
    proj = os.path.join(a.out, names['proj'])
    if kit['quizzes'] or kit['missions']:
        sl = Slides(proj, kit, None)
        sl.build(kit)
        sl.c.save()
        if not a.no_encrypt:
            protect(proj, proj_h)
    if kit['tests']:
        workbook(kit, os.path.join(a.out, names['xlsx']))
    print(f'✓ {pdf}: {doc.page} страници; проектор: {sl.pages if kit["quizzes"] or kit["missions"] else 0} слайда; '
          f'{len(kit["sheets"])} листа, {nt} задачи, {len(kit["quizzes"])} викторини, {len(kit["missions"])} мисии, {len(kit["tests"])} теста')


if __name__ == '__main__':
    main()
