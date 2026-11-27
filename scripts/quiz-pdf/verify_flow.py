"""Check the retry flow: first try q -> c „Вярно!“ (right) / h hint (wrong); hint -> r second try (only „Опитай пак“);
second try -> v „Вярно от втория опит!“ (right) / s solution or explanation (wrong); v -> s („Виж решението“) or next.

    python3 -I scripts/quiz-pdf/verify_flow.py <pdf> <keys.json> <content.json>

Works for one book (math, literature, language) and for a book with several subjects (e.g. „600 въпроса и
задачи“): there the main menu leads to a menu for each subject, „Части“ leads to the subject's menu and the end
of a subject's last part leads to the next subject (or the parent page) and to the main menu."""
import json, re, sys, random
from pypdf import PdfReader

pdf, keys_path, content_path = sys.argv[1:4]
r = PdfReader(pdf)
if r.is_encrypted:
    r.decrypt('')
keys = json.load(open(keys_path))
content = json.load(open(content_path))
def words(q):  # math: „Задача“ / „Решение“; literature and language: „Въпрос“ / „Обяснение“
    return ('Задача', 'Решение') if q.get('subject', 'Математика') == 'Математика' else ('Въпрос', 'Обяснение')
N = len(r.pages)
assert N == len(keys), (N, len(keys))
idx = {k: i for i, k in enumerate(keys)}
page_of_ref = {p.indirect_reference.idnum: i for i, p in enumerate(r.pages)}

def links(i):
    out = []
    for a in r.pages[i].get('/Annots') or []:
        a = a.get_object()
        if a.get('/Subtype') != '/Link':
            continue
        dest = a.get('/Dest') or a['/A'].get('/D')
        out.append(([float(v) for v in a['/Rect']], keys[page_of_ref[dest[0].idnum]]))
    return out

texts = {}
def text(i):
    if i not in texts:
        texts[i] = r.pages[i].extract_text() or ''
    return texts[i]

qs, parts = content['questions'], content['parts']
MULTI = 'menu1' in keys  # several subjects: a menu for each subject
subjects = list(dict.fromkeys(p.get('subject') for p in parts))
menu_of = {i: (f'menu{subjects.index(p.get("subject")) + 1}' if MULTI else 'menu') for i, p in enumerate(parts, 1)}
errors, counts = [], dict(option_links=0, right=0, wrong_to_hint=0, option_links2=0, right2=0, wrong2_to_solution=0)
nxt, part_of = {}, {}
n = 0
for pi, p in enumerate(parts, 1):
    pq = [q for q in qs if q['part'] == p['id']]
    for j, q in enumerate(pq):
        n += 1
        if q['n'] != n:
            errors.append(('numbering', q['n'], n))
        nxt[n] = f'end{pi}' if j == len(pq) - 1 else f'q{n + 1}'
        part_of[n] = pi

def chain(prefix):
    return [k for k in keys if k == prefix or k.startswith(prefix + '_')]

def options_of(page_key, targets):
    """The 4 answer buttons of a question page, sorted А..Г (rows top->bottom, then left->right)."""
    L = links(idx[page_key])
    opts = [l for l in L if l[1] in targets]
    opts.sort(key=lambda l: (-round(l[0][3]), l[0][0]))
    return opts, sorted(t for _, t in L if t not in targets)

def no_answer_text(q, body, extra=()):
    """Problems if a page shows the answer letter, the result, the solution or the right option."""
    bad = []
    if re.search(r'(^|[\s(])[АБВГ]\)', body):
        bad.append('letter)')
    for w in ('ВЕРНИЯТ', 'Верният', 'РЕШЕНИЕ СТЪПКА', 'Отговор:', 'Уловката', 'Преговори', 'Вярно е', 'Грешката е',
              'ЗАЩО', 'Защо:', 'Вярно!', 'точки при първи опит') + tuple(extra):
        if w in body:
            bad.append(w)
    flat = ' '.join(body.split())
    if any(st['do'][:25] in flat for st in q.get('steps') or [] if len(st['do']) >= 12):
        bad.append('step text')
    return bad, flat

for q in qs:
    num = q['n']
    menu = menu_of[part_of[num]]
    QWORD, SWORD = words(q)
    # first try: one -> „Вярно!“ (c), three -> hint (h)
    qc = chain(f'q{num}')
    opts, others = options_of(qc[-1], (f'c{num}', f'h{num}', f'w{num}'))
    if len(opts) != 4:
        errors.append((num, 'option count', len(opts)))
    for k, (rect, tgt) in enumerate(opts):
        counts['option_links'] += 1
        exp = f'c{num}' if k == q['correct'] else f'h{num}'
        if tgt != exp:
            errors.append((num, 'option', 'АБВГ'[k], tgt, exp))
        elif k == q['correct']:
            counts['right'] += 1
        else:
            counts['wrong_to_hint'] += 1
    exp_o = sorted([menu, nxt[num]] + ([qc[0]] if len(qc) > 1 else []))
    if others != exp_o:
        errors.append((num, 'q-nav', others, exp_o))
    # hint page: only „Опитай пак“ -> the second-try question
    rc = chain(f'r{num}')
    if not rc:
        errors.append((num, 'missing second try'))
        continue
    if [t for _, t in links(idx[f'h{num}'])] != [rc[0]]:
        errors.append((num, 'hint links', links(idx[f'h{num}'])))
    # second try: one -> „Вярно от втория опит!“ (v), three -> solution (s); „Пропусни“, „Части“ as on the first try
    opts2, others2 = options_of(rc[-1], (f'v{num}', f's{num}'))
    if len(opts2) != 4:
        errors.append((num, 'second-try option count', len(opts2)))
    for k, (rect, tgt) in enumerate(opts2):
        counts['option_links2'] += 1
        exp = f'v{num}' if k == q['correct'] else f's{num}'
        if tgt != exp:
            errors.append((num, 'second-try option', 'АБВГ'[k], tgt, exp))
        elif k == q['correct']:
            counts['right2'] += 1
        else:
            counts['wrong2_to_solution'] += 1
    exp_o2 = sorted([menu, nxt[num]] + ([rc[0]] if len(rc) > 1 else []))
    if others2 != exp_o2:
        errors.append((num, 'second-try nav', others2, exp_o2))
    # „Вярно от втория опит!“: „Виж решението/обяснението“ -> s, „Следваща …“ -> next
    if sorted(t for _, t in links(idx[f'v{num}'])) != sorted([f's{num}', nxt[num]]):
        errors.append((num, 'v links', links(idx[f'v{num}'])))
    for kind in 'cs':
        pages = chain(f'{kind}{num}')
        if not pages:
            errors.append((num, 'missing', kind))
        for k, pk in enumerate(pages):
            tg = sorted(t for _, t in links(idx[pk]))
            exp = [pages[k + 1]] if k < len(pages) - 1 else sorted([menu, nxt[num]])
            if tg != exp:
                errors.append((num, pk, tg, exp))
            if idx[pk] != idx[pages[0]] + k:
                errors.append((num, pk, 'not consecutive'))
    # page texts (math: „Задача“ / „Решение“; literature and language: „Въпрос“ / „Обяснение“)
    if f'{QWORD} {num:03d}' not in text(idx[qc[0]]) or f'{QWORD} {num:03d}' not in text(idx[rc[0]]):
        errors.append((num, 'q title'))
    if 'Вярно!' not in text(idx[f'c{num}']) or SWORD not in text(idx[f's{num}']):
        errors.append((num, 'c/s title'))
    if 'Вярно!' in text(idx[f's{num}']) or 'точки при първи опит' in text(idx[f's{num}']):
        errors.append((num, 's page shows result'))
    tv = text(idx[f'v{num}'])
    if 'Вярно от втория опит!' not in tv or 'Точки се дават само при първия опит.' not in tv:
        errors.append((num, 'v page text'))
    if q.get('err'):
        L_ = 'АБВГ'[q['correct']]
        for kind in 'cs':
            t = text(idx[f'{kind}{num}'])
            if f'Грешката е в ред {L_}' not in t or 'Вярно е:' not in t:
                errors.append((num, kind, 'err line missing'))

# hint pages and second-try pages: no letter, no answer, no result, no steps
hint_issues, second_issues = [], []
for q in qs:
    num = q['n']
    body = text(idx[f'h{num}'])
    bad, flat = no_answer_text(q, body, ('Покажи',))
    right = q['options'][q['correct']]
    if len(right) >= 4 and right in flat:
        bad.append(f'correct option text „{right}“')
    if 'Не е вярно' not in body or 'Подсказка' not in body:
        bad.append('missing status/hint')
    if bad:
        hint_issues.append((num, bad))
    for rk in chain(f'r{num}'):
        body = text(idx[rk])
        bad, flat = no_answer_text(q, body, ('Не е вярно', 'Подсказка'))
        if re.search(r'(?<![\d,])[123] т\.', body):
            bad.append('points shown')
        if rk == f'r{num}' and 'Втори опит' not in body:
            bad.append('no „Втори опит“ label')
        if bad:
            second_issues.append((num, rk, bad))
    bad, _ = no_answer_text(q, text(idx[f'v{num}']))
    if bad:
        second_issues.append((num, f'v{num}', bad))

# static pages and part transitions
exp_static = {'cover': ['parent'], 'parent': ['howto'], 'howto': ['menu'],
              'menu': sorted([f'part{i}' for i in range(1, len(parts) + 1)] + ['parent']), 'final': ['menu']}
if MULTI:  # main menu -> subject menus; each subject menu -> its parts, „Всички предмети“, „Инструкции“
    exp_static['menu'] = sorted([f'menu{k}' for k in range(1, len(subjects) + 1)] + ['parent'])
    for k in range(1, len(subjects) + 1):
        exp_static[f'menu{k}'] = sorted([f'part{i}' for i in menu_of if menu_of[i] == f'menu{k}'] + ['menu', 'parent'])
for k, e in exp_static.items():
    if sorted(t for _, t in links(idx[k])) != sorted(e):
        errors.append((k, links(idx[k])))
for i in range(1, len(parts) + 1):
    first = min(q['n'] for q in qs if q['part'] == parts[i - 1]['id'])
    if sorted(t for _, t in links(idx[f'part{i}'])) != sorted([f'q{first}', menu_of[i]]):
        errors.append((f'part{i}', links(idx[f'part{i}'])))
    e = sorted([f'part{i + 1}' if i < len(parts) else 'final', 'menu'])
    if MULTI:
        if i < len(parts) and menu_of[i + 1] == menu_of[i]:
            e = sorted([f'part{i + 1}', menu_of[i]])       # next part of the same subject, „Части“
        elif i < len(parts):
            e = sorted([menu_of[i + 1], 'menu'])            # next subject's menu, „Всички предмети“
        else:
            e = sorted(['final', 'menu'])
    if sorted(t for _, t in links(idx[f'end{i}'])) != e:
        errors.append((f'end{i}', links(idx[f'end{i}'])))
# footer page numbers on every page
foot_bad = [i + 1 for i in range(N) if f'{i + 1:03d} / {N:03d}' not in text(i)]
# max points per part: from content and from the part pages
pts_content = [sum(q['level'] for q in qs if q['part'] == p['id']) for p in parts]
pts_pages = []
for i in range(1, len(parts) + 1):
    m = re.search(r'до (\d+) точки', text(idx[f'part{i}']))
    pts_pages.append(int(m.group(1)) if m else None)
pts_menu = [int(x) for x in re.findall(r'до (\d+) точки', text(idx['menu']))]
if MULTI:  # parts are listed in the subject menus; the main menu has one total per subject
    pts_main = [int(x) for x in re.findall(r'до (\d+) точки', text(idx['menu']))]
    pts_menu = [int(x) for k in range(1, len(subjects) + 1) for x in re.findall(r'до (\d+) точки', text(idx[f'menu{k}']))]
pts_end = [int(re.search(r'Събра до (\d+) точки', text(idx[f'end{i}'])).group(1)) for i in range(1, len(parts) + 1)]
print(f'pages: {N} | tasks: {len(qs)} | first-try option links: {counts["option_links"]} '
      f'(right→„Вярно!“: {counts["right"]}, wrong→hint: {counts["wrong_to_hint"]}) | second-try option links: '
      f'{counts["option_links2"]} (right→„Вярно от втория опит!“: {counts["right2"]}, wrong→solution: {counts["wrong2_to_solution"]})')
print('link/text errors:', len(errors))
for e in errors[:15]:
    print('  ', e)
print('hint pages with issues:', len(hint_issues))
for h_ in hint_issues[:15]:
    print('  ', h_)
print('second-try / „Вярно от втория опит!“ pages with issues:', len(second_issues))
for h_ in second_issues[:15]:
    print('  ', h_)
print('footer number problems:', foot_bad[:10])
print('max points – content:', pts_content, sum(pts_content), '| part pages:', pts_pages, '| menu:', pts_menu, '| end pages:', pts_end)
if MULTI:
    per = {}
    for p, v in zip(parts, pts_content):
        per[p.get('subject')] = per.get(p.get('subject'), 0) + v
    print('subjects:', per, '| main menu:', pts_main,
          '| per-subject OK:', [per[x] for x in subjects] == pts_main)
    if pts_content != pts_pages or pts_content != pts_menu or pts_content != pts_end:
        print('  POINTS MISMATCH')
random.seed(11)
for num in sorted(random.sample(range(1, len(qs) + 1), 5)):
    q = qs[num - 1]
    qc = chain(f'q{num}')
    L = [l for l in links(idx[qc[-1]]) if l[1] in (f'c{num}', f'h{num}')]
    L.sort(key=lambda l: (-round(l[0][3]), l[0][0]))
    L2, _ = options_of(chain(f'r{num}')[-1], (f'v{num}', f's{num}'))
    print(f'task {num}: correct {"АБВГ"[q["correct"]]} | 1st:', ' '.join(f'{"АБВГ"[k]}→{t}(p{idx[t] + 1})' for k, (_, t) in enumerate(L)),
          f'| h{num}→' + ', '.join(f'{t}(p{idx[t] + 1})' for _, t in links(idx[f"h{num}"])),
          '| 2nd:', ' '.join(f'{"АБВГ"[k]}→{t}(p{idx[t] + 1})' for k, (_, t) in enumerate(L2)))
