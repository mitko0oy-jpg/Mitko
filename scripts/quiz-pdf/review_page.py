"""A page for the reviewing teacher: every question of a „200 въпроса / задачи“ PDF with the right answer marked.

    python3 -I scripts/quiz-pdf/review_page.py <content.json> <out.html>

<content.json> is the PDF input (bel200.py / math200.py --pdf). The letters are the PDF's. The page is paid content:
keep it in private/. The teacher's ticks „прегледано“ stay only in their browser."""
import html as H
import json
import sys

LV = {1: "Знам", 2: "Разбирам", 3: "Мисля"}
L = "АБВГ"


def main(src, out):
    c = json.load(open(src, encoding="utf8"))
    math = all(q.get("subject", "Математика") == "Математика" for q in c["questions"])
    word = "Задача" if math else "Въпрос"
    title = c.get("title") or ("200 задачи по математика" if math else "200 въпроса")
    rows = []
    for p in c["parts"]:
        rows.append(f"<h2>{H.escape(p['title'])}</h2>")
        for q in [x for x in c["questions"] if x["part"] == p["id"]]:
            ps = "".join(f'<p class="ps">{H.escape(l)}</p>' for l in (q.get("passage") or []))
            opts = "".join(f"<li class='{'ok' if i == q['correct'] else ''}'><b>{L[i]})</b> {H.escape(o)}</li>" for i, o in enumerate(q["options"]))
            if q.get("steps"):
                expl = "<ol class='st'>" + "".join(f"<li><b>{H.escape(s['do'])}</b><br>{H.escape(s['why'])}</li>" for s in q["steps"]) + "</ol>"
                expl += f"<p class='w'><b>Отговор:</b> {H.escape(q.get('answer', ''))}</p><p class='w'><b>Уловката:</b> {H.escape(q.get('trap', ''))}</p>"
            else:
                expl = f"<p class='w'><b>Защо:</b> {H.escape(q.get('why', ''))}</p>"
            rows.append(f"<article><span class='id'>{word} {q['n']:03d} · {LV[q['level']]}</span><p class='q'>{H.escape(q['q'])}</p>{ps}<ol class='o'>{opts}</ol>"
                        f"<p class='h'><b>Подсказка:</b> {H.escape(q.get('hint', ''))}</p>{expl}<p class='r'>Преговори: {H.escape(q.get('review', ''))}</p>"
                        f"<label class='mark'><input type='checkbox'> прегледано</label></article>")
    page = f"""<!doctype html><html lang="bg"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{H.escape(title)} – за преглед</title><style>
:root{{--bg:#f5f1e8;--paper:#fffefb;--ink:#172e42;--muted:#647581;--ok:#286658;--okbg:#e3efe9;--line:#e1dcd1}}
@media (prefers-color-scheme:dark){{:root{{--bg:#0e1a26;--paper:#16263a;--ink:#e8eef3;--muted:#a9b8c3;--ok:#6fcfa9;--okbg:#173a30;--line:#2c3f55}}}}
body{{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 system-ui,sans-serif}}main{{max-width:760px;margin:0 auto;padding:16px}}
article{{background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:12px 16px;margin:10px 0}}.id{{font-size:12px;color:var(--muted)}}
.q{{font-weight:600;margin:4px 0}}.ps{{font-style:italic;margin:0 0 0 12px;border-left:3px solid var(--line);padding-left:8px}}.o{{list-style:none;padding:0;margin:6px 0;display:grid;gap:3px}}
.o li{{padding:3px 8px;border-radius:8px}}.o li.ok{{background:var(--okbg);color:var(--ok);font-weight:600}}.h,.w,.r{{margin:4px 0;font-size:15px}}.r{{color:var(--muted)}}.st{{font-size:15px}}
.mark{{display:block;margin-top:6px;font-size:14px;color:var(--muted)}}
</style></head><body><main><h1>{H.escape(title)} – за преглед от учител</h1>
<p>Верният отговор е оцветен в зелено; буквите са като в PDF-а. Пишете на Митко номера и какво да се поправи. Отметките „прегледано“ остават само в този браузър.</p>
{''.join(rows)}</main><script>document.querySelectorAll("article").forEach(a=>{{const id=a.querySelector(".id").textContent,b=a.querySelector(".mark input"),k=document.title+":"+id;try{{b.checked=localStorage.getItem(k)==="1"}}catch(e){{}}b.addEventListener("change",()=>{{try{{localStorage.setItem(k,b.checked?"1":"0")}}catch(e){{}}}})}})</script></body></html>"""
    open(out, "w", encoding="utf8").write(page)
    print(f"✓ {out}: {len(c['questions'])} {'задачи' if math else 'въпроса'}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
