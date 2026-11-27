"""„200 задачи по математика“ (5.–7. клас, Знам / Разбирам / Мисля) → math modules for the trainer.

    python3 -I tools/nvo-trener/math200.py <out-folder> private/mat/g5.json private/mat/g6.json private/mat/g7.json
    python3 -I tools/nvo-trener/math_nvo.py <out-folder> --out add.json --review преглед.html
    node scripts/admin.mjs trener-bank-add add.json      (the modules go in as drafts: only „преглед…“ codes see them)
    python3 -I tools/nvo-trener/math200.py --pdf pdf-content.json private/mat/g5.json …   (input for scripts/quiz-pdf)

Source (paid content, outside git): {"parts": [{"id": "5a", "grade": 5, "title": "…", "tasks": [task…]}]},
task = {n, lv (0 Знам, 1 Разбирам, 2 Мисля), q, o: [right, wrong×3], h (hint), s: [{do, why}], a, trap, card, t}.
Every part becomes three modules (one per level) „mz-<part>-<level>“ in the section „Задачи като на НВО“;
the worked solution (`sol`) is the trainer's step list, `why` is the common trap, `sk` the skill of the card.
In the text {a/b} is a fraction and braces without „/“ a set, e.g. {2; 3}."""
import html, json, os, re, sys

LEVELS = [("znam", "Знам", "едно правило, една стъпка"), ("razbiram", "Разбирам", "2–3 стъпки и чест капан"),
          ("mislya", "Мисля", "текстови и многостъпкови задачи")]
SEC = {"5a": "num", "5b": "geo", "6a": "pct", "6b": "geo", "7a": "alg", "7b": "geo"}
# Card of „Еду БЕЛ – Математика“ → skill of the trainer's map (bank.skills).
SKILL = {4: "m-delimost", 5: "m-drobi", 6: "m-racionalni", 7: "m-stepeni", 8: "m-modul", 9: "m-merni", 10: "m-proporcii",
         11: "m-procenti", 12: "m-ceni", 13: "m-ceni", 14: "m-mnogochleni", 15: "m-formuli", 16: "m-razlagane",
         17: "m-lineyni", 18: "m-razlagane", 19: "m-uravnenie-modul", 20: "m-neravenstva", 21: "m-tekstovi",
         22: "m-dvizhenie", 23: "m-rabota", 24: "m-smesi", 25: "m-agli", 26: "m-agli", 27: "m-nerav-triag",
         28: "m-ednakvi", 29: "m-ravnobedren", 30: "m-pravoagalen", 31: "m-ravnobedren", 32: "m-pravoagalen",
         33: "m-lica", 34: "m-lica", 35: "m-lica", 36: "m-tela", 37: "m-tela", 38: "m-danni", 39: "m-veroyatnost",
         40: "m-mnozhestva", 41: "m-lineyni", 42: "m-tekstovi", 43: "m-ednakvi", 44: "m-racionalni", 45: "m-stepeni",
         46: "m-racionalni", 47: "m-razlagane", 48: "m-merni", 49: "m-lica"}
FIRST_N = 301  # module order after the topic modules mz-… (201–206)


def m(s):
    """Plain text with {a/b} fractions → the trainer's HTML (escaped, .fr fractions, line breaks)."""
    s = html.escape(str(s), quote=False)
    s = re.sub(r"\{([^{}/]+)/([^{}]+)\}", r'<span class="fr"><span>\1</span><span>\2</span></span>', s)
    return s.replace("\n", "<br>")


def fig_html(f):
    """A table, bar chart or pie chart for the trainer (HTML table / inline SVG; the trainer keeps these tags)."""
    if f["type"] == "table":
        head = "".join(f"<th>{m(x)}</th>" for x in f["head"])
        rows = "".join("<tr>" + "".join(f"<td>{m(x)}</td>" for x in r) + "</tr>" for r in f["rows"])
        return f'<table class="mtable"><thead><tr>{head}</tr></thead><tbody>{rows}</tbody></table>'
    if f["type"] == "bar":
        W, H, L, B, T = 320, 220, 34, 30, 22  # width, height, left axis, bottom labels, top
        top, step, vals = f["max"], f["step"], f["values"]
        y = lambda v: T + (H - T - B) * (1 - v / top)
        g = []
        for v in range(0, top + 1, step):
            g.append(f'<line x1="{L}" y1="{y(v):.1f}" x2="{W - 6}" y2="{y(v):.1f}" stroke="currentColor" stroke-opacity="{0.35 if v == 0 else 0.12}" stroke-width="1"></line>')
            if v % (step * 2) == 0 or step >= 10:
                g.append(f'<text x="{L - 6}" y="{y(v) + 4:.1f}" font-size="11" text-anchor="end" fill="currentColor">{v}</text>')
        bw = (W - L - 16) / len(vals)
        for i, (lab, v) in enumerate(zip(f["labels"], vals)):
            x = L + 8 + i * bw + bw * 0.18
            g.append(f'<rect x="{x:.1f}" y="{y(v):.1f}" width="{bw * 0.64:.1f}" height="{y(0) - y(v):.1f}" rx="3" fill="#6b5e98"></rect>')
            g.append(f'<text x="{x + bw * 0.32:.1f}" y="{H - 10}" font-size="12" text-anchor="middle" fill="currentColor">{html.escape(lab)}</text>')
        g.append(f'<text x="{L}" y="13" font-size="12" font-weight="700" fill="currentColor">{html.escape(f.get("title", ""))}</text>')
        return f'<svg viewBox="0 0 {W} {H}" width="100%" class="mfig">{"".join(g)}</svg>'
    if f["type"] == "pie":
        import math
        cx, cy, r, a0, g = 110, 112, 88, -90.0, []
        colors = ["#6b5e98", "#3d777a", "#b98d4f", "#a6534f"]
        legend = []
        for i, sct in enumerate(f["sectors"]):
            a1 = a0 + sct["deg"]
            p = lambda a: (cx + r * math.cos(math.radians(a)), cy + r * math.sin(math.radians(a)))
            (x0, y0), (x1, y1) = p(a0), p(a1)
            large = 1 if sct["deg"] > 180 else 0
            g.append(f'<path d="M{cx},{cy} L{x0:.1f},{y0:.1f} A{r},{r} 0 {large} 1 {x1:.1f},{y1:.1f} Z" fill="{colors[i % 4]}" stroke="#fff" stroke-width="2"></path>')
            mx, my = cx + r * 0.62 * math.cos(math.radians((a0 + a1) / 2)), cy + r * 0.62 * math.sin(math.radians((a0 + a1) / 2))
            g.append(f'<text x="{mx:.1f}" y="{my + 4:.1f}" font-size="12" font-weight="700" text-anchor="middle" fill="#fff">{sct["deg"]}°</text>')
            legend.append(f'<rect x="222" y="{70 + i * 26}" width="14" height="14" rx="3" fill="{colors[i % 4]}"></rect><text x="242" y="{82 + i * 26}" font-size="13" fill="currentColor">{html.escape(sct["label"])} – {sct["deg"]}°</text>')
            a0 = a1
        title = f'<text x="0" y="13" font-size="12" font-weight="700" fill="currentColor">{html.escape(f.get("title", ""))}</text>'
        return f'<svg viewBox="0 0 360 214" width="100%" class="mfig">{title}{"".join(g)}{"".join(legend)}</svg>'
    return ""


def sol(t):
    steps = "".join(f'<li><span class="do">{m(x["do"])}</span><span class="why">{m(x["why"])}</span></li>' for x in t["s"])
    # „Find the wrong line“: the letters are shuffled in the trainer, so name the wrong statement itself.
    err = f'<p><b>Грешката е в:</b> {m(t["o"][0])}<br><b>Вярно е:</b> {m(t["err"]["fix"])}</p><p><br></p>' if t.get("err") else ""
    return (err + f'<ol class="steps sol">{steps}</ol><p><br><b>Отговор:</b> {m(t["a"])}</p>'
            f'<p><small>Преговори: карта {t["card"]:02d} – {m(t["t"])}</small></p>')


def _seeded(seed):
    h = 2166136261
    for ch in str(seed):
        h = ((h ^ ord(ch)) * 16777619) & 0xFFFFFFFF
    def nxt():
        nonlocal h
        h = ((h ^ (h >> 15)) * 2246822507) & 0xFFFFFFFF
        return h
    return nxt


def _shuffled(items, seed):
    nxt, a = _seeded(seed), list(items)
    for i in range(len(a) - 1, 0, -1):
        j = nxt() % (i + 1)
        a[i], a[j] = a[j], a[i]
    return a


def option_order(n):
    """Fixed order of the 4 options of task n in the PDF (index 0 = the right one). Every 4 consecutive tasks put the
    right answer once on each of А, Б, В, Г. Never change it: printed and sent copies must keep their letters."""
    right = _shuffled([0, 1, 2, 3], f"b{(n - 1) // 4}")[(n - 1) % 4]
    wrong = _shuffled([1, 2, 3], f"w{n}")
    wrong.insert(right, 0)
    return wrong


def pdf_content(out, files):
    parts, questions = [], []
    for f in files:
        for part in json.load(open(f, encoding="utf8"))["parts"]:
            pid = f"mat-{part['id']}"
            parts.append({"id": pid, "grade": part["grade"], "title": part["title"]})
            for t in part["tasks"]:
                order = option_order(t["n"])
                questions.append({"n": t["n"], "part": pid, "grade": part["grade"], "subject": "Математика", "level": t["lv"] + 1,
                                  "q": t["q"], "options": [t["o"][i] for i in order], "correct": order.index(0), "hint": t["h"],
                                  "steps": t["s"], "answer": t["a"], "trap": t["trap"], "card": t["card"],
                                  "review": f"Карта {t['card']:02d} · {t['t']}",
                                  # optional: a table / bar / pie chart, „За напреднали“, „Грешката е в ред …“ + what is right
                                  **{k: t[k] for k in ("fig", "adv", "err") if t.get(k)}})
    json.dump({"parts": parts, "questions": questions}, open(out, "w", encoding="utf8"), ensure_ascii=False, indent=1)
    print(f"{len(questions)} задачи → {out}")


def main(out, files):
    os.makedirs(out, exist_ok=True)
    modules, k = [], 0
    for f in files:
        for part in json.load(open(f, encoding="utf8"))["parts"]:
            for lv, (slug, name, about) in enumerate(LEVELS):
                tasks = [t for t in part["tasks"] if t["lv"] == lv]
                if not tasks:
                    continue
                mid = f"mz-{part['id']}-{slug}"
                modules.append({"n": FIRST_N + k, "id": mid, "sec": SEC.get(part["id"], "num"), "area": "math", "draft": True,
                                "title": f"{part['grade']}. клас · {part['title']} · {name}",
                                "desc": f"200 задачи · ниво „{name}“ ({lv + 1} т.): {about}. С решение стъпка по стъпка."})
                k += 1
                qs = []
                for i, t in enumerate(tasks):
                    right = (t["n"] - 1) % 4  # the trainer shuffles on screen; this only spreads the stored index
                    o = [m(x) for x in t["o"][1:]]
                    o.insert(right, m(t["o"][0]))
                    qs.append({"id": f"{mid}-{i + 1:02d}", "m": mid, "t": "mc", "h": 1, "q": ("<small>За напреднали</small><br>" if t.get("adv") else "") + m(t["q"]) + (fig_html(t["fig"]) if t.get("fig") else ""), "o": o, "a": right,
                               "why": m(t["trap"]), "sol": sol(t), "sk": SKILL[t["card"]], "n200": t["n"]})
                json.dump(qs, open(os.path.join(out, f"{mid}.json"), "w", encoding="utf8"), ensure_ascii=False, indent=1)
    json.dump(modules, open(os.path.join(out, "modules.json"), "w", encoding="utf8"), ensure_ascii=False, indent=1)
    print(f"{len(modules)} модула → {out}")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    if sys.argv[1] == "--pdf":
        pdf_content(sys.argv[2], sys.argv[3:])
    else:
        main(sys.argv[1], sys.argv[2:])
