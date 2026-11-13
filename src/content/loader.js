// Content scripts can't be ES modules directly, so this tiny loader imports the real one.
(() => {
  if (window.__marginLoader) return;
  window.__marginLoader = true;
  if (location.protocol === "chrome-extension:") return;
  // Skip tiny/invisible frames (ads, trackers) to stay light.
  if (window !== window.top && (innerWidth < 120 || innerHeight < 60)) return;
  import(chrome.runtime.getURL("src/content/main.js")).catch((err) => console.debug("[Margin] failed to load", err));
})();
