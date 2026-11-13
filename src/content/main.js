import { attachStudyLayer } from "../shared/study-layer.js";

function start() {
  const root = document.body;
  if (!root) return;
  attachStudyLayer({
    root,
    getSource: () => ({
      url: location.href,
      title: (document.title || "").trim().slice(0, 140),
      page: null,
    }),
  });
}

if (document.body) start();
else document.addEventListener("DOMContentLoaded", start, { once: true });
