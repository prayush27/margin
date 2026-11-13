// Finds saved terms inside a piece of text.
// - whole-word matches only ("tree" won't match "street")
// - simple plurals ("queue" also matches "queues", "query" matches "queries")
// - acronyms (short ALL-CAPS terms like "CPU", "OS") are case-sensitive so "os" in prose doesn't match
// - longest match wins ("binary search tree" beats "tree")

const WORD = "[\\p{L}\\p{N}]";

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
}

function variants(t) {
  const out = new Set([t]);
  if (/[a-z]$/i.test(t) && t.length > 3) {
    if (/(s|x|z|ch|sh)$/i.test(t)) out.add(t + "es");
    else if (/[^aeiou]y$/i.test(t)) out.add(t.slice(0, -1) + "ies");
    else out.add(t + "s");
  }
  return [...out];
}

function isAcronym(s) {
  return s.length <= 6 && s === s.toUpperCase() && /[A-Z]/.test(s);
}

const norm = (s) => s.toLowerCase().replace(/\s+/g, " ");

export function buildMatcher(terms) {
  const insensitive = new Map();
  const sensitive = new Map();

  for (const t of terms) {
    for (const raw of [t.term, ...(t.aliases || [])]) {
      const name = (raw || "").trim();
      if (name.length < 2) continue;
      const acronym = isAcronym(name);
      const map = acronym ? sensitive : insensitive;
      for (const v of acronym ? [name, name + "s"] : variants(name)) {
        const key = acronym ? v : norm(v);
        if (!map.has(key)) map.set(key, new Set());
        map.get(key).add(t.id);
      }
    }
  }

  const compile = (map, flags) => {
    if (!map.size) return null;
    const alts = [...map.keys()].sort((a, b) => b.length - a.length).map(escapeRe);
    return new RegExp(`(?<!${WORD})(?:${alts.join("|")})(?!${WORD})`, flags);
  };
  const reInsensitive = compile(insensitive, "giu");
  const reSensitive = compile(sensitive, "gu");

  function find(text) {
    if (!text) return [];
    const hits = [];
    for (const [re, map, lower] of [
      [reInsensitive, insensitive, true],
      [reSensitive, sensitive, false],
    ]) {
      if (!re) continue;
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text))) {
        if (!m[0]) {
          re.lastIndex++;
          continue;
        }
        const ids = map.get(lower ? norm(m[0]) : m[0]);
        if (ids) hits.push({ start: m.index, end: m.index + m[0].length, ids: [...ids] });
      }
    }
    hits.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));
    const result = [];
    let last = -1;
    for (const h of hits) {
      if (h.start >= last) {
        result.push(h);
        last = h.end;
      }
    }
    return result;
  }

  return { empty: !reInsensitive && !reSensitive, find };
}
