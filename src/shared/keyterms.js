// "Terms on this page": finds the key terms in a lecture so you can save them in one click.
// Runs entirely on your computer. Four signals, combined into one score per candidate:
//
//   1. Textbook glossaries   terms from the course's OpenStax books / NIST that appear in the text
//   2. Professor definitions sentences like "A heap is …", "Load factor: …", "… is called a deadlock"
//   3. Specificity           how unusual the phrase is in everyday English (word frequencies from wordfreq)
//   4. Emphasis              repeats, how many pages it's on, and whether it's in a slide title
//
// Every suggested definition comes from the slides or a textbook, never generated text.
// No Chrome APIs here, so it's unit-tested in tests/run.mjs.

import { buildMatcher } from "./matcher.js";
import { guessDefinition, sentenceAround } from "./extract.js";

const STOP = new Set(
  (
    "a about above after again against all also am an and any are aren't as at be because been before being below between both but by " +
    "can can't cannot could couldn't did didn't do does doesn't doing don't down during each either else even every few for from " +
    "further get gets got had hadn't has hasn't have haven't having he her here hers herself him himself his how however i if in into is " +
    "isn't it it's its itself just let's like many may me might more most much must my myself need no nor not now of off often on once " +
    "one only or other others our ours ourselves out over own per rather same says see seen shall she should shouldn't since so some " +
    "such than that that's the their theirs them themselves then there there's these they this those though through thus to too " +
    "under until up upon us use used uses using very via was wasn't we well were weren't what when where whether which while who whom " +
    "whose why will with within without would wouldn't yet you your yours yourself yourselves " +
    "e.g i.e etc vs fig figure table slide slides page pages chapter section lecture week today example examples note notes " +
    "first second third next last new old good bad big small large high low two three four five six seven eight nine ten " +
    "make makes made take takes took give gives given show shows shown find finds found call called way ways thing things lot lots " +
    "case cases part parts kind kinds type types number numbers time times step steps point points idea ideas question questions answer " +
    "answers problem problems review recall remember think know want try look looks let lets put puts end ends start starts begin"
  ).split(" "),
);

const PRONOUN_START = /^(it|this|that|these|those|there|here|he|she|they|we|you|i|which|what|who|one|each|all|some|such|our|your|their|its)\b/i;

const norm = (s) => s.toLowerCase().replace(/[’']/g, "'").replace(/[‐‑–—-]+/g, "-").replace(/\s+/g, " ").trim();

// Groups "heaps"/"heap", "queries"/"query", "hash functions"/"hash function".
function canon(s) {
  const words = norm(s).split(" ");
  const last = words[words.length - 1];
  let base = last;
  if (/[^aeiou]ies$/.test(last) && last.length > 4) base = last.slice(0, -3) + "y";
  else if (/(ss|x|ch|sh|zz)es$/.test(last)) base = last.slice(0, -2);
  else if (/[^su'i]s$/.test(last) && last.length > 3) base = last.slice(0, -1);
  words[words.length - 1] = base;
  return words.join(" ");
}

const isAcronym = (s) => s.length >= 2 && s.length <= 6 && s === s.toUpperCase() && /[A-Z]/.test(s);

/** Joins words hyphenated across line breaks ("struc-\nture") and tidies PDF text. */
export function cleanText(t) {
  return (t || "")
    .replace(/\uFB01/g, "fi").replace(/\uFB02/g, "fl").replace(/\uFB00/g, "ff").replace(/\uFB03/g, "ffi").replace(/\uFB04/g, "ffl")
    .replace(/([a-z])-\n\s*([a-z])/g, "$1$2")
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n");
}

/** 0 (everyday word) … 1 (rare / technical), from Zipf×10 frequencies (unknown words count as rare). */
function wordSpecificity(w, zipf) {
  const z = zipf[w.toLowerCase().replace(/'s$/, "")] ?? 0;
  return Math.max(0, Math.min(1, (58 - z) / 26));
}
function phraseSpecificity(words, zipf) {
  const s = words.map((w) => wordSpecificity(w, zipf));
  return 0.6 * Math.max(...s) + 0.4 * (s.reduce((a, b) => a + b, 0) / s.length);
}

// "A heap is …" / "Heap: …" / "… is called a heap" / "Heap refers to …"
const TERM = "([A-Za-z][A-Za-z'’-]*(?:\\s+(?:of\\s+)?[A-Za-z][A-Za-z'’-]*){0,3})";
const DEF_PATTERNS = [
  new RegExp(`^(?:an?|the)?\\s*${TERM}\\s*(?:\\([^)]{1,30}\\))?\\s*,?\\s+(?:is|are)\\s+(?:defined\\s+as\\s+|known\\s+as\\s+)?(?:an?|the)\\s+\\S`, "i"),
  new RegExp(`^(?:an?|the)?\\s*${TERM}\\s*(?:\\([^)]{1,30}\\))?\\s+(?:refers?\\s+to|means|denotes)\\s+\\S`, "i"),
  new RegExp(`^${TERM}\\s*(?:\\([^)]{1,30}\\))?\\s*(?::|\\s[–—-]\\s)\\s*\\S.{12,}`),
  new RegExp(`\\b(?:is|are)\\s+(?:called|known\\s+as|referred\\s+to\\s+as|termed)\\s+(?:an?\\s+|the\\s+)?${TERM}\\s*[.,;]`, "i"),
];

function sentencesOf(text) {
  // Slide text: treat lines as sentences too, so "Load factor: n / m" works.
  return text
    .replace(/([^.!?:;\n])\n(?=[a-z(])/g, "$1 ") // a sentence that wraps onto the next line
    .split(/(?<=[.!?])\s+(?=[A-Z])|\n+/)
    .map((s) => s.replace(/^[\s•▪◦·*\-–—\d.)]+/, "").trim())
    .filter((s) => s.length > 8);
}

// "Insert O(1), removeMax O(n)" is a note, not a definition.
function looksLikeDefinition(def) {
  if (!def) return false;
  const words = def.replace(/[.!?]$/, "").split(/\s+/);
  if (words.length < 4 || /\b[OΘΩ]\(/.test(def)) return false;
  const wordy = words.filter((w) => /^[A-Za-z][a-z'’-]*[,;:]?$/.test(w)).length;
  return wordy / words.length >= 0.8;
}

function validTerm(t, zipf) {
  const words = t.split(/\s+/);
  if (!words.length || words.length > 4) return false;
  if (PRONOUN_START.test(t)) return false;
  if (STOP.has(words[0].toLowerCase()) || STOP.has(words[words.length - 1].toLowerCase())) return false;
  if (words.some((w) => w.length < 2 && !/^[A-Z]$/.test(w))) return false;
  // a single everyday word ("Time is …") needs more evidence than a sentence shape
  if (words.length === 1 && wordSpecificity(words[0], zipf) < 0.25 && !isAcronym(words[0])) return false;
  return true;
}

/**
 * @param {object} o
 * @param {string[]} o.pages        text of each page (or one entry for a web page)
 * @param {{term:string,text:string,source:object}[]} [o.glossary]  bundled glossary for the course's subject
 * @param {{term:string,aliases?:string[]}[]} [o.saved]           terms already saved (skipped)
 * @param {Record<string,number>} [o.zipf]                         Zipf×10 word frequencies
 * @param {string[]} [o.titles]     extra heading lines (web pages); PDFs use each page's first lines
 * @param {string} [o.docTitle]
 * @param {number} [o.limit]
 */
export function findKeyTerms({ pages, glossary = [], saved = [], zipf = {}, titles = [], docTitle = "", limit = 40 }) {
  const texts = pages.map(cleanText);
  const cands = new Map();
  const cand = (surface) => {
    const key = canon(surface);
    if (!cands.has(key)) cands.set(key, { key, forms: new Map(), count: 0, pages: new Set(), firstAt: null, glossary: null, pageDef: null, inTitle: false, phrase: false });
    const c = cands.get(key);
    c.forms.set(surface, (c.forms.get(surface) || 0) + 1);
    return c;
  };
  const savedKeys = new Set(saved.flatMap((t) => [t.term, ...(t.aliases || [])]).filter(Boolean).map(canon));

  // Title lines: the first non-empty lines of each page (slide titles), plus headings passed in.
  const titleText = norm([...texts.map((t) => t.split("\n").find((l) => l.trim()) || ""), ...titles].join(" \n "));
  const inTitle = (key) => new RegExp(`(^|[^a-z])${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}s?(?![a-z])`, "i").test(titleText);

  // Capitalized somewhere other than the start of a sentence or line -> a name; keep its capitals.
  const midCaps = (c, surface, text, idx) => {
    if (/^[A-Z]/.test(surface) && !/(^|[.!?:•]\s*|\n\s*)$/.test(text.slice(Math.max(0, idx - 4), idx))) c.properCase = true;
  };
  const note = (c, page, text, idx, len) => {
    c.count++;
    c.pages.add(page);
    if (!c.firstAt) c.firstAt = { page, context: sentenceAround(text, idx, len) };
  };

  // 1. Textbook glossary terms
  if (glossary.length) {
    const usable = glossary.filter((g) => g.term.length >= 3 && !STOP.has(g.term));
    const matcher = buildMatcher(usable.map((g, i) => ({ id: i, term: g.term })));
    texts.forEach((text, p) => {
      for (const hit of matcher.find(text)) {
        const surface = text.slice(hit.start, hit.end).replace(/\s+/g, " ");
        const c = cand(surface);
        c.glossary ??= usable[hit.ids[0]];
        midCaps(c, surface, text, hit.start);
        note(c, p + 1, text, hit.start, hit.end - hit.start);
      }
    });
  }

  // 2. Definitions written in the document
  texts.forEach((text, p) => {
    for (const s of sentencesOf(text)) {
      for (const re of DEF_PATTERNS) {
        const m = s.match(re);
        if (!m) continue;
        const term = m[1].trim().replace(/[’']s$/, "");
        if (!validTerm(term, zipf)) continue;
        const def = guessDefinition(term, s);
        if (!looksLikeDefinition(def)) continue;
        const c = cand(term);
        if (!c.pageDef) c.pageDef = { text: def, page: p + 1 };
        if (!c.count) {
          note(c, p + 1, text, Math.max(0, text.indexOf(s)), s.length);
          c.countedByDef = true; // replaced by the real count in the phrase pass, if it finds one
        }
        break;
      }
    }
  });

  // 3. Specific phrases (RAKE-style runs of content words), counted across the document
  const phraseCounts = new Map();
  texts.forEach((text, p) => {
    const re = /[A-Za-z][A-Za-z'’-]*|[^A-Za-z\s]+|\s+/g;
    let run = [];
    const flush = () => {
      const words = run.map((r) => r.w);
      const grams = [];
      for (let n = 1; n <= Math.min(3, words.length); n++) for (let i = 0; i + n <= words.length; i++) grams.push([i, i + n]);
      for (const [a, b] of grams) {
        const ws = words.slice(a, b);
        if (!ws.length) continue;
        const surface = ws.join(" ");
        const key = canon(surface);
        let e = phraseCounts.get(key);
        if (!e) phraseCounts.set(key, (e = { surface, words: ws, hits: [] }));
        e.hits.push({ page: p + 1, idx: run[a].i, len: run[b - 1].i + run[b - 1].w.length - run[a].i, surface });
      }
      run = [];
    };
    let m;
    while ((m = re.exec(text))) {
      const tok = m[0];
      if (/^\s+$/.test(tok)) {
        if (tok.includes("\n")) flush();
        continue;
      }
      const lower = tok.toLowerCase().replace(/’/g, "'");
      if (/^[A-Za-z]/.test(tok) && !STOP.has(lower) && tok.length >= 2 && !/^[ivx]+$/i.test(tok)) run.push({ w: tok.replace(/[’']s$/, ""), i: m.index });
      else flush();
    }
    flush();
  });
  for (const [key, e] of phraseCounts) {
    const n = e.words.length;
    const spec = phraseSpecificity(e.words, zipf);
    const enough = n === 1 ? e.hits.length >= 3 && spec >= 0.55 : e.hits.length >= 2 && spec >= 0.4;
    if (!enough && !cands.has(key)) continue;
    if (/^\d|[^A-Za-z' -]/.test(e.surface)) continue;
    if (e.words.some((w) => /[a-z][A-Z]/.test(w))) continue; // code identifiers like removeMax
    const c = cands.get(key) || cand(e.surface);
    c.phrase = true;
    c.spec = spec;
    if (c.countedByDef) {
      c.count = 0;
      c.pages.clear();
      c.countedByDef = false;
    }
    if (!c.glossary) for (const h of e.hits) note(c, h.page, texts[h.page - 1], h.idx, h.len);
    for (const h of e.hits) {
      c.forms.set(h.surface, (c.forms.get(h.surface) || 0) + 1);
      midCaps(c, h.surface, texts[h.page - 1], h.idx);
    }
  }

  // Drop phrases that are just part of a longer phrase ("search tree" inside "binary search tree").
  const list = [...cands.values()];
  for (const c of list) {
    if (c.glossary || c.pageDef) continue;
    const longer = list.find((o) => o !== c && o.key.length > c.key.length && (" " + o.key + " ").includes(" " + c.key + " ") && o.count >= c.count * 0.6);
    if (longer) c.drop = true;
  }

  // 4. Score
  const out = [];
  for (const c of list) {
    if (c.drop || savedKeys.has(c.key) || !c.count) continue;
    const words = c.key.split(" ");
    const spec = c.spec ?? phraseSpecificity(words, zipf);
    const commonSingle = words.length === 1 && spec < 0.3 && !isAcronym([...c.forms.keys()][0] || "");
    c.inTitle = inTitle(c.key);
    if (commonSingle && !c.pageDef && !(c.inTitle && c.count >= 2)) continue; // "set", "mean", "power" without emphasis
    if (!c.glossary && !c.pageDef && !c.phrase) continue;

    const reasons = [];
    let score = 1.3 * Math.log2(1 + c.count) + 0.6 * Math.log2(1 + c.pages.size) + 2.2 * spec;
    if (c.glossary) (score += 2.4), reasons.push("glossary");
    if (c.pageDef) (score += 2.6), reasons.push("defined");
    if (c.inTitle) (score += 1.4), reasons.push("title");
    if (words.length === 2) score += 0.4;
    if (words.length >= 3) score += 0.6;
    if (commonSingle) score -= 1.5;
    // Everyday single words from a glossary ("element", "level", "theory") need more than a match.
    if (words.length === 1 && !c.pageDef && spec < 0.7) score -= 5 * (0.7 - spec);
    // Phrase-only single words ("reject", "insert") are the weakest signal.
    if (words.length === 1 && !c.glossary && !c.pageDef) score -= 1;
    // A lone mention on the cover page is usually the course name ("Data Science", "Psychology").
    if (c.count === 1 && c.pages.has(1) && !c.pageDef && texts.length > 2) score -= 2;

    out.push({
      key: c.key,
      term: displayForm(c, zipf),
      count: c.count,
      pages: [...c.pages].sort((a, b) => a - b),
      context: c.firstAt?.context || "",
      ...definitionFor(c, docTitle),
      reasons,
      score: Math.round(score * 100) / 100,
    });
  }
  out.sort((a, b) => b.score - a.score || b.count - a.count);
  return out.slice(0, limit);
}

function definitionFor(c, docTitle) {
  if (c.pageDef)
    return { definition: c.pageDef.text, defSource: { label: "From this PDF", detail: `${docTitle ? docTitle + " · " : ""}p. ${c.pageDef.page}`, url: "", license: "" } };
  if (c.glossary) return { definition: c.glossary.text, defSource: { ...c.glossary.source } };
  return { definition: "", defSource: null };
}

// "Heap" at the start of a slide line is still "heap"; acronyms and names ("Dijkstra's algorithm") keep capitals.
function displayForm(c, zipf) {
  const forms = [...c.forms.entries()].sort((a, b) => b[1] - a[1]).map(([f]) => f);
  const acronym = forms.find((f) => isAcronym(f));
  if (acronym) return acronym;
  const singular = (list) => list.find((f) => canon(f) === norm(f)) || list[0];
  const lower = forms.filter((f) => f === f.toLowerCase());
  // The textbook's spelling is the singular, lowercase form ("hash tables" -> "hash table").
  if (c.glossary && lower.length) return c.glossary.term;
  if (lower.length) return singular(lower);
  const f = singular(forms);
  // Only ever capitalized at the start of a sentence or slide line: "Amortized analysis" -> "amortized analysis".
  if (!c.properCase && /^[A-Z][a-z-]+(\s[a-z-]+)*$/.test(f)) return f.toLowerCase();
  const [first, ...rest] = f.split(" ");
  const ordinary = (w) => w.length > 1 && w === w.charAt(0) + w.slice(1).toLowerCase() && zipf[w.toLowerCase()] != null;
  if (ordinary(first) && rest.every((w) => w === w.toLowerCase() || ordinary(w))) return f.toLowerCase();
  return f;
}
