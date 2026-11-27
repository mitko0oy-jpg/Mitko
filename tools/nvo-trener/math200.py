"""„200 задачи по математика“ (5.–7. клас, Знам / Разбирам / Мисля) → math modules for the trainer.

    python3 -I tools/nvo-trener/math200.py <out-folder> private/mat/g5.json private/mat/g6.json private/mat/g7.json
    python3 -I tools/nvo-trener/math_nvo.py <out-folder> --out add.json --review преглед.html
    node scripts/admin.mjs trener-bank-add add.json      (the modules go in as drafts: only „преглед…“ codes see them)

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


def sol(t):
    steps = "".join(f'<li><span class="do">{m(x["do"])}</span><span class="why">{m(x["why"])}</span></li>' for x in t["s"])
    return (f'<ol class="steps sol">{steps}</ol><p><br><b>Отговор:</b> {m(t["a"])}</p>'
            f'<p><small>Преговори: карта {t["card"]:02d} – {m(t["t"])}</small></p>')


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
                    qs.append({"id": f"{mid}-{i + 1:02d}", "m": mid, "t": "mc", "h": 1, "q": m(t["q"]), "o": o, "a": right,
                               "why": m(t["trap"]), "sol": sol(t), "sk": SKILL[t["card"]], "n200": t["n"]})
                json.dump(qs, open(os.path.join(out, f"{mid}.json"), "w", encoding="utf8"), ensure_ascii=False, indent=1)
    json.dump(modules, open(os.path.join(out, "modules.json"), "w", encoding="utf8"), ensure_ascii=False, indent=1)
    print(f"{len(modules)} модула → {out}")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2:])
