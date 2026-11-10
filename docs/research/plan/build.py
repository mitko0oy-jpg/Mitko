"""Assemble the plan page: plan.src.html + plan.css + mockups.html, with the app's pictures inlined as data URIs.
Usage: python3 -I build.py <media dir> [src] [out]"""
import base64, os, re, sys
here = os.path.dirname(os.path.abspath(__file__))
media = sys.argv[1]
src = sys.argv[2] if len(sys.argv) > 2 else os.path.join(here, "plan.src.html")
out = sys.argv[3] if len(sys.argv) > 3 else os.path.join(here, "edu-bel-2.html")
html = open(src, encoding="utf8").read()
html = html.replace("{{css}}", open(os.path.join(here, "plan.css"), encoding="utf8").read())
html = html.replace("{{mockups}}", open(os.path.join(here, "mockups.html"), encoding="utf8").read())
cache = {}
def img(m):
    n = m.group(1)
    if n not in cache:
        cache[n] = "data:image/webp;base64," + base64.b64encode(open(os.path.join(media, n + ".webp"), "rb").read()).decode()
    return cache[n]
html = re.sub(r"\{\{img:([\w-]+)\}\}", img, html)
open(out, "w", encoding="utf8").write(html)
print(out, f"{len(html) // 1024} KB", "images:", sorted(cache))
