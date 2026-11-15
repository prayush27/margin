// Margin website: scroll-linked motion, reveals and the live demo. No dependencies.
(() => {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

  // ---------- Nav ----------
  const nav = $(".nav");
  const navBar = $(".nav-links");
  const navLinks = $$(".nav-links a");
  const pill = $(".nav-pill");
  const line = $(".nav-line");
  // Glide an indicator to a link. Uses layout offsets, so the nav's own scale doesn't skew it.
  // If the indicator is hidden, it appears in place (no slide in from the last spot).
  function glide(el, link, inset = 0) {
    if (!el) return;
    if (!link) { el.style.opacity = "0"; el.dataset.on = ""; return; }
    const x = link.offsetLeft + inset, w = link.offsetWidth - inset * 2;
    if (!el.dataset.on) {
      el.classList.add("no-anim");
      el.style.transform = `translateX(${x}px)`;
      el.style.width = `${w}px`;
      el.offsetWidth; // apply position before turning motion back on
      el.classList.remove("no-anim");
    } else {
      el.style.transform = `translateX(${x}px)`;
      el.style.width = `${w}px`;
    }
    el.style.opacity = "1";
    el.dataset.on = "1";
  }
  let hovered = null;
  navLinks.forEach((a) => {
    a.addEventListener("pointerenter", (e) => { if (e.pointerType !== "touch") glide(pill, (hovered = a)); });
    a.addEventListener("focus", () => { if (a.matches(":focus-visible")) glide(pill, (hovered = a)); });
    a.addEventListener("blur", () => { if (hovered === a && !navBar.matches(":hover")) glide(pill, (hovered = null)); });
  });
  navBar?.addEventListener("pointerleave", () => glide(pill, (hovered = null)));
  const navTargets = navLinks.map((a) => [a, $(a.getAttribute("href"))]).filter(([, sec]) => sec);
  const darkSections = $$("[data-dark]");
  function updateNav() {
    nav.classList.toggle("scrolled", scrollY > 24);
    const mid = nav.getBoundingClientRect().top + nav.offsetHeight / 2;
    nav.classList.toggle("on-dark", darkSections.some((d) => { const r = d.getBoundingClientRect(); return r.top <= mid && r.bottom >= mid; }));
    // underline the section you're reading
    let active = null;
    for (const [a, sec] of navTargets) if (sec.getBoundingClientRect().top <= innerHeight * 0.35) active = a;
    const prev = navLinks.find((a) => a.classList.contains("is-active")) || null;
    if (active !== prev) {
      for (const a of navLinks) a.classList.toggle("is-active", a === active);
      glide(line, active, 13);
    }
  }
  // Fonts and resizes change link widths; keep the indicators lined up.
  const realign = () => { if (line?.dataset.on) glide(line, navLinks.find((a) => a.classList.contains("is-active")), 13); if (hovered) glide(pill, hovered); };
  addEventListener("resize", realign);
  document.fonts?.ready.then(realign);

  // ---------- Statement: split into words ----------
  const statement = $("#statement");
  let words = [];
  if (statement) {
    statement.innerHTML = statement.textContent.trim().split(/\s+/).map((w) => `<span class="sw">${esc(w)}</span>`).join(" ");
    words = $$(".sw", statement);
  }

  // ---------- Elements driven by scroll ----------
  const heroStage = $("#heroStage");
  const heroWindow = $("#heroWindow");
  const howStage = $("#howStage");
  const steps = $$(".step");
  const pdfImg = $("#pdfShot img");

  function placeHowOverlays() {
    if (!howStage) return;
    const doc = $(".doc", howStage);
    const d = doc.getBoundingClientRect();
    const h1 = $(".heap1", howStage).getBoundingClientRect();
    const h2 = $(".heap2", howStage).getBoundingClientRect();
    const pill = $(".pill", howStage);
    const save = $(".save-card", howStage);
    const tip = $(".tip-card", howStage);
    const within = (x, w) => clamp(x, 12, d.width - w - 12);
    pill.style.left = `${within(h1.right - d.left - pill.offsetWidth + 20, pill.offsetWidth)}px`;
    pill.style.top = `${h1.top - d.top - pill.offsetHeight - 10}px`;
    save.style.left = `${within(h1.left - d.left - 20, save.offsetWidth)}px`;
    save.style.top = `${h1.bottom - d.top + 10}px`;
    tip.style.left = `${within(h2.left - d.left - 24, tip.offsetWidth)}px`;
    tip.style.top = `${h2.bottom - d.top + 10}px`;
  }

  let ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  }

  function update() {
    ticking = false;
    const vh = innerHeight;
    updateNav();

    if (!reduced && heroStage && heroWindow) {
      const r = heroStage.getBoundingClientRect();
      const t = clamp((vh - r.top) / (vh * 0.95));
      const e = 1 - Math.pow(1 - t, 3);
      heroWindow.style.setProperty("--hr", `${18 * (1 - e)}deg`);
      heroWindow.style.setProperty("--hs", `${0.9 + 0.1 * e}`);
      heroWindow.style.setProperty("--hy", `${-40 * e}px`);
    }

    if (words.length) {
      const r = statement.getBoundingClientRect();
      const p = clamp((vh * 0.82 - r.top) / (r.height + vh * 0.32));
      const lit = p * words.length * 1.08;
      words.forEach((w, i) => w.style.setProperty("--o", reduced ? 1 : String(clamp(lit - i, 0.14, 1))));
    }

    if (steps.length && howStage) {
      let active = 1;
      let best = Infinity;
      const mid = innerWidth <= 900 ? vh * 0.72 : vh * 0.5;
      steps.forEach((s) => {
        const r = s.getBoundingClientRect();
        const dist = Math.abs(r.top + Math.min(r.height, vh * 0.4) / 2 - mid);
        if (dist < best) { best = dist; active = +s.dataset.step; }
      });
      if (howStage.dataset.active !== String(active)) howStage.dataset.active = String(active);
      steps.forEach((s) => s.classList.toggle("active", +s.dataset.step === active));
    }

    if (!reduced && pdfImg) {
      const r = pdfImg.getBoundingClientRect();
      const t = clamp((vh - r.top) / (vh * 0.85));
      const e = 1 - Math.pow(1 - t, 3);
      pdfImg.style.setProperty("--ps", `${0.88 + 0.12 * e}`);
      pdfImg.style.setProperty("--po", `${0.35 + 0.65 * e}`);
    }
  }

  addEventListener("scroll", onScroll, { passive: true });
  addEventListener("resize", () => { placeHowOverlays(); onScroll(); });
  document.fonts?.ready.then(() => { placeHowOverlays(); update(); });
  placeHowOverlays();
  update();

  // ---------- Reveal on enter ----------
  const groups = new Map();
  $$(".reveal").forEach((el) => {
    const list = groups.get(el.parentElement) || [];
    el.style.setProperty("--rd", `${Math.min(list.length, 5) * 70}ms`);
    list.push(el);
    groups.set(el.parentElement, list);
  });
  const io = new IntersectionObserver(
    (entries) => entries.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.add("in");
      io.unobserve(e.target);
      $$(".count", e.target).forEach(countUp);
      if (e.target.id === "flip" && !reduced) setTimeout(() => e.target.classList.add("flipped"), 1400);
    }),
    { threshold: 0.12, rootMargin: "0px 0px -4% 0px" },
  );
  $$(".reveal").forEach((el) => io.observe(el));

  function countUp(el) {
    const to = +el.dataset.to;
    if (reduced) { el.textContent = to.toLocaleString(); return; }
    const start = performance.now();
    const dur = 1600;
    const step = (now) => {
      const t = clamp((now - start) / dur);
      el.textContent = Math.round(to * (1 - Math.pow(1 - t, 4))).toLocaleString();
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // ---------- Flip card ----------
  $("#flip")?.addEventListener("click", (e) => e.currentTarget.classList.toggle("flipped"));

  // ---------- Toast ----------
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.setAttribute("role", "status");
  document.body.append(toast);
  let toastTimer;
  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
  }

  // ---------- Live demo ----------
  const COURSES = {
    cs: {
      name: "CS 400", color: "#e0962b", url: "cs400 · lecture notes",
      html: `<p class="doc-kicker">CS 400 · Week 9</p><h3 class="doc-title">Priority queues</h3>
<p>A [[priority queue]] always hands back the most important item next. The usual way to build one is with a [[heap]], which keeps the smallest key at the root.</p>
<p>Because a [[heap]] is a [[complete binary tree]], it fits in an array with no pointers. Fast lookups by key still belong to the [[hash table]], which trades order for speed.</p>`,
      saved: {
        "priority queue": { def: "Represents a collection of elements where each element has an associated priority value.", src: "OpenStax" },
        "complete binary tree": { def: "A binary tree in which every level, except possibly the deepest, is completely filled, with nodes as far left as possible.", src: "NIST" },
      },
      find: {
        heap: [
          ["NIST", "Algorithms and Data Structures", "A complete tree where every node has a key more extreme (greater or less) than or equal to the key of its parent."],
          ["OpenStax", "Introduction to Computer Science", "Stores dynamically allocated data."],
          ["Wikipedia", "Heap (data structure)", "A heap is a tree-based data structure that satisfies the heap property."],
        ],
        "hash table": [
          ["NIST", "Algorithms and Data Structures", "A dictionary in which keys are mapped to array positions by hash functions."],
          ["OpenStax", "Introduction to Computer Science", "Implements sets and maps by applying the concept of hashing."],
        ],
      },
    },
    stat: {
      name: "STAT 240", color: "#3b82f6", url: "stat240 · lecture 18",
      html: `<p class="doc-kicker">STAT 240 · Lecture 18</p><h3 class="doc-title">Inference, in one page</h3>
<p>Before trusting a result, check the [[p-value]]: small values are evidence against the null hypothesis. A [[confidence interval]] gives a range of plausible values instead of a single guess.</p>
<p>How wide that range is depends on the [[sampling distribution]] of your statistic. Report the [[p-value]] alongside the interval, never instead of it.</p>`,
      saved: {
        "confidence interval": { def: "An interval where sample data is used to provide an estimate for a population parameter.", src: "OpenStax" },
      },
      find: {
        "p-value": [
          ["OpenStax", "Introductory Statistics 2e", "The probability that an event will happen purely by chance assuming the null hypothesis is true."],
          ["Statistics Ontology", "EMBL-EBI", "A hypothesis testing measure that represents the probability of obtaining a result at least as extreme as the one observed, assuming the null hypothesis is true."],
        ],
        "sampling distribution": [
          ["OpenStax", "Principles of Data Science", "A probability distribution of a sample statistic based on all possible random samples of a certain size from a population."],
          ["Wikipedia", "Sampling distribution", "The probability distribution of a given random-sample-based statistic."],
        ],
      },
    },
    psych: {
      name: "PSYCH 202", color: "#22a06b", url: "psych202 · chapter 12",
      html: `<p class="doc-kicker">PSYCH 202 · Chapter 12</p><h3 class="doc-title">Why we believe what we believe</h3>
<p>In [[operant conditioning]], behavior is shaped by its consequences. People also work hard to avoid [[cognitive dissonance]], the discomfort of acting against their own beliefs.</p>
<p>When you read a study, watch for a [[confounding variable]], and for your own [[confirmation bias]].</p>`,
      saved: {
        "operant conditioning": { def: "Learning process whereby feedback from the environment shapes an individual's behavior.", src: "OpenStax" },
      },
      find: {
        "cognitive dissonance": [
          ["OpenStax", "Psychology 2e", "Psychological discomfort that arises from a conflict in a person's behaviors, attitudes, or beliefs that runs counter to one's positive self-perception."],
          ["MeSH", "National Library of Medicine", "Motivational state produced by inconsistencies between simultaneously held cognitions or between a cognition and behavior."],
        ],
        "confounding variable": [
          ["OpenStax", "Psychology 2e", "Unanticipated outside factor that affects both variables of interest, often giving the false impression that changes in one variable cause changes in the other."],
        ],
        "confirmation bias": [
          ["OpenStax", "Introduction to Philosophy", "The tendency to search for, interpret, favor, and recall information that confirms or supports established beliefs."],
          ["Wiktionary", "noun", "The tendency to interpret information in a way that confirms one's preconceptions."],
        ],
      },
    },
  };

  const demo = $("#demo");
  if (demo) {
    const doc = $("#demoDoc");
    const win = $(".demo-window", demo);
    const status = $("#demoStatus");
    const url = $("#demoUrl");
    let course = "cs";
    let hideTimer;

    const tip = document.createElement("div");
    tip.className = "card demo-card";
    tip.setAttribute("role", "tooltip");
    const save = document.createElement("div");
    save.className = "card save-card demo-card demo-save";
    save.setAttribute("role", "dialog");
    save.setAttribute("aria-label", "Save to Margin");
    win.append(tip, save);

    function render(fresh) {
      const c = COURSES[course];
      doc.innerHTML = c.html.replace(/\[\[([^\]]+)\]\]/g, (_, term) => {
        const s = c.saved[term];
        const cls = s ? `saved${fresh === term ? " just" : ""}` : "cand";
        return `<button type="button" class="${cls}" data-term="${esc(term)}">${esc(term)}</button>`;
      });
      url.textContent = c.url;
      const all = new Set([...c.html.matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1]));
      const n = [...all].filter((t) => c.saved[t]).length;
      status.innerHTML = n === all.size
        ? `<b>All ${all.size} terms saved.</b> Try another course.`
        : `<b>${n} of ${all.size}</b> terms saved in ${c.name}`;
    }

    function place(card, target) {
      const w = win.getBoundingClientRect();
      const r = target.getBoundingClientRect();
      card.style.left = "0px";
      card.style.top = "0px";
      const cw = card.offsetWidth;
      const ch = card.offsetHeight;
      let left = clamp(r.left - w.left - 16, 10, w.width - cw - 10);
      let top = r.bottom - w.top + 10;
      if (top + ch > w.height - 6 && r.top - w.top - ch - 10 > 46) top = r.top - w.top - ch - 10;
      card.style.left = `${left}px`;
      card.style.top = `${top}px`;
    }

    function showTip(btn) {
      const c = COURSES[course];
      const s = c.saved[btn.dataset.term];
      if (!s) return;
      clearTimeout(hideTimer);
      tip.innerHTML = `<div class="card-head"><span class="term">${esc(btn.dataset.term)}</span><span class="chip"><i style="background:${c.color}"></i>${c.name}</span></div>
        <p class="card-def">${esc(s.def)}</p><div class="card-meta"><span>${esc(c.url)}</span><span>${s.src === "mine" ? "your words" : `via ${esc(s.src)}`}</span></div>`;
      place(tip, btn);
      tip.classList.add("show");
    }
    const hideTip = () => { hideTimer = setTimeout(() => tip.classList.remove("show"), 60); };

    function closeSave() {
      save.classList.remove("show");
      $$(".cand.open", doc).forEach((b) => b.classList.remove("open"));
    }

    function openSave(btn) {
      const c = COURSES[course];
      const term = btn.dataset.term;
      const options = c.find[term] || [];
      let mode = options.length ? "find" : "own";
      let picked = 0;
      tip.classList.remove("show");
      closeSave();
      btn.classList.add("open");

      const draw = () => {
        save.innerHTML = `<div class="save-head"><span class="logo"></span>Save to Margin<button class="x" type="button" aria-label="Close">×</button></div>
          <div class="field term-field">${esc(term)}</div>
          <div class="def-row"><span>Definition</span><span class="seg" role="group"><b role="button" tabindex="0" data-mode="own" class="${mode === "own" ? "on" : ""}">Write my own</b><b role="button" tabindex="0" data-mode="find" class="${mode === "find" ? "on" : ""}">Find one</b></span></div>
          ${mode === "find"
            ? options.map(([src, detail, text], i) => `<div class="sugg${i === picked ? " on" : ""}" role="button" tabindex="0" data-i="${i}"><span class="src"><b>${esc(src)}</b> · ${esc(detail)}</span>${esc(text)}</div>`).join("")
            : `<textarea placeholder="What does it mean? Your own words stick best." aria-label="Your definition"></textarea>`}
          <div class="save-foot"><span class="course">${c.name}</span><button class="btn-mini" type="button">Save</button></div>`;
        place(save, btn);
        save.classList.add("show");
        if (mode === "own") $("textarea", save).focus();
      };
      draw();

      save.onclick = (e) => {
        const m = e.target.closest("[data-mode]");
        const s = e.target.closest(".sugg");
        if (e.target.closest(".x")) return closeSave();
        if (m && m.dataset.mode !== mode) { mode = m.dataset.mode; draw(); return; }
        if (s) { picked = +s.dataset.i; $$(".sugg", save).forEach((el, i) => el.classList.toggle("on", i === picked)); return; }
        if (e.target.closest(".btn-mini")) {
          let def;
          let src;
          if (mode === "own") {
            def = $("textarea", save).value.trim();
            src = "mine";
            if (!def) { $("textarea", save).focus(); return; }
          } else {
            [src, , def] = options[picked];
          }
          c.saved[term] = { def, src };
          closeSave();
          render(term);
          showToast(`Saved “${term}” to ${c.name}`);
        }
      };
      save.onkeydown = (e) => {
        if (e.key === "Escape") { closeSave(); btn.focus(); }
        if ((e.key === "Enter" || e.key === " ") && e.target.matches("[data-mode], .sugg")) { e.preventDefault(); e.target.click(); }
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) $(".btn-mini", save).click();
      };
    }

    doc.addEventListener("mouseover", (e) => { const b = e.target.closest(".saved"); if (b) showTip(b); });
    doc.addEventListener("mouseout", (e) => { if (e.target.closest(".saved")) hideTip(); });
    doc.addEventListener("focusin", (e) => { const b = e.target.closest(".saved"); if (b) showTip(b); });
    doc.addEventListener("focusout", (e) => { if (e.target.closest(".saved")) hideTip(); });
    doc.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      if (b.classList.contains("cand")) openSave(b);
      else if (b.classList.contains("saved")) tip.classList.contains("show") ? tip.classList.remove("show") : showTip(b);
    });
    document.addEventListener("pointerdown", (e) => {
      if (!save.contains(e.target) && !e.target.closest(".cand")) closeSave();
      if (!e.target.closest(".saved")) tip.classList.remove("show");
    });

    $$(".demo-tabs button").forEach((tab) =>
      tab.addEventListener("click", () => {
        if (tab.dataset.course === course) return;
        $$(".demo-tabs button").forEach((t) => t.setAttribute("aria-selected", String(t === tab)));
        closeSave();
        tip.classList.remove("show");
        doc.classList.add("fading");
        setTimeout(() => { course = tab.dataset.course; render(); doc.classList.remove("fading"); }, 220);
      }),
    );

    render();
  }
})();

// In-page links scroll smoothly without leaving "#top" or "#how" in the address bar.
document.addEventListener("click", (e) => {
  const a = e.target.closest("a[href]");
  if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin || url.pathname !== location.pathname) return;
  const target = url.hash ? document.getElementById(decodeURIComponent(url.hash.slice(1))) : null;
  if (url.hash && !target) return;
  e.preventDefault();
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (target) target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  else window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  if (location.hash) history.replaceState(null, "", location.pathname + location.search);
});
