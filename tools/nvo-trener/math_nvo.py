"""Math tasks „като на НВО“ (modules mz-…): check them, make the file for the live bank and a page for the teacher.
Usage: python3 -I tools/nvo-trener/math_nvo.py <folder> [--out add.json] [--review review.html]
<folder> holds modules.json (the modules, in order) and <module id>.json (its tasks, format as in SCHEMA.md plus
h: 1, num/unit for a numeric answer, sol for a worked solution). The tasks are paid content: keep them in private/.
--out    -> {"modules", "questions"} for `node scripts/admin.mjs trener-bank-add <file>` (replaces only these modules)
--review -> one HTML page with every task and its right answer, for the teacher to check before anything goes live."""
import html as H, json, os, re, sys
from collections import Counter

args = sys.argv[1:]
if not args:
    sys.exit(__doc__)
folder = args[0]
opt = lambda k: args[args.index(k) + 1] if k in args else None

# The tags the trainer lets through in math tasks (mh() in trener.js), minus the drawing ones we do not need here.
OK_TAGS = {"i", "b", "em", "strong", "small", "sup", "sub", "span", "br", "p", "ol", "ul", "li", "div", "table", "tr", "td", "th", "tbody", "thead"}
errors, warns = [], []


def check_html(where, s):
    for t in re.findall(r"</?([a-zA-Z][a-zA-Z0-9]*)", s or ""):
        if t.lower() not in OK_TAGS:
            errors.append(f"{where}: таг <{t}> не се показва в тренажора")
    for a in re.findall(r"<[a-zA-Z]+\s+([^>]*)>", s or ""):
        for name in re.findall(r"([a-zA-Z-]+)\s*=", a):
            if name.lower() != "class":
                errors.append(f"{where}: атрибут {name} отпада в тренажора")
    if re.search(r"\d\.\d", re.sub(r"<[^>]+>", "", s or "")):
        warns.append(f"{where}: десетична точка? (у нас е запетая: 2,5)")


modules = json.load(open(os.path.join(folder, "modules.json"), encoding="utf8"))
questions = []
for m in modules:
    mid = m["id"]
    if not re.fullmatch(r"mz-[a-z0-9-]+", mid) or m.get("area") != "math":
        errors.append(f"{mid}: id mz-… и area math")
    path = os.path.join(folder, f"{mid}.json")
    if not os.path.exists(path):
        errors.append(f"{mid}: липсва {path}")
        continue
    qs = json.load(open(path, encoding="utf8"))
    seen = set()
    for i, q in enumerate(qs):
        w = q.get("id") or f"{mid}#{i + 1}"
        if q.get("m") != mid:
            errors.append(f"{w}: m трябва да е {mid}")
        if w in seen:
            errors.append(f"{w}: повторен id")
        seen.add(w)
        if q.get("t") not in ("mc", "input", "self"):
            errors.append(f"{w}: вид {q.get('t')}")
        if not q.get("why"):
            errors.append(f"{w}: липсва обяснение (why)")
        q["h"] = 1
        for k in ("q", "text", "why", "sol"):
            check_html(f"{w}.{k}", q.get(k))
        if q.get("t") == "mc":
            o = q.get("o") or []
            if len(o) != 4 or len(set(o)) != 4:
                errors.append(f"{w}: 4 различни отговора")
            if not isinstance(q.get("a"), int) or not 0 <= q["a"] < len(o):
                errors.append(f"{w}: a е номерът на верния отговор (0–3)")
            for j, x in enumerate(o):
                check_html(f"{w}.o{j}", x)
                if re.search(r"всички|нито един|[АБВГ] и [АБВГ]", re.sub(r"<[^>]+>", "", x), re.I):
                    errors.append(f"{w}.o{j}: отговорите се разбъркват – без „всички“, „А и Б“")
        if q.get("t") == "input":
            if not (isinstance(q.get("num"), list) and q["num"] and all(isinstance(x, (int, float)) for x in q["num"])):
                errors.append(f"{w}: num – числото на отговора")
            if not (isinstance(q.get("a"), list) and q["a"]):
                errors.append(f"{w}: a – как се показва отговорът")
        questions.append(q)
    spread = Counter(q["a"] for q in qs if q.get("t") == "mc")
    if spread and max(spread.values()) - min(spread.get(k, 0) for k in range(4)) > 3:
        warns.append(f"{mid}: верните отговори не са разпределени равномерно {dict(spread)}")
    print(f"{mid}: {len(qs)} задачи ({', '.join(f'{k} {v}' for k, v in Counter(q.get('t') for q in qs).items())})")

for w in warns:
    print("! " + w)
if errors:
    print("\n".join("✗ " + e for e in errors))
    sys.exit(1)

if opt("--out"):
    json.dump({"modules": modules, "questions": questions}, open(opt("--out"), "w", encoding="utf8"), ensure_ascii=False)
    print(f"✓ {opt('--out')}: {len(modules)} модула, {len(questions)} задачи")

if opt("--review"):
    LET = "АБВГ"
    rows = []
    for m in modules:
        rows.append(f"<h2>{H.escape(m['title'])} <small>{H.escape(m['id'])}</small></h2>")
        for q in [x for x in questions if x["m"] == m["id"]]:
            body = f"<div class='t'>{q['text']}</div>" if q.get("text") else ""
            body += f"<p class='q'>{q['q']}</p>"
            if q["t"] == "mc":
                body += "<ol class='o'>" + "".join(f"<li class='{'ok' if j == q['a'] else ''}'><b>{LET[j]}</b> {x}</li>" for j, x in enumerate(q["o"])) + "</ol>"
            else:
                body += f"<p class='ans'>Отговор: <b>{H.escape(q['a'][0])}</b>{(' ' + H.escape(q['unit'])) if q.get('unit') else ''}</p>"
            body += f"<p class='why'>{q['why']}</p>"
            if q.get("sol"):
                body += f"<details><summary>Решение</summary>{q['sol']}</details>"
            rows.append(f"<article><span class='id'>{H.escape(q['id'])}</span>{body}<label class='mark'><input type='checkbox'> прегледано</label></article>")
    page = f"""<!doctype html><html lang="bg"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Математика за преглед</title><style>
:root{{--bg:#F4F1FF;--paper:#fff;--ink:#1D1640;--muted:#5D5880;--ok:#0E8F67;--okbg:#E3F6EF;--line:#E1DBF5}}
@media (prefers-color-scheme:dark){{:root:not([data-theme=light]){{--bg:#0E0A22;--paper:#191337;--ink:#EEEAFF;--muted:#B4ADD8;--ok:#5FD3A8;--okbg:#123A2E;--line:#2E265F}}}}
:root[data-theme=dark]{{--bg:#0E0A22;--paper:#191337;--ink:#EEEAFF;--muted:#B4ADD8;--ok:#5FD3A8;--okbg:#123A2E;--line:#2E265F}}
body{{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 system-ui,sans-serif}}main{{max-width:760px;margin:0 auto;padding:16px}}
h1{{font-size:24px}}h2{{margin:28px 0 8px;font-size:20px}}h2 small{{color:var(--muted);font-weight:400;font-size:13px}}
article{{background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:14px 16px;margin:10px 0}}
.id{{font-size:12px;color:var(--muted)}}.q{{font-weight:600;margin:4px 0}}.t{{background:var(--bg);border-radius:8px;padding:8px 10px}}
.o{{list-style:none;padding:0;margin:6px 0;display:grid;gap:4px}}.o li{{padding:4px 8px;border-radius:8px}}.o li.ok{{background:var(--okbg);color:var(--ok);font-weight:600}}
.ans{{color:var(--ok)}}.why{{color:var(--muted);font-size:15px;margin:6px 0 0}}.mark{{display:block;margin-top:8px;font-size:14px;color:var(--muted)}}
.fr{{display:inline-flex;flex-direction:column;vertical-align:middle;text-align:center;line-height:1.05;font-size:.85em;margin:0 .15em}}
.fr>span:first-child{{border-bottom:1.5px solid currentColor;padding:0 .2em .1em}}.fr>span:last-child{{padding:.1em .2em 0}}
</style></head><body><main><h1>Задачи по математика „като на НВО“ – за преглед от учител</h1>
<p>{len(questions)} задачи в {len(modules)} теми. Верният отговор е оцветен в зелено. Отговорите в тренажора се разбъркват. Пишете на Митко номера на задачата (напр. mz-chisla-04) и какво да се поправи.</p>
{''.join(rows)}</main>
<script>
// The ticks stay in this browser only (the teacher's own list of what is checked).
document.querySelectorAll("article").forEach((a) => {{
  const id = a.querySelector(".id").textContent, box = a.querySelector(".mark input"), k = "mz-review:" + id;
  try {{ box.checked = localStorage.getItem(k) === "1"; }} catch (e) {{}}
  box.addEventListener("change", () => {{ try {{ localStorage.setItem(k, box.checked ? "1" : "0"); }} catch (e) {{}} }});
}});
</script></body></html>"""
    open(opt("--review"), "w", encoding="utf8").write(page)
    print(f"✓ {opt('--review')}")
