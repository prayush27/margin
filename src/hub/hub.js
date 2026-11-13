import * as store from "../shared/storage.js";
import { attachStudyLayer } from "../shared/study-layer.js";
import { SHORTCUT_LABEL, sourceLabel } from "../shared/ui.js";
import { listRecent, removeRecent, touchRecent, viewerUrl } from "../shared/recent.js";
import { setOpenPdfs } from "../shared/pdfs.js";

const $ = (id) => document.getElementById(id);
const main = $("main");

let data = await store.getAll();
let ui = { sort: "az", query: "" };
let quiz = null; // active quiz session

// ---------------- helpers ----------------
function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "style") el.setAttribute("style", v);
    else if (k === "html") el.innerHTML = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}
const svg = (path, extra = "") =>
  `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" ${extra}>${path}</svg>`;
const ICON = {
  search: svg('<circle cx="7" cy="7" r="4.5"/><path d="m10.5 10.5 3 3"/>'),
  plus: svg('<path d="M8 3.5v9M3.5 8h9"/>', 'stroke-width="1.7"'),
  edit: svg('<path d="M10.5 2.75 13.25 5.5 6 12.75H3.25V10z"/>'),
  more: svg('<circle cx="3.5" cy="8" r=".8" fill="currentColor"/><circle cx="8" cy="8" r=".8" fill="currentColor"/><circle cx="12.5" cy="8" r=".8" fill="currentColor"/>'),
  x: svg('<path d="m4.5 4.5 7 7M11.5 4.5l-7 7"/>'),
};

function courseById(id) {
  return data.courses.find((c) => c.id === id);
}
function chip(course) {
  if (!course) return null;
  return h("span", { class: "chip" }, h("span", { class: "dot", style: `background:${course.color}` }), course.name);
}
function timeAgo(t) {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} d ago`;
  return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric", year: s > 86400 * 300 ? "numeric" : undefined });
}
let toastTimer;
function toast(msg, action) {
  document.querySelector(".hub-toast")?.remove();
  clearTimeout(toastTimer);
  const t = h(
    "div",
    { class: "hub-toast", role: "status" },
    msg,
    action &&
      h(
        "button",
        {
          onclick: () => {
            t.remove();
            action.run();
          },
        },
        action.label,
      ),
  );
  document.body.append(t);
  toastTimer = setTimeout(() => t.remove(), 4000);
}
function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h("a", { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function sourceHref(source) {
  if (!source?.url || source.url.startsWith("local:")) return null;
  if (source.page || /\.pdf($|[?#])/i.test(source.url)) return viewerUrl({ file: source.url, page: source.page });
  return source.url;
}

// ---------------- routing ----------------
function route() {
  const hash = location.hash.slice(1);
  const [key, value] = hash.split("=");
  return { key: key || "glossary", value: value ? decodeURIComponent(value) : null };
}

function render() {
  const r = route();
  renderSidebar(r);
  let view;
  if (r.key === "quiz") view = renderQuiz(r.value);
  else if (r.key === "pdfs") view = renderPdfs();
  else if (r.key === "settings") view = renderSettings();
  else view = renderGlossary(r);
  main.replaceChildren(view);
  if (r.key === "term" && r.value) {
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-term="${CSS.escape(r.value)}"]`);
      if (el) {
        el.scrollIntoView({ block: "center" });
        el.classList.add("flash");
      }
      openTermDialog(r.value);
    });
  }
}
window.addEventListener("hashchange", () => {
  if (route().key !== "quiz") quiz = null;
  render();
  main.scrollTop = 0;
  window.scrollTo(0, 0);
});

// ---------------- sidebar ----------------
function renderSidebar(r) {
  const view = ["quiz", "pdfs", "settings"].includes(r.key) ? r.key : r.key === "course" ? "course" : "glossary";
  for (const a of $("nav").querySelectorAll("a")) a.classList.toggle("active", a.dataset.view === view);
  $("navCount").textContent = data.terms.length || "";
  const counts = new Map();
  for (const t of data.terms) counts.set(t.courseId, (counts.get(t.courseId) || 0) + 1);
  const list = $("courseList");
  if (!data.courses.length) {
    list.replaceChildren(h("div", { class: "none" }, "No courses yet"));
    return;
  }
  list.replaceChildren(
    ...data.courses.map((c) =>
      h(
        "a",
        { href: `#course=${c.id}`, class: r.key === "course" && r.value === c.id ? "active" : "", title: c.name },
        h("span", { class: "dot", style: `background:${c.color}` }),
        h("span", { class: "name" }, c.name),
        h("span", { class: "n" }, counts.get(c.id) || ""),
      ),
    ),
  );
}

// ---------------- glossary ----------------
function renderGlossary(r) {
  const course = r.key === "course" ? courseById(r.value) : null;
  let terms = course ? data.terms.filter((t) => t.courseId === course.id) : data.terms;
  const q = ui.query.trim().toLowerCase();
  if (q) {
    terms = terms.filter((t) =>
      [t.term, t.definition, ...(t.aliases || [])].some((s) => (s || "").toLowerCase().includes(q)),
    );
  }
  terms = [...terms].sort((a, b) =>
    ui.sort === "recent" ? b.createdAt - a.createdAt : a.term.localeCompare(b.term, undefined, { sensitivity: "base" }),
  );

  const showWelcome = r.key === "welcome" || (!data.terms.length && !course);
  const page = h("div", { class: "page" });

  page.append(
    h(
      "div",
      { class: "page-head" },
      h(
        "div",
        {},
        h("p", { class: "eyebrow" }, course ? "Course" : "All courses"),
        h("h1", { class: "title" }, course ? course.name : "Glossary"),
      ),
      h(
        "div",
        { class: "actions" },
        course && h("button", { class: "btn", onclick: () => (location.hash = `#quiz=${course.id}`) }, "Quiz me"),
        course && h("button", { class: "btn icon", title: "Edit course", "aria-label": "Edit course", html: ICON.edit, onclick: () => openCourseDialog(course) }),
        h("button", { class: "btn primary", html: `${ICON.plus}<span>Add term</span>`, onclick: () => openTermDialog(null, course?.id) }),
      ),
    ),
  );

  if (showWelcome) page.append(renderWelcome());

  if (data.terms.length) {
    const search = h("input", {
      class: "input",
      type: "search",
      placeholder: course ? `Search ${course.name}` : "Search terms and definitions",
      value: ui.query,
      "aria-label": "Search",
    });
    search.value = ui.query;
    search.addEventListener("input", () => {
      ui.query = search.value;
      const list = page.querySelector(".list");
      list.replaceWith(renderList(filterSort(course)));
    });
    page.append(
      h(
        "div",
        { class: "toolbar" },
        h("div", { class: "search", html: ICON.search }, search, !ui.query && h("kbd", {}, "/")),
        h(
          "div",
          { class: "seg", role: "group", "aria-label": "Sort" },
          h("button", { class: ui.sort === "az" ? "on" : "", onclick: () => setSort("az") }, "A–Z"),
          h("button", { class: ui.sort === "recent" ? "on" : "", onclick: () => setSort("recent") }, "Recent"),
        ),
      ),
    );
  }

  page.append(renderList(terms, { course, empty: !data.terms.length }));
  return page;
}

function filterSort(course) {
  let terms = course ? data.terms.filter((t) => t.courseId === course.id) : data.terms;
  const q = ui.query.trim().toLowerCase();
  if (q) terms = terms.filter((t) => [t.term, t.definition, ...(t.aliases || [])].some((s) => (s || "").toLowerCase().includes(q)));
  return [...terms].sort((a, b) =>
    ui.sort === "recent" ? b.createdAt - a.createdAt : a.term.localeCompare(b.term, undefined, { sensitivity: "base" }),
  );
}

function setSort(s) {
  ui.sort = s;
  render();
}

function renderList(terms, { course, empty } = {}) {
  const list = h("div", { class: "list" });
  if (empty) return list;
  if (!terms.length) {
    list.append(
      h(
        "div",
        { class: "empty-card" },
        h("h3", {}, ui.query ? "No matches" : "Nothing here yet"),
        h(
          "p",
          {},
          ui.query
            ? `No terms match “${ui.query}”.`
            : `Save terms to ${course ? course.name : "this course"} while you read: select a word and press ${SHORTCUT_LABEL}.`,
        ),
      ),
    );
    return list;
  }
  let letter = null;
  for (const t of terms) {
    if (ui.sort === "az") {
      const l = (t.term[0] || "#").toUpperCase();
      const L = /[A-Z]/.test(l) ? l : "#";
      if (L !== letter) {
        letter = L;
        list.append(h("div", { class: "letter" }, L));
      }
    }
    list.append(renderEntry(t, !course));
  }
  return list;
}

function renderEntry(t, showCourse) {
  const course = courseById(t.courseId);
  const href = sourceHref(t.source);
  const src = t.source && sourceLabel(t.source);
  return h(
    "article",
    { class: "entry", "data-term": t.id },
    h(
      "div",
      { class: "head" },
      h("span", { class: "term" }, t.term),
      t.aliases?.length > 0 && h("span", { class: "aka" }, `also ${t.aliases.join(", ")}`),
      showCourse && chip(course),
    ),
    h(
      "div",
      { class: "tools" },
      h("button", { class: "btn ghost", onclick: () => openTermDialog(t.id) }, "Edit"),
      h(
        "button",
        {
          class: "btn ghost",
          onclick: async () => {
            const copy = { ...t };
            await store.deleteTerm(t.id);
            toast(`Deleted “${t.term}”`, {
              label: "Undo",
              run: () => store.importData({ courses: course ? [course] : [], terms: [copy] }),
            });
          },
        },
        "Delete",
      ),
    ),
    h("p", { class: t.definition ? "def" : "def none" }, t.definition || "No definition yet. Click Edit to add one."),
    h(
      "div",
      { class: "meta" },
      src && (href ? h("a", { href, target: "_blank", title: t.source.url }, src) : h("span", {}, src)),
      src && h("span", {}, "·"),
      h("span", {}, `Saved ${timeAgo(t.createdAt)}`),
    ),
  );
}

function renderWelcome() {
  return h(
    "section",
    { class: "welcome" },
    h("h2", {}, "Every term, in the margin."),
    h("p", {}, "Save a term once. See its definition wherever you study: lecture PDFs, Canvas and course sites."),
    h(
      "div",
      { class: "steps" },
      h(
        "div",
        { class: "step" },
        h("span", { class: "num" }, "1"),
        h("h4", {}, "Save a term"),
        h("p", { html: `Select a word on any page and press <kbd>${SHORTCUT_LABEL}</kbd>, or click <b>Save term</b>.` }),
      ),
      h(
        "div",
        { class: "step" },
        h("span", { class: "num" }, "2"),
        h("h4", {}, "Hover to recall"),
        h("p", {}, "Saved terms get a soft underline on your course sites and PDFs. Hover one to see your definition."),
      ),
      h(
        "div",
        { class: "step" },
        h("span", { class: "num" }, "3"),
        h("h4", {}, "Quiz before exams"),
        h("p", {}, "Run a quick recall quiz per course. Missed terms come back first."),
      ),
    ),
    h(
      "div",
      { class: "try" },
      h("p", { class: "eyebrow" }, "Try it here: select “stack” and save it"),
      h(
        "p",
        { class: "sample" },
        "A stack is a collection where the last item added is the first one removed. Undo history in a text editor behaves like a stack.",
      ),
    ),
    !data.settings.pdfAsked &&
      h(
        "div",
        { class: "ask" },
        h(
          "div",
          { class: "grow" },
          h("h4", {}, "Open lecture PDFs in Margin?"),
          h("p", {}, "PDFs you open in Chrome will switch to Margin's viewer, with your terms underlined and a list of every term in the file. You can change this anytime in Settings."),
        ),
        h(
          "div",
          { class: "ask-actions" },
          h("button", { class: "btn primary", onclick: async () => (await setOpenPdfs(true), toast("PDFs will open in Margin.")) }, "Yes, open them in Margin"),
          h("button", { class: "btn ghost", onclick: () => setOpenPdfs(false) }, "Not now"),
        ),
      ),
    h(
      "div",
      { class: "foot" },
      h("a", { class: "btn", href: viewerUrl(), target: "_blank" }, "Open a lecture PDF"),
      h("button", { class: "btn ghost", onclick: () => (location.hash = "#glossary") }, "Got it"),
    ),
  );
}

// ---------------- term dialog ----------------
function fillCourseSelect(select, selected) {
  select.replaceChildren(
    h("option", { value: "" }, "No course"),
    ...data.courses.map((c) => h("option", { value: c.id }, c.name)),
    h("option", { value: "__new" }, "New course…"),
  );
  select.value = selected && courseById(selected) ? selected : "";
}

function openTermDialog(id, presetCourse) {
  const dlg = $("termDialog");
  const t = id ? data.terms.find((x) => x.id === id) : null;
  if (id && !t) return;
  $("dialogTitle").textContent = t ? "Edit term" : "Add a term";
  $("fTerm").value = t?.term || "";
  $("fAliases").value = (t?.aliases || []).join(", ");
  $("fDef").value = t?.definition || "";
  fillCourseSelect($("fCourse"), t ? t.courseId : presetCourse || data.settings.lastCourse);
  $("deleteTerm").hidden = !t;
  const ctx = $("fContext");
  if (t?.context) {
    ctx.hidden = false;
    ctx.replaceChildren(h("b", {}, `Where you saw it${t.source ? ` · ${sourceLabel(t.source)}` : ""}`), `“${t.context}”`);
  } else ctx.hidden = true;
  dlg.dataset.id = t?.id || "";
  dlg.showModal();
  (t ? $("fDef") : $("fTerm")).focus();
}

$("fCourse").addEventListener("change", async (e) => {
  if (e.target.value !== "__new") return;
  const name = prompt("Course name (for example, CS 400):");
  if (name?.trim()) {
    const c = await store.addCourse(name);
    data = await store.getAll();
    fillCourseSelect(e.target, c.id);
  } else e.target.value = "";
});

$("termForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const dlg = $("termDialog");
  const term = $("fTerm").value.trim();
  if (!term) return $("fTerm").focus();
  const payload = {
    term,
    aliases: $("fAliases").value.split(",").map((s) => s.trim()).filter(Boolean),
    definition: $("fDef").value.trim(),
    courseId: $("fCourse").value && $("fCourse").value !== "__new" ? $("fCourse").value : null,
  };
  if (dlg.dataset.id) await store.updateTerm(dlg.dataset.id, payload);
  else {
    await store.saveTerm(payload);
    if (payload.courseId) await store.updateSettings({ lastCourse: payload.courseId });
  }
  dlg.close();
  if (route().key === "term") history.replaceState(null, "", "#glossary");
  toast(dlg.dataset.id ? "Saved changes" : `Added “${term}”`);
});
$("termForm").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) $("termForm").requestSubmit();
});
$("cancelTerm").addEventListener("click", () => $("termDialog").close());
$("deleteTerm").addEventListener("click", async () => {
  const id = $("termDialog").dataset.id;
  const t = data.terms.find((x) => x.id === id);
  if (!t) return;
  await store.deleteTerm(id);
  $("termDialog").close();
  const course = courseById(t.courseId);
  toast(`Deleted “${t.term}”`, { label: "Undo", run: () => store.importData({ courses: course ? [course] : [], terms: [t] }) });
});
$("termDialog").addEventListener("close", () => {
  if (route().key === "term") history.replaceState(null, "", "#glossary");
});

// ---------------- course dialog ----------------
function openCourseDialog(course) {
  const dlg = $("courseDialog");
  $("courseDialogTitle").textContent = course ? "Edit course" : "New course";
  $("cName").value = course?.name || "";
  $("deleteCourse").hidden = !course;
  let color = course?.color || store.COURSE_COLORS[data.courses.length % store.COURSE_COLORS.length];
  const paint = () =>
    $("cColors").replaceChildren(
      ...store.COURSE_COLORS.map((c) =>
        h("button", {
          type: "button",
          class: c === color ? "on" : "",
          style: `background:${c}`,
          "aria-label": `Color ${c}`,
          onclick: () => {
            color = c;
            paint();
          },
        }),
      ),
    );
  paint();
  dlg.dataset.id = course?.id || "";
  dlg.getColor = () => color;
  dlg.showModal();
  $("cName").focus();
}
$("addCourse").addEventListener("click", () => openCourseDialog(null));
$("cancelCourse").addEventListener("click", () => $("courseDialog").close());
$("courseForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const dlg = $("courseDialog");
  const name = $("cName").value.trim();
  if (!name) return;
  if (dlg.dataset.id) await store.updateCourse(dlg.dataset.id, { name, color: dlg.getColor() });
  else {
    const c = await store.addCourse(name);
    await store.updateCourse(c.id, { color: dlg.getColor() });
    location.hash = `#course=${c.id}`;
  }
  dlg.close();
});
$("deleteCourse").addEventListener("click", async () => {
  const id = $("courseDialog").dataset.id;
  const c = courseById(id);
  const n = data.terms.filter((t) => t.courseId === id).length;
  if (!c) return;
  const msg = n
    ? `Delete “${c.name}”? Its ${n} term${n === 1 ? "" : "s"} will be kept under “No course”.`
    : `Delete “${c.name}”?`;
  if (!confirm(msg)) return;
  await store.deleteCourse(id);
  $("courseDialog").close();
  location.hash = "#glossary";
});

// ---------------- quiz ----------------
function pickCards(terms, n = 20) {
  const usable = terms.filter((t) => t.definition?.trim());
  const sorted = [...usable].sort((a, b) => {
    const sa = a.stats || {};
    const sb = b.stats || {};
    return (sa.box || 0) - (sb.box || 0) || (sa.last || 0) - (sb.last || 0);
  });
  const pool = sorted.slice(0, n);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool;
}

function renderQuiz(courseParam) {
  const page = h("div", { class: "page" });
  if (quiz) {
    page.append(renderQuizCard());
    return page;
  }
  let courseId = courseParam && courseById(courseParam) ? courseParam : "all";
  let mode = ui.quizMode || "def";
  page.append(
    h(
      "div",
      { class: "page-head" },
      h(
        "div",
        {},
        h("p", { class: "eyebrow" }, "Practice"),
        h("h1", { class: "title" }, "Quiz"),
        h("p", { class: "lede" }, "Recall beats rereading. Try to answer before you flip; terms you miss come back first next time."),
      ),
    ),
  );
  const withDefs = (id) => store.termsForCourse(data.terms, id).filter((t) => t.definition?.trim()).length;
  const setup = h("div", { class: "quiz-setup" });
  const paint = () => {
    const n = withDefs(courseId);
    setup.replaceChildren(
      h(
        "div",
        { class: "row" },
        h("span", { class: "label" }, "Course"),
        h(
          "div",
          { class: "choice" },
          h(
            "button",
            { class: courseId === "all" ? "on" : "", onclick: () => ((courseId = "all"), paint()) },
            "All courses",
            h("span", { class: "c" }, withDefs("all")),
          ),
          ...data.courses.map((c) =>
            h(
              "button",
              { class: courseId === c.id ? "on" : "", onclick: () => ((courseId = c.id), paint()) },
              h("span", { class: "dot", style: `background:${c.color}` }),
              c.name,
              h("span", { class: "c" }, withDefs(c.id)),
            ),
          ),
        ),
      ),
      h(
        "div",
        { class: "row" },
        h("span", { class: "label" }, "Show me"),
        h(
          "div",
          { class: "choice" },
          h("button", { class: mode === "def" ? "on" : "", onclick: () => ((mode = ui.quizMode = "def"), paint()) }, "The definition, I recall the term"),
          h("button", { class: mode === "term" ? "on" : "", onclick: () => ((mode = ui.quizMode = "term"), paint()) }, "The term, I recall the definition"),
        ),
      ),
      h(
        "div",
        {},
        n >= 1
          ? h(
              "button",
              {
                class: "btn primary",
                style: "height:38px;padding:0 18px;font-size:14px",
                onclick: () => {
                  const cards = pickCards(store.termsForCourse(data.terms, courseId));
                  quiz = { cards, i: 0, revealed: false, mode, missed: [], got: 0, courseId };
                  render();
                },
              },
              `Start · ${Math.min(n, 20)} card${Math.min(n, 20) === 1 ? "" : "s"}`,
            )
          : h("p", { class: "muted", style: "margin:0" }, "Save a few terms with definitions first, then come back here."),
      ),
    );
  };
  paint();
  page.append(setup);
  return page;
}

function renderQuizCard() {
  const wrap = h("div", { class: "quiz-stage" });
  const q = quiz;
  if (q.i >= q.cards.length) {
    const total = q.cards.length;
    wrap.append(
      h(
        "div",
        { class: "score" },
        h("p", { class: "eyebrow" }, "Done"),
        h("div", { class: "big" }, `${q.got}/${total}`),
        h("p", {}, q.missed.length ? `${q.missed.length} to review. They'll come up first next time.` : "Clean sweep. Nice."),
        q.missed.length > 0 &&
          h(
            "ul",
            { class: "missed-list" },
            ...q.missed.map((t) => h("li", {}, h("strong", {}, t.term), h("span", {}, t.definition))),
          ),
        h(
          "div",
          { class: "grade" },
          q.missed.length > 0 &&
            h(
              "button",
              {
                class: "btn",
                onclick: () => {
                  quiz = { ...q, cards: [...q.missed], i: 0, revealed: false, missed: [], got: 0 };
                  render();
                },
              },
              "Retry missed",
            ),
          h(
            "button",
            {
              class: "btn got",
              onclick: () => {
                quiz = null;
                render();
              },
            },
            "Done",
          ),
        ),
      ),
    );
    return wrap;
  }
  const card = q.cards[q.i];
  const course = courseById(card.courseId);
  const showDef = q.mode === "def";
  const reveal = () => {
    q.revealed = true;
    render();
  };
  const grade = async (correct) => {
    if (!q.revealed) return reveal();
    if (correct) q.got++;
    else q.missed.push(card);
    q.i++;
    q.revealed = false;
    render();
    store.recordReview(card.id, correct);
  };
  wrap.append(
    h("div", { class: "progress" }, h("i", { style: `width:${(q.i / q.cards.length) * 100}%` })),
    h("div", { class: "qmeta" }, h("span", {}, `${q.i + 1} of ${q.cards.length}`), course ? h("span", {}, course.name) : h("span")),
    h(
      "div",
      { class: "flash-card" },
      h("div", { class: "ask" }, showDef ? "What's the term?" : "What does it mean?"),
      h("div", { class: showDef ? "prompt" : "prompt big" }, showDef ? card.definition : card.term),
      q.revealed &&
        h(
          "div",
          { class: "answer" },
          h("div", { class: showDef ? "big" : "small" }, showDef ? card.term : card.definition),
          card.source && h("div", { class: "src" }, sourceLabel(card.source)),
        ),
    ),
    h(
      "div",
      { class: "grade" },
      q.revealed
        ? [
            h("button", { class: "btn miss", onclick: () => grade(false) }, "Missed it", h("kbd", {}, "1")),
            h("button", { class: "btn got", onclick: () => grade(true) }, "Got it", h("kbd", {}, "2")),
          ]
        : h("button", { class: "btn got", onclick: reveal }, "Show answer", h("kbd", {}, "space")),
    ),
  );
  quiz.grade = grade;
  quiz.reveal = reveal;
  return wrap;
}

document.addEventListener("keydown", (e) => {
  if (document.querySelector("dialog[open]")) return;
  const typing = e.target.closest?.("input, textarea, select, [contenteditable]");
  if (quiz && quiz.i < quiz.cards.length && !typing) {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      quiz.revealed ? quiz.grade(true) : quiz.reveal();
    } else if (e.key === "1" && quiz.revealed) quiz.grade(false);
    else if (e.key === "2" && quiz.revealed) quiz.grade(true);
    return;
  }
  if (e.key === "/" && !typing) {
    const s = main.querySelector('input[type="search"]');
    if (s) {
      e.preventDefault();
      s.focus();
    }
  }
});

// ---------------- PDFs ----------------
function renderPdfs() {
  const page = h("div", { class: "page" });
  page.append(
    h(
      "div",
      { class: "page-head" },
      h(
        "div",
        {},
        h("p", { class: "eyebrow" }, "Read"),
        h("h1", { class: "title" }, "PDFs"),
        h("p", { class: "lede" }, "Lecture slides and readings open in Margin's viewer, where your terms are underlined and new ones are one shortcut away."),
      ),
    ),
  );
  const drop = h(
    "div",
    { class: "drop" },
    h("h3", {}, "Drop a PDF here"),
    h("p", {}, "or pick one from your Mac"),
    h("button", { class: "btn primary", onclick: pickAndOpen }, "Choose PDF…"),
  );
  drop.addEventListener("dragover", (e) => {
    e.preventDefault();
    drop.classList.add("over");
  });
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", async (e) => {
    e.preventDefault();
    drop.classList.remove("over");
    const item = [...e.dataTransfer.items].find((i) => i.kind === "file");
    const handle = await item?.getAsFileSystemHandle?.();
    if (handle?.kind === "file") {
      const rec = await touchRecent({ name: handle.name, handle });
      open(viewerUrl({ recent: rec.id }), "_blank");
    }
  });
  page.append(drop);

  const listCard = h("div", { class: "list-card", hidden: true }, h("h3", {}, "Recent"));
  page.append(listCard);
  listRecent().then((recent) => {
    if (!recent.length) return;
    listCard.hidden = false;
    for (const r of recent.slice(0, 20)) {
      const where = r.url && !r.url.startsWith("file:") ? (() => { try { return new URL(r.url).hostname; } catch { return ""; } })() : "On this Mac";
      const row = h(
        "a",
        { class: "item", href: viewerUrl(r.url ? { file: r.url } : { recent: r.id }), target: "_blank" },
        h("span", { class: "file-ico" }),
        h("span", { class: "grow" }, h("div", { class: "t" }, r.name), h("div", { class: "s" }, `${where} · ${timeAgo(r.openedAt)}`)),
        h("button", {
          class: "btn ghost icon",
          title: "Remove from recent",
          "aria-label": "Remove from recent",
          html: ICON.x,
          onclick: async (e) => {
            e.preventDefault();
            await removeRecent(r.id);
            row.remove();
          },
        }),
      );
      listCard.append(row);
    }
  });

  page.append(
    h("h2", { class: "section" }, "Open PDFs from Finder in Margin"),
    h(
      "div",
      { class: "list-card" },
      h(
        "div",
        { class: "setting" },
        h(
          "div",
          { class: "grow" },
          h("div", { class: "t" }, "Make Chrome your PDF app"),
          h(
            "ol",
            { class: "how" },
            h("li", {}, "In Finder, right-click any PDF and choose Get Info."),
            h("li", {}, "Under “Open with”, pick Google Chrome, then click Change All…"),
            h("li", {}, "Turn on file access for Margin (see Settings) so local PDFs open here automatically."),
          ),
        ),
      ),
    ),
  );
  return page;
}

async function pickAndOpen() {
  try {
    const [handle] = await window.showOpenFilePicker({ types: [{ description: "PDF", accept: { "application/pdf": [".pdf"] } }] });
    const rec = await touchRecent({ name: handle.name, handle });
    open(viewerUrl({ recent: rec.id }), "_blank");
  } catch (err) {
    if (err?.name !== "AbortError") toast(String(err.message || err));
  }
}

// ---------------- settings ----------------
function toggle(key, { invert = false, value } = {}) {
  const input = h("input", { type: "checkbox" });
  const on = value !== undefined ? value : invert ? !data.settings[key] : !!data.settings[key];
  input.checked = on;
  input.addEventListener("change", () => {
    const v = invert ? !input.checked : input.checked;
    store.updateSettings({ [key]: v });
  });
  return h("label", { class: "switch" }, input, h("span"));
}

function pdfToggle() {
  const input = h("input", { type: "checkbox" });
  input.checked = !!data.settings.openPdfs;
  input.addEventListener("change", async () => {
    await setOpenPdfs(input.checked);
  });
  return h("label", { class: "switch" }, input, h("span"));
}

function settingRow(title, desc, control) {
  return h("div", { class: "setting" }, h("div", { class: "grow" }, h("div", { class: "t" }, title), desc && h("div", { class: "s" }, desc)), control);
}

function renderSettings() {
  const s = data.settings;
  const page = h("div", { class: "page" });
  page.append(h("div", { class: "page-head" }, h("div", {}, h("p", { class: "eyebrow" }, "Preferences"), h("h1", { class: "title" }, "Settings"))));

  const underlineFirst = h("input", { type: "checkbox" });
  underlineFirst.checked = s.underline === "first";
  underlineFirst.addEventListener("change", () => store.updateSettings({ underline: underlineFirst.checked ? "first" : "all" }));

  page.append(
    h(
      "div",
      { class: "list-card" },
      settingRow("Underline saved terms", "Turn Margin on or off everywhere.", toggle("enabled")),
      settingRow(
        "Where to underline",
        s.scope === "everywhere"
          ? "On every website, except sites you pause."
          : "Only on school and learning sites (.edu, Canvas, Gradescope, OpenStax, Wikipedia…), your PDFs, and sites you turn on.",
        h(
          "div",
          { class: "seg", role: "group", "aria-label": "Where to underline" },
          h("button", { class: s.scope !== "everywhere" ? "on" : "", onclick: () => store.updateSettings({ scope: "study" }) }, "Study sites"),
          h("button", { class: s.scope === "everywhere" ? "on" : "", onclick: () => store.updateSettings({ scope: "everywhere" }) }, "Everywhere"),
        ),
      ),
      settingRow("Only the first time per page", "Underline each term once per page instead of every time it appears. Less busy on long readings.", h("label", { class: "switch" }, underlineFirst, h("span"))),
      settingRow("Show “Save term” when selecting text", `A small button appears next to short selections. The ${SHORTCUT_LABEL} shortcut always works.`, toggle("selectionPill")),
      settingRow("Open PDFs in Margin", "Lecture PDFs you open in Chrome switch to Margin's viewer, with your terms underlined.", pdfToggle()),
    ),
  );

  // Shortcut + file access
  const shortcutVal = h("span", { class: "chip" }, SHORTCUT_LABEL);
  chrome.commands.getAll().then((cmds) => {
    const c = cmds.find((x) => x.name === "save-term");
    shortcutVal.textContent = c?.shortcut || "Not set";
  });
  const fileStatus = h("span", { class: "status" });
  chrome.extension.isAllowedFileSchemeAccess().then((ok) => {
    fileStatus.className = `status ${ok ? "ok" : "warn"}`;
    fileStatus.replaceChildren(h("i"), ok ? "Allowed" : "Off");
  });
  page.append(
    h("h2", { class: "section" }, "Shortcuts & access"),
    h(
      "div",
      { class: "list-card" },
      settingRow(
        "Save term shortcut",
        "Change it on Chrome's shortcuts page.",
        h("div", { style: "display:flex;gap:8px;align-items:center" }, shortcutVal, h("button", { class: "btn", onclick: () => chrome.tabs.create({ url: "chrome://extensions/shortcuts" }) }, "Change")),
      ),
      settingRow(
        "Local PDF files",
        "To open PDFs from your Mac (file://) automatically, turn on “Allow access to file URLs” for Margin.",
        h("div", { style: "display:flex;gap:8px;align-items:center" }, fileStatus, h("button", { class: "btn", onclick: () => chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` }) }, "Open")),
      ),
    ),
  );

  // Per-site choices
  const hostChips = (hosts, key, verb) =>
    h(
      "div",
      {},
      ...hosts.map((host) =>
        h(
          "span",
          { class: "host-chip" },
          host,
          h("button", {
            "aria-label": `${verb} ${host}`,
            title: verb,
            html: "×",
            onclick: () => store.updateSettings({ [key]: s[key].filter((x) => x !== host) }),
          }),
        ),
      ),
    );
  const allowed = s.scope === "everywhere" ? [] : s.allowedHosts;
  page.append(
    h("h2", { class: "section" }, "Sites"),
    h(
      "div",
      { class: "list-card" },
      s.scope !== "everywhere" &&
        settingRow(
          allowed.length ? "Also on" : "No extra sites",
          allowed.length
            ? hostChips(allowed, "allowedHosts", "Turn off on")
            : "Turn Margin on for any other site from the toolbar popup. Saving a term on a site turns it on there too.",
          null,
        ),
      settingRow(
        s.disabledHosts.length ? "Paused" : "No paused sites",
        s.disabledHosts.length ? hostChips(s.disabledHosts, "disabledHosts", "Resume on") : "Pause Margin on a site from the toolbar popup. Google Docs is always skipped.",
        null,
      ),
    ),
  );

  // Data
  page.append(
    h("h2", { class: "section" }, "Your data"),
    h(
      "div",
      { class: "list-card" },
      settingRow(
        "Export",
        "Back up everything as JSON, or get a CSV you can open in Sheets or import into Anki/Quizlet.",
        h(
          "div",
          { style: "display:flex;gap:8px" },
          h("button", { class: "btn", onclick: exportJson }, "JSON"),
          h("button", { class: "btn", onclick: exportCsv }, "CSV"),
        ),
      ),
      settingRow("Import", "Add terms from a Margin JSON backup or a CSV with term, definition, course columns.", h("button", { class: "btn", onclick: () => $("importInput").click() }, "Import…")),
      settingRow(
        "Delete everything",
        `${data.terms.length} terms and ${data.courses.length} courses are stored on this computer only.`,
        h(
          "button",
          {
            class: "btn danger",
            onclick: async () => {
              if (!confirm("Delete all terms and courses? This can't be undone. Export first if you want a backup.")) return;
              await chrome.storage.local.set({ terms: [], courses: [] });
              toast("Deleted all terms and courses");
            },
          },
          "Delete…",
        ),
      ),
    ),
    h("p", { class: "faint", style: "margin-top:24px;font-size:12px" }, `Margin ${chrome.runtime.getManifest().version} · No account, no tracking, no server.`),
  );
  return page;
}

// ---------------- import / export ----------------
function exportJson() {
  const payload = { app: "margin", version: 1, exportedAt: new Date().toISOString(), courses: data.courses, terms: data.terms };
  download(`margin-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(payload, null, 2), "application/json");
}

function csvCell(v) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportCsv() {
  const rows = [["term", "definition", "course", "aliases", "source_title", "source_url", "page"]];
  for (const t of data.terms) {
    rows.push([t.term, t.definition, courseById(t.courseId)?.name || "", (t.aliases || []).join("; "), t.source?.title || "", t.source?.url?.startsWith("local:") ? "" : t.source?.url || "", t.source?.page || ""]);
  }
  download(`margin-terms-${new Date().toISOString().slice(0, 10)}.csv`, rows.map((r) => r.map(csvCell).join(",")).join("\n"), "text/csv");
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim()));
}

$("importInput").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    const text = await file.text();
    let added = 0;
    if (file.name.toLowerCase().endsWith(".json")) {
      const json = JSON.parse(text);
      added = await store.importData({ courses: json.courses || [], terms: json.terms || [] });
    } else {
      const rows = parseCsv(text);
      let header = rows[0].map((c) => c.trim().toLowerCase());
      const hasHeader = header.includes("term");
      if (!hasHeader) header = ["term", "definition", "course"];
      const idx = (name) => header.indexOf(name);
      const courses = new Map();
      const terms = [];
      for (const r of hasHeader ? rows.slice(1) : rows) {
        const courseName = (r[idx("course")] || "").trim();
        if (courseName && !courses.has(courseName)) courses.set(courseName, { id: `csv-${courses.size}`, name: courseName });
        terms.push({
          term: r[idx("term")],
          definition: r[idx("definition")] || "",
          courseId: courseName ? courses.get(courseName).id : null,
          aliases: idx("aliases") >= 0 ? (r[idx("aliases")] || "").split(";").map((s) => s.trim()).filter(Boolean) : [],
        });
      }
      added = await store.importData({ courses: [...courses.values()], terms });
    }
    toast(`Imported ${added} term${added === 1 ? "" : "s"}`);
  } catch (err) {
    toast(`Couldn't import: ${err.message || err}`);
  }
});

// ---------------- live updates ----------------
store.onChange(async () => {
  data = await store.getAll();
  const anyDialogOpen = document.querySelector("dialog[open]");
  if (quiz) {
    renderSidebar(route());
    return;
  }
  if (anyDialogOpen) {
    renderSidebar(route());
    return;
  }
  const focused = document.activeElement;
  const wasSearch = focused?.type === "search";
  const scroll = window.scrollY;
  render();
  window.scrollTo(0, scroll);
  if (wasSearch) {
    const s = main.querySelector('input[type="search"]');
    s?.focus();
    s?.setSelectionRange(s.value.length, s.value.length);
  }
});

render();

// Underline saved terms inside definitions and the welcome sample, so the hub itself is "live".
attachStudyLayer({
  root: main,
  extensionPage: true,
  ignoreSelector: ".term, .aka, .letter, .title, .eyebrow, .flash-card, .choice, .score, .chip, .meta, .tools, .step, .lede, .setting, .drop, .list-card, .empty-card",
  getSource: () => null,
});
