"""Check a question bank file against SCHEMA.md. Usage: python3 -I validate.py bank/<file>.json [more files]"""
import json, sys, re, collections
ALLOWED_TAGS = re.compile(r"</?(i|b|u|br)\s*/?>")
def bad_html(s):
    return re.sub(ALLOWED_TAGS, "", s).count("<") > 0
errs = []
ids = set()
for path in sys.argv[1:]:
    data = json.load(open(path, encoding="utf8"))
    qs = data["questions"] if isinstance(data, dict) else data
    passages = data.get("passages", {}) if isinstance(data, dict) else {}
    per = collections.Counter(); types = collections.Counter(); apos = collections.Counter()
    for q in qs:
        i = q.get("id", "?")
        E = lambda m: errs.append(f"{path} {i}: {m}")
        if i in ids: E("duplicate id")
        ids.add(i)
        for k in ("id", "m", "t", "q", "why"):
            if not isinstance(q.get(k), str) or not q[k].strip(): E(f"missing {k}")
        if not re.fullmatch(r"[a-z0-9-]+-\d\d", i): E("id format")
        if not i.startswith(q.get("m", "") + "-"): E("id does not start with module id")
        per[q.get("m")] += 1; types[q.get("t")] += 1
        for k in ("q", "text", "why", "hint"):
            if isinstance(q.get(k), str) and bad_html(q[k]): E(f"disallowed html in {k}")
        if '"' in q.get("q", "") + q.get("text", ""): E('straight double quote – use „…“')
        t = q.get("t")
        if t == "mc":
            o = q.get("o")
            if not (isinstance(o, list) and len(o) == 4 and all(isinstance(x, str) and x.strip() for x in o)): E("mc needs 4 options")
            elif len(set(x.strip().lower() for x in o)) != 4: E("duplicate options")
            if not isinstance(q.get("a"), int) or not 0 <= q["a"] <= 3: E("mc a must be 0..3")
            else: apos[q["a"]] += 1
            if o and any(re.match(r"^\s*[АБВГабвг][).]\s", x) for x in o): E("option starts with a letter")
            if o and any(re.search(r"всички (изброени|посочени)|нито (един|една|едно) от", x, re.I) for x in o): E("all/none-of-the-above option")
        elif t == "input":
            a = q.get("a")
            if not (isinstance(a, list) and a and all(isinstance(x, str) and x.strip() for x in a)): E("input a must be non-empty list")
        elif t == "match":
            p = q.get("pairs")
            if not (isinstance(p, list) and 3 <= len(p) <= 5 and all(isinstance(x, list) and len(x) == 2 for x in p)): E("match needs 3-5 pairs")
            elif len(set(x[1] for x in p)) != len(p): E("match right sides not unique")
        elif t == "order":
            it = q.get("items")
            if not (isinstance(it, list) and 3 <= len(it) <= 6): E("order needs 3-6 items")
            elif len(set(it)) != len(it): E("order items not unique")
        else:
            E(f"unknown type {t}")
        if q.get("p") and q["p"] not in passages: E("unknown passage id")
    print(path, dict(per), dict(types), "answer positions:", dict(sorted(apos.items())))
    for pid, p in passages.items():
        if not (isinstance(p.get("title"), str) and isinstance(p.get("text"), list) and p["text"]): errs.append(f"{path} passage {pid}: needs title and text[]")
print("\n".join(errs) if errs else "OK – no errors")
sys.exit(1 if errs else 0)
