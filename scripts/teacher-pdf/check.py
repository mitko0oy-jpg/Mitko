"""Check the content of a teacher kit („Учителски комплект“, 5.–7. клас) before the PDF is made.

    python3 -I scripts/teacher-pdf/check.py <file.json>... [--old do-not-repeat.json]

A file holds any of: {"sheets": […]} (работни листове), {"tests": […], "skills": […]} (входен/изходен тест, варианти А и Б),
{"quizzes": […]} (викторини за класа), {"missions": […]} (детективски мисии). The content is paid: it stays in private/.

Task = {lv: 0|1|2, type, q, passage?: [lines], why, pts? (tests), skill? (tests)} and by type:
  mc    o: [right, wrong×3]                      tf    items: [{s, v: true|false}] (3–6)
  match pairs: [[left, right]…] (3–6)            order items: [in the right order] (3–6)
  fill  text with ___ per gap, answers: […], bank?: [words to choose from, the answers among them]
  open  lines: 2–10, answer: sample answer, crit: [criteria]
Clue of a mission = {title, story, task (mc) | {type: "word", q, answer, pick}, letter}; the letters spell the mission's code."""
import json
import re
import sys
from difflib import SequenceMatcher

LV = (0, 1, 2)
BANNED_OPT = re.compile(r"\bвсички\b|\bнито един|\b[АБВГ] и [АБВГ]\b", re.I)
TESA = re.compile(r"\bтез[аи]\b", re.I)
norm = lambda s: re.sub(r"[^\w ]+", "", str(s).lower()).strip()


class Check:
    def __init__(self, old):
        self.errors, self.warns, self.texts, self.old = [], [], [], old

    def err(self, w, m):
        self.errors.append(f"{w}: {m}")

    def warn(self, w, m):
        self.warns.append(f"{w}: {m}")

    def strings(self, x):
        if isinstance(x, str):
            yield x
        elif isinstance(x, list):
            for y in x:
                yield from self.strings(y)
        elif isinstance(x, dict):
            for k, y in x.items():
                if k not in ("type", "id", "unit", "skill", "section"):
                    yield from self.strings(y)

    def language(self, w, obj):
        text = " ".join(self.strings(obj))
        if TESA.search(text):
            self.err(w, "думата „теза“")
        if '"' in text:
            self.warn(w, "прави кавички – трябват „…“")
        if re.search(r"\s-\s", text):
            self.warn(w, "тире с „-“ – трябва „–“")

    def task(self, w, t, test=False):
        if not isinstance(t, dict):
            return self.err(w, "задачата не е обект")
        if t.get("lv") not in LV:
            self.err(w, "lv трябва да е 0, 1 или 2")
        for k in ("q", "why"):
            if not str(t.get(k) or "").strip():
                self.err(w, f"липсва {k}")
        if t.get("passage") is not None and (not isinstance(t["passage"], list) or not all(isinstance(x, str) and x.strip() for x in t["passage"])):
            self.err(w, "passage е списък с редове или null")
        ty = t.get("type")
        if ty == "mc":
            o = t.get("o") or []
            if len(o) != 4 or len({norm(x) for x in o}) != 4 or not all(str(x).strip() for x in o):
                self.err(w, "mc: 4 различни отговора")
            if BANNED_OPT.search(" ".join(map(str, o))):
                self.err(w, "mc: „всички“, „нито един“ или „А и Б“ в отговорите")
        elif ty == "tf":
            it = t.get("items") or []
            if not 3 <= len(it) <= 6 or not all(isinstance(x, dict) and str(x.get("s") or "").strip() and isinstance(x.get("v"), bool) for x in it):
                self.err(w, "tf: 3–6 твърдения {s, v: true|false}")
            elif len({x["v"] for x in it}) < 2:
                self.err(w, "tf: нужни са и верни, и неверни твърдения")
        elif ty == "match":
            p = t.get("pairs") or []
            if not 3 <= len(p) <= 6 or not all(isinstance(x, list) and len(x) == 2 and all(str(y).strip() for y in x) for x in p):
                self.err(w, "match: 3–6 двойки [ляво, дясно]")
            elif len({norm(x[1]) for x in p}) != len(p) or len({norm(x[0]) for x in p}) != len(p):
                self.err(w, "match: повтаря се елемент")
        elif ty == "order":
            it = t.get("items") or []
            if not 3 <= len(it) <= 6 or len({norm(x) for x in it}) != len(it):
                self.err(w, "order: 3–6 различни елемента в правилния ред")
        elif ty == "fill":
            txt, ans = str(t.get("text") or ""), t.get("answers") or []
            gaps = txt.count("___")
            if not gaps or gaps != len(ans) or not all(str(a).strip() for a in ans):
                self.err(w, f"fill: {gaps} празнини „___“, а отговорите са {len(ans)}")
            if t.get("bank") is not None:
                bank = [norm(b) for b in t["bank"]]
                if any(norm(a) not in bank for a in ans):
                    self.err(w, "fill: верните отговори трябва да са в bank")
        elif ty == "open":
            if not isinstance(t.get("lines"), int) or not 1 <= t["lines"] <= 12:
                self.err(w, "open: lines 1–12")
            if not str(t.get("answer") or "").strip():
                self.err(w, "open: липсва примерен отговор (answer)")
            if not isinstance(t.get("crit"), list) or not t["crit"]:
                self.err(w, "open: липсват критерии (crit)")
        else:
            self.err(w, f"непознат вид „{ty}“")
        if test:
            if not isinstance(t.get("pts"), int) or not 1 <= t["pts"] <= 8:
                self.err(w, "pts 1–8")
            if not t.get("skill"):
                self.err(w, "липсва skill")
        self.language(w, t)
        q = norm(t.get("q", "")) + " " + " ".join(norm(x) for x in (t.get("passage") or []))
        if len(q) > 25:
            for prev, pw in self.texts:
                if SequenceMatcher(None, prev, q).ratio() > 0.9:
                    self.warn(w, f"прилича на {pw}")
                    break
            for o in self.old:
                if SequenceMatcher(None, o, norm(t.get("q", ""))).ratio() > 0.85:
                    self.warn(w, f"прилича на стар въпрос: „{o[:60]}“")
                    break
            self.texts.append((q, w))

    def sheets(self, sheets):
        ids = set()
        for s in sheets:
            w = s.get("id", "?")
            if w in ids:
                self.err(w, "повтарящо се id")
            ids.add(w)
            for k in ("unit", "title", "section", "goal"):
                if not str(s.get(k) or "").strip():
                    self.err(w, f"липсва {k}")
            ts = s.get("tasks") or []
            if not 5 <= len(ts) <= 9:
                self.err(w, f"{len(ts)} задачи (трябват 6–8)")
            lv = [t.get("lv") for t in ts]
            if lv != sorted(lv, key=lambda x: x if x in LV else 9):
                self.err(w, "нивата Знам → Разбирам → Мисля")
            if not all(k in lv for k in LV):
                self.err(w, "трябват и трите нива")
            if len({t.get("type") for t in ts}) < 3:
                self.warn(w, "по-малко от 3 вида задачи")
            if not any(t.get("type") == "open" for t in ts):
                self.warn(w, "няма задача със свободен отговор")
            for i, t in enumerate(ts, 1):
                self.task(f"{w} зад. {i}", t)
            self.language(w, {k: s.get(k) for k in ("title", "subtitle", "goal")})

    def tests(self, tests, skills):
        sk = {x.get("id") for x in skills or []}
        if not sk:
            self.err("tests", "липсва списъкът skills [{id, t}]")
        for t in tests:
            w = t.get("id", "?")
            for k in ("title", "covers", "minutes"):
                if not t.get(k):
                    self.err(w, f"липсва {k}")
            a, b = t.get("A") or [], t.get("B") or []
            if len(a) != len(b) or not 15 <= len(a) <= 25:
                self.err(w, f"варианти А ({len(a)}) и Б ({len(b)}) – еднакъв брой, 15–25 задачи")
            for i, (x, y) in enumerate(zip(a, b), 1):
                for k in ("skill", "type", "lv", "pts"):
                    if x.get(k) != y.get(k):
                        self.err(f"{w} зад. {i}", f"А и Б се различават по {k}")
                for v, z in (("А", x), ("Б", y)):
                    self.task(f"{w}-{v} зад. {i}", z, test=True)
                    if z.get("skill") and z["skill"] not in sk:
                        self.err(f"{w}-{v} зад. {i}", f"непознато умение {z['skill']}")
                if norm(x.get("q")) == norm(y.get("q")) and x.get("passage") == y.get("passage"):
                    self.err(f"{w} зад. {i}", "А и Б са еднакви")
            pa, pb = sum(x.get("pts", 0) for x in a), sum(x.get("pts", 0) for x in b)
            if pa != pb or pa != t.get("max", pa):
                self.err(w, f"точки: А {pa}, Б {pb}")
            print(f"{w} {t.get('title')}: {len(a)} задачи × 2 варианта, {pa} т.")

    def quizzes(self, qz):
        for z in qz:
            w = z.get("id", "?")
            qs = z.get("questions") or []
            if not 10 <= len(qs) <= 15:
                self.err(w, f"{len(qs)} въпроса (трябват 10–15)")
            for k in ("title", "topic"):
                if not z.get(k):
                    self.err(w, f"липсва {k}")
            for i, q in enumerate(qs, 1):
                q = {"type": "mc", **q}
                if q["type"] != "mc":
                    self.err(f"{w} в. {i}", "викторината е само с 4 отговора (mc)")
                self.task(f"{w} в. {i}", q)
                if any(len(str(o)) > 70 for o in q.get("o") or []):
                    self.warn(f"{w} в. {i}", "дълъг отговор (> 70 знака) – трудно се чете на проектора")
                if len(q.get("q", "")) > 220:
                    self.warn(f"{w} в. {i}", "дълъг въпрос (> 220 знака)")

    def missions(self, ms):
        for m in ms:
            w = m.get("id", "?")
            for k in ("title", "topic", "intro", "finale", "code", "minutes"):
                if not m.get(k):
                    self.err(w, f"липсва {k}")
            code = str(m.get("code") or "").upper()
            cl = m.get("clues") or []
            if not 4 <= len(cl) <= 8 or len(cl) != len(code):
                self.err(w, f"{len(cl)} улики, а кодът „{code}“ има {len(code)} букви (4–8)")
            for i, c in enumerate(cl, 1):
                cw = f"{w} улика {i}"
                for k in ("title", "story", "letter"):
                    if not c.get(k):
                        self.err(cw, f"липсва {k}")
                t = c.get("task") or {}
                if t.get("type") == "word":
                    ans = str(t.get("answer") or "")
                    pick = t.get("pick")
                    if not ans or not isinstance(pick, int) or not 1 <= pick <= len(ans):
                        self.err(cw, "word: answer и pick (номер на буквата)")
                    elif ans[pick - 1].upper() != str(c.get("letter", "")).upper():
                        self.err(cw, f"буква {pick} на „{ans}“ не е „{c.get('letter')}“")
                    for k in ("q", "why"):
                        if not str(t.get(k) or "").strip():
                            self.err(cw, f"липсва {k}")
                    self.language(cw, t)
                else:
                    self.task(cw, {"type": "mc", **t})
                if i <= len(code) and str(c.get("letter", "")).upper() != code[i - 1]:
                    self.err(cw, f"буквата „{c.get('letter')}“ не е {i}-ата буква на кода „{code}“")
            self.language(w, {k: m.get(k) for k in ("title", "intro", "finale", "teacher")})


def main(files, old_file):
    old = [norm(x["q"]) for x in json.load(open(old_file, encoding="utf8"))] if old_file else []
    c = Check(old)
    for f in files:
        d = json.load(open(f, encoding="utf8"))
        if "sheets" in d:
            c.sheets(d["sheets"])
            n = sum(len(s.get("tasks") or []) for s in d["sheets"])
            print(f"{f}: {len(d['sheets'])} работни листа, {n} задачи")
        if "tests" in d:
            c.tests(d["tests"], d.get("skills"))
        if "quizzes" in d:
            c.quizzes(d["quizzes"])
            print(f"{f}: {len(d['quizzes'])} викторини, {sum(len(z.get('questions') or []) for z in d['quizzes'])} въпроса")
        if "missions" in d:
            c.missions(d["missions"])
            print(f"{f}: {len(d['missions'])} мисии, {sum(len(m.get('clues') or []) for m in d['missions'])} улики")
    for x in c.warns:
        print("! " + x)
    if c.errors:
        print("\n".join("✗ " + x for x in c.errors))
        sys.exit(1)
    print("✓ без грешки в структурата")


if __name__ == "__main__":
    a = sys.argv[1:]
    old = None
    if "--old" in a:
        i = a.index("--old")
        old = a[i + 1]
        del a[i:i + 2]
    if not a:
        sys.exit(__doc__)
    main(a, old)
