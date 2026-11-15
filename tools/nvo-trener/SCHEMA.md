# Question format (one JSON file per writer: an array of objects)

Every object:
- "id": "<module>-<NN>", two-digit running number inside the module, e.g. "pravopis-07".
- "m": module id (given in your brief).
- "t": "mc" | "input" | "match" | "order".
- "q": the task wording in Bulgarian, addressed to the pupil ("Кое…", "Посочете…", "Запишете…"). Allowed tags: <i>, <b>, <u>, <br>. No other HTML.
- "text": OPTIONAL – a sentence, quote or excerpt shown above the question in a framed box (use it for the sentence to analyse, the verse to interpret, etc.). Allowed tags as above.
- "p": OPTIONAL, reading module only – id of the passage the question is about.
- "nvo": OPTIONAL – the NVO task number(s) this item imitates, as a string, e.g. "9" or "18".
- "why": REQUIRED – 1–2 sentences shown after the pupil answers: the rule or the fact behind the right answer, and the trap in the wrong one if useful. Warm, clear, for a 13-year-old.

By type:
- mc: "o": exactly 4 options (strings, no letters in front), "a": index (0–3) of the ONLY correct option. Options are shuffled on screen, so never write "всички изброени", "нито един от посочените", "А и Б". Add "fix": true only if the order of options must stay (rare).
- input: "a": array of ALL accepted answers (the first one is shown as "the right answer"). The check ignores capital letters, quotes, final punctuation and extra spaces, and nothing else – so list every acceptable variant (e.g. with and without "г."). Use input only when the answer is ONE word or a short fixed phrase with no realistic alternative wording. Add "hint" (e.g. "Запишете една дума.").
- match: "pairs": 3–4 pairs [left, right]; every right side unique. The pupil picks the right side for each left side from a dropdown.
- order: "items": 3–5 short items IN THE CORRECT ORDER (they are shuffled on screen).

Rules:
- Bulgarian only, official spelling and punctuation (Официален правописен речник, 2012 and later). Typographic quotes „…“ and the dash –.
- One unambiguous correct answer. If you are not sure about a fact or a rule, drop the item and write another. Never invent quotes: quote a work only if you are certain of the wording.
- Distractors must be plausible (typical pupil mistakes), similar in length to the right answer.
- Level: 7th grade NVO (national external assessment in Bulgarian language and literature). Practise knowledge AND prepare for the exam format.
- Spread the correct "a" index roughly evenly over 0–3.
- Mix: about 14 mc, 3 input, 2 match, 1 order per 20 questions (adapt if a type does not fit the topic).
- Output valid JSON (UTF-8, double quotes, no comments, no trailing commas).
