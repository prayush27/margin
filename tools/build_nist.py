#!/usr/bin/env python3
"""Builds Margin's bundled NIST Dictionary of Algorithms and Data Structures (DADS) dataset.

DADS (Paul E. Black, ed., NIST) is a US government work in the public domain, except entries
copyrighted by CRC Press, which this script skips.

Writes data/nist-dads.json: {normalized term: [definition, page slug]}
Run from the repo root:  python3 tools/build_nist.py
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
BASE = "https://xlinux.nist.gov/dads/"
UA = {"User-Agent": "Margin-glossary-builder/0.1 (free study extension)"}


def get(url, tries=3):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
                return r.read().decode("utf-8", "replace")
        except Exception:
            if i == tries - 1:
                return ""
            time.sleep(1.5 * (i + 1))


def clean(s):
    s = re.sub(r"<[^>]+>", "", s)
    s = html.unescape(s)
    return re.sub(r"\s+", " ", s).strip()


def norm(s):
    s = s.lower()
    s = re.sub(r"[–—‐-]", " ", s)
    s = re.sub(r"[^a-z0-9' ]", "", s)
    return re.sub(r"\s+", " ", s).strip()


def main():
    index = get(BASE + "terms.html")
    links = {}
    for slug, name in re.findall(r'<a href="HTML/([^"#]+)\.html">([^<]+)</a>', index):
        links.setdefault(slug, []).append(clean(name))
    print(f"{len(links)} pages", file=sys.stderr)

    def fetch(slug):
        page = get(f"{BASE}HTML/{slug}.html")
        if not page or "CRC Press" in page:
            return slug, None
        m = re.search(r"<strong>Definition:</strong>(.*?)(?:<p>|<P>|<dl>|<strong>)", page, re.S)
        if not m:
            return slug, None
        d = clean(m.group(1))
        return slug, d if 10 < len(d) <= 600 else None

    out = {}
    skipped = 0
    with cf.ThreadPoolExecutor(4) as pool:
        for slug, d in pool.map(fetch, links):
            if not d:
                skipped += 1
                continue
            for name in links[slug]:
                k = norm(name)
                if k and k not in out:
                    out[k] = [d, slug]
    os.makedirs(os.path.join(ROOT, "data"), exist_ok=True)
    with open(os.path.join(ROOT, "data", "nist-dads.json"), "w") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"{len(out)} terms, {skipped} pages skipped (CRC or no definition)", file=sys.stderr)


if __name__ == "__main__":
    main()
