"""Assemble the standalone quiz: app.html + modules.json + the question bank (+ logo) -> one HTML file.
The bank is paid content and lives outside git, in private/nvo-trener/bank/*.json (see SCHEMA.md).
Usage: python3 -I tools/nvo-trener/build.py [bank_dir] [out_file]
Writes <out_file> (for publishing as an Artifact) and <out_file minus .html>-file.html (a complete document to send)."""
import json, sys, glob, base64, os
here = os.path.dirname(os.path.abspath(__file__))
private = os.path.join(here, "..", "..", "private", "nvo-trener")
bank_dir = sys.argv[1] if len(sys.argv) > 1 else os.path.join(private, "bank")
out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(private, "nvo-trener.html")
mods = json.load(open(os.path.join(here, "modules.json"), encoding="utf8"))
order = {m["id"]: m["n"] for m in mods}
passages, questions = {}, []
for f in sorted(glob.glob(os.path.join(bank_dir, "*.json"))):
    d = json.load(open(f, encoding="utf8"))
    if isinstance(d, dict):
        passages.update(d.get("passages", {}))
        questions += d["questions"]
    else:
        questions += d
questions = [q for q in questions if q.get("m") in order]
questions.sort(key=lambda q: (order[q["m"]], q["id"]))
for k in ("nvo",):
    for q in questions: q.pop(k, None)
js = lambda o: json.dumps(o, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
html = open(os.path.join(here, "app.html"), encoding="utf8").read()
logo = base64.b64encode(open(os.path.join(here, "..", "..", "public", "assets", "logo.png"), "rb").read()).decode()
html = (html.replace("/*__BANK__*/null", js({"passages": passages, "questions": questions}))
            .replace("/*__MODULES__*/[]", js(mods))
            .replace("__LOGO__", "data:image/png;base64," + logo))
open(out, "w", encoding="utf8").write(html)
# The same page as a complete document, for sending as a file (the artifact publish adds this skeleton itself).
head = ('<!doctype html>\n<html lang="bg">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
        '<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>\n')
title_end = html.index("</title>") + len("</title>")
standalone = head + html[:title_end] + "\n</head>\n<body>\n" + html[title_end:] + "\n</body>\n</html>\n"
open(out[:-5] + "-file.html", "w", encoding="utf8").write(standalone)
from collections import Counter
print(out, f"{len(html)//1024} KB", len(questions), "questions", dict(Counter(q["m"] for q in questions)))
