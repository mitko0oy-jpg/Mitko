"""Recover the question bank from a built trainer (e.g. the published Artifact saved with the Artifact tool's read).
Usage: python3 -I tools/nvo-trener/extract.py <built.html> [out.json]  (default out: private/nvo-trener/bank/all.json)"""
import json, os, sys
here = os.path.dirname(os.path.abspath(__file__))
src = open(sys.argv[1], encoding="utf8").read()
marker = "window.TRENER_BANK = " if "window.TRENER_BANK = " in src else "const BANK = "  # older builds used the second form
start = src.index(marker) + len(marker)
bank, _ = json.JSONDecoder().raw_decode(src[start:])
out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(here, "..", "..", "private", "nvo-trener", "bank", "all.json")
os.makedirs(os.path.dirname(out), exist_ok=True)
json.dump(bank, open(out, "w", encoding="utf8"), ensure_ascii=False, indent=1)
print(out, len(bank["questions"]), "questions,", len(bank["passages"]), "passages")
