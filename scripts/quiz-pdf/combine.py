"""Join several „200“ PDF inputs into one book (e.g. „600 въпроса и задачи“: math + literature + language).

    python3 -I scripts/quiz-pdf/combine.py "<title>" <out-content.json> <content.json>...

Each <content.json> is a PDF input made by math200.py --pdf or bel200.py. The questions are numbered again
from 1 in the given order (the first book keeps its numbers); the options keep their order, so every letter
stays as in the separate PDFs. Every part gets the subject of its questions."""
import json
import sys


def main(title, out, files):
    parts, questions, n = [], [], 0
    for f in files:
        c = json.load(open(f, encoding="utf8"))
        subj = {}
        for q in c["questions"]:
            subj.setdefault(q["part"], q.get("subject", "Математика"))
        for p in c["parts"]:
            parts.append({**p, "subject": subj[p["id"]]})
        for q in sorted(c["questions"], key=lambda q: q["n"]):
            n += 1
            questions.append({**q, "n": n, "subject": q.get("subject", "Математика")})
    ids = [p["id"] for p in parts]
    if len(set(ids)) != len(ids):
        sys.exit("Повтарящи се части – дай им различни id.")
    json.dump({"title": title, "parts": parts, "questions": questions}, open(out, "w", encoding="utf8"), ensure_ascii=False, indent=1)
    by = {}
    for q in questions:
        by.setdefault(q["subject"], [0, 0])
        by[q["subject"]][0] += 1
        by[q["subject"]][1] += q["level"]
    print(f"✓ {len(questions)} в {len(parts)} части → {out}: " + "; ".join(f"{s} {a} ({b} т.)" for s, (a, b) in by.items()))


if __name__ == "__main__":
    if len(sys.argv) < 4:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2], sys.argv[3:])
