// Unit tests for Margin's pure logic: term matching, definition guessing, subject detection.
// No dependencies. Run with Node (`node tests/run.mjs`) or macOS JavaScriptCore (`jsc -m tests/run.mjs`).
import { buildMatcher } from "../src/shared/matcher.js";
import { guessDefinition, sentenceAround } from "../src/shared/extract.js";
import { subjectFor } from "../src/shared/lookup.js";

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

log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) throw new Error(`${failures.length} test(s) failed: ${failures.join(", ")}`);
