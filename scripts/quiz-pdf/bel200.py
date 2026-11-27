"""„200 въпроса по литература“ / „200 въпроса по български език“: check the questions and make the PDF input.

    python3 -I scripts/quiz-pdf/bel200.py <Литература|Български език> <out-content.json> <parts.json>... [--old old.json]
    python3 -I scripts/quiz-pdf/build_quiz_pdf.py <out-content.json> <out.pdf>

<parts.json> (paid content, outside git): {"parts": [{"id": "1", "title": "…", "tasks": [question…]}]},
question = {n, lv (0 Знам, 1 Разбирам, 2 Мисля), work, q, passage (null | [lines]), o: [right, wrong×3], h, why, review}.
--old: earlier questions ({q} list) that must not come back, e.g. the BEL „200 въпроса“.
The А–Г order is fixed by the question number (as for the math PDF): never change it after copies are out."""
import json, os, re, sys
from difflib import SequenceMatcher

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "tools", "nvo-trener"))
from math200 import option_order  # noqa: E402

PROTECTED = ["Художник", "Ханчев"]  # authors who died less than 70 years ago: no quotes
BANNED = re.compile(r"\bвсички\b|\bнито един|\b[АБВГ] и [АБВГ]\b|\bтеза\b", re.I)


def main(subject, out, files, old_file=None):
    errors, warns, parts, questions = [], [], [], []
    old = [x["q"] for x in json.load(open(old_file, encoding="utf8"))] if old_file else []
    norm = lambda s: re.sub(r"[^\w ]+", "", s.lower()).strip()
    prefix = "lit" if subject == "Литература" else "ez"
    seen = set()
    for f in files:
        for part in json.load(open(f, encoding="utf8"))["parts"]:
            pid = f"{prefix}-{part['id']}"
            parts.append({"id": pid, "title": part["title"]})
            last = 0
            for t in part["tasks"]:
                w = f"№{t.get('n')}"
                if not isinstance(t.get("n"), int) or t["n"] in seen:
                    errors.append(f"{w}: номер")
                seen.add(t.get("n"))
                if t.get("lv") not in (0, 1, 2) or t["lv"] < last:
                    errors.append(f"{w}: нивата Знам → Разбирам → Мисля")
                last = t.get("lv", last)
                for k in ("work", "q", "h", "why", "review"):
                    if not str(t.get(k) or "").strip():
                        errors.append(f"{w}: липсва {k}")
                o = t.get("o") or []
                if len(o) != 4 or len({norm(x) for x in o}) != 4:
                    errors.append(f"{w}: 4 различни отговора")
                text = " ".join([t.get("q", ""), t.get("h", ""), t.get("why", ""), *o, *(t.get("passage") or [])])
                if BANNED.search(" ".join(o)) or re.search(r"\bтеза\b", text, re.I):
                    errors.append(f"{w}: „всички“, „нито един“, „А и Б“ или „теза“")
                if '"' in text:
                    warns.append(f"{w}: прави кавички – трябват „…“")
                if t.get("passage") and any(p in (t.get("work", "") + t.get("review", "")) for p in PROTECTED):
                    errors.append(f"{w}: цитат от защитен автор")
                for q in old:
                    if SequenceMatcher(None, norm(q), norm(t.get("q", ""))).ratio() > 0.85:
                        warns.append(f"{w}: прилича на стар въпрос: „{q[:70]}“")
                order = option_order(t["n"])
                questions.append({"n": t["n"], "part": pid, "subject": subject, "level": t["lv"] + 1, "q": t["q"],
                                  "passage": t.get("passage") or None, "options": [o[i] for i in order] if len(o) == 4 else o,
                                  "correct": order.index(0), "hint": t["h"], "why": t["why"], "review": t["review"]})
            lv = [sum(1 for t in part["tasks"] if t.get("lv") == k) for k in range(3)]
            print(f"{pid} {part['title']}: {len(part['tasks'])} въпроса (Знам {lv[0]}, Разбирам {lv[1]}, Мисля {lv[2]}) · до {lv[0] + 2 * lv[1] + 3 * lv[2]} т.")
    ns = sorted(seen)
    if ns and ns != list(range(1, len(ns) + 1)):
        warns.append(f"номерата не са поредни 1–{len(ns)}")
    for x in warns:
        print("! " + x)
    if errors:
        print("\n".join("✗ " + x for x in errors))
        sys.exit(1)
    title = f"200 въпроса по {'литература' if subject == 'Литература' else 'български език'}"
    json.dump({"title": title, "parts": parts, "questions": questions}, open(out, "w", encoding="utf8"), ensure_ascii=False, indent=1)
    print(f"✓ {len(questions)} въпроса → {out}")


if __name__ == "__main__":
    a = sys.argv[1:]
    old = None
    if "--old" in a:
        i = a.index("--old")
        old = a[i + 1]
        del a[i:i + 2]
    if len(a) < 3:
        sys.exit(__doc__)
    main(a[0], a[1], a[2:], old)
