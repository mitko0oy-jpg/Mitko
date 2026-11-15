"""Turns the card modules of the platform into trainer modules (area "cards").
Input: an export of the platform content (node scripts/admin.mjs export > private/content/export.json).
Output: private/nvo-trener/bank/cards.json (paid content, never in git).
Usage: python3 -I tools/nvo-trener/cards.py [export.json] [out.json]
Card data in the platform: {q, o: [right answer first, 3 wrong], e: explanation, qt: quote or null, l: level, n, w}."""
import json, os, sys

here = os.path.dirname(os.path.abspath(__file__))
root = os.path.join(here, "..", "..")
src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(root, "private", "content", "export.json")
out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(root, "private", "nvo-trener", "bank", "cards.json")
d = json.load(open(src, encoding="utf8"))
items = {}
for it in sorted(d["items"], key=lambda i: (i["module_slug"], i["position"])):
    if it["status"] != "hidden":
        items.setdefault(it["module_slug"], []).append(it["data"])

# trainer module id -> (platform module, level filter)
PLAN = [
    ("karti1", "bel7-karti", 0), ("karti2", "bel7-karti", 1), ("karti3", "bel7-karti", 2),
    ("ezik5", "bel5-ezik", None), ("ezik6", "bel6-ezik", None), ("ezik7", "bel7-ezik", None),
]
# Keep to the 5–7 grade programme: the two tenses of grade 8 are left out, and the grade 7 term is
# "преизказни форми", not "преизказно наклонение".
LATER = ("бъдеще предварително в миналото", "бъдеще предварително")
def fit(c):
    if c["o"][0].strip().lower() in LATER:
        return None
    c = dict(c, o=list(c["o"]))
    for i in range(1, 4):
        if c["o"][i].strip().lower() in LATER:
            c["o"][i] = next(x for x in ("минало неопределено", "сегашно време", "минало несвършено") if x not in c["o"])
    for k in ("q", "e"):
        if c.get(k):
            c[k] = c[k].replace("преизказно наклонение", "преизказна форма")
    return c

questions = []
for mid, slug, level in PLAN:
    cards = [f for f in (fit(c) for c in items.get(slug, []) if level is None or c.get("l") == level) if f]
    if not cards:
        sys.exit(f"no cards for {mid} ({slug})")
    for i, c in enumerate(cards, 1):
        o = c["o"]
        if len(o) != 4:
            sys.exit(f"{slug} card {c.get('n')}: needs 4 options")
        # Spread the right answer over the four places (they are shuffled on screen anyway).
        k = (i - 1) % 4
        opts = o[1:]
        opts.insert(k, o[0])
        q = {"id": f"{mid}-{i:02d}", "m": mid, "t": "mc", "q": c["q"], "o": opts, "a": k, "why": c.get("e") or ""}
        if c.get("qt"):
            q["text"] = c["qt"]
        if c.get("w"):
            q["topic"] = c["w"]
        questions.append(q)
os.makedirs(os.path.dirname(out), exist_ok=True)
json.dump(questions, open(out, "w", encoding="utf8"), ensure_ascii=False, indent=1)
from collections import Counter
print(out, len(questions), dict(Counter(q["m"] for q in questions)))
