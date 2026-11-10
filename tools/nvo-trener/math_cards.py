"""Math cards (Карти по математика за НВО, 5.–7. клас) -> data for the trainer: private/nvo-trener/math.json.
Usage: python3 -I tools/nvo-trener/math_cards.py <cards.html> [out.json]
Reads the published card page (the print design: <article class="face front|back a-xxx" aria-label="Карта N, ...">
and the table of all 50 cards) and writes:
  index     – all 50 cards (number, section, title, grades), so the app can show the whole box, "скоро" for the missing ones;
  cards     – the written cards, front and back as blocks of cleaned HTML (fractions, italic letters, figures);
  questions – practice made from each card: "Опитай сам" (numeric answers are checked), the worked example and the
              second-part task (solve on paper, then compare), one "which is right?" per trap, and the trap cards' slips;
  modules   – one per card ("mk-N"), for grades and stars.
build.py adds it to the bank (bank.math + questions + modules). The cards are paid content: the output stays in private/."""
import html as H, json, os, re, sys
from html.parser import HTMLParser

here = os.path.dirname(os.path.abspath(__file__))
src = sys.argv[1]
out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(here, "..", "..", "private", "nvo-trener", "math.json")

SECTIONS = [
    ("sys", "Старт", "#C49A3C"), ("num", "Числа и действия", "#3F7A8C"), ("pct", "Проценти и пари", "#A8641B"),
    ("alg", "Алгебра", "#2F5597"), ("mod", "Текстови задачи", "#8C3F5A"), ("geo", "Геометрия", "#2E7D4F"),
    ("dat", "Данни и вероятности", "#6A4C93"), ("p2", "Втора част", "#1B2A4A"), ("trap", "Капан · намери грешката", "#B23A3A"),
    ("fin", "Финал", "#C49A3C"),
]
BY_NAME = {t: i for i, t, _ in SECTIONS}
BY_COLOR = {c.lower(): i for i, _, c in reversed(SECTIONS)}

# ---------- a tiny DOM, so the HTML can be cleaned and read safely ----------
VOID = {"br", "img", "hr", "path", "circle", "line", "rect", "ellipse", "polyline", "polygon", "stop", "use"}
TAGS = {"span", "b", "i", "em", "strong", "small", "sup", "sub", "p", "ol", "ul", "li", "div", "section", "br", "h5",
        "figure", "figcaption", "details", "summary", "table", "thead", "tbody", "tr", "th", "td",
        "svg", "g", "path", "circle", "line", "rect", "ellipse", "polyline", "polygon", "text", "tspan"}
SVG_ATTRS = {"width", "height", "viewbox", "d", "stroke", "stroke-width", "fill", "cx", "cy", "r", "rx", "ry", "x", "y",
             "x1", "y1", "x2", "y2", "points", "transform", "text-anchor", "font-size", "font-style", "font-family",
             "font-weight", "stroke-dasharray", "stroke-linecap", "stroke-linejoin", "opacity", "dominant-baseline",
             "fill-opacity", "stroke-opacity"}


class Node:
    def __init__(self, tag, attrs, parent=None):
        self.tag, self.attrs, self.kids, self.parent = tag, dict(attrs), [], parent

    @property
    def cls(self):
        return (self.attrs.get("class") or "").split()


class Tree(HTMLParser):
    def __init__(self, s):
        super().__init__(convert_charrefs=True)
        self.root = self.cur = Node("root", {})
        self.feed(s)

    def handle_starttag(self, tag, attrs):
        n = Node(tag, attrs, self.cur)
        self.cur.kids.append(n)
        if tag not in VOID:
            self.cur = n

    def handle_startendtag(self, tag, attrs):
        self.cur.kids.append(Node(tag, attrs, self.cur))

    def handle_endtag(self, tag):
        n = self.cur
        while n is not self.root and n.tag != tag:
            n = n.parent
        if n is not self.root:
            self.cur = n.parent

    def handle_data(self, d):
        self.cur.kids.append(d)


def parse(s):
    return Tree(s).root


def find(n, pred):
    out = []
    for k in n.kids:
        if isinstance(k, Node):
            if pred(k):
                out.append(k)
            out += find(k, pred)
    return out


def first(n, pred):
    r = find(n, pred)
    return r[0] if r else None


has = lambda c: (lambda n: c in n.cls)
tag = lambda t: (lambda n: n.tag == t)


def clean(n):
    """Inner HTML with only the allowed tags and attributes (class; drawing attributes on SVG)."""
    out = []
    for k in n.kids:
        if isinstance(k, str):
            out.append(H.escape(re.sub(r"\s+", " ", k), quote=False))
            continue
        if k.tag not in TAGS:
            out.append(clean(k))
            continue
        attrs = []
        for a, v in k.attrs.items():
            v = v or ""
            if a == "class" and re.fullmatch(r"[\w -]+", v):
                attrs.append(f' class="{v}"')
            elif a.lower() in SVG_ATTRS and re.fullmatch(r"[\w .,#%()-]*", v):
                attrs.append(f' {a}="{v}"')
            elif a == "style" and k.tag == "svg" and re.fullmatch(r"[\w .:;%-]*", v):
                # the drawings are sized for a 10 cm card; on a phone they are shown about twice as big
                v = re.sub(r"(\d+(?:\.\d+)?)cqw", lambda m: f"{min(90, round(float(m.group(1)) * 2, 1))}cqw", v)
                attrs.append(f' style="{v}"')
        at = "".join(attrs)
        if k.tag == "br":
            out.append("<br>")
        elif k.tag in VOID:
            out.append(f"<{k.tag}{at}/>")  # inside <svg> an element must close itself
        else:
            out.append(f"<{k.tag}{at}>{clean(k)}</{k.tag}>")
    return re.sub(r"<div>\s*</div>", "", re.sub(r"\s+", " ", "".join(out))).strip()


def text(n):
    """Plain text, with fractions as a/b."""
    if isinstance(n, str):
        return n
    if "fr" in n.cls:
        parts = [text(k).strip() for k in n.kids if isinstance(k, Node)]
        return "/".join(parts) if len(parts) == 2 else "".join(parts)
    return "".join(text(k) for k in n.kids)


T = lambda n: re.sub(r"\s+", " ", text(n)).strip() if n is not None else ""


def outer(n):
    holder = Node("root", {})
    holder.kids = [n]
    return clean(holder)


# ---------- numbers in answers ----------
NUM = r"[−-]?\d+(?:[.,]\d+)?(?:\s*/\s*\d+(?:[.,]\d+)?)?"


def value(tok):
    tok = tok.replace("−", "-").replace(",", ".").replace(" ", "")
    if "/" in tok:
        a, b = tok.split("/")
        return float(a) / float(b) if float(b) else None
    return float(tok)


def numeric(ans):
    """(value, unit) when the answer is one number (with an optional unit), else None."""
    s = re.sub(r"^\s*Отговор:\s*", "", ans).strip()
    s = re.sub(r"(?<=\d) (?=\d{3}\b)", "", s)  # 10 000 -> 10000
    if re.search(r"\bили\b|;|\sи\s|,\s|[<>≤≥≠]", s):  # several answers, or an inequality: solved on paper
        return None
    if "=" in s:
        s = s.split("=")[-1]
    toks = re.findall(NUM, s)
    if len(toks) != 1:
        return None
    unit = s[s.find(toks[0].strip()) + len(toks[0].strip()):].strip(" .")
    if len(unit) > 8 or re.search(r"\d", unit):
        return None
    return value(toks[0]), unit


# ---------- the cards ----------
def blocks(safe):
    """The parts of a card face, in order (header, title, footer and QR left out)."""
    out = []
    for k in safe.kids:
        if not isinstance(k, Node) or k.tag in ("header", "footer", "h4") or "nvo" in k.cls:
            continue
        for q in find(k, has("qr")):
            q.parent.kids.remove(q)
        for u in find(k, has("upside")):  # the upside-down answer becomes a tap-to-show answer
            u.tag, u.attrs = "details", {"class": "upside"}
            u.kids = [Node("summary", {}), Node("p", {})] if False else [u_sum(), u_p(u.kids)]
        h5 = first(k, tag("h5"))
        out.append({"tag": k.tag if k.tag in ("section", "p", "div", "ol", "ul", "table") else "div", "cls": " ".join(k.cls), "h": T(h5) if h5 else "", "html": clean(k)})
    return [b for b in out if b["html"]]


def u_sum():
    s = Node("summary", {})
    s.kids = ["Покажи отговора"]
    return s


def u_p(kids):
    p = Node("p", {})
    p.kids = kids
    return p


def practice(n, front, back):
    qs, mid = [], f"mk-{n}"
    task = first(back, has("task"))
    ex_ctx = clean(task) if task is not None else ""
    # "Опитай сам": a numeric answer is checked, anything else is solved on paper and compared.
    for t in find(back, has("try")):
        up = first(t, has("upside"))
        ps = [k for k in t.kids if isinstance(k, Node) and k.tag == "p" and "upside" not in k.cls]
        if up is None or not ps:
            continue
        ans = re.sub(r"^\s*Отговор:\s*", "", T(up))
        q = {"id": f"m{n}-t", "m": mid, "h": 1, "q": clean(ps[0]), "a": [ans]}
        nv = numeric(ans)
        if nv:
            q.update(t="input", num=[nv[0]], unit=nv[1])
        else:
            q.update(t="self")
        qs.append(q)
    # The worked example (or the second-part task): solve it without looking, then compare with the solution.
    ans = first(back, has("ans"))
    sol = first(back, has("steps")) or first(back, has("sheetlines"))
    ftask = first(front, has("task"))
    if ans is not None and sol is not None and (task is not None or ftask is not None):
        q_html = ex_ctx or clean(ftask)
        qs.append({"id": f"m{n}-x", "m": mid, "h": 1, "t": "self", "q": q_html, "a": [re.sub(r"^\s*Отговор:\s*", "", T(ans))], "sol": outer(sol)})
    # Each trap: which of the two is right?
    for i, tr in enumerate(find(back, has("trap"))):
        bad, good, why = first(tr, has("bad")), first(tr, has("good")), first(tr, has("why"))
        if bad is None or good is None:
            continue
        strip = lambda s: re.sub(r"^\s*[✗✓]\s*", "", s)
        qs.append({"id": f"m{n}-k{i + 1}", "m": mid, "h": 1, "t": "mc", "text": ex_ctx or (clean(ftask) if ftask is not None else ""),
                   "q": "Кое е вярно?", "o": [strip(clean(good)), strip(clean(bad))], "a": 0, "why": clean(why) if why is not None else ""})
    # Trap cards: three wrong solutions – what is the right result?
    slips, fixes = find(front, has("slip")), find(back, has("fix"))
    for i, (sl, fx) in enumerate(zip(slips, fixes)):
        ok = first(fx, has("ok"))
        if ok is None:
            continue
        ok_t = re.sub(r"^\s*✓\s*", "", T(ok))
        explain = " ".join(clean(p) for p in find(fx, tag("p")) if "ok" not in p.cls and "ref" not in p.cls)
        ref = first(fx, has("ref"))
        sp = first(sl, tag("p"))
        q = {"id": f"m{n}-s{i + 1}", "m": mid, "h": 1, "text": clean(sp) if sp is not None else clean(sl),
             "q": "Има една грешка. Какъв е верният резултат?", "a": [ok_t],
             "why": explain + (f" <b>{H.escape(T(ref))}</b>" if ref is not None else "")}
        nv = numeric(ok_t)
        if nv:
            q.update(t="input", num=[nv[0]], unit=nv[1])
        else:
            q.update(t="self", q="Има една грешка. Намери я и я поправи.")
        qs.append(q)
    return qs


def index(root):
    """The table of all 50 cards: number, section (by the colour of its group), title, grades."""
    out, sec = [], "sys"
    tbl = first(root, has("list50"))
    if tbl is None:
        return out
    for tr in find(tbl, tag("tr")):
        if "grp" in tr.cls:
            dot = first(tr, has("dot"))
            col = re.search(r"#[0-9a-fA-F]{6}", (dot.attrs.get("style") or "") if dot is not None else "")
            sec = BY_NAME.get(T(tr)) or (BY_COLOR.get(col.group(0).lower(), sec) if col else sec)
            continue
        tds = [k for k in tr.kids if isinstance(k, Node) and k.tag == "td"]
        if len(tds) < 3:
            continue
        rng = re.fullmatch(r"(\d+)\s*[–-]\s*(\d+)", T(tds[0]))
        if rng:  # "44–49 | 6 карти по 3 грешни решения ..."
            for k in range(int(rng.group(1)), int(rng.group(2)) + 1):
                out.append({"n": k, "area": sec, "title": "Три решения, три грешки", "grades": T(tds[2])})
        elif T(tds[0]).isdigit():
            out.append({"n": int(T(tds[0])), "area": sec, "title": T(tds[1]), "grades": T(tds[2])})
    return out


raw = open(src, encoding="utf8").read()
raw = re.sub(r"data:[a-z]+/[^\"')]+", "", raw)
root = parse(raw)
cards = {}
for art in find(root, tag("article")):
    m = re.match(r"Карта (\d+)", art.attrs.get("aria-label") or "")
    if not m or "face" not in art.cls:
        continue
    n = int(m.group(1))
    area = next((c[2:] for c in art.cls if c.startswith("a-")), "sys")
    safe = first(art, has("safe"))
    c = cards.setdefault(n, {"n": n, "area": area})
    if "front" in art.cls:
        c["title"] = T(first(safe, has("ctitle")))
        g = first(safe, has("grades"))
        c["grades"] = "".join(T(i) for i in find(g, tag("i"))) if g is not None else ""
        area_t = first(safe, has("area"))
        c["areaT"] = T(area_t)
        nvo = first(safe, has("nvo"))
        if nvo is not None:
            st = first(nvo, has("stars"))
            c["stars"] = T(st).count("★") if st is not None else 0
            c["nvo"] = re.sub(r"^[★☆\s]+", "", T(nvo))
        c["_front"] = safe
    else:
        bh = first(safe, has("bhead"))
        spans = [k for k in bh.kids if isinstance(k, Node)] if bh is not None else []
        c["backT"] = T(spans[-1]) if len(spans) > 1 else ""
        c["_back"] = safe

questions = []
for c in cards.values():
    fr, bk = c.pop("_front", Node("x", {})), c.pop("_back", Node("x", {}))
    qs = practice(c["n"], fr, bk)
    questions += qs
    c["q"] = len(qs)
    c["front"], c["back"] = blocks(fr), blocks(bk)
cards = [cards[k] for k in sorted(cards)]
idx = index(root)
sec_of = {e["n"]: e["area"] for e in idx}
for c in cards:
    c["sec"] = sec_of.get(c["n"], c["area"])  # the group in the box (the colour comes from c.area)
    for e in idx:
        if e["n"] == c["n"]:
            e["title"], e["grades"] = c["title"], "–".join(c["grades"][::len(c["grades"]) - 1]) if len(c["grades"]) > 1 else c["grades"]
if not idx:
    idx = [{"n": c["n"], "area": c["area"], "title": c["title"], "grades": c["grades"]} for c in cards]
modules = [{"id": f"mk-{c['n']}", "n": 100 + c["n"], "title": f"Карта {c['n']}: {c['title']}", "area": "math", "sec": c["sec"], "desc": c.get("nvo", "")}
           for c in cards if c["q"]]
data = {"title": "Математика за НВО · 5.–7. клас", "sections": [{"id": i, "t": t, "c": col} for i, t, col in SECTIONS],
        "index": idx, "cards": cards, "questions": questions, "modules": modules}
os.makedirs(os.path.dirname(out), exist_ok=True)
json.dump(data, open(out, "w", encoding="utf8"), ensure_ascii=False, indent=1)
print(out, f"{len(idx)} in the index, {len(cards)} written:", [c["n"] for c in cards], f"{len(questions)} practice questions")
for q in questions:
    print(" ", q["id"], q["t"], q.get("num", ""), q.get("unit", ""), "|", re.sub(r"<[^>]+>", "", q.get("text", "") + " " + q["q"])[:90], "→", q.get("a") if q["t"] != "mc" else re.sub(r"<[^>]+>", "", q["o"][0]))
