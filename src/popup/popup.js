import * as store from "../shared/storage.js";
import { siteActive, isStudySite, setSiteOn, BLOCKED_HOSTS } from "../shared/sites.js";
import { looksLikePdf, setOpenPdfs } from "../shared/pdfs.js";
import { viewerUrl } from "../shared/recent.js";

const $ = (id) => document.getElementById(id);
const { terms, courses, settings } = await store.getAll();

// Current site
const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
let host = "";
let canRun = false;
try {
  const u = new URL(tab?.url || "");
  host = u.hostname;
  canRun = /^https?:$/.test(u.protocol) && host !== "chromewebstore.google.com";
  if (u.href.startsWith(chrome.runtime.getURL(""))) {
    $("siteTitle").textContent = "Margin page";
    $("siteHost").textContent = "Always on here";
  }
} catch {}

const toggle = $("siteToggle");
const shortHost = host.replace(/^www\./, "");
function describeSite(s) {
  if (!s.enabled) return "Margin is off everywhere (Settings)";
  const on = siteActive(s, host);
  if (s.disabledHosts.includes(host)) return `Paused on ${shortHost}`;
  if (s.scope === "everywhere") return `On for ${shortHost}`;
  if (isStudySite(host)) return `On for ${shortHost} · study site`;
  return on ? `On for ${shortHost} · you turned it on` : `Off for ${shortHost} · not a study site`;
}
if (canRun) {
  if (BLOCKED_HOSTS.has(host)) {
    toggle.checked = false;
    toggle.disabled = true;
    $("siteHost").textContent = "Google Docs isn't supported yet";
  } else {
    toggle.checked = siteActive(settings, host);
    toggle.disabled = !settings.enabled;
    $("siteHost").textContent = describeSite(settings);
  }
} else if (tab?.url?.startsWith(chrome.runtime.getURL(""))) {
  toggle.checked = true;
  toggle.disabled = true;
} else {
  $("siteHost").textContent = "Margin can't run on this page";
  toggle.disabled = true;
}
$("siteRow").classList.toggle("disabled", toggle.disabled);

toggle.addEventListener("change", async () => {
  const s = await store.updateSettings(setSiteOn(await store.getSettings(), host, toggle.checked));
  $("siteHost").textContent = describeSite(s);
});

// A PDF in Chrome's own viewer: offer to open it in Margin (and to always do that).
if (tab?.id && looksLikePdf(tab.url) && !tab.url.startsWith(chrome.runtime.getURL(""))) {
  $("pdfRow").hidden = false;
  $("siteRow").hidden = true; // Chrome's PDF viewer doesn't run extensions, so the site switch does nothing here
  $("openPdfHere").addEventListener("click", async () => {
    await chrome.tabs.update(tab.id, { url: viewerUrl({ file: tab.url }) });
    window.close();
  });
  const always = $("alwaysPdf");
  always.checked = !!settings.openPdfs;
  always.addEventListener("change", async () => {
    await setOpenPdfs(always.checked);
  });
}

// Course scope
const select = $("courseSelect");
const counts = new Map();
for (const t of terms) counts.set(t.courseId, (counts.get(t.courseId) || 0) + 1);
select.append(new Option(`All courses (${terms.length})`, "all"));
for (const c of courses) select.append(new Option(`${c.name} (${counts.get(c.id) || 0})`, c.id));
select.value = courses.some((c) => c.id === settings.activeCourse) ? settings.activeCourse : "all";
select.addEventListener("change", async () => {
  await store.updateSettings({ activeCourse: select.value });
  $("quizLink").href = `../hub/hub.html#quiz${select.value !== "all" ? `=${select.value}` : ""}`;
});
if (select.value !== "all") $("quizLink").href = `../hub/hub.html#quiz=${select.value}`;

// Stats
const weekAgo = Date.now() - 7 * 86400000;
const thisWeek = terms.filter((t) => t.createdAt > weekAgo).length;
const stat = (n, label) => {
  const d = document.createElement("div");
  d.className = "stat";
  const b = document.createElement("b");
  b.textContent = n;
  const s = document.createElement("span");
  s.textContent = label;
  d.append(b, s);
  return d;
};
$("stats").append(stat(terms.length, terms.length === 1 ? "term saved" : "terms saved"), stat(thisWeek, "added this week"));

// Shortcut label
chrome.commands.getAll().then((cmds) => {
  const c = cmds.find((x) => x.name === "save-term");
  if (c?.shortcut) $("shortcut").textContent = c.shortcut;
});

// Class sidebar. sidePanel.open() needs the click's user gesture, so no awaits before it.
$("openSidebar").addEventListener("click", () => {
  chrome.sidePanel
    .open({ windowId: tab.windowId })
    .then(() => window.close())
    .catch(() => {});
});
