// Class sidebar (Chrome side panel): every term saved for one class, with the ones on the
// current page or PDF first. Follows you across tabs and picks the class from the page when it
// can (a Canvas course you've saved terms from, or chosen here before).

import * as store from "../shared/storage.js";
import { buildMatcher } from "../shared/matcher.js";
import { courseKey } from "../shared/sites.js";
import { looksLikePdf } from "../shared/pdfs.js";
import { viewerUrl } from "../shared/recent.js";
import { sourceLabel } from "../shared/ui.js";

const $ = (id) => document.getElementById(id);
const VIEWER = chrome.runtime.getURL("src/viewer/viewer.html");
const HUB = chrome.runtime.getURL("src/hub/hub.html");

let data = { terms: [], courses: [], settings: {} };
let windowId = null;
let tab = null;
let courseId = null;
let autoPicked = false;
let page = { state: "idle", text: "" }; // state: ok | reload | pdf | unsupported | none
let query = "";
const expanded = new Set();

function h(tag, props = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === "class") n.className = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) n.append(c.nodeType ? c : document.createTextNode(String(c)));
  return n;
}

// ---------- which class ----------
function pickCourse() {
  const { courses, settings } = data;
  const exists = (id) => id && courses.some((c) => c.id === id);
  const key = tab?.url ? courseKey(tab.url) : "";
  const mapped = key && settings.courseSites?.[key];
  if (exists(mapped)) {
    autoPicked = true;
    return mapped;
  }
  autoPicked = false;
  if (exists(courseId)) return courseId;
  return [settings.sidebarCourse, settings.activeCourse, settings.lastCourse].find(exists) || courses[0]?.id || null;
}

// ---------- the page in the active tab ----------
// Right after a page loads, Margin's page script may still be starting, so ask a few times.
async function readPage() {
  for (let i = 0; ; i++) {
    const r = await readPageOnce();
    if (r.state !== "reload" || i >= 4) return r;
    await new Promise((res) => setTimeout(res, 600));
  }
}

async function readPageOnce() {
  if (!tab?.id || !tab.url) return { state: "none", text: "" };
  try {
    if (tab.url.startsWith(VIEWER)) {
      const r = await chrome.runtime.sendMessage({ type: "page-text", tabId: tab.id });
      return r?.ok ? { state: "ok", text: r.text } : { state: "none", text: "" };
    }
    if (!/^(https?|file):/.test(tab.url)) return { state: "unsupported", text: "" };
    if (looksLikePdf(tab.url)) {
      // Chrome's own PDF viewer doesn't run extensions.
      const r = await chrome.tabs.sendMessage(tab.id, { type: "page-text" }, { frameId: 0 }).catch(() => null);
      return r?.ok ? { state: "ok", text: r.text } : { state: "pdf", text: "" };
    }
    const r = await chrome.tabs.sendMessage(tab.id, { type: "page-text" }, { frameId: 0 });
    return r?.ok ? { state: "ok", text: r.text } : { state: "reload", text: "" };
  } catch {
    return { state: "reload", text: "" };
  }
}

async function revealOnPage(term) {
  if (!tab?.id) return;
  const msg = { type: "reveal-term", term: { id: term.id, term: term.term, aliases: term.aliases || [] }, tabId: tab.id };
  if (tab.url?.startsWith(VIEWER)) chrome.runtime.sendMessage(msg).catch(() => {});
  else chrome.tabs.sendMessage(tab.id, msg, { frameId: 0 }).catch(() => {});
}

// ---------- refresh ----------
let refreshing = null;
async function refresh({ reread = true } = {}) {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    data = await store.getAll();
    if (windowId == null) windowId = (await chrome.windows.getCurrent()).id;
    [tab] = await chrome.tabs.query({ active: true, windowId });
    courseId = pickCourse();
    if (reread) page = await readPage();
    render();
  })().finally(() => (refreshing = null));
  return refreshing;
}

// ---------- render ----------
function render() {
  const { courses, terms } = data;
  const select = $("course");
  const counts = new Map();
  for (const t of terms) counts.set(t.courseId, (counts.get(t.courseId) || 0) + 1);
  select.replaceChildren(...courses.map((c) => h("option", { value: c.id, selected: c.id === courseId }, `${c.name} · ${counts.get(c.id) || 0}`)));
  select.disabled = !courses.length;

  const course = courses.find((c) => c.id === courseId);
  document.documentElement.style.setProperty("--course", course?.color || "var(--mark)");
  $("courseHint").hidden = !autoPicked;
  $("courseHint").textContent = autoPicked ? "Picked from this course page" : "";
  $("quiz").href = `${HUB}#quiz${courseId ? `=${courseId}` : ""}`;
  $("glossary").href = `${HUB}${courseId ? `#course=${courseId}` : ""}`;

  const list = $("list");
  if (!courses.length) {
    list.replaceChildren(
      h("div", { class: "empty" }, h("strong", {}, "No classes yet"), h("p", {}, "Select a word on any page and press ⌥⇧S to save your first term. Its class will show up here.")),
    );
    return;
  }

  const classTerms = terms.filter((t) => t.courseId === courseId);
  const q = query.trim().toLowerCase();
  const visible = q
    ? classTerms.filter((t) => t.term.toLowerCase().includes(q) || t.aliases?.some((a) => a.toLowerCase().includes(q)) || t.definition?.toLowerCase().includes(q))
    : classTerms;

  // Which of this class's terms are on the page, and how often.
  const onPage = new Map();
  if (page.state === "ok" && page.text && classTerms.length) {
    for (const hit of buildMatcher(classTerms).find(page.text)) for (const id of hit.ids) onPage.set(id, (onPage.get(id) || 0) + 1);
  }
  const here = visible.filter((t) => onPage.has(t.id)).sort((a, b) => onPage.get(b.id) - onPage.get(a.id) || a.term.localeCompare(b.term));
  const rest = visible.filter((t) => !onPage.has(t.id)).sort((a, b) => a.term.localeCompare(b.term, undefined, { sensitivity: "base" }));

  const sections = [];
  const pageNote = {
    reload: "Reload this tab to see which terms are on it.",
    pdf: "This PDF is open in Chrome's viewer.",
    unsupported: "",
    none: "",
  }[page.state];

  if (here.length || page.state === "ok") {
    sections.push(
      h("h2", { class: "sec" }, "On this page", h("span", { class: "n" }, here.length || "")),
      here.length ? h("div", { class: "rows" }, ...here.map((t) => row(t, onPage.get(t.id)))) : h("p", { class: "note" }, q ? "No matches on this page." : `None of your ${course?.name || ""} terms are on this page yet.`),
    );
  } else if (pageNote) {
    sections.push(
      h(
        "p",
        { class: "note" },
        pageNote,
        page.state === "pdf" && " ",
        page.state === "pdf" &&
          h("button", { class: "link", onclick: () => chrome.tabs.update(tab.id, { url: viewerUrl({ file: tab.url }) }) }, "Open it in Margin"),
      ),
    );
  }

  sections.push(
    h("h2", { class: "sec" }, here.length ? "Everything else" : `All terms`, h("span", { class: "n" }, rest.length || "")),
    rest.length
      ? h("div", { class: "rows" }, ...rest.map((t) => row(t, 0)))
      : h("p", { class: "note" }, q ? "Nothing matches." : here.length ? "That's every term in this class." : "No terms in this class yet. Save one and it shows up here."),
  );
  list.replaceChildren(...sections);
}

function row(t, count) {
  const isOpen = expanded.has(t.id);
  const src = sourceLabel(t.source);
  return h(
    "article",
    { class: `term${isOpen ? " open" : ""}${count ? " here" : ""}` },
    h(
      "button",
      {
        class: "head",
        "aria-expanded": String(isOpen),
        onclick: () => {
          isOpen ? expanded.delete(t.id) : expanded.add(t.id);
          render();
        },
      },
      h("span", { class: "name" }, t.term),
      count ? h("span", { class: "count", title: `${count} on this page` }, `×${count}`) : null,
    ),
    h("p", { class: t.definition ? "def" : "def none" }, t.definition || "No definition yet."),
    isOpen &&
      h(
        "div",
        { class: "more" },
        t.aliases?.length ? h("p", { class: "aka" }, `Also: ${t.aliases.join(", ")}`) : null,
        src ? h("p", { class: "src" }, `Saved from ${src}`) : null,
        h(
          "div",
          { class: "acts" },
          count ? h("button", { class: "btn sm", onclick: () => revealOnPage(t) }, "Show on page") : null,
          h("a", { class: "btn sm ghost", href: `${HUB}#term=${t.id}`, target: "_blank" }, "Edit"),
        ),
      ),
  );
}

// ---------- events ----------
$("course").addEventListener("change", async (e) => {
  courseId = e.target.value;
  autoPicked = false;
  expanded.clear();
  await store.updateSettings({ sidebarCourse: courseId });
  // Remember the choice for this course site (e.g. this Canvas course).
  if (tab?.url && courseKey(tab.url)) await store.rememberCourseSite(tab.url, courseId);
  render();
});
$("search").addEventListener("input", (e) => {
  query = e.target.value;
  render();
});

chrome.tabs.onActivated.addListener((info) => info.windowId === windowId && refresh());
chrome.tabs.onUpdated.addListener((id, change, t) => {
  if (t.active && t.windowId === windowId && (change.status === "complete" || change.url)) refresh();
});
store.onChange((changes) => {
  if (changes.terms || changes.courses || changes.settings) refresh({ reread: false });
});
// Pages like Canvas change without reloading; check again now and then while the panel is visible.
setInterval(() => document.visibilityState === "visible" && refresh(), 6000);
document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && refresh());

refresh();
store.getSettings().then((s) => s.seenSidebar || store.updateSettings({ seenSidebar: true }));
