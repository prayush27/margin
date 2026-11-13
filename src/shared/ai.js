// Optional on-device AI for "Terms on this page", using Chrome's built-in model (Gemini Nano,
// Prompt API). It runs on your computer: nothing is sent anywhere, and there's no account or key.
// Computers that can't run it (or Chrome versions without it) just skip this step.
//
// What it does with the top candidates from keyterms.js:
//   - drops ones that aren't real course concepts (slide boilerplate, ordinary words)
//   - rates how central each one is to the lecture, which nudges the ranking
//   - drafts a one-sentence definition for terms with none, marked as an AI draft

const OPTIONS = {
  expectedInputs: [{ type: "text", languages: ["en"] }],
  expectedOutputs: [{ type: "text", languages: ["en"] }],
};

const SCHEMA = {
  type: "object",
  properties: {
    terms: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "integer" },
          keep: { type: "boolean" },
          importance: { type: "integer", minimum: 1, maximum: 5 },
          definition: { type: "string" },
        },
        required: ["id", "keep", "importance"],
      },
    },
  },
  required: ["terms"],
};

const SYSTEM = `You help a college student pick vocabulary to study from their lecture slides.
For each candidate you get the term, how often it appears, a sentence from the slides, and whether it already has a definition.
- keep: true only for subject concepts a student should learn for an exam. false for ordinary words, slide boilerplate, code identifiers, course names, and people's names on their own.
- importance: 1 (minor detail) to 5 (a main idea of this lecture).
- definition: only when hasDefinition is false and keep is true. One plain sentence, at most 25 words, using the slide sentence and the standard meaning in this subject. Do not start with the term itself.
Answer with JSON only.`;

/** "unavailable" | "downloadable" | "downloading" | "available" */
export async function aiStatus() {
  try {
    if (typeof LanguageModel === "undefined") return "unavailable";
    return await LanguageModel.availability(OPTIONS);
  } catch {
    return "unavailable";
  }
}

/**
 * Re-ranks candidates with the on-device model. Returns a new list (candidates the model rejects
 * are removed). Throws if the model can't start; callers keep the original list in that case.
 * Starting a model that still has to download needs a click (user activation).
 */
export async function refineWithAI(candidates, { course = "", subject = "", docTitle = "", signal, onProgress, top = 24 } = {}) {
  const head = candidates.slice(0, top);
  const tail = candidates.slice(top);
  if (!head.length) return candidates;

  const base = await LanguageModel.create({
    ...OPTIONS,
    signal,
    initialPrompts: [{ role: "system", content: SYSTEM }],
    monitor(m) {
      m.addEventListener("downloadprogress", (e) => onProgress?.(e.loaded));
    },
  });
  const verdicts = new Map();
  try {
    const context = `Course: ${course || "unknown"}${subject ? ` (${subject})` : ""}. Lecture: ${docTitle || "untitled"}.`;
    for (let i = 0; i < head.length; i += 8) {
      if (signal?.aborted) break;
      const batch = head.slice(i, i + 8).map((c, j) => ({
        id: i + j,
        term: c.term,
        mentions: c.count,
        slide: (c.context || "").slice(0, 220),
        hasDefinition: !!c.definition,
      }));
      const session = await base.clone({ signal });
      try {
        const raw = await session.prompt(`${context}\nCandidates:\n${JSON.stringify(batch)}`, { responseConstraint: SCHEMA, signal });
        for (const v of JSON.parse(raw).terms || []) if (Number.isInteger(v.id)) verdicts.set(v.id, v);
      } finally {
        session.destroy();
      }
      onProgress?.(1, Math.min(1, (i + 8) / head.length));
    }
  } finally {
    base.destroy();
  }

  const refined = [];
  head.forEach((c, i) => {
    const v = verdicts.get(i);
    if (!v) return refined.push(c);
    // Strong evidence from the slides or a textbook outweighs a "no" from a small model.
    if (!v.keep && !(c.reasons.includes("defined") || (c.reasons.includes("glossary") && c.count >= 3))) return;
    const out = { ...c, score: Math.round((c.score + ((v.importance ?? 3) - 3) * 1.2) * 100) / 100, reasons: [...c.reasons, "ai"] };
    const def = (v.definition || "").trim();
    if (!c.definition && v.keep && def.split(/\s+/).length >= 4) {
      out.definition = /[.!?]$/.test(def) ? def : def + ".";
      out.defSource = { label: "On-device AI", detail: "Draft from the slides · check it", url: "", license: "" };
    }
    refined.push(out);
  });
  refined.sort((a, b) => b.score - a.score);
  return [...refined, ...tail];
}
