"""Builds data/english-zipf.json: how common everyday English words are.

Margin's "Terms on this page" uses it to tell course vocabulary ("amortized", "heap") from
ordinary words ("people", "first"). Values are Zipf frequencies x10 (7.7 = "the", 3.0 ≈ once per
million words), for lowercase alphabetic words with Zipf >= 3.

Data: wordfreq by Robyn Speer (https://github.com/rspeer/wordfreq), CC BY-SA 4.0.
Run:  pip install wordfreq && python3 tools/build_wordfreq.py
"""
import json, os, re
from wordfreq import top_n_list, zipf_frequency

out = {}
for w in top_n_list("en", 60000):
    if not re.fullmatch(r"[a-z][a-z']*[a-z]|[a-z]", w):
        continue
    z = zipf_frequency(w, "en")
    if z < 3.0:
        break
    out[w] = round(z * 10)
path = os.path.join(os.path.dirname(__file__), "..", "data", "english-zipf.json")
with open(path, "w") as f:
    json.dump(out, f, separators=(",", ":"))
print(f"{len(out)} words -> {os.path.relpath(path)} ({os.path.getsize(path) // 1024} KB)")
