// On-page UI for Margin: hover card, save card, "Save term" pill and toasts.
// Everything lives inside a closed shadow root so page CSS can't touch it (and vice versa).

const STYLE = `
:host { all: initial; }
* { box-sizing: border-box; }
.root {
  --font: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", "Segoe UI", system-ui, sans-serif;
  --serif: "Newsreader", "New York", "Iowan Old Style", Georgia, serif;
  --surface: rgba(255,255,255,0.97);
  --solid: #ffffff;
  --surface-2: #f4f2ee;
  --text: #1d1d1f;
  --text-2: rgba(60,60,67,0.76);
  --text-3: rgba(60,60,67,0.5);
  --border: rgba(0,0,0,0.09);
  --border-strong: rgba(0,0,0,0.15);
  --hover: rgba(0,0,0,0.05);
  --primary: #1d1d1f;
  --on-primary: #fff;
  --mark: #f2a93b;
  --mark-soft: rgba(242,169,59,0.22);
  --accent: #b86e0c;
  --shadow: 0 12px 32px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.06);
  --ease: cubic-bezier(.2,.8,.2,1);
  font-family: var(--font);
  color: var(--text);
  font-size: 14px;
  line-height: 1.45;
  -webkit-font-smoothing: antialiased;
}
@media (prefers-color-scheme: dark) {
  .root {
    --surface: rgba(36,36,38,0.97);
    --solid: #242426;
    --surface-2: #2e2e31;
    --text: #f5f5f7;
    --text-2: rgba(235,235,245,0.68);
    --text-3: rgba(235,235,245,0.42);
    --border: rgba(255,255,255,0.1);
    --border-strong: rgba(255,255,255,0.18);
    --hover: rgba(255,255,255,0.07);
    --primary: #f5f5f7;
    --on-primary: #1d1d1f;
    --accent: #f2b552;
    --shadow: 0 12px 32px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.35);
  }
}
[hidden] { display: none !important; }
.panel {
  position: fixed;
  top: 0; left: 0;
  background: var(--surface);
  backdrop-filter: saturate(180%) blur(20px);
  -webkit-backdrop-filter: saturate(180%) blur(20px);
  border: 1px solid var(--border);
  border-radius: 14px;
  box-shadow: var(--shadow);
  animation: pop 140ms var(--ease);
}
@keyframes pop { from { opacity: 0; transform: translateY(4px) scale(.985); } to { opacity: 1; transform: none; } }

/* Hover card */
.tip { width: max-content; max-width: 360px; min-width: 220px; padding: 4px; }
.item { padding: 10px 12px; border-radius: 10px; }
.item + .item { border-top: 1px solid var(--border); border-radius: 0 0 10px 10px; }
.head { display: flex; align-items: baseline; gap: 8px; margin-bottom: 4px; }
.term { font-family: var(--serif); font-size: 18px; font-weight: 600; letter-spacing: -0.01em; line-height: 1.25; }
.chip { margin-left: auto; display: inline-flex; align-items: center; gap: 5px; height: 20px; padding: 0 7px; border-radius: 999px; background: var(--surface-2); color: var(--text-2); font-size: 11px; font-weight: 600; white-space: nowrap; }
.chip i { width: 6px; height: 6px; border-radius: 50%; }
.def { margin: 0; font-size: 14px; line-height: 1.5; color: var(--text); white-space: pre-wrap; }
.def.empty { color: var(--text-3); font-style: italic; }
.meta { display: flex; align-items: center; gap: 10px; margin-top: 8px; font-size: 12px; color: var(--text-3); }
.meta .src { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 240px; }
.link { all: unset; cursor: pointer; color: var(--text-2); font-size: 12px; font-weight: 500; }
.link:hover { color: var(--accent); }
.meta .link:last-child { margin-left: auto; }
.meta .via { white-space: nowrap; }

/* Save card */
.card { width: 360px; padding: 14px; }
.card-head { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; font-size: 13px; font-weight: 600; color: var(--text); }
.logo { width: 16px; height: 16px; border-radius: 4px; background: var(--primary); position: relative; flex: none; }
.logo::after { content: ""; position: absolute; left: 3px; right: 3px; bottom: 3px; height: 2px; border-radius: 1px; background: var(--mark); }
.spacer { flex: 1; }
label { display: block; margin: 10px 0 5px; font-size: 11.5px; font-weight: 600; color: var(--text-2); letter-spacing: 0.01em; }
input, textarea, select {
  all: unset; box-sizing: border-box; display: block; width: 100%;
  font-family: var(--font); font-size: 14px; color: var(--text);
  background: var(--solid); border: 1px solid var(--border-strong); border-radius: 8px;
  padding: 7px 10px; line-height: 1.45;
  transition: border-color 120ms var(--ease), box-shadow 120ms var(--ease);
}
input.term-input { font-family: var(--serif); font-size: 17px; font-weight: 600; padding: 6px 10px; }
textarea { min-height: 76px; max-height: 220px; resize: vertical; white-space: pre-wrap; overflow: auto; }
select { cursor: pointer; padding-right: 28px; background-image: linear-gradient(45deg, transparent 50%, var(--text-2) 50%), linear-gradient(135deg, var(--text-2) 50%, transparent 50%); background-position: calc(100% - 15px) 50%, calc(100% - 10px) 50%; background-size: 5px 5px; background-repeat: no-repeat; }
input:focus, textarea:focus, select:focus { border-color: var(--mark); box-shadow: 0 0 0 3px var(--mark-soft); }
input::placeholder, textarea::placeholder { color: var(--text-3); }
.ctx { margin-top: 8px; padding: 8px 10px; border-radius: 8px; background: var(--surface-2); font-family: var(--serif); font-size: 13.5px; font-style: italic; line-height: 1.45; color: var(--text-2); max-height: 84px; overflow: auto; }
.ctx .use { all: unset; cursor: pointer; display: inline-block; margin-top: 4px; font-family: var(--font); font-style: normal; font-size: 11.5px; font-weight: 600; color: var(--accent); }
.def-label { display: flex; align-items: center; gap: 8px; margin: 10px 0 6px; }
.def-label label { margin: 0; }
.seg { margin-left: auto; display: inline-flex; padding: 2px; border-radius: 8px; background: var(--surface-2); }
.seg button { all: unset; cursor: pointer; height: 22px; padding: 0 9px; border-radius: 6px; font-family: var(--font); font-size: 11.5px; font-weight: 600; color: var(--text-2); transition: background 120ms var(--ease), color 120ms; }
.seg button:hover { color: var(--text); }
.seg button[aria-pressed="true"] { background: var(--solid); color: var(--text); box-shadow: 0 1px 2px rgba(0,0,0,.12), 0 0 0 .5px var(--border); }
.seg button:focus-visible { outline: 2px solid var(--mark); outline-offset: 1px; }
.suggs { display: flex; flex-direction: column; gap: 6px; margin-bottom: 8px; max-height: 232px; overflow: auto; }
.sugg { all: unset; box-sizing: border-box; display: block; cursor: pointer; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--border); background: var(--solid); transition: border-color 120ms var(--ease), background 120ms; }
.sugg:hover { border-color: var(--border-strong); }
.sugg[aria-pressed="true"] { border-color: var(--mark); box-shadow: 0 0 0 3px var(--mark-soft); }
.sugg:focus-visible { outline: 2px solid var(--mark); outline-offset: 1px; }
.sugg .src { display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 600; color: var(--text-3); margin-bottom: 2px; }
.sugg .src b { color: var(--accent); font-weight: 600; }
.sugg .src span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sugg .txt { font-size: 13px; line-height: 1.45; color: var(--text); display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.sugg-note { padding: 6px 2px; font-size: 12px; color: var(--text-3); }
.sugg-note.warn { color: var(--accent); font-weight: 500; }
.sugg.loading { cursor: default; pointer-events: none; }
.sugg.loading .bar { height: 9px; border-radius: 4px; margin: 4px 0; background: linear-gradient(90deg, var(--surface-2), var(--hover), var(--surface-2)); background-size: 200% 100%; animation: shimmer 1.1s linear infinite; }
.sugg.loading .bar:last-child { width: 62%; }
@keyframes shimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }
.foot { display: flex; align-items: center; gap: 8px; margin-top: 14px; }
.hint { font-size: 11.5px; color: var(--text-3); }
kbd { display: inline-block; min-width: 18px; padding: 0 4px; border-radius: 4px; border: 1px solid var(--border-strong); border-bottom-width: 2px; font-family: var(--font); font-size: 10.5px; font-weight: 600; line-height: 15px; text-align: center; color: var(--text-2); }
.btn { all: unset; box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 30px; padding: 0 12px; border-radius: 7px; font-family: var(--font); font-size: 13px; font-weight: 500; cursor: pointer; color: var(--text-2); transition: background 120ms var(--ease), opacity 120ms; }
.btn:hover { background: var(--hover); color: var(--text); }
.btn.primary { background: var(--primary); color: var(--on-primary); }
.btn.primary:hover { opacity: .88; }
.btn:focus-visible, .link:focus-visible, .pill:focus-visible { outline: 2px solid var(--mark); outline-offset: 2px; }
.error { margin-top: 8px; font-size: 12px; color: #d93025; }

/* Selection pill */
.pill {
  all: unset; box-sizing: border-box; position: fixed; top: 0; left: 0;
  display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 10px 0 8px;
  border-radius: 999px; background: var(--primary); color: var(--on-primary);
  font-family: var(--font); font-size: 12.5px; font-weight: 600; cursor: pointer;
  box-shadow: 0 6px 18px rgba(0,0,0,0.18); animation: pop 120ms var(--ease);
}
.pill svg { width: 14px; height: 14px; }
.pill kbd { border-color: rgba(127,127,127,.45); color: inherit; opacity: .7; }

/* Toast */
.toast {
  position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%);
  display: flex; align-items: center; gap: 12px; padding: 10px 14px;
  border-radius: 12px; background: var(--primary); color: var(--on-primary);
  font-family: var(--font); font-size: 13px; font-weight: 500; box-shadow: var(--shadow);
  animation: rise 180ms var(--ease);
}
.toast .act { all: unset; cursor: pointer; font-weight: 600; color: var(--mark); }
@keyframes rise { from { opacity: 0; transform: translate(-50%, 8px); } to { opacity: 1; transform: translate(-50%, 0); } }
`;

const PLUS = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M8 3.5v9M3.5 8h9"/></svg>`;

function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "style") el.setAttribute("style", v);
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "html") el.innerHTML = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}

const isMac = /Mac/i.test(navigator.platform || navigator.userAgent);
export const SHORTCUT_LABEL = isMac ? "⌥⇧S" : "Alt+Shift+S";

export function sourceLabel(source) {
  if (!source) return "";
  let label = source.title || "";
  if (!label && source.url) {
    try {
      const u = new URL(source.url);
      label = u.hostname + u.pathname;
    } catch {
      label = source.url;
    }
  }
  if (source.page) label += ` · p. ${source.page}`;
  return label;
}

export function createOverlay() {
  const host = document.createElement("margin-overlay");
  host.setAttribute("style", "all: initial !important; position: fixed !important; top: 0 !important; left: 0 !important; width: 0 !important; height: 0 !important; z-index: 2147483647 !important; display: block !important;");
  const shadow = host.attachShadow({ mode: "closed" });
  const root = h("div", { class: "root" });
  const tip = h("div", { class: "panel tip", hidden: true, role: "tooltip" });
  const card = h("form", { class: "panel card", hidden: true });
  const pill = h("button", { class: "pill", hidden: true, type: "button", html: `${PLUS}<span>Save term</span><kbd>${SHORTCUT_LABEL}</kbd>` });
  const toastEl = h("div", { class: "toast", hidden: true, role: "status" });
  root.append(tip, card, pill, toastEl);
  shadow.append(h("style", {}, STYLE), root);
  (document.documentElement || document.body).appendChild(host);

  // Keep page keyboard shortcuts (YouTube, Canvas, etc.) from reacting while typing in our UI.
  for (const type of ["keydown", "keyup", "keypress", "input"]) {
    root.addEventListener(type, (e) => e.stopPropagation());
  }

  let tipHovered = false;
  tip.addEventListener("mouseenter", () => (tipHovered = true));
  tip.addEventListener("mouseleave", () => {
    tipHovered = false;
    api.onTipLeave?.();
  });

  function place(el, rect, { gap = 8, prefer = "below", align = "start" } = {}) {
    el.hidden = false;
    el.style.visibility = "hidden";
    el.style.left = "0px";
    el.style.top = "0px";
    const w = el.offsetWidth;
    const hgt = el.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let top = prefer === "below" ? rect.bottom + gap : rect.top - gap - hgt;
    if (prefer === "below" && top + hgt > vh - 8) top = rect.top - gap - hgt;
    if (prefer === "above" && top < 8) top = rect.bottom + gap;
    top = Math.max(8, Math.min(top, vh - hgt - 8));
    let left = align === "end" ? rect.right - w : rect.left;
    left = Math.max(8, Math.min(left, vw - w - 8));
    el.style.left = `${Math.round(left)}px`;
    el.style.top = `${Math.round(top)}px`;
    el.style.visibility = "";
  }

  // The save card grows when suggestions load; nudge it up so it never runs off screen.
  new ResizeObserver(() => {
    if (card.hidden) return;
    const top = parseFloat(card.style.top) || 0;
    const overflow = top + card.offsetHeight - (window.innerHeight - 8);
    if (overflow > 0) card.style.top = `${Math.max(8, top - overflow)}px`;
  }).observe(card);

  let saveResolve = null;
  let toastTimer = null;

  const api = {
    host,
    onTipLeave: null,
    contains(node) {
      return node === host;
    },
    get tipVisible() {
      return !tip.hidden;
    },
    get tipHovered() {
      return tipHovered;
    },
    get saving() {
      return !card.hidden;
    },

    showTip(rect, items, { onEdit, onOpenSource } = {}) {
      tip.replaceChildren(
        ...items.map(({ term, course }) => {
          const def = term.definition?.trim();
          return h(
            "div",
            { class: "item" },
            h(
              "div",
              { class: "head" },
              h("span", { class: "term" }, term.term),
              course && h("span", { class: "chip" }, h("i", { style: `background:${course.color}` }), course.name),
            ),
            h("p", { class: def ? "def" : "def empty" }, def || "No definition yet."),
            h(
              "div",
              { class: "meta" },
              term.source &&
                h(
                  "button",
                  { class: "link src", type: "button", title: term.source.url || "", onclick: () => onOpenSource?.(term) },
                  sourceLabel(term.source),
                ),
              def && term.defSource?.label && term.defSource.label !== "This page" &&
                h(
                  "span",
                  { class: "via", title: [term.defSource.detail, term.defSource.license, term.defSource.url].filter(Boolean).join(" · ") },
                  `via ${term.defSource.label}`,
                ),
              h("button", { class: "link", type: "button", onclick: () => onEdit?.(term) }, def ? "Edit" : "Add definition"),
            ),
          );
        }),
      );
      place(tip, rect, { gap: 6 });
    },

    hideTip() {
      tip.hidden = true;
      tipHovered = false;
    },

    showPill(rect, onClick) {
      pill.onmousedown = (e) => e.preventDefault();
      pill.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      };
      place(pill, rect, { gap: 8, prefer: "above", align: "end" });
    },

    hidePill() {
      pill.hidden = true;
    },

    /**
     * Opens the save card. Resolves with {term, definition, courseId|newCourse} or null if cancelled.
     */
    openSave({ rect, term = "", definition = "", guess = "", context = "", courses = [], courseId = null, known = () => [], lookup = null }) {
      api.hideTip();
      api.hidePill();
      if (saveResolve) saveResolve(null);

      const termInput = h("input", { class: "term-input", name: "term", value: term, placeholder: "Term", autocomplete: "off", spellcheck: "false" });
      termInput.value = term;
      const defInput = h("textarea", { name: "definition", placeholder: "What does it mean? Your own words stick best." });
      defInput.value = definition;

      const select = h(
        "select",
        { name: "course" },
        ...courses.map((c) => h("option", { value: c.id }, c.name)),
        h("option", { value: "__new" }, courses.length ? "New course…" : "Create a course…"),
      );
      const newCourse = h("input", { name: "newCourse", placeholder: "Course name, e.g. CS 400", hidden: true, autocomplete: "off" });
      if (courseId && courses.some((c) => c.id === courseId)) select.value = courseId;
      else if (courses.length) select.value = courses[0].id;
      else {
        select.value = "__new";
        select.hidden = true;
        newCourse.hidden = false;
      }
      select.addEventListener("change", () => {
        if (select.value === "__new") {
          newCourse.hidden = false;
          newCourse.focus();
        } else newCourse.hidden = true;
      });

      const error = h("div", { class: "error", hidden: true });
      const ctx =
        context &&
        h(
          "div",
          { class: "ctx" },
          `“${context}”`,
          h("br"),
          h(
            "button",
            {
              class: "use",
              type: "button",
              onclick: () => {
                defInput.value = context;
                defInput.focus();
              },
            },
            "Use this sentence",
          ),
        );

      // ----- Definition: "Write my own" or "Find one" -----
      let mode = "own";
      let chosen = null; // the suggestion currently in the textarea
      let lookupSeq = 0;
      let lookupTimer = null;
      const suggs = h("div", { class: "suggs", hidden: true, role: "list" });
      const ownBtn = h("button", { type: "button", "aria-pressed": "true" }, "Write my own");
      const findBtn = h("button", { type: "button", "aria-pressed": "false" }, "Find one");
      const courseName = () =>
        select.value === "__new" ? newCourse.value.trim() : courses.find((c) => c.id === select.value)?.name || "";

      const pick = (s, btn) => {
        chosen = s;
        defInput.value = s.text;
        for (const b of suggs.querySelectorAll(".sugg")) b.setAttribute("aria-pressed", String(b === btn));
      };
      const suggButton = (s) => {
        const btn = h(
          "button",
          { class: "sugg", type: "button", "aria-pressed": "false", title: s.url || "" },
          h("div", { class: "src" }, h("b", {}, s.source), s.detail && h("span", {}, `· ${s.detail}`)),
          h("div", { class: "txt" }, s.text),
        );
        btn.addEventListener("click", () => pick(s, btn));
        if (chosen && chosen.text === s.text) btn.setAttribute("aria-pressed", "true");
        return btn;
      };
      const loadingRow = () => h("div", { class: "sugg loading" }, h("div", { class: "bar" }), h("div", { class: "bar" }));

      async function renderSuggestions() {
        const seq = ++lookupSeq;
        const t = termInput.value.trim();
        const local = [];
        for (const k of known(t)) local.push({ source: "Your glossary", detail: k.course || "", text: k.text });
        if (guess && t.toLowerCase() === term.toLowerCase()) local.push({ source: "This page", detail: "", text: guess });
        const seen = new Set(local.map((s) => s.text));
        suggs.replaceChildren(...local.map(suggButton), ...(t && lookup ? [loadingRow()] : []));
        if (!t) {
          suggs.append(h("div", { class: "sugg-note" }, "Type a term first."));
          return local;
        }
        if (!lookup) return local;
        let online = [];
        let failure = "";
        try {
          online = (await lookup(t, courseName())) || [];
        } catch (e) {
          const why = String(e?.message || e);
          failure = /stale|Receiving end|context invalidated|message port/i.test(why)
            ? "Margin was updated. Reload it in chrome://extensions (↻), then refresh this page."
            : why === "timeout"
              ? "Lookup timed out. Check your connection and try again."
              : "Couldn’t look up definitions right now.";
          console.debug("[Margin] lookup failed:", why);
        }
        if (seq !== lookupSeq || mode !== "find") return local;
        online = online.filter((s) => !seen.has(s.text));
        suggs.replaceChildren(...local.map(suggButton), ...online.map(suggButton));
        if (failure) suggs.append(h("div", { class: "sugg-note warn" }, failure));
        else if (!local.length && !online.length)
          suggs.append(h("div", { class: "sugg-note" }, "Nothing found. Try “Write my own”."));
        return [...local, ...online];
      }

      async function setMode(next, { autoPick = false } = {}) {
        mode = next;
        ownBtn.setAttribute("aria-pressed", String(next === "own"));
        findBtn.setAttribute("aria-pressed", String(next === "find"));
        suggs.hidden = next !== "find";
        if (ctx) ctx.hidden = next === "find";
        if (next === "own") {
          lookupSeq++;
          if (chosen && defInput.value === chosen.text) defInput.value = "";
          chosen = null;
          defInput.placeholder = "What does it mean? Your own words stick best.";
          defInput.focus();
          return;
        }
        defInput.placeholder = "Pick one above, then tweak it if you like.";
        const all = await renderSuggestions();
        if (autoPick && !defInput.value && all[0] && mode === "find") pick(all[0], suggs.querySelector(".sugg"));
      }
      ownBtn.addEventListener("click", () => setMode("own"));
      findBtn.addEventListener("click", () => setMode("find", { autoPick: !defInput.value.trim() }));
      const refresh = () => {
        if (mode !== "find") return;
        clearTimeout(lookupTimer);
        lookupTimer = setTimeout(renderSuggestions, 450);
      };
      termInput.addEventListener("input", refresh);
      select.addEventListener("change", refresh);
      newCourse.addEventListener("input", refresh);
      defInput.addEventListener("input", () => {
        if (!defInput.value.trim()) chosen = null;
      });

      card.replaceChildren(
        h("div", { class: "card-head" }, h("span", { class: "logo" }), "Save to Margin", h("span", { class: "spacer" }), h("kbd", {}, "esc")),
        h("label", {}, "Term"),
        termInput,
        h("div", { class: "def-label" }, h("label", {}, "Definition"), h("div", { class: "seg", role: "group" }, ownBtn, findBtn)),
        suggs,
        defInput,
        ctx,
        h("label", {}, "Course"),
        select,
        newCourse,
        error,
        h(
          "div",
          { class: "foot" },
          h("span", { class: "hint" }, h("kbd", {}, isMac ? "⌘" : "Ctrl"), " ", h("kbd", {}, "↵"), " to save"),
          h("span", { class: "spacer" }),
          h("button", { class: "btn", type: "button", onclick: () => finish(null) }, "Cancel"),
          h("button", { class: "btn primary", type: "submit" }, "Save"),
        ),
      );

      const finish = (value) => {
        card.hidden = true;
        const r = saveResolve;
        saveResolve = null;
        r?.(value);
      };
      card.onsubmit = (e) => {
        e.preventDefault();
        const t = termInput.value.trim();
        if (!t) {
          error.textContent = "Give the term a name.";
          error.hidden = false;
          termInput.focus();
          return;
        }
        const usingNew = select.value === "__new";
        if (usingNew && !newCourse.value.trim()) {
          error.textContent = "Name the course (for example, CS 400).";
          error.hidden = false;
          newCourse.focus();
          return;
        }
        finish({
          term: t,
          definition: defInput.value.trim(),
          defSource: chosen && defInput.value.trim() ? { label: chosen.source, detail: chosen.detail || "", url: chosen.url || "", license: chosen.license || "" } : null,
          courseId: usingNew ? null : select.value,
          newCourse: usingNew ? newCourse.value.trim() : null,
        });
      };
      card.onkeydown = (e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          finish(null);
        } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          card.requestSubmit();
        } else if (e.key === "Enter" && e.target === termInput) {
          e.preventDefault();
          defInput.focus();
        }
      };

      place(card, rect, { gap: 10 });
      // A definition found on the page or in another course? Start on "Find one" with it picked.
      if (!definition && term && (guess || known(term).length)) setMode("find", { autoPick: true });
      requestAnimationFrame(() => {
        const target = !term ? termInput : defInput;
        target.focus();
        if (target === defInput) defInput.setSelectionRange(defInput.value.length, defInput.value.length);
      });

      return new Promise((resolve) => (saveResolve = resolve));
    },

    closeSave() {
      if (saveResolve) {
        const r = saveResolve;
        saveResolve = null;
        r(null);
      }
      card.hidden = true;
    },

    toast(message, action) {
      clearTimeout(toastTimer);
      toastEl.replaceChildren(
        h("span", {}, message),
        action &&
          h(
            "button",
            {
              class: "act",
              type: "button",
              onclick: () => {
                toastEl.hidden = true;
                action.run();
              },
            },
            action.label,
          ),
      );
      toastEl.hidden = false;
      toastTimer = setTimeout(() => (toastEl.hidden = true), 4200);
    },
  };

  return api;
}
