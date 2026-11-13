// Ready-made definitions for the save card's "Find one" tab. Runs in the background service worker.
//
// Sources, picked by the course's subject:
//   Bundled (offline, in data/):
//     OpenStax glossaries   64 free college textbooks (CC BY / CC BY-NC-SA 4.0), every subject
//     NIST DADS             Dictionary of Algorithms and Data Structures (public domain), computer science
//   Live (only the term and a subject word are sent):
//     EBI Ontology Lookup   STATO (statistics), GO / CL / UBERON (biology), ChEBI (chemistry), NCIt / MONDO (medicine)
//     MeSH (NLM)            biology, medicine, psychology (public domain)
//     Wikipedia             everything (CC BY-SA)
//     Wiktionary            plain English meaning (CC BY-SA)
// Results are cached in chrome.storage.local.

const CACHE_KEY = "lookupCache";
const CACHE_VERSION = 2;
const CACHE_MAX = 400;
const CACHE_TTL = 30 * 24 * 3600 * 1000;
const MAX_RESULTS = 6;

// Course code prefix -> subject.
const SUBJECTS = {
  CS: "computer science", COMPSCI: "computer science", CSE: "computer science", INFO: "computer science", DS: "statistics",
  STAT: "statistics", STATS: "statistics", MATH: "mathematics", ECON: "economics", BIO: "biology", BIOLOGY: "biology",
  BIOCHEM: "biochemistry", BIOCORE: "biology", MICROBIO: "microbiology", GENETICS: "genetics", GEN: "genetics",
  ZOOLOGY: "zoology", ZOO: "zoology", BOTANY: "botany", ANAT: "anatomy", PHYSIOL: "anatomy", NEURO: "neuroscience",
  CHEM: "chemistry", PHYS: "physics", PHYSICS: "physics", ASTRO: "astronomy", ASTRON: "astronomy",
  PSYCH: "psychology", PSYC: "psychology", PSY: "psychology", SOC: "sociology", POLISCI: "political science",
  POLI: "political science", PHIL: "philosophy", HIST: "history", ANTHRO: "anthropology",
  ACCT: "accounting", ACCTIS: "accounting", FIN: "finance", MKT: "marketing", MARKETING: "marketing", MGMT: "management",
  MHR: "management", BUS: "management", GENBUS: "management", NURS: "nursing", NURSING: "nursing", PHARM: "pharmacology",
  NUTR: "nutrition", NUTRISCI: "nutrition", ENGL: "literature", LAW: "law", LEGAL: "law",
  ECE: "electrical engineering", ME: "mechanical engineering", EMA: "mechanical engineering", CBE: "chemical engineering",
  CEE: "civil engineering", BME: "biomedical engineering", ISYE: "industrial engineering",
};

// Subject -> OpenStax fields to prefer, and which field references to ask.
const PLANS = {
  "computer science": { fields: ["computer science"], nist: true },
  statistics: { fields: ["statistics"], ols: ["stato"] },
  mathematics: { fields: ["mathematics"] },
  economics: { fields: ["economics"] },
  biology: { fields: ["biology"], ols: ["go", "cl", "uberon"], mesh: true },
  microbiology: { fields: ["microbiology", "biology"], ols: ["go", "cl"], mesh: true },
  genetics: { fields: ["biology"], ols: ["go"], mesh: true },
  zoology: { fields: ["biology"], ols: ["uberon", "go"], mesh: true },
  botany: { fields: ["biology"], ols: ["go"] },
  anatomy: { fields: ["anatomy", "biology"], ols: ["uberon", "cl"], mesh: true },
  biochemistry: { fields: ["biology", "chemistry"], ols: ["go", "chebi"], mesh: true },
  neuroscience: { fields: ["neuroscience", "psychology", "biology"], ols: ["uberon", "cl", "go"], mesh: true },
  chemistry: { fields: ["chemistry"], ols: ["chebi"] },
  physics: { fields: ["physics"] },
  astronomy: { fields: ["astronomy", "physics"] },
  psychology: { fields: ["psychology"], mesh: true },
  sociology: { fields: ["sociology"] },
  "political science": { fields: ["political science"] },
  philosophy: { fields: ["philosophy"] },
  history: { fields: ["history"] },
  anthropology: { fields: ["anthropology", "sociology"] },
  accounting: { fields: ["accounting"] },
  finance: { fields: ["finance", "economics"] },
  marketing: { fields: ["marketing", "management"] },
  management: { fields: ["management"] },
  nursing: { fields: ["nursing", "medicine"], ols: ["ncit", "mondo"], mesh: true },
  pharmacology: { fields: ["nursing", "medicine"], ols: ["chebi", "ncit"], mesh: true },
  nutrition: { fields: ["nursing", "biology"], ols: ["chebi"], mesh: true },
  literature: { fields: ["literature"] },
  law: { fields: ["law"] },
  "electrical engineering": { fields: ["physics"] },
  "mechanical engineering": { fields: ["physics"] },
  "chemical engineering": { fields: ["chemistry"], ols: ["chebi"] },
  "civil engineering": { fields: ["physics"] },
  "biomedical engineering": { fields: ["biology", "anatomy"], ols: ["uberon"], mesh: true },
  "industrial engineering": { fields: ["statistics", "management"] },
};

const NAME_WORDS = Object.keys(PLANS).sort((a, b) => b.length - a.length);
const NAME_STEMS = {
  psych: "psychology", bio: "biology", chem: "chemistry", econ: "economics", stat: "statistics", calc: "mathematics",
  physic: "physics", sociol: "sociology", programming: "computer science", algorithm: "computer science", "data structure": "computer science",
};

/** "CS 400" -> "computer science"; "Intro to Psychology" -> "psychology"; unknown -> "". */
export function subjectFor(courseName = "") {
  const name = courseName.trim();
  if (!name) return "";
  // "CS 400", "COMP SCI 577", "E C E 252", "STAT&240"
  const code = name.match(/^([A-Za-z&]+(?:\s+[A-Za-z&]+)*)\s*\d/);
  if (code) {
    const s = SUBJECTS[code[1].toUpperCase().replace(/[\s&]/g, "")];
    if (s) return s;
  }
  const lower = name.toLowerCase();
  for (const w of NAME_WORDS) if (lower.includes(w)) return w;
  for (const [k, v] of Object.entries(NAME_STEMS)) if (lower.includes(k)) return v;
  return "";
}

// ---------- helpers ----------
const norm = (s) =>
  s.toLowerCase().replace(/’/g, "'").replace(/[–—‐-]/g, " ").replace(/[^a-z0-9' ]/g, "").replace(/\s+/g, " ").trim();

function variants(key) {
  const out = [key];
  if (/ies$/.test(key)) out.push(key.replace(/ies$/, "y"));
  if (/(s|x|ch|sh)es$/.test(key)) out.push(key.replace(/es$/, ""));
  if (/[^s]s$/.test(key)) out.push(key.slice(0, -1));
  if (!/s$/.test(key)) out.push(key + "s");
  return [...new Set(out)];
}

function sentence(s) {
  let t = s.replace(/\s+/g, " ").trim();
  if (!t) return "";
  t = t.charAt(0).toUpperCase() + t.slice(1);
  if (!/[.!?…)]$/.test(t)) t += ".";
  return t;
}

function trimTo(text, max = 300) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const end = cut.lastIndexOf(". ");
  return end > 80 ? cut.slice(0, end + 1) : cut.replace(/\s+\S*$/, "") + "…";
}

const decode = (s) =>
  s.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));

async function fetchJson(url, ms = 6000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ---------- bundled data ----------
const bundle = new Map();
function loadBundled(path) {
  if (!bundle.has(path)) bundle.set(path, fetchJson(chrome.runtime.getURL(path), 4000).then((d) => d || {}));
  return bundle.get(path);
}

async function fromOpenStax(term, fields) {
  const key = norm(term);
  const none = { matched: [], other: [] };
  if (!key) return none;
  const shard = /[a-z]/.test(key[0]) ? key[0] : "_";
  const [books, data] = await Promise.all([loadBundled("data/openstax/books.json"), loadBundled(`data/openstax/${shard}.json`)]);
  if (!Array.isArray(books)) return none;
  const entries = variants(key).flatMap((v) => data[v] || []);
  const matched = [];
  const other = [];
  const seen = new Set();
  for (const [bi, def] of entries) {
    const b = books[bi];
    if (!b || seen.has(def)) continue;
    seen.add(def);
    const r = { source: "OpenStax", detail: b.t, url: `https://openstax.org/details/books/${b.s}`, license: b.l, text: trimTo(sentence(def)) };
    const rank = fields.findIndex((f) => b.f.includes(f));
    if (rank >= 0) matched.push({ r, rank });
    else other.push(r);
  }
  matched.sort((a, b) => a.rank - b.rank);
  return { matched: matched.map((m) => m.r), other };
}

/**
 * Every bundled glossary term for a subject, for scanning a whole document ("Terms on this page").
 * Returns [{ term, text, source }] with OpenStax books in this subject's fields, plus NIST for CS.
 */
const glossaries = new Map();
export function glossaryFor(subject) {
  const plan = PLANS[subject];
  if (!plan) return Promise.resolve([]);
  if (!glossaries.has(subject)) glossaries.set(subject, buildGlossary(plan));
  return glossaries.get(subject);
}

async function buildGlossary(plan) {
  const out = [];
  if (plan.nist) {
    const nist = await loadBundled("data/nist-dads.json");
    for (const [term, [def, slug]] of Object.entries(nist))
      out.push({
        term,
        text: trimTo(sentence(def)),
        source: { label: "NIST", detail: "Dictionary of Algorithms and Data Structures", url: `https://xlinux.nist.gov/dads/HTML/${slug}.html`, license: "Public domain" },
      });
  }
  const books = await loadBundled("data/openstax/books.json");
  if (!Array.isArray(books)) return out;
  const wanted = new Map();
  books.forEach((b, i) => {
    const rank = plan.fields.findIndex((f) => b.f.includes(f));
    if (rank >= 0) wanted.set(i, rank);
  });
  if (!wanted.size) return out;
  const shards = await Promise.all([..."_abcdefghijklmnopqrstuvwxyz"].map((c) => loadBundled(`data/openstax/${c}.json`)));
  const have = new Set(out.map((g) => g.term));
  for (const shard of shards)
    for (const [term, entries] of Object.entries(shard)) {
      if (have.has(term)) continue;
      const best = entries.filter(([bi]) => wanted.has(bi)).sort((a, b) => wanted.get(a[0]) - wanted.get(b[0]))[0];
      if (!best) continue;
      const b = books[best[0]];
      have.add(term);
      out.push({
        term,
        text: trimTo(sentence(best[1])),
        source: { label: "OpenStax", detail: b.t, url: `https://openstax.org/details/books/${b.s}`, license: b.l },
      });
    }
  return out;
}

async function fromNist(term) {
  const data = await loadBundled("data/nist-dads.json");
  for (const v of variants(norm(term))) {
    const hit = data[v];
    if (hit)
      return [{
        source: "NIST",
        detail: "Dictionary of Algorithms and Data Structures",
        url: `https://xlinux.nist.gov/dads/HTML/${hit[1]}.html`,
        license: "Public domain",
        text: trimTo(sentence(hit[0])),
      }];
  }
  return [];
}

// ---------- live sources ----------
const OLS_NAMES = {
  stato: "Statistics Ontology", go: "Gene Ontology", cl: "Cell Ontology", uberon: "Uberon",
  chebi: "ChEBI", ncit: "NCI Thesaurus", mondo: "Mondo",
};
const IAO_DEF = "http://purl.obolibrary.org/obo/IAO_0000115";

function olsDefinition(x) {
  let d = x[IAO_DEF] ?? null;
  if (Array.isArray(d)) d = d[0];
  if (d && typeof d === "object") d = d.value;
  if (typeof d !== "string") return "";
  return d.replace(/\s*\[[^\]]*\]\s*$/, "").trim();
}

async function fromOls(term, ontologies) {
  if (!ontologies?.length) return [];
  const keys = variants(norm(term));
  const lists = await Promise.all(
    ontologies.map((o) =>
      fetchJson(`https://www.ebi.ac.uk/ols4/api/v2/entities?search=${encodeURIComponent(term)}&ontologyId=${o}&exactMatch=true&size=3&lang=en`),
    ),
  );
  for (let i = 0; i < ontologies.length; i++) {
    for (const x of lists[i]?.elements || []) {
      if (x.isObsolete) continue;
      const names = [...[].concat(x.label || []), ...[].concat(x.synonym || [])].map((s) => norm(typeof s === "string" ? s : s?.value || ""));
      if (!keys.some((k) => names.includes(k))) continue;
      const def = olsDefinition(x);
      if (def.length < 15) continue;
      return [{
        source: OLS_NAMES[ontologies[i]] || ontologies[i].toUpperCase(),
        detail: "",
        url: `https://www.ebi.ac.uk/ols4/ontologies/${ontologies[i]}/classes?iri=${encodeURIComponent(x.iri)}`,
        license: "CC BY",
        text: trimTo(sentence(def)),
      }];
    }
  }
  return [];
}

async function fromMesh(term) {
  const hits = await fetchJson(`https://id.nlm.nih.gov/mesh/lookup/descriptor?label=${encodeURIComponent(term)}&match=exact&limit=1`);
  const hit = Array.isArray(hits) && hits[0];
  if (!hit?.resource) return [];
  const id = hit.resource.split("/").pop();
  const q = `PREFIX meshv: <http://id.nlm.nih.gov/mesh/vocab#> SELECT ?n WHERE { <http://id.nlm.nih.gov/mesh/${id}> meshv:preferredConcept ?c . ?c meshv:scopeNote ?n }`;
  const data = await fetchJson(`https://id.nlm.nih.gov/mesh/sparql?format=JSON&query=${encodeURIComponent(q)}`);
  const note = data?.results?.bindings?.[0]?.n?.value;
  if (!note) return [];
  return [{ source: "MeSH", detail: "National Library of Medicine", url: `https://meshb.nlm.nih.gov/record/ui?ui=${id}`, license: "Public domain", text: trimTo(sentence(note)) }];
}

// "In computer science, a heap is a tree-based data structure that satisfies the heap property: In a max heap…"
//   -> "A heap is a tree-based data structure that satisfies the heap property."
function conciseWiki(text) {
  let t = text.replace(/\s*\([^()]*\)/g, "").replace(/\s+/g, " ").trim();
  t = t.replace(/^In [^,]{3,60}, /, "");
  const sentences = t.match(/[^.!?]+(?:[.!?](?=\s|$)|$)/g) || [t];
  let out = sentences[0].trim();
  const colon = out.indexOf(": ");
  if (colon > 40) out = out.slice(0, colon) + ".";
  if (out.length < 70 && sentences[1]) out += " " + sentences[1].trim();
  out = out.replace(/[\s,;:]+$/, "");
  return trimTo(sentence(out), 260);
}

async function fromWikipedia(term, subject) {
  const q = subject ? `${term} ${subject}` : term;
  const url =
    "https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrlimit=5&prop=extracts|info&inprop=url" +
    "&exintro=1&explaintext=1&exsentences=2&redirects=1&format=json&gsrsearch=" + encodeURIComponent(q);
  const data = await fetchJson(url);
  const pages = Object.values(data?.query?.pages || {}).sort((a, b) => a.index - b.index);
  const t = norm(term);
  const titleOf = (p) => norm(p.title.replace(/\s*\(.*\)$/, ""));
  return pages
    .filter((p) => p.extract && !/may refer to|can refer to/i.test(p.extract) && !/^(glossary|list|outline|index) of/i.test(p.title) && !/\(disambiguation\)/i.test(p.title))
    .filter((p) => {
      const title = titleOf(p);
      return title.includes(t) || (title.length > 3 && t.includes(title)) || norm(p.extract.slice(0, 300)).includes(t);
    })
    .map((p) => {
      const title = titleOf(p);
      let score = 10 - p.index;
      if (title === t) score += 20;
      else if (title.includes(t) || t.includes(title)) score += 8;
      return { p, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 1)
    .map(({ p }) => ({
      source: "Wikipedia",
      detail: p.title,
      url: p.fullurl || `https://en.wikipedia.org/wiki/${encodeURIComponent(p.title)}`,
      license: "CC BY-SA 4.0",
      text: conciseWiki(p.extract),
    }));
}

async function fromWiktionary(term) {
  if (term.split(/\s+/).length > 3) return [];
  for (const w of [...new Set([term.toLowerCase(), term])]) {
    const data = await fetchJson(`https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(w.replace(/ /g, "_"))}`);
    const en = data?.en;
    if (!Array.isArray(en)) continue;
    for (const m of en) {
      for (const d of m.definitions || []) {
        const text = decode(d.definition || "").replace(/\s+/g, " ").trim();
        if (text.length < 8 || /^\(?(obsolete|archaic|dialectal|rare)\b/i.test(text)) continue;
        return [{
          source: "Wiktionary",
          detail: (m.partOfSpeech || "").toLowerCase(),
          url: `https://en.wiktionary.org/wiki/${encodeURIComponent(w.replace(/ /g, "_"))}`,
          license: "CC BY-SA 4.0",
          text: trimTo(sentence(text), 220),
        }];
      }
    }
  }
  return [];
}

// ---------- main ----------
export async function lookupDefinitions(term, subject = "") {
  term = term.trim().replace(/\s+/g, " ");
  if (!term || term.length > 80) return [];
  const key = `${CACHE_VERSION}|${term.toLowerCase()}|${subject}`;
  const { [CACHE_KEY]: cache = {} } = await chrome.storage.local.get(CACHE_KEY);
  const hit = cache[key];
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.results;

  const plan = PLANS[subject] || { fields: [] };
  const safe = (p) => p.catch(() => []);
  const [stax, nist, ols, mesh, wiki, wikt] = await Promise.all([
    fromOpenStax(term, plan.fields).catch(() => ({ matched: [], other: [] })),
    safe(plan.nist ? fromNist(term) : Promise.resolve([])),
    safe(fromOls(term, plan.ols)),
    safe(plan.mesh ? fromMesh(term) : Promise.resolve([])),
    safe(fromWikipedia(term, subject)),
    safe(fromWiktionary(term)),
  ]);

  // Textbooks and references for this course's field first, then general sources.
  const ordered = [
    ...nist, // CS: NIST's algorithms dictionary is the most precise
    ...stax.matched.slice(0, 2),
    ...ols,
    ...mesh,
    ...wiki,
    ...(stax.matched.length ? [] : stax.other.slice(0, plan.fields.length ? 1 : 2)),
    ...wikt,
  ];
  const seen = new Set();
  const results = ordered.filter((r) => r.text && !seen.has(r.text) && seen.add(r.text)).slice(0, MAX_RESULTS);

  if (results.length) {
    cache[key] = { at: Date.now(), results };
    const keys = Object.keys(cache);
    if (keys.length > CACHE_MAX) keys.sort((a, b) => cache[a].at - cache[b].at).slice(0, keys.length - CACHE_MAX).forEach((k) => delete cache[k]);
    await chrome.storage.local.set({ [CACHE_KEY]: cache });
  }
  return results;
}
