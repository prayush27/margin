import { getSettings, updateSettings } from "./shared/storage.js";
import { viewerUrl } from "./shared/recent.js";
import { lookupDefinitions, subjectFor } from "./shared/lookup.js";

const HUB_URL = chrome.runtime.getURL("src/hub/hub.html");

// ---------- Install ----------
chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: "save-selection", title: "Save “%s” to Margin", contexts: ["selection"] });
    chrome.contextMenus.create({
      id: "open-link-pdf",
      title: "Open PDF in Margin",
      contexts: ["link"],
      targetUrlPatterns: ["*://*/*.pdf*", "*://*/*.PDF*", "*://*/*/files/*", "file:///*.pdf", "file:///*.PDF"],
    });
    chrome.contextMenus.create({ id: "open-hub", title: "Open Margin glossary", contexts: ["action"] });
  });
  if (reason === "install") {
    const s = await getSettings();
    if (!s.welcomed) {
      await updateSettings({ welcomed: true });
      chrome.tabs.create({ url: `${HUB_URL}#welcome` });
    }
  }
});

// ---------- Save a term ----------
async function requestSave(tab, { frameId, text } = {}) {
  if (!tab?.id) return;
  if (tab.url?.startsWith(chrome.runtime.getURL(""))) {
    // Margin's own pages (PDF viewer, hub) listen on runtime messages.
    chrome.runtime.sendMessage({ type: "save-selection", text }).catch(() => {});
    return;
  }
  const options = frameId != null ? { frameId } : undefined;
  chrome.tabs.sendMessage(tab.id, { type: "save-selection", text }, options).catch(() => {});
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "save-selection") {
    requestSave(tab, { frameId: info.frameId, text: info.selectionText });
  } else if (info.menuItemId === "open-link-pdf" && info.linkUrl) {
    chrome.tabs.create({ url: viewerUrl({ file: info.linkUrl }), index: tab ? tab.index + 1 : undefined });
  } else if (info.menuItemId === "open-hub") {
    chrome.tabs.create({ url: HUB_URL });
  }
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === "save-term") requestSave(tab);
});

// ---------- Messages from pages ----------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "open-hub") {
    chrome.tabs.create({ url: HUB_URL + (msg.hash || ""), index: sender.tab ? sender.tab.index + 1 : undefined });
  } else if (msg?.type === "open-source" && msg.source) {
    const { url, page } = msg.source;
    if (!url || url.startsWith("local:")) return;
    const isPdf = page || /\.pdf($|[?#])/i.test(url);
    chrome.tabs.create({
      url: isPdf ? viewerUrl({ file: url, page }) : url,
      index: sender.tab ? sender.tab.index + 1 : undefined,
    });
  } else if (msg?.type === "lookup" && msg.term) {
    lookupDefinitions(msg.term, subjectFor(msg.course || ""))
      .then((results) => sendResponse({ ok: true, results }))
      .catch((e) => sendResponse({ ok: false, error: String(e?.message || e) }));
    return true;
  } else if (msg?.type === "bypass-pdf" && msg.url) {
    chrome.storage.session.set({ bypass: { url: msg.url, until: Date.now() + 15000 } }).then(() => sendResponse(true));
    return true;
  }
});

// ---------- Open PDFs in Margin ----------
async function shouldBypass(url) {
  const { bypass } = await chrome.storage.session.get("bypass");
  if (bypass && bypass.url === url && bypass.until > Date.now()) {
    await chrome.storage.session.remove("bypass");
    return true;
  }
  return false;
}

function header(details, name) {
  return details.responseHeaders?.find((h) => h.name.toLowerCase() === name)?.value || "";
}

// Web PDFs from course sites. Only acts when you've turned on "Open PDFs in Margin".
chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    if (details.tabId < 0 || details.method !== "GET") return;
    const type = header(details, "content-type").toLowerCase();
    if (!type.includes("application/pdf")) return;
    if (/^\s*attachment/i.test(header(details, "content-disposition"))) return;
    (async () => {
      const settings = await getSettings();
      if (!settings.openPdfs || (await shouldBypass(details.url))) return;
      chrome.tabs.update(details.tabId, { url: viewerUrl({ file: details.url }) });
    })();
  },
  { urls: ["http://*/*", "https://*/*"], types: ["main_frame"] },
  ["responseHeaders"],
);

// Local PDFs opened in Chrome (file:///...). Needs "Allow access to file URLs" for Margin;
// the host permission lets Margin see the tab's URL, so no browsing-history permission is needed.
chrome.tabs.onUpdated.addListener(async (tabId, change) => {
  if (!change.url || !/^file:\/\/.*\.pdf$/i.test(change.url)) return;
  const settings = await getSettings();
  if (!settings.openPdfs || (await shouldBypass(change.url))) return;
  chrome.tabs.update(tabId, { url: viewerUrl({ file: change.url }) });
});
