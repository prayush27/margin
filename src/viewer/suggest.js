// The "Suggested" tab in the PDF side panel: key terms in this lecture you haven't saved yet,
// with definitions ready, saved in one click. Scoring lives in shared/keyterms.js; the optional
// on-device AI pass in shared/ai.js.

import * as store from "../shared/storage.js";
import { findKeyTerms } from "../shared/keyterms.js";
import { glossaryFor, subjectFor } from "../shared/lookup.js";
import { aiStatus, refineWithAI } from "../shared/ai.js";

const PRECHECK = 5;
const FIRST_SHOWN = 12;

// Pre-check only confident picks: defined in the lecture, a multi-word term, or a very high score.
const strongPick = (c) => c.score >= 7 && (c.reasons.includes("defined") || c.term.includes(" ") || c.score >= 9);

let zipfPromise = null;
const loadZipf = () =>
  (zipfPromise ??= fetch(chrome.runtime.getURL("data/english-zipf.json"))
    .then((r) => r.json())
    .catch(() => ({})));

function el(tag, props = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === "class") n.className = v;
    else if (k === "innerHTML") n.innerHTML = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else if (k in n && typeof v !== "string") n[k] = v;
    else n.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) n.append(c.nodeType ? c : document.createTextNode(String(c)));
  return n;
}

const SPARK = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5l1.4 4.1 4.1 1.4-4.1 1.4L8 12.5 6.6 8.4 2.5 7l4.1-1.4z" fill="currentColor"/></svg>';

/**
 * @param {object} o
 * @param {HTMLElement} o.pane           container for the tab's content
 * @param {(n:number|null) => void} o.onCount   badge count (null while scanning)
 * @param {() => {pages:string[], done:boolean, total:number}} o.getText
 * @param {() => {url:string, title:string, name:string}} o.getDoc
 * @param {(page:number) => void} o.goToPage
 * @param {(msg:string, action?:object) => void} o.toast
 */
export function createSuggestions({ pane, onCount, getText, getDoc, goToPage, toast }) {
  let docKey = "";
  let courseChoice = null; // course id, or "" with typedCourse for a new one
  let typedCourse = "";
  let base = []; // findKeyTerms output for this doc + course
  let refined = null; // AI-refined list, when it ran
  let checked = new Set();
  let showAll = false;
  let ai = { status: "unknown", running: false, progress: 0, error: "" };
  let computeId = 0;
  let aiAbort = null;

  const subjectKey = () => `${docKey}|${courseChoice || "new:" + typedCourse.toLowerCase()}`;

  async function currentCourse() {
    const { courses, settings } = await store.getAll();
    if (courseChoice === null) {
      const pick = [settings.activeCourse, settings.lastCourse].find((id) => id && id !== "all" && courses.some((c) => c.id === id));
      courseChoice = pick || courses[0]?.id || "";
    }
    const course = courses.find((c) => c.id === courseChoice) || null;
    return { course, courses, name: course?.name || typedCourse };
  }

  /** Call when the PDF changes, text extraction progresses, or saved terms change. */
  async function refresh({ newDoc = false } = {}) {
    const doc = getDoc();
    if (newDoc || doc.url !== docKey) {
      docKey = doc.url || doc.name || "";
      base = [];
      refined = null;
      checked = new Set();
      showAll = false;
      aiAbort?.abort();
      ai = { ...ai, running: false, progress: 0, error: "" };
    }
    const text = getText();
    if (!text.done) {
      onCount(null);
      return render({ scanning: text });
    }
    const id = ++computeId;
    const { name, courses } = await currentCourse();
    const { terms } = await store.getAll();
    const subject = subjectFor(name);
    const [glossary, zipf] = await Promise.all([glossaryFor(subject), loadZipf()]);
    if (id !== computeId) return;
    const firstRun = !base.length;
    base = findKeyTerms({ pages: text.pages, glossary, saved: terms, zipf, docTitle: doc.title || doc.name || "", limit: 40 });
    if (refined) refined = refined.filter((c) => base.some((b) => b.key === c.key));
    if (firstRun) for (const c of base.slice(0, PRECHECK)) if (strongPick(c)) checked.add(c.key);
    for (const k of checked) if (!base.some((c) => c.key === k)) checked.delete(k);
    onCount(list().length);
    render({ courses, subject });
    if (ai.status === "unknown") ai.status = await aiStatus();
    if (ai.status === "available" && !refined && !ai.running && base.length) runAI({ name, subject });
    else render({ courses, subject });
  }

  const list = () => refined || base;

  async function runAI({ name, subject }) {
    const key = subjectKey();
    aiAbort = new AbortController();
    ai = { ...ai, running: true, progress: 0, error: "" };
    render({});
    try {
      const out = await refineWithAI(base, {
        course: name,
        subject,
        docTitle: getDoc().title,
        signal: aiAbort.signal,
        onProgress: (loaded, done) => {
          ai.progress = done ?? loaded ?? 0;
          render({});
        },
      });
      if (key !== subjectKey()) return;
      refined = out;
      ai.status = "available";
      // Keep the pre-checked picks in step with the new order.
      const top = out.slice(0, PRECHECK).filter(strongPick).map((c) => c.key);
      checked = new Set([...checked].filter((k) => out.some((c) => c.key === k)));
      if (checked.size < PRECHECK) for (const k of top) checked.add(k);
      onCount(list().length);
    } catch (err) {
      if (err?.name !== "AbortError") {
        ai.error = "The on-device model couldn't run right now.";
        ai.status = await aiStatus();
        console.debug("[Margin] on-device AI failed", err);
      }
    } finally {
      ai.running = false;
      render({});
    }
  }

  async function save() {
    const picks = list().filter((c) => checked.has(c.key));
    if (!picks.length) return;
    let { course } = await currentCourse();
    if (!course && typedCourse.trim()) course = await store.addCourse(typedCourse);
    const doc = getDoc();
    const saved = [];
    for (const c of picks) {
      const { term, created } = await store.saveTerm({
        term: c.term,
        definition: c.definition,
        defSource: c.defSource,
        courseId: course?.id ?? null,
        context: c.context,
        source: { url: doc.url, title: doc.title || doc.name, page: c.pages[0] || null },
      });
      if (created) saved.push(term.id);
    }
    if (course) {
      courseChoice = course.id;
      await store.updateSettings({ lastCourse: course.id });
    }
    checked = new Set();
    toast(`Saved ${saved.length} term${saved.length === 1 ? "" : "s"}${course ? ` to ${course.name}` : ""}`, {
      label: "Undo",
      run: () => Promise.all(saved.map((id) => store.deleteTerm(id))),
    });
    // storage change listeners call refresh(), which drops the saved terms from this list
  }

  // ---------- rendering ----------
  let last = {};
  async function render(opts) {
    last = { ...last, ...opts };
    if (opts.scanning) {
      pane.replaceChildren(el("div", { class: "side-empty" }, el("strong", {}, "Reading the lecture…"), el("br"), `Page ${opts.scanning.pages.filter((t) => t !== undefined).length} of ${opts.scanning.total}`));
      return;
    }
    const { courses = (await store.getAll()).courses, subject = "" } = last;
    const items = list();
    const shown = showAll ? items : items.slice(0, FIRST_SHOWN);

    // Course picker: the suggestions depend on the course's subject (which textbooks to use).
    const select = el(
      "select",
      { class: "select", "aria-label": "Course", onchange: (e) => {
          if (e.target.value === "__new") {
            courseChoice = "";
            typedCourse = "";
          } else courseChoice = e.target.value;
          base = [];
          refined = null;
          refresh();
        } },
      ...courses.map((c) => el("option", { value: c.id, selected: c.id === courseChoice }, c.name)),
      el("option", { value: "__new", selected: !courseChoice }, "New course…"),
    );
    const nameInput =
      !courseChoice &&
      el("input", {
        class: "input",
        placeholder: "Course, e.g. CS 400",
        value: typedCourse,
        onchange: (e) => {
          typedCourse = e.target.value.trim();
          base = [];
          refined = null;
          refresh();
        },
      });
    const head = el("div", { class: "sg-head" }, el("label", { class: "sg-course" }, el("span", {}, "For"), select), nameInput);

    // AI status line
    let aiLine = null;
    if (ai.running)
      aiLine = el("div", { class: "sg-ai busy" }, el("span", { class: "spark", innerHTML: SPARK }), ai.progress && ai.progress < 1 ? `Ranking with on-device AI… ${Math.round(ai.progress * 100)}%` : "Ranking with on-device AI…");
    else if (refined) aiLine = el("div", { class: "sg-ai" }, el("span", { class: "spark", innerHTML: SPARK }), "Ranked with on-device AI");
    else if (ai.status === "downloadable" || ai.status === "downloading")
      aiLine = el(
        "button",
        { class: "sg-ai cta", onclick: () => currentCourse().then(({ name }) => runAI({ name, subject: subjectFor(name) })) },
        el("span", { class: "spark", innerHTML: SPARK }),
        "Rank with on-device AI (one-time download)",
      );
    if (ai.error) aiLine = el("div", { class: "sg-ai muted" }, ai.error);

    if (!items.length) {
      pane.replaceChildren(
        head,
        el(
          "div",
          { class: "side-empty" },
          el("strong", {}, "No new key terms found."),
          el("br"),
          subject ? "You may have saved them all already, or this PDF is mostly images." : "Pick the course this PDF is for, so Margin can use the right textbooks.",
        ),
      );
      return;
    }

    const rows = shown.map((c) => {
      const box = el("input", {
        type: "checkbox",
        checked: checked.has(c.key),
        "aria-label": `Select ${c.term}`,
        onchange: (e) => {
          e.target.checked ? checked.add(c.key) : checked.delete(c.key);
          footerBtn.textContent = saveLabel();
          footerBtn.disabled = !checked.size;
        },
      });
      const src = c.defSource ? el("span", { class: `src${c.defSource.label === "On-device AI" ? " ai" : ""}`, title: c.defSource.detail || "" }, c.defSource.label) : null;
      return el(
        "label",
        { class: "sg-row" },
        box,
        el(
          "div",
          { class: "grow" },
          el(
            "div",
            { class: "t" },
            el("button", { class: "term", type: "button", title: `Go to page ${c.pages[0]}`, onclick: (e) => (e.preventDefault(), goToPage(c.pages[0])) }, c.term),
            el("span", { class: "n", title: `${c.count} mention${c.count === 1 ? "" : "s"} on ${c.pages.length} page${c.pages.length === 1 ? "" : "s"}` }, `×${c.count}`),
          ),
          el("p", { class: c.definition ? "d" : "d none" }, c.definition || "No definition yet. You can write one after saving."),
          src && el("div", { class: "meta" }, src),
        ),
      );
    });

    const saveLabel = () => (checked.size ? `Save ${checked.size} term${checked.size === 1 ? "" : "s"}` : "Select terms to save");
    const footerBtn = el("button", { class: "btn primary", disabled: !checked.size, onclick: save }, saveLabel());
    const allOn = shown.every((c) => checked.has(c.key));
    const footer = el(
      "div",
      { class: "sg-foot" },
      footerBtn,
      el(
        "button",
        {
          class: "btn ghost",
          onclick: () => {
            for (const c of shown) allOn ? checked.delete(c.key) : checked.add(c.key);
            render({});
          },
        },
        allOn ? "None" : "All",
      ),
    );

    pane.replaceChildren(
      head,
      aiLine,
      el("div", { class: "sg-list" }, ...rows, items.length > shown.length && el("button", { class: "sg-more", onclick: () => ((showAll = true), render({})) }, `Show ${items.length - shown.length} more`)),
      footer,
    );
  }

  return { refresh };
}
