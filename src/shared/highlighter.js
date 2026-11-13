// Underlines saved terms on a page using the CSS Custom Highlight API.
// The page's HTML is never modified, so sites (Canvas, React apps, PDF.js) don't break.
// A MutationObserver keeps highlights current as content loads or changes.

const SKIP_TAGS = new Set([
  "SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT", "SELECT", "OPTION", "CODE", "PRE",
  "SVG", "MATH", "CANVAS", "IFRAME", "BUTTON", "KBD", "SAMP", "TITLE", "HEAD", "TEMPLATE",
]);

export class Highlighter {
  constructor({ root, doc = document, name = "margin-term", ignore = () => false, mode = "all" }) {
    this.root = root;
    this.doc = doc;
    this.name = name;
    this.ignore = ignore;
    this.mode = mode;
    this.matcher = null;
    this.highlight = new Highlight();
    this.nodes = new Map(); // text node -> [{start,end,ids,range}]
    this.seen = new Set();
    this.rejectCache = new WeakMap();
    this.pending = new Set();
    this.observer = null;
    this.timer = null;
    this.running = false;
  }

  start() {
    if (this.running) return;
    this.running = true;
    CSS.highlights.set(this.name, this.highlight);
    this.observer = new MutationObserver((records) => this.#onMutations(records));
    this.observer.observe(this.root, { childList: true, subtree: true, characterData: true });
    this.rescan();
  }

  stop() {
    this.running = false;
    this.observer?.disconnect();
    this.observer = null;
    clearTimeout(this.timer);
    this.highlight.clear();
    this.nodes.clear();
    this.seen.clear();
    CSS.highlights.delete(this.name);
  }

  setMatcher(matcher) {
    this.matcher = matcher;
    if (this.running) this.rescan();
  }

  setMode(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    if (this.running) this.rescan();
  }

  rescan() {
    this.highlight.clear();
    this.nodes.clear();
    this.seen.clear();
    this.rejectCache = new WeakMap();
    this.scan(this.root);
  }

  scan(root) {
    if (!this.matcher || this.matcher.empty || !root) return;
    if (root.nodeType === Node.TEXT_NODE) {
      this.#addTextNode(root);
      return;
    }
    if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;
    if (root.nodeType === Node.ELEMENT_NODE && this.#rejected(root)) return;
    const walker = this.doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => {
        if (n.data.length < 2 || !/\S/.test(n.data)) return NodeFilter.FILTER_REJECT;
        const p = n.parentElement;
        if (!p || this.#rejected(p)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    let n;
    while ((n = walker.nextNode())) this.#addTextNode(n);
  }

  /** Returns the term hit under a screen point, or null. */
  hitTest(x, y) {
    let node;
    let offset;
    if (this.doc.caretPositionFromPoint) {
      const p = this.doc.caretPositionFromPoint(x, y);
      if (!p) return null;
      node = p.offsetNode;
      offset = p.offset;
    } else if (this.doc.caretRangeFromPoint) {
      const r = this.doc.caretRangeFromPoint(x, y);
      if (!r) return null;
      node = r.startContainer;
      offset = r.startOffset;
    }
    if (!node || node.nodeType !== Node.TEXT_NODE) return null;
    const entries = this.nodes.get(node);
    if (!entries) return null;
    for (const e of entries) {
      if (offset < e.start || offset > e.end) continue;
      for (const rect of e.range.getClientRects()) {
        if (x >= rect.left - 1 && x <= rect.right + 1 && y >= rect.top - 2 && y <= rect.bottom + 2) {
          return { ids: e.ids, rect: e.range.getBoundingClientRect(), range: e.range };
        }
      }
    }
    return null;
  }

  #rejected(el) {
    const chain = [];
    let cur = el;
    let result = false;
    while (cur && cur !== this.root.parentNode) {
      if (this.rejectCache.has(cur)) {
        result = this.rejectCache.get(cur);
        break;
      }
      chain.push(cur);
      if (SKIP_TAGS.has(cur.tagName) || cur.isContentEditable || cur.getAttribute?.("aria-hidden") === "true" || this.ignore(cur)) {
        result = true;
        break;
      }
      cur = cur.parentElement;
    }
    for (const c of chain) this.rejectCache.set(c, result);
    return result;
  }

  #addTextNode(node) {
    this.#removeTextNode(node);
    const matches = this.matcher.find(node.data);
    if (!matches.length) return;
    const entries = [];
    for (const m of matches) {
      if (this.mode === "first") {
        const key = m.ids.join("|");
        if (this.seen.has(key)) continue;
        this.seen.add(key);
      }
      const range = new Range();
      range.setStart(node, m.start);
      range.setEnd(node, m.end);
      this.highlight.add(range);
      entries.push({ ...m, range });
    }
    if (entries.length) this.nodes.set(node, entries);
  }

  #removeTextNode(node) {
    const entries = this.nodes.get(node);
    if (!entries) return;
    for (const e of entries) this.highlight.delete(e.range);
    this.nodes.delete(node);
  }

  #onMutations(records) {
    for (const r of records) {
      if (r.type === "characterData") {
        this.pending.add(r.target);
      } else {
        for (const n of r.addedNodes) this.pending.add(n);
      }
    }
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.#flush(), 150);
  }

  #flush() {
    if (!this.running) return;
    for (const [node] of this.nodes) {
      if (!node.isConnected) this.#removeTextNode(node);
    }
    const batch = [...this.pending];
    this.pending.clear();
    for (const n of batch) {
      if (!n.isConnected) continue;
      if (n.nodeType === Node.TEXT_NODE) {
        this.#removeTextNode(n);
        const p = n.parentElement;
        if (p && !this.#rejected(p) && n.data.length >= 2) this.#addTextNode(n);
      } else if (n.nodeType === Node.ELEMENT_NODE) {
        this.scan(n);
      }
    }
  }
}
