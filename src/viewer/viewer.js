import * as store from "../shared/storage.js";
import { buildMatcher } from "../shared/matcher.js";
import { attachStudyLayer } from "../shared/study-layer.js";
import { listRecent, getRecent, touchRecent, viewerUrl } from "../shared/recent.js";
import { createSuggestions } from "./suggest.js";
import { SHORTCUT_LABEL } from "../shared/ui.js";

const $ = (id) => document.getElementById(id);
const PDFJS = "../../vendor/pdfjs/";

const params = new URLSearchParams(location.search);
const fileParam = params.get("file");
const recentParam = params.get("recent");
let hashPage = Number(new URLSearchParams(location.hash.slice(1)).get("page")) || null;

let pdfjsLib;
let viewer;
let eventBus;
let pdfDoc = null;
let docInfo = { url: null, name: "" };
let pageTexts = [];
let layer = null;
let suggestions = null;
let sideTab = "saved";

// ---------------- Boot ----------------
(async function boot() {
  const settings = await store.getSettings();
  setDarkPages(settings.darkPdf);
  wireToolbar();
  wireDrop();

  try {
    if (recentParam) await openRecent(recentParam);
    else if (fileParam) await openUrl(fileParam);
    else await showEmpty();
  } catch (err) {
    console.error(err);
    showError(err);
  }
})();

async function ensurePdfjs() {
  if (pdfjsLib) return;
  pdfjsLib = await import(PDFJS + "build/pdf.min.mjs");
  globalThis.pdfjsLib = pdfjsLib;
  pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("vendor/pdfjs/build/pdf.worker.min.mjs");
  const { EventBus, PDFViewer, PDFLinkService } = await import(PDFJS + "web/pdf_viewer.mjs");

  eventBus = new EventBus();
  const linkService = new PDFLinkService({ eventBus, externalLinkTarget: 2 });
  viewer = new PDFViewer({
    container: $("viewerContainer"),
    viewer: $("viewer"),
    eventBus,
    linkService,
    textLayerMode: 1,
    removePageBorders: true,
  });
  linkService.setViewer(viewer);
  ensurePdfjs.linkService = linkService;

  eventBus.on("pagesinit", () => {
    viewer.currentScaleValue = "page-width";
    if (hashPage) viewer.currentPageNumber = Math.min(hashPage, pdfDoc.numPages);
    hashPage = null; // only for the PDF this link opened
  });
  eventBus.on("pagechanging", ({ pageNumber }) => {
    $("pageInput").value = pageNumber;
    $("prevPage").disabled = pageNumber <= 1;
    $("nextPage").disabled = pageNumber >= (pdfDoc?.numPages || 1);
  });
  eventBus.on("scalechanging", ({ scale }) => {
    $("zoomLabel").textContent = `${Math.round(scale * 100)}%`;
  });
}

// ---------------- Opening documents ----------------
function nameFromUrl(url) {
  try {
    const u = new URL(url);
    const last = decodeURIComponent(u.pathname.split("/").filter(Boolean).pop() || u.hostname);
    return last;
  } catch {
    return "Document.pdf";
  }
}

async function openUrl(url) {
  if (url.startsWith("file:")) {
    const allowed = await chrome.extension.isAllowedFileSchemeAccess();
    if (!allowed) {
      showMessage(
        "Margin needs permission to open files from your Mac",
        "Turn on “Allow access to file URLs” for Margin in Chrome's extension settings, then reload this tab. Or choose the file directly.",
        [
          { label: "Open extension settings", primary: true, run: () => chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` }) },
          { label: "Choose file…", run: pickFile },
        ],
      );
      return;
    }
  }
  const name = nameFromUrl(url);
  await openDocument({ url, withCredentials: true }, { url, name });
  touchRecent({ name: docInfo.name, url }).catch(() => {});
}

async function openRecent(id) {
  const rec = await getRecent(id);
  if (!rec) return showEmpty();
  if (rec.url) return openUrl(rec.url);
  if (!rec.handle) return showEmpty();
  const perm = await rec.handle.queryPermission({ mode: "read" });
  if (perm !== "granted") {
    showMessage(`Reopen “${rec.name}”?`, "Chrome needs your OK to read this file again.", [
      {
        label: "Open file",
        primary: true,
        run: async () => {
          if ((await rec.handle.requestPermission({ mode: "read" })) === "granted") openHandle(rec.handle, rec.id);
        },
      },
      { label: "Choose another…", run: pickFile },
    ]);
    return;
  }
  await openHandle(rec.handle, rec.id);
}

async function openHandle(handle, recentId) {
  const file = await handle.getFile();
  const data = new Uint8Array(await file.arrayBuffer());
  const rec = await touchRecent({ id: recentId, name: file.name, handle });
  history.replaceState(null, "", viewerUrl({ recent: rec.id }));
  await openDocument({ data }, { url: `local:${file.name}`, name: file.name });
}

async function openDocument(source, info) {
  await ensurePdfjs();
  hideStates();
  $("docTitle").textContent = "Loading…";
  if (pdfDoc) {
    await pdfDoc.destroy();
    pdfDoc = null;
  }
  const task = pdfjsLib.getDocument({
    ...source,
    cMapUrl: chrome.runtime.getURL("vendor/pdfjs/cmaps/"),
    cMapPacked: true,
    standardFontDataUrl: chrome.runtime.getURL("vendor/pdfjs/standard_fonts/"),
    isEvalSupported: false,
  });
  pdfDoc = await task.promise;
  docInfo = info;

  let title = info.name;
  try {
    const meta = await pdfDoc.getMetadata();
    const t = meta?.info?.Title?.trim();
    if (t && t.length > 3 && !/^(untitled|microsoft|powerpoint)/i.test(t)) title = t;
  } catch {}
  docInfo.title = title;
  document.title = `${title} · Margin`;
  $("docTitle").textContent = title;
  $("docTitle").title = info.url?.startsWith("local:") ? info.name : info.url || "";

  viewer.setDocument(pdfDoc);
  ensurePdfjs.linkService.setDocument(pdfDoc, null);
  $("pageCount").textContent = pdfDoc.numPages;
  $("pageInput").value = 1;
  $("viewerContainer").hidden = false;
  $("controls").hidden = false;
  $("toggleSide").hidden = false;

  if (!layer) {
    layer = await attachStudyLayer({
      root: $("viewer"),
      extensionPage: true,
      getPageText: () => pageTexts.map((t) => t || "").join("\n\n"),
      revealTerm: (term) => {
        const m = buildMatcher([term]);
        const i = pageTexts.findIndex((t) => t && m.find(t).length);
        if (i < 0) return false;
        viewer.currentPageNumber = i + 1;
        return true;
      },
      getSource: (range) => {
        const pageEl = range?.startContainer?.parentElement?.closest?.(".page");
        const page = Number(pageEl?.dataset.pageNumber) || viewer.currentPageNumber;
        return { url: docInfo.url, title: docInfo.title || docInfo.name, page };
      },
    });
    suggestions = createSuggestions({
      pane: $("suggestPane"),
      onCount: (n) => {
        $("suggestCount").hidden = !n;
        $("suggestCount").textContent = n || "";
      },
      getText: () => ({ pages: pageTexts, done: !!pdfDoc && pageTexts.filter((t) => t !== undefined).length >= pdfDoc.numPages, total: pdfDoc?.numPages || 0 }),
      getDoc: () => ({ url: docInfo.url, title: docInfo.title || docInfo.name, name: docInfo.name }),
      goToPage: (n) => (viewer.currentPageNumber = n),
      toast: (msg, action) => layer.overlay.toast(msg, action),
    });
    wireSideTabs();
    store.onChange((changes) => {
      if (changes.terms || changes.settings) renderSide();
      if (changes.terms || changes.courses) suggestions.refresh();
    });
  }

  const settings = await store.getSettings();
  setSide(settings.sideOpen !== false);
  pageTexts = [];
  renderSide(true);
  suggestions.refresh({ newDoc: true });
  // New to Margin? Start on the suggestions instead of an empty list.
  setSideTab((await store.getAll()).terms.length ? "saved" : "suggest");
  extractText();
}

async function extractText() {
  const doc = pdfDoc;
  for (let i = 1; i <= doc.numPages; i++) {
    if (doc !== pdfDoc) return;
    try {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      pageTexts[i - 1] = joinTextItems(content.items);
    } catch {
      pageTexts[i - 1] = "";
    }
    if (i % 8 === 0 || i === doc.numPages) {
      renderSide();
      suggestions?.refresh();
    }
  }
}

// PDF text comes in pieces. Join them by where they sit on the page, so a word split around a
// ligature ("signi" + "fi" + "cance") stays one word, and separate words keep their space.
function joinTextItems(items) {
  let out = "";
  let prev = null;
  for (const it of items) {
    const str = it.str || "";
    if (prev) {
      if (prev.hasEOL) out += "\n";
      else if (str && prev.str) {
        const size = Math.hypot(it.transform[2], it.transform[3]) || 10;
        const sameLine = Math.abs(it.transform[5] - prev.transform[5]) < size * 0.5;
        const gap = it.transform[4] - (prev.transform[4] + prev.width);
        const touching = sameLine && gap < size * 0.12 && gap > -size * 0.5;
        if (!touching && !/\s$/.test(out) && !/^\s/.test(str)) out += sameLine ? " " : "\n";
      }
    }
    out += str;
    if (str || it.hasEOL) prev = it;
  }
  return out.replace(/[\uFB00-\uFB06]/g, (c) => ({ "\uFB00": "ff", "\uFB01": "fi", "\uFB02": "fl", "\uFB03": "ffi", "\uFB04": "ffl", "\uFB05": "st", "\uFB06": "st" })[c]);
}

// ---------------- Side panel tabs ----------------
function setSideTab(tab) {
  sideTab = tab;
  const saved = tab === "saved";
  $("tabSaved").setAttribute("aria-selected", String(saved));
  $("tabSuggest").setAttribute("aria-selected", String(!saved));
  $("sideList").hidden = !saved;
  $("suggestPane").hidden = saved;
  $("sideMeta").hidden = !saved;
}

function wireSideTabs() {
  $("tabSaved").addEventListener("click", () => setSideTab("saved"));
  $("tabSuggest").addEventListener("click", () => setSideTab("suggest"));
}

// ---------------- Side panel: terms in this PDF ----------------
async function renderSide(initial = false) {
  if (!pdfDoc) return;
  const { terms, courses, settings } = await store.getAll();
  const scoped = store.termsForCourse(terms, settings.activeCourse);
  const list = $("sideList");
  const done = pageTexts.filter((t) => t !== undefined).length;
  const total = pdfDoc.numPages;

  const found = new Map();
  if (scoped.length) {
    const matcher = buildMatcher(scoped);
    pageTexts.forEach((text, idx) => {
      if (!text) return;
      for (const hit of matcher.find(text)) {
        for (const id of hit.ids) {
          if (!found.has(id)) found.set(id, new Set());
          found.get(id).add(idx + 1);
        }
      }
    });
  }

  const rows = [...found.entries()]
    .map(([id, pages]) => ({ term: terms.find((t) => t.id === id), pages: [...pages].sort((a, b) => a - b) }))
    .filter((r) => r.term)
    .sort((a, b) => a.pages[0] - b.pages[0] || a.term.term.localeCompare(b.term.term));

  $("termCount").textContent = rows.length;
  $("sideMeta").textContent = done < total ? `Scanning ${done}/${total}` : `${rows.length} found`;

  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  if (!rows.length) {
    if (initial || done >= total || done === 0) {
      const empty = el("div", "side-empty");
      if (!terms.length) {
        empty.innerHTML = `<strong>No terms saved yet.</strong><br>Select a word in this PDF and press <kbd>${SHORTCUT_LABEL}</kbd>, or click <strong>Save term</strong>.`;
      } else {
        empty.innerHTML = `<strong>None of your saved terms appear here yet.</strong><br>Save new ones as you read and they'll show up in this list.`;
      }
      list.replaceChildren(empty);
    }
    return;
  }

  list.replaceChildren(
    ...rows.map(({ term, pages }) => {
      const course = courses.find((c) => c.id === term.courseId);
      const row = el("div", "term-row");
      const t = el("div", "t");
      if (course) {
        const dot = el("i");
        dot.style.background = course.color;
        dot.title = course.name;
        t.append(dot);
      }
      t.append(term.term);
      const d = el("p", term.definition ? "d" : "d none", term.definition || "No definition yet");
      const p = el("div", "pages");
      for (const n of pages.slice(0, 12)) {
        const b = el("button", null, `p. ${n}`);
        b.addEventListener("click", () => (viewer.currentPageNumber = n));
        p.append(b);
      }
      if (pages.length > 12) p.append(el("span", "faint", ` +${pages.length - 12}`));
      row.append(t, d, p);
      return row;
    }),
  );
  if (done < total) list.append(el("div", "scanning", `Scanning pages… ${done}/${total}`));
}

function setSide(open) {
  $("side").hidden = !open;
  document.body.classList.toggle("side-open", open);
  $("toggleSide").setAttribute("aria-pressed", String(open));
  if (viewer && pdfDoc) {
    requestAnimationFrame(() => {
      if (["page-width", "auto", "page-fit"].includes(viewer.currentScaleValue)) viewer.currentScaleValue = viewer.currentScaleValue;
      else viewer.update();
    });
  }
}

function setDarkPages(on) {
  document.body.classList.toggle("dark-pages", !!on);
  $("darkPages").setAttribute("aria-pressed", String(!!on));
}

// ---------------- Toolbar ----------------
const ZOOMS = [0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4];

function zoom(dir) {
  if (!viewer || !pdfDoc) return;
  const cur = viewer.currentScale;
  const next = dir > 0 ? ZOOMS.find((z) => z > cur + 0.01) : [...ZOOMS].reverse().find((z) => z < cur - 0.01);
  if (next) viewer.currentScale = next;
}

function wireToolbar() {
  $("prevPage").addEventListener("click", () => viewer && (viewer.currentPageNumber -= 1));
  $("nextPage").addEventListener("click", () => viewer && (viewer.currentPageNumber += 1));
  $("pageInput").addEventListener("change", (e) => {
    const n = Number(e.target.value);
    if (viewer && n >= 1 && n <= pdfDoc.numPages) viewer.currentPageNumber = n;
    else e.target.value = viewer?.currentPageNumber || 1;
  });
  $("pageInput").addEventListener("focus", (e) => e.target.select());
  $("zoomIn").addEventListener("click", () => zoom(1));
  $("zoomOut").addEventListener("click", () => zoom(-1));
  $("zoomLabel").addEventListener("click", () => viewer && (viewer.currentScaleValue = "page-width"));
  $("openFile").addEventListener("click", pickFile);
  $("pickFile").addEventListener("click", pickFile);
  $("toggleSide").addEventListener("click", async () => {
    const open = $("side").hidden;
    setSide(open);
    await store.updateSettings({ sideOpen: open });
  });
  $("darkPages").addEventListener("click", async () => {
    const on = !document.body.classList.contains("dark-pages");
    setDarkPages(on);
    await store.updateSettings({ darkPdf: on });
  });

  document.addEventListener("keydown", (e) => {
    const typing = e.target.closest?.("input, textarea, select, [contenteditable]");
    if (typing || e.metaKey || e.ctrlKey || e.altKey || !pdfDoc) return;
    if (e.key === "+" || e.key === "=") zoom(1);
    else if (e.key === "-") zoom(-1);
    else if (e.key === "ArrowRight" || e.key === "n") viewer.currentPageNumber += 1;
    else if (e.key === "ArrowLeft" || e.key === "p") viewer.currentPageNumber -= 1;
    else return;
    e.preventDefault();
  });
}

// ---------------- Files: picker + drag & drop ----------------
async function pickFile() {
  try {
    const [handle] = await window.showOpenFilePicker({
      types: [{ description: "PDF", accept: { "application/pdf": [".pdf"] } }],
      excludeAcceptAllOption: false,
      multiple: false,
    });
    if (handle) await openHandle(handle);
  } catch (err) {
    if (err?.name !== "AbortError") showError(err);
  }
}

function wireDrop() {
  let depth = 0;
  const overlay = $("dropOverlay");
  const isFile = (e) => [...(e.dataTransfer?.types || [])].includes("Files");
  window.addEventListener("dragenter", (e) => {
    if (!isFile(e)) return;
    e.preventDefault();
    depth++;
    if ($("emptyState").hidden) overlay.hidden = false;
    else $("dropZone").classList.add("over");
  });
  window.addEventListener("dragover", (e) => {
    if (isFile(e)) e.preventDefault();
  });
  window.addEventListener("dragleave", () => {
    depth = Math.max(0, depth - 1);
    if (!depth) {
      overlay.hidden = true;
      $("dropZone").classList.remove("over");
    }
  });
  window.addEventListener("drop", async (e) => {
    if (!isFile(e)) return;
    e.preventDefault();
    depth = 0;
    overlay.hidden = true;
    $("dropZone").classList.remove("over");
    const item = [...e.dataTransfer.items].find((i) => i.kind === "file");
    if (!item) return;
    // Both must be requested before the first await: the drop's items stop working after it.
    const file = item.getAsFile();
    const handlePromise = item.getAsFileSystemHandle?.();
    try {
      const handle = await handlePromise;
      if (handle && handle.kind === "file") {
        await openHandle(handle);
      } else {
        if (!file) return;
        await openDocument({ data: new Uint8Array(await file.arrayBuffer()) }, { url: `local:${file.name}`, name: file.name });
      }
    } catch (err) {
      showError(err);
    }
  });
}

// ---------------- States ----------------
function hideStates() {
  $("emptyState").hidden = true;
  $("messageState").hidden = true;
}

function timeAgo(t) {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} d ago`;
  return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

async function showEmpty() {
  $("docTitle").textContent = "";
  $("viewerContainer").hidden = true;
  $("controls").hidden = true;
  $("side").hidden = true;
  document.body.classList.remove("side-open");
  $("messageState").hidden = true;
  $("emptyState").hidden = false;
  const recent = (await listRecent().catch(() => [])).slice(0, 8);
  $("recentWrap").hidden = !recent.length;
  $("recentList").replaceChildren(
    ...recent.map((r) => {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = viewerUrl(r.url ? { file: r.url } : { recent: r.id });
      const ico = document.createElement("span");
      ico.className = "file-ico";
      const name = document.createElement("span");
      name.className = "name";
      name.textContent = r.name;
      const when = document.createElement("span");
      when.className = "when";
      when.textContent = (r.url && !r.url.startsWith("file:") ? new URL(r.url).hostname + " · " : "") + timeAgo(r.openedAt);
      a.append(ico, name, when);
      li.append(a);
      return li;
    }),
  );
}

function showMessage(title, body, actions = []) {
  $("viewerContainer").hidden = true;
  $("controls").hidden = true;
  $("side").hidden = true;
  $("emptyState").hidden = true;
  $("messageState").hidden = false;
  $("messageTitle").textContent = title;
  $("messageBody").textContent = body;
  $("messageActions").replaceChildren(
    ...actions.map((a) => {
      const b = document.createElement("button");
      b.className = a.primary ? "btn primary" : "btn";
      b.textContent = a.label;
      b.addEventListener("click", a.run);
      return b;
    }),
  );
}

function showError(err) {
  const url = fileParam;
  const isWeb = url && /^https?:/.test(url);
  const msg = String(err?.message || err || "");
  const auth = /401|403|Unexpected server response|Missing PDF|Invalid PDF/i.test(msg);
  showMessage(
    "Couldn't open this PDF",
    isWeb && auth
      ? "This file may need your school login. Open the original page, download the PDF, then drop it here."
      : msg || "Something went wrong while loading the file.",
    [
      isWeb && {
        label: "Open original",
        primary: true,
        run: async () => {
          await chrome.runtime.sendMessage({ type: "bypass-pdf", url });
          location.href = url;
        },
      },
      { label: "Choose file…", primary: !isWeb, run: pickFile },
    ].filter(Boolean),
  );
}
