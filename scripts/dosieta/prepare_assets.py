"""Подготвя папката с изображения и шрифтове за „Литературни досиета“.

    pip install pillow numpy fonttools brotli
    python3 scripts/dosieta/prepare_assets.py <оригинален-PDF-на-книгата> private/dosieta-12/assets

Взима корицата, картинката с бюрото и шестте икони от вече издадената книга (5.–7. клас),
сваля Sofia Sans от Google Fonts и прави статични шрифтове, за да се вграждат в PDF като TrueType
(променливите шрифтове Chromium вгражда като Type 3, които печатниците не обичат).
Изображенията са на Еду БЕЛ и не влизат в публичното хранилище – дръж ги в private/.
"""
import os
import re
import subprocess
import sys
import tempfile
import urllib.request

import numpy as np
from PIL import Image
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ICONS = [['lupa', 'papka', 'kod'], ['znachka', 'tetradka', 'sandak']]
FONTS_CSS = 'https://fonts.googleapis.com/css2?family=Sofia+Sans:ital,wght@0,400..900;1,400..900&family=Sofia+Sans+Condensed:wght@700..900&display=swap'
WEIGHTS = {('Sofia Sans', 'normal'): [400, 600, 700, 800, 900], ('Sofia Sans', 'italic'): [400, 700], ('Sofia Sans Condensed', 'normal'): [800]}
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36'


def fetch(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=60).read()


def images(pdf, out):
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(['pdfimages', '-png', pdf, os.path.join(tmp, 'img')], check=True)
        files = sorted(os.listdir(tmp))
        sizes = {f: Image.open(os.path.join(tmp, f)).size for f in files}
        cover = next(f for f in files if sizes[f][1] > sizes[f][0])
        wide = [f for f in files if sizes[f] == (1536, 1024)]
        modes = {f: Image.open(os.path.join(tmp, f)).mode for f in wide}
        sprite = next(f for i, f in enumerate(wide) if modes[f] == 'RGB' and i + 1 < len(wide) and modes[wide[i + 1]] == 'L')
        mask = wide[wide.index(sprite) + 1]
        hero = next(f for f in wide if modes[f] == 'RGB' and f != sprite)
        Image.open(os.path.join(tmp, cover)).convert('RGB').save(os.path.join(out, 'cover.jpg'), quality=88)
        Image.open(os.path.join(tmp, hero)).convert('RGB').save(os.path.join(out, 'hero.jpg'), quality=86)
        im = Image.open(os.path.join(tmp, sprite)).convert('RGB')
        alpha = Image.open(os.path.join(tmp, mask)).convert('L')
        im.putalpha(alpha)
        A = np.array(alpha)
        H, W = A.shape
        for r, (y0, y1) in enumerate([(0, H // 2), (H // 2, H)]):
            occ = (A[y0:y1] > 30).sum(axis=0)
            segs, start = [], None
            for x in range(W + 1):
                filled = x < W and occ[x] > 2
                if filled and start is None:
                    start = x
                elif not filled and start is not None:
                    if x - start > 60:
                        segs.append((start, x))
                    start = None
            for c, (x0, x1) in enumerate(segs[:3]):
                t = im.crop((x0, y0, x1, y1))
                t = t.crop(t.getbbox())
                t.thumbnail((520, 520))
                t.save(os.path.join(out, ICONS[r][c] + '.png'), optimize=True)


def fonts(out):
    os.makedirs(os.path.join(out, 'fonts-static'), exist_ok=True)
    css = fetch(FONTS_CSS).decode()
    faces = []
    for sub, body in re.findall(r'/\* (\S+) \*/\s*@font-face\s*\{(.*?)\}', css, re.S):
        if sub not in ('cyrillic', 'latin'):
            continue
        fam = re.search(r"font-family: '(.*?)'", body).group(1)
        style = re.search(r'font-style: (\w+)', body).group(1)
        rng = re.search(r'unicode-range: ([^;]+);', body).group(1)
        url = re.search(r'url\((.*?)\)', body).group(1)
        with tempfile.NamedTemporaryFile(suffix='.woff2', delete=False) as tmp:
            tmp.write(fetch(url))
        for w in WEIGHTS.get((fam, style), []):
            var = TTFont(tmp.name)
            lo, hi = next((a.minValue, a.maxValue) for a in var['fvar'].axes if a.axisTag == 'wght')
            st = instancer.instantiateVariableFont(var, {'wght': max(lo, min(hi, w))})
            st.flavor = None
            name = f"{fam.replace(' ', '')}-{style}-{w}-{sub}.ttf"
            st.save(os.path.join(out, 'fonts-static', name))
            faces.append(f"@font-face{{font-family:'{fam}';font-style:{style};font-weight:{w};src:url(fonts-static/{name}) format('truetype');unicode-range:{rng};}}")
        os.unlink(tmp.name)
    with open(os.path.join(out, 'fonts-local.css'), 'w') as f:
        f.write('\n'.join(faces))


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    pdf, out = sys.argv[1], sys.argv[2]
    os.makedirs(out, exist_ok=True)
    images(pdf, out)
    fonts(out)
    print('Готово:', ', '.join(sorted(os.listdir(out))))
