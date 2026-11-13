#!/usr/bin/env python3
"""Builds Margin's bundled OpenStax glossary dataset.

Pulls the "Key Terms" / "Glossary" pages of every live English OpenStax textbook and writes:
  data/openstax/books.json        [{t: title, s: slug, f: [fields], l: license}]
  data/openstax/<shard>.json      {normalized term: [[book index, definition], ...]}

OpenStax books are CC BY 4.0 or CC BY-NC-SA 4.0. Margin is free and non-commercial and shows
the book title and a link with every definition, which those licenses ask for.

Run from the repo root:  python3 tools/build_openstax.py
"""
import concurrent.futures as cf
import html
import json
import os
import re
import sys
import time
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "openstax")
UA = {"User-Agent": "Margin-glossary-builder/0.1 (free study extension)"}

# Title keywords -> Margin subject fields (must match the values in src/shared/lookup.js).
FIELDS = [
    (r"psycholog|lifespan", ["psychology"]),
    (r"behavioral neuroscience", ["neuroscience", "psychology", "biology"]),
    (r"sociolog", ["sociology"]),
    (r"econom", ["economics"]),
    (r"statistic|data science", ["statistics"]),
    (r"microbiolog", ["biology", "microbiology"]),
    (r"anatomy|physiology", ["biology", "anatomy"]),
    (r"biolog", ["biology"]),
    (r"organic chem", ["chemistry", "organic chemistry"]),
    (r"chemi", ["chemistry"]),
    (r"physics|fizyka", ["physics"]),
    (r"astronom", ["astronomy"]),
    (r"calculus|algebra|trigonometry|prealgebra|mathematics|precalc", ["mathematics"]),
    (r"computer science|python|information systems|programming|cybersecurity|web", ["computer science"]),
    (r"government|political", ["political science"]),
    (r"philosoph", ["philosophy"]),
    (r"anthropolog", ["anthropology"]),
    (r"accounting", ["accounting"]),
    (r"finance", ["finance"]),
    (r"marketing", ["marketing"]),
    (r"management|business|entrepreneur|organizational|leadership", ["management"]),
    (r"nursing|pharmacolog|nutrition|health|medical|maternal|psychiatric|population", ["nursing", "medicine"]),
    (r"history", ["history"]),
    (r"writing|literature|rhetoric", ["literature"]),
    (r"intellectual property|law", ["law"]),
]

LICENSES = {
    "Creative Commons Attribution License": "CC BY 4.0",
    "Creative Commons Attribution-NonCommercial-ShareAlike License": "CC BY-NC-SA 4.0",
}


def get_json(url, tries=3):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
                return json.load(r)
        except Exception:
            if i == tries - 1:
                raise
            time.sleep(1.5 * (i + 1))


def fields_for(title):
    out = []
    for pat, fs in FIELDS:
        if re.search(pat, title, re.I):
            out += [f for f in fs if f not in out]
    return out


def clean(s):
    s = re.sub(r"<[^>]+>", "", s)
    s = html.unescape(s)
    return re.sub(r"\s+", " ", s).strip()


def norm(s):
    s = s.lower().replace("’", "'")
    s = re.sub(r"[–—‐-]", " ", s)
    s = re.sub(r"[^a-z0-9' ]", "", s)
    return re.sub(r"\s+", " ", s).strip()


def keys_for(term):
    """'American Psychological Association (APA)' -> full, without parens, and the abbreviation."""
    keys = {norm(term)}
    m = re.match(r"^(.*?)\s*\(([^)]+)\)\s*$", term)
    if m:
        keys.add(norm(m.group(1)))
        if len(m.group(2)) <= 12:
            keys.add(norm(m.group(2)))
    return {k for k in keys if k}


def shard_of(key):
    c = key[0]
    return c if "a" <= c <= "z" else "_"


def walk(node, out):
    title = clean(node.get("title", ""))
    if re.fullmatch(r"(Key Terms|Glossary)", title, re.I):
        out.append(node["id"].split("@")[0])
    for c in node.get("contents", []):
        walk(c, out)
    return out


def main():
    rel = get_json("https://openstax.org/rex/release.json")
    archive = "https://openstax.org" + rel["archiveUrl"]
    cms = get_json(
        "https://openstax.org/apps/cms/api/v2/pages/?type=books.Book&limit=250"
        "&fields=title,cnx_id,book_state,license_name"
    )
    books = []
    for item in cms["items"]:
        cid = item.get("cnx_id")
        if item.get("book_state") != "live" or item["meta"].get("locale") != "en" or cid not in rel["books"]:
            continue
        books.append({"cid": cid, "v": rel["books"][cid]["defaultVersion"], "t": item["title"].strip(),
                      "s": item["meta"]["slug"], "f": fields_for(item["title"]),
                      "l": LICENSES.get(item.get("license_name"), item.get("license_name") or "")})
    print(f"{len(books)} live English books", file=sys.stderr)

    def pages_of(b):
        tree = get_json(f"{archive}/contents/{b['cid']}@{b['v']}.json")["tree"]
        return walk(tree, [])

    def terms_of(b, page):
        content = get_json(f"{archive}/contents/{b['cid']}@{b['v']}:{page}.json")["content"]
        return [(clean(dt), clean(dd)) for dt, dd in re.findall(r"<dt[^>]*>(.*?)</dt>\s*<dd[^>]*>(.*?)</dd>", content, re.S)]

    index = {}
    kept = []
    with cf.ThreadPoolExecutor(6) as pool:
        page_lists = list(pool.map(lambda b: (b, pages_of(b)), books))
        for b, pages in page_lists:
            if not pages:
                continue
            bi = len(kept)
            kept.append({k: b[k] for k in ("t", "s", "f", "l")})
            count = 0
            for terms in pool.map(lambda p: terms_of(b, p), pages):
                for term, definition in terms:
                    if not term or not definition or len(definition) > 600:
                        continue
                    for key in keys_for(term):
                        entries = index.setdefault(key, [])
                        if not any(d == definition for _, d in entries):
                            entries.append([bi, definition])
                            count += 1
            print(f"  {b['t']}: {len(pages)} pages, {count} entries", file=sys.stderr)

    os.makedirs(OUT, exist_ok=True)
    for f in os.listdir(OUT):
        os.remove(os.path.join(OUT, f))
    with open(os.path.join(OUT, "books.json"), "w") as f:
        json.dump(kept, f, ensure_ascii=False, separators=(",", ":"))
    shards = {}
    for key, entries in index.items():
        shards.setdefault(shard_of(key), {})[key] = entries
    for name, data in shards.items():
        with open(os.path.join(OUT, f"{name}.json"), "w") as f:
            json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    print(f"{len(kept)} books, {len(index)} terms, {len(shards)} shards", file=sys.stderr)


if __name__ == "__main__":
    main()
