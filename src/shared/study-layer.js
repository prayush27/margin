// Ties everything together on one document: highlights saved terms, shows the hover card,
// and handles saving a new term from a selection. Used by web pages, the PDF viewer and the hub.

import * as store from "./storage.js";
import { buildMatcher } from "./matcher.js";
import { Highlighter } from "./highlighter.js";
import { createOverlay } from "./ui.js";
import { guessDefinition, sentenceAround } from "./extract.js";
import { siteActive, isStudySite, setSiteOn, BLOCKED_HOSTS } from "./sites.js";

const PAGE_STYLE_ID = "margin-highlight-style";

function injectPageStyle() {
  if (document.getElementById(PAGE_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = PAGE_STYLE_ID;
  style.textContent = `::highlight(margin-term){background-color:rgba(242,169,59,.2);text-decoration:underline dotted rgba(214,138,30,.95);text-decoration-thickness:1.5px;text-underline-offset:3px;}::highlight(margin-flash){background-color:rgba(242,169,59,.6);color:inherit;}`;
  (document.head || document.documentElement).appendChild(style);
}

function isEditable(node) {
  const el = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
  if (!el) return false;
  return !!el.closest("input, textarea, select, [contenteditable=''], [contenteditable='true']");
}

function blockFor(node) {
  const el = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
  if (!el) return null;
  return (
    el.closest(".textLayer") ||
    el.closest("p, li, dd, dt, td, th, blockquote, figcaption, h1, h2, h3, h4, h5, h6, article, section") ||
    el.closest("div") ||
    el
  );
}

const squash = (s) => (s || "").replace(/\s+/g, " ").trim();

/**
 * @param {object} opts
 * @param {Element} opts.root           element to highlight inside
 * @param {(range: Range) => object} opts.getSource   returns {url,title,page}
 * @param {boolean} [opts.extensionPage]  true for Margin's own pages (viewer/hub)
 */
export async function attachStudyLayer({ root, getSource, extensionPage = false, ignoreSelector = null, getPageText = null, revealTerm = null }) {
  let data = await store.getAll();
  const overlay = createOverlay();
  const highlighter = new Highlighter({
    root,
    ignore: (el) => overlay.contains(el) || (ignoreSelector ? el.matches?.(ignoreSelector) : false),
  });
  const host = location.hostname;
  if (!extensionPage) injectPageStyle();

  const active = () => (extensionPage ? data.settings.enabled : siteActive(data.settings, host, location.protocol));

  function refresh() {
    highlighter.setMode(data.settings.underline);
    if (active()) {
      highlighter.setMatcher(buildMatcher(store.termsForCourse(data.terms, data.settings.activeCourse)));
      highlighter.start();
    } else {
      highlighter.stop();
      overlay.hideTip();
      overlay.hidePill();
    }
  }
  refresh();

  store.onChange(async (changes) => {
    // Lookups cache results in storage too; only terms, courses and settings change what's underlined.
    if (!changes.terms && !changes.courses && !changes.settings) return;
    data = await store.getAll();
    refresh();
  });

  // ---------- Hover card ----------
  let showTimer = null;
  let hideTimer = null;
  let currentKey = "";
  let frame = 0;
  let lastPoint = null;

  const scheduleHide = (delay = 220) => {
    clearTimeout(showTimer);
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (!overlay.tipHovered) {
        overlay.hideTip();
        currentKey = "";
      }
    }, delay);
  };
  overlay.onTipLeave = () => scheduleHide(180);

  function openHub(hash) {
    chrome.runtime.sendMessage({ type: "open-hub", hash }).catch(() => {});
  }

  function showFor(hit) {
    const items = hit.ids
      .map((id) => data.terms.find((t) => t.id === id))
      .filter(Boolean)
      .map((term) => ({ term, course: data.courses.find((c) => c.id === term.courseId) }));
    if (!items.length) return;
    overlay.showTip(hit.rect, items, {
      onEdit: (term) => openHub(`#term=${term.id}`),
      onOpenSource: (term) => chrome.runtime.sendMessage({ type: "open-source", source: term.source }).catch(() => {}),
    });
  }

  function onPointer() {
    frame = 0;
    if (!lastPoint || !active() || overlay.saving) return;
    const hit = highlighter.hitTest(lastPoint.x, lastPoint.y);
    if (!hit) {
      if (overlay.tipVisible) scheduleHide();
      else clearTimeout(showTimer);
      currentKey = "";
      return;
    }
    const key = hit.ids.join("|") + "@" + Math.round(hit.rect.top) + ":" + Math.round(hit.rect.left);
    clearTimeout(hideTimer);
    if (key === currentKey) return;
    currentKey = key;
    clearTimeout(showTimer);
    if (overlay.tipVisible) showFor(hit);
    else showTimer = setTimeout(() => showFor(hit), 180);
  }

  document.addEventListener(
    "mousemove",
    (e) => {
      if (e.composedPath().includes(overlay.host)) return;
      lastPoint = { x: e.clientX, y: e.clientY };
      if (!frame) frame = requestAnimationFrame(onPointer);
    },
    { passive: true, capture: true },
  );
  document.addEventListener(
    "scroll",
    () => {
      if (overlay.tipVisible && !overlay.tipHovered) {
        overlay.hideTip();
        currentKey = "";
      }
      overlay.hidePill();
    },
    { passive: true, capture: true },
  );

  // ---------- Selection pill ----------
  function selectionInfo() {
    const sel = document.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
    const range = sel.getRangeAt(0);
    if (isEditable(range.commonAncestorContainer)) return null;
    const text = squash(sel.toString());
    if (!text) return null;
    return { sel, range, text };
  }

  function maybeShowPill(e) {
    if (e && e.composedPath().includes(overlay.host)) return;
    if (!data.settings.selectionPill || !active() || overlay.saving) return overlay.hidePill();
    const info = selectionInfo();
    if (!info || info.text.length < 2 || info.text.length > 80 || info.text.split(" ").length > 8) return overlay.hidePill();
    const rects = info.range.getClientRects();
    const rect = rects.length ? rects[rects.length - 1] : info.range.getBoundingClientRect();
    if (!rect || (!rect.width && !rect.height)) return overlay.hidePill();
    overlay.showPill(rect, () => saveFromSelection());
  }

  document.addEventListener("mouseup", (e) => setTimeout(() => maybeShowPill(e), 10), true);
  document.addEventListener(
    "keyup",
    (e) => {
      if (e.shiftKey || e.key === "Shift") setTimeout(() => maybeShowPill(e), 10);
    },
    true,
  );
  document.addEventListener(
    "mousedown",
    (e) => {
      if (!e.composedPath().includes(overlay.host)) overlay.hidePill();
    },
    true,
  );
  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Escape") {
        overlay.hideTip();
        overlay.hidePill();
      }
    },
    true,
  );

  // ---------- Save flow ----------
  async function saveFromSelection(textOverride) {
    const info = selectionInfo();
    const text = squash(textOverride || info?.text);
    if (!text) return false;
    const range = info?.range;
    const rect = range?.getBoundingClientRect() || { top: innerHeight / 3, bottom: innerHeight / 3, left: innerWidth / 2 - 180, right: innerWidth / 2 + 180 };

    let context = "";
    if (range) {
      const block = blockFor(range.commonAncestorContainer);
      const blockText = squash(block?.innerText || block?.textContent || "");
      const idx = blockText.toLowerCase().indexOf(text.toLowerCase());
      context = sentenceAround(blockText, idx, text.length);
      if (context === text) context = "";
    }

    const looksLikeDefinition = text.split(" ").length > 8;
    const term = looksLikeDefinition ? "" : text.length > 80 ? text.slice(0, 80) : text;
    const definition = looksLikeDefinition ? text : "";
    const guess = looksLikeDefinition ? "" : guessDefinition(term, context);

    // Definitions you already wrote for this term in other courses.
    const known = (t) => {
      const key = t.trim().toLowerCase();
      if (!key) return [];
      const seen = new Set();
      return data.terms
        .filter((x) => x.definition?.trim() && (x.term.toLowerCase() === key || x.aliases?.some((a) => a.toLowerCase() === key)))
        .filter((x) => !seen.has(x.definition) && seen.add(x.definition))
        .slice(0, 3)
        .map((x) => ({ text: x.definition, course: data.courses.find((c) => c.id === x.courseId)?.name || "" }));
    };
    // Asks the background worker. A reply without {ok} means the worker is running older code
    // (the page was refreshed but the extension wasn't reloaded).
    const lookup = async (t, course) => {
      const reply = await Promise.race([
        chrome.runtime.sendMessage({ type: "lookup", term: t, course }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 15000)),
      ]);
      if (!reply || typeof reply !== "object" || !("ok" in reply)) throw new Error("stale");
      if (!reply.ok) throw new Error(reply.error || "failed");
      return reply.results || [];
    };

    const result = await overlay.openSave({
      rect,
      term,
      definition,
      guess,
      known,
      lookup,
      context: looksLikeDefinition ? "" : context,
      courses: data.courses,
      courseId: data.settings.activeCourse !== "all" ? data.settings.activeCourse : data.settings.lastCourse,
    });
    if (!result) return false;

    let courseId = result.courseId;
    let courseName = data.courses.find((c) => c.id === courseId)?.name;
    if (result.newCourse) {
      const course = await store.addCourse(result.newCourse);
      courseId = course.id;
      courseName = course.name;
    }
    const source = getSource(range);
    const { term: saved, created } = await store.saveTerm({
      term: result.term,
      definition: result.definition,
      defSource: result.defSource,
      courseId,
      context: looksLikeDefinition ? "" : context,
      source,
    });
    // Saving a term somewhere Margin was off (a blog, a news site) turns it on for that site,
    // so the new term is underlined right away. Sites you paused yourself stay paused.
    const turnOn =
      !extensionPage && host && location.protocol !== "file:" && !active() && !BLOCKED_HOSTS.has(host) &&
      data.settings.enabled && !data.settings.disabledHosts.includes(host) && !isStudySite(host);
    await store.updateSettings({ lastCourse: courseId, ...(turnOn ? setSiteOn(data.settings, host, true) : {}) });
    document.getSelection()?.removeAllRanges();
    overlay.toast(
      (created ? `Saved “${saved.term}”${courseName ? ` to ${courseName}` : ""}` : `Updated “${saved.term}”`) +
        (turnOn ? `. Margin is now on for ${host.replace(/^www\./, "")}` : ""),
      created ? { label: "Undo", run: () => store.deleteTerm(saved.id) } : null,
    );
    return true;
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type !== "save-selection") return;
    if (extensionPage && !document.hasFocus()) return;
    const info = selectionInfo();
    if (!info && !(msg.text && !extensionPage && window === window.top)) return;
    if (msg.text && info && !info.text.includes(squash(msg.text).slice(0, 20))) return;
    saveFromSelection(info ? undefined : msg.text);
  });

  // ---------- Class sidebar ----------
  // The side panel asks for the page's text (to list this class's terms on it) and asks to
  // scroll to a term when you click it. Web pages answer from the top frame; Margin's own pages
  // (PDF viewer) answer only for their own tab.
  let myTabId = null;
  if (extensionPage) chrome.tabs?.getCurrent?.((t) => (myTabId = t?.id ?? null));
  const forMe = (msg) => (extensionPage ? msg.tabId != null && msg.tabId === myTabId : window === window.top);

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === "page-text" && forMe(msg)) {
      const text = getPageText ? getPageText() : root.innerText || "";
      sendResponse({ ok: true, text: text.slice(0, 600000), url: location.href, title: document.title });
    } else if (msg?.type === "reveal-term" && forMe(msg) && msg.term) {
      sendResponse({ ok: revealTerm ? revealTerm(msg.term) : reveal(msg.term) });
    }
  });

  function reveal(term) {
    const matcher = buildMatcher([term]);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.parentElement && !overlay.contains(n.parentElement) && n.parentElement.offsetParent !== null ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
    });
    let n;
    while ((n = walker.nextNode())) {
      const hit = matcher.find(n.data)[0];
      if (!hit) continue;
      const range = document.createRange();
      range.setStart(n, hit.start);
      range.setEnd(n, hit.end);
      n.parentElement.scrollIntoView({ behavior: "smooth", block: "center" });
      injectPageStyle();
      CSS.highlights.set("margin-flash", new Highlight(range));
      setTimeout(() => CSS.highlights.delete("margin-flash"), 1800);
      return true;
    }
    return false;
  }

  return {
    highlighter,
    overlay,
    saveFromSelection,
    getData: () => data,
  };
}
