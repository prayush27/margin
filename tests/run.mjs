// Unit tests for Margin's pure logic: term matching, definition guessing, subject detection, study sites, key terms.
// No dependencies. Run with Node (`node tests/run.mjs`) or macOS JavaScriptCore (`jsc -m tests/run.mjs`).
import { buildMatcher } from "../src/shared/matcher.js";
import { guessDefinition, sentenceAround } from "../src/shared/extract.js";
import { subjectFor } from "../src/shared/lookup.js";
import { isStudySite, siteActive, setSiteOn } from "../src/shared/sites.js";
import { findKeyTerms, cleanText } from "../src/shared/keyterms.js";

const log = globalThis.print ?? console.log;
let passed = 0;
const failures = [];
function eq(name, got, want) {
  if (JSON.stringify(got) === JSON.stringify(want)) {
    passed++;
    log(`  ✓ ${name}`);
  } else {
    failures.push(name);
    log(`  ✗ ${name}\n      got:  ${JSON.stringify(got)}\n      want: ${JSON.stringify(want)}`);
  }
}

log("matcher");
const terms = [
  { id: "q", term: "queue" }, { id: "bst", term: "binary search tree" }, { id: "t", term: "tree" },
  { id: "os", term: "OS" }, { id: "qy", term: "query" }, { id: "bt", term: "B-tree", aliases: ["B tree"] },
  { id: "hash", term: "hash" }, { id: "kq", term: "queue" },
];
const m = buildMatcher(terms);
const words = (s) => m.find(s).map((h) => s.slice(h.start, h.end) + ":" + h.ids.join("+"));
eq("plurals, and the longest term wins", words("Queues and a binary search tree, not a street."), ["Queues:q+kq", "binary search tree:bst"]);
eq("short acronyms are case-sensitive", words("The OS boots; os is not; macOS no."), ["OS:os"]);
eq("y → ies plural", words("Two queries ran."), ["queries:qy"]);
eq("hyphens and aliases", words("A B-tree is like a B tree."), ["B-tree:bt", "B tree:bt"]);
eq("es plural", words("hashes and hash"), ["hashes:hash", "hash:hash"]);
eq("any whitespace between words", words("binary   search\ntree"), ["binary   search\ntree:bst"]);
eq("empty glossary", buildMatcher([]).empty, true);

log("definition guesser");
eq("“X is …”", guessDefinition("stack", "A stack is a collection where the last item added is the first one removed."), "A collection where the last item added is the first one removed.");
eq("“X refers to …”", guessDefinition("latency", "Latency refers to the delay before a transfer begins."), "The delay before a transfer begins.");
eq("“X: …”", guessDefinition("Heap", "Heap: a tree-based structure satisfying the heap property"), "A tree-based structure satisfying the heap property.");
eq("“… is called X”", guessDefinition("deadlock", "A situation where each process waits on another forever is called a deadlock."), "A situation where each process waits on another forever.");
eq("no definition in the sentence", guessDefinition("stack", "We used a stack in lab today."), "");
const para = "Intro text here. A queue is a FIFO structure. Next sentence follows.";
eq("sentence around a term", sentenceAround(para, para.indexOf("queue"), 5), "A queue is a FIFO structure.");

log("course subjects");
eq("CS 400", subjectFor("CS 400"), "computer science");
eq("COMPSCI 577", subjectFor("COMPSCI 577"), "computer science");
eq("COMP SCI 577 (UW style, with spaces)", subjectFor("COMP SCI 577"), "computer science");
eq("E C E 252", subjectFor("E C E 252"), "electrical engineering");
eq("STAT 240", subjectFor("STAT 240"), "statistics");
eq("PSYCH 202", subjectFor("PSYCH 202"), "psychology");
eq("course name words", subjectFor("Intro to Psychology"), "psychology");
eq("stems", subjectFor("Organic Chem"), "chemistry");
eq("unknown", subjectFor("Seminar 1"), "");

log("study sites");
const study = ["canvas.wisc.edu", "wisc.instructure.com", "www.gradescope.com", "en.wikipedia.org", "openstax.org", "ox.ac.uk", "www.unimelb.edu.au", "pubmed.ncbi.nlm.nih.gov", "developer.mozilla.org"];
const notStudy = ["mail.google.com", "www.youtube.com", "www.reddit.com", "news.ycombinator.com", "notedu.com", "edu.example.com", "fakewikipedia.org"];
eq("school and learning sites", study.filter((x) => !isStudySite(x)), []);
eq("everything else", notStudy.filter((x) => isStudySite(x)), []);
const S = { enabled: true, scope: "study", allowedHosts: [], disabledHosts: [] };
eq("on for a study site", siteActive(S, "canvas.wisc.edu"), true);
eq("off for other sites", siteActive(S, "www.youtube.com"), false);
eq("always on for local files", siteActive(S, "", "file:"), true);
eq("never on Google Docs", siteActive({ ...S, scope: "everywhere" }, "docs.google.com"), false);
eq("everywhere mode", siteActive({ ...S, scope: "everywhere" }, "www.youtube.com"), true);
eq("off when Margin is off", siteActive({ ...S, enabled: false }, "canvas.wisc.edu"), false);
const on = { ...S, ...setSiteOn(S, "blog.example.com", true) };
eq("turning a site on", [siteActive(on, "blog.example.com"), on.allowedHosts], [true, ["blog.example.com"]]);
const off = { ...on, ...setSiteOn(on, "blog.example.com", false) };
eq("turning it off again", [siteActive(off, "blog.example.com"), off.allowedHosts, off.disabledHosts], [false, [], ["blog.example.com"]]);
const paused = { ...S, ...setSiteOn(S, "canvas.wisc.edu", false) };
eq("pausing a study site", siteActive(paused, "canvas.wisc.edu"), false);
eq("resuming it", siteActive({ ...paused, ...setSiteOn(paused, "canvas.wisc.edu", true) }, "canvas.wisc.edu"), true);

log("key terms");
const zipfMini = { the: 77, people: 62, set: 56, data: 53, array: 41, tree: 48, node: 39, key: 51, element: 46, insert: 37, sorted: 40, time: 63, week: 58, homework: 44, due: 51, friday: 49, heap: 36, queue: 38, priority: 46 };
const gl = [
  { term: "heap", text: "A tree with the heap property.", source: { label: "NIST" } },
  { term: "set", text: "An unordered collection.", source: { label: "NIST" } },
  { term: "binary search tree", text: "A binary tree where left < node < right.", source: { label: "NIST" } },
];
const lecture = [
  "Lecture 9: Heaps\nCS 400",
  "Heaps\nA heap is a complete binary tree in which every node's key is greater than or equal to the\nkeys of its children.\nWe set the root first.",
  "Using heaps\nCall removeMax() to take the top. removeMax runs in O(log n).\nUnsorted array: insert O(1), removeMax O(n).",
  "Balancing\nAmortized analysis averages the cost over many operations. Amortized analysis matters for dynamic arrays.\nHomework due Friday.",
];
const kt = findKeyTerms({ pages: lecture, glossary: gl, zipf: zipfMini, saved: [{ term: "binary search tree" }], docTitle: "Lecture 9: Heaps" });
const byTerm = Object.fromEntries(kt.map((k) => [k.term, k]));
eq("finds the lecture's main term first", kt[0]?.term, "heap");
eq("uses the professor's definition, even across a line break", byTerm.heap?.definition, "A complete binary tree in which every node's key is greater than or equal to the keys of its children.");
eq("counts plurals with the term", byTerm.heap?.count >= 3, true);
eq("finds unglossaried phrases that repeat", !!byTerm["amortized analysis"], true);
eq("skips everyday glossary words, saved terms, code and notes", ["set", "binary search tree", "removeMax", "Unsorted array", "homework"].filter((t) => byTerm[t]), []);
eq("joins PDF ligatures", cleanText("signi\uFB01cance"), "significance");

log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) throw new Error(`${failures.length} test(s) failed: ${failures.join(", ")}`);
