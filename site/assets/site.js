// Margin website: the live demo, the flip card and a few small touches. No dependencies.
(() => {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

  // ---------- Shortcuts read the way your keyboard does ----------
  if (!/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)) {
    $$("kbd").forEach((k) => {
      const t = k.textContent;
      if (t === "⌥") k.textContent = "Alt";
      else if (t === "⇧") k.textContent = "Shift";
      else if (t.length > 1) k.textContent = t.replace("⌥", "Alt+").replace("⇧", "Shift+");
    });
  }

  // ---------- Top bar: hairline once you scroll, amber underline under the section you're in ----------
  const bar = $("#bar");
  const barLine = $(".bar-line");
  const barLinks = $$(".bar-links a").map((a) => [a, a.hash && $(a.hash)]).filter(([, sec]) => sec);
  let activeLink = null;
  function updateBar() {
    bar?.classList.toggle("stuck", scrollY > 8);
    let next = null;
    const line = innerHeight * 0.4;
    for (const [a, sec] of barLinks) { const r = sec.getBoundingClientRect(); if (r.top <= line && r.bottom > line) next = a; }
    if (next === activeLink) return;
    activeLink?.classList.remove("is-active");
    const prev = activeLink;
    activeLink = next;
    next?.classList.add("is-active");
    if (!barLine) return;
    // Glide between links; when there's no section to mark, shrink into the middle of the last one.
    const place = (a, show) => {
      const x = a.offsetLeft, w = a.offsetWidth;
      return show ? `translateX(${x}px) scaleX(${w})` : `translateX(${x + w / 2}px) scaleX(0)`;
    };
    if (!next) { if (prev) barLine.style.transform = place(prev, false); return; }
    if (!prev) {
      // grow out from the middle of the link
      barLine.classList.add("instant");
      barLine.style.transform = place(next, false);
      barLine.offsetWidth;
      barLine.classList.remove("instant");
    }
    barLine.style.transform = place(next, true);
  }

  // ---------- Statement: words light up as you read down ----------
  const statement = $("#statement");
  let words = [];
  if (statement && !reduced) {
    const text = statement.textContent.trim();
    statement.innerHTML = `<span class="sr">${esc(text)}</span><span aria-hidden="true">${text.split(/\s+/).map((w) => `<span class="sw">${esc(w)}</span>`).join(" ")}</span>`;
    words = $$(".sw", statement);
  }

  // ---------- How it works: the page on the right follows the step you're reading ----------
  const howStage = $("#howStage");
  const steps = $$(".step");
  const howTrack = $(".how-track");
  function placeHowOverlays() {
    if (!howStage) return;
    const doc = $(".stage-doc", howStage);
    const d = doc.getBoundingClientRect();
    const h1 = $(".heap1", howStage).getBoundingClientRect();
    const h2 = $(".heap2", howStage).getBoundingClientRect();
    const pill = $(".pill", howStage);
    const save = $(".save-card", howStage);
    const tip = $(".tip-card", howStage);
    const within = (x, w) => clamp(x, 12, d.width - w - 12);
    pill.style.left = `${within(h1.right - d.left - pill.offsetWidth + 24, pill.offsetWidth)}px`;
    pill.style.top = `${h1.top - d.top - pill.offsetHeight - 8}px`;
    save.style.left = `${within(h1.left - d.left - 20, save.offsetWidth)}px`;
    save.style.top = `${h1.bottom - d.top + 10}px`;
    tip.style.left = `${within(h2.left - d.left - 24, tip.offsetWidth)}px`;
    tip.style.top = `${h2.bottom - d.top + 10}px`;
  }

  const demoFrame = $(".demo .frame");
  let ticking = false;
  function update() {
    ticking = false;
    const vh = innerHeight;
    updateBar();

    if (words.length) {
      const r = statement.getBoundingClientRect();
      const p = clamp((vh * 0.85 - r.top) / (r.height + vh * 0.25));
      const lit = p * words.length * 1.15;
      words.forEach((w, i) => w.style.setProperty("--o", String(clamp(lit - i, 0.2, 1))));
    }

    if (steps.length && howStage) {
      let active = 1, best = Infinity;
      const mid = innerWidth <= 960 ? vh * 0.72 : vh * 0.5;
      const centers = steps.map((s) => { const r = s.getBoundingClientRect(); return r.top + Math.min(r.height, vh * 0.4) / 2; });
      centers.forEach((c, i) => {
        const dist = Math.abs(c - mid);
        if (dist < best) { best = dist; active = i + 1; }
        // fade smoothly with distance from the reading line instead of snapping
        const t = clamp(dist / (vh * 0.42));
        steps[i].style.setProperty("--so", (1 - 0.58 * t * t * (3 - 2 * t)).toFixed(3));
      });
      if (howStage.dataset.active !== String(active)) howStage.dataset.active = String(active);
      if (howTrack) howTrack.style.setProperty("--hp", clamp((mid - centers[0]) / (centers[centers.length - 1] - centers[0])).toFixed(4));
    }

    if (reduced) return;
    if (demoFrame) {
      // the demo starts tipped back and settles flat as you scroll to it
      const r = demoFrame.getBoundingClientRect();
      const e = 1 - Math.pow(1 - clamp((vh - r.top) / (vh * 0.75)), 3);
      demoFrame.style.setProperty("--hr", `${(14 * (1 - e)).toFixed(2)}deg`);
      demoFrame.style.setProperty("--hs", (0.94 + 0.06 * e).toFixed(4));
    }
  }
  const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
  addEventListener("scroll", onScroll, { passive: true });
  addEventListener("resize", () => { placeHowOverlays(); activeLink = null; onScroll(); });
  document.fonts?.ready.then(() => { placeHowOverlays(); activeLink = null; update(); });
  placeHowOverlays();
  update();

  // ---------- Counts up once when it comes into view ----------
  const seen = (el, fn, threshold = 0.6) => {
    if (!el) return;
    if (!("IntersectionObserver" in window)) return fn();
    const io = new IntersectionObserver((en) => { if (en[0].isIntersecting) { io.disconnect(); fn(); } }, { threshold });
    io.observe(el);
  };
  $$(".count").forEach((el) => {
    if (reduced) return;
    const to = +el.dataset.to;
    el.textContent = "0";
    seen(el, () => {
      const t0 = performance.now();
      const step = (now) => {
        const t = clamp((now - t0) / 1500);
        el.textContent = Math.round(to * (1 - Math.pow(1 - t, 4))).toLocaleString("en-US");
        if (t < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }, 1);
  });

  // ---------- Quiz: a real little round. Missed terms come back; finish to see your score ----------
  const flip = $("#flip");
  if (flip) {
    const DECK = [
      ["PSYCH 202", "Discomfort from a conflict between what you do and what you believe.", "cognitive dissonance"],
      ["CS 400", "A complete tree where every node's key is at least as extreme as its parent's.", "heap"],
      ["STAT 240", "The chance of a result at least this extreme if the null hypothesis were true.", "p-value"],
      ["BIO 152", "Water moving across a membrane toward the side with more dissolved particles.", "osmosis"],
      ["ECON 101", "How strongly demand or supply reacts when the price changes.", "elasticity"],
    ];
    const front = $(".front", flip), back = $(".back", flip);
    const meta = $("#qMeta"), prompt = $("#qPrompt"), hint = $("#qHint");
    const course = $("#qCourse"), answer = $("#qAnswer"), score = $("#qScore");
    const grades = $$("[data-grade]", flip);
    let queue, firstTry, missed, cleared, card, done;

    const turn = (on) => {
      flip.classList.toggle("flipped", on);
      front.setAttribute("aria-hidden", String(on));
      back.setAttribute("aria-hidden", String(!on));
      front.tabIndex = on ? -1 : 0;
      grades.forEach((g) => (g.tabIndex = on ? 0 : -1));
    };
    const showFront = () => {
      if (done) {
        meta.textContent = "Round done";
        prompt.innerHTML = `<span class="done">${firstTry} of ${DECK.length} on the first try</span>`;
        hint.textContent = "Tap to go again";
        score.innerHTML = missed.size ? `You missed <b>${[...missed].join(", ")}</b>. In Margin those come back first next time.` : "A clean round. Margin would space these out now.";
        return;
      }
      card = queue[0];
      meta.textContent = missed.has(card[2]) ? `${card[0]} · back again` : `${card[0]} · ${DECK.indexOf(card) + 1} of ${DECK.length}`;
      prompt.textContent = card[1];
      hint.textContent = "Tap to see the term";
      course.textContent = card[0];
      answer.textContent = card[2];
    };
    const reset = () => { queue = DECK.slice(); firstTry = 0; missed = new Set(); cleared = 0; done = false; score.textContent = ""; showFront(); };
    reset();

    front.addEventListener("click", () => {
      if (done) { turn(false); reset(); return; }
      turn(true);
      grades[1].focus({ preventScroll: true });
    });
    grades.forEach((g) => g.addEventListener("click", () => {
      const got = g.dataset.grade === "got";
      queue.shift();
      if (!missed.has(card[2]) && got) firstTry++;
      if (!got) { missed.add(card[2]); queue.splice(Math.min(1, queue.length), 0, card); }
      if (got) cleared++;
      done = queue.length === 0;
      // swap the front while it's facing away, then turn back to it
      showFront();
      turn(false);
      front.focus({ preventScroll: true });
      const left = queue.length;
      if (!done) score.innerHTML = `<b>${firstTry}</b> right on the first try · ${left} to go`;
    }));
  }

  // ---------- The film: plays with sound on click, pauses when you scroll away, offers the demo at the end ----------
  const filmSec = $("#film"), video = $("#filmVideo"), playBtn = $("#filmPlay"), filmEnd = $("#filmEnd");
  if (filmSec && video) {
    const start = () => {
      filmEnd.hidden = true;
      filmSec.classList.add("playing");
      document.dispatchEvent(new Event("margin:film"));
      video.controls = true;
      if (video.ended) video.currentTime = 0;
      const p = video.play();
      if (p && p.catch) p.catch(() => {});
      video.focus({ preventScroll: true });
    };
    playBtn.addEventListener("click", start);
    $("#filmAgain")?.addEventListener("click", () => { video.currentTime = 0; start(); });
    video.addEventListener("ended", () => { video.controls = false; filmEnd.hidden = false; $(".btn", filmEnd)?.focus({ preventScroll: true }); });
    $$("[data-play]").forEach((a) => a.addEventListener("click", (e) => {
      e.preventDefault();
      filmSec.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
      start();
    }));
    if ("IntersectionObserver" in window) {
      new IntersectionObserver((en) => { if (!en[0].isIntersecting && !video.paused) video.pause(); }, { threshold: 0.25 }).observe(video);
    }
  }

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
      name: "CS 400", color: "var(--cs)", url: "cs400 · lecture notes",
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
      name: "STAT 240", color: "var(--stat)", url: "stat240 · lecture 18",
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
      name: "PSYCH 202", color: "var(--psych)", url: "psych202 · chapter 12",
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

    function openSave(btn, byUser = true) {
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
            ? options.map(([src, detail, text], i) => `<div class="sugg${i === picked ? " on" : ""}" role="button" tabindex="0" aria-pressed="${i === picked}" data-i="${i}"><span class="src"><b>${esc(src)}</b> · ${esc(detail)}</span>${esc(text)}</div>`).join("")
            : `<textarea placeholder="What does it mean? Your own words stick best." aria-label="Your definition"></textarea>`}
          <div class="save-foot"><span class="course">${c.name}</span><button class="btn-mini" type="button">Save</button></div>`;
        place(save, btn);
        save.classList.add("show");
        if (mode === "own") $("textarea", save).focus();
        else if (byUser) ($(".sugg.on", save) || save).focus({ preventScroll: true });
      };
      draw();

      save.onclick = (e) => {
        const m = e.target.closest("[data-mode]");
        const s = e.target.closest(".sugg");
        if (e.target.closest(".x")) return closeSave();
        if (m && m.dataset.mode !== mode) { mode = m.dataset.mode; draw(); return; }
        if (s) { picked = +s.dataset.i; $$(".sugg", save).forEach((el, i) => { el.classList.toggle("on", i === picked); el.setAttribute("aria-pressed", String(i === picked)); }); return; }
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
      if (b.classList.contains("cand")) openSave(b, e.isTrusted);
      else if (b.classList.contains("saved")) tip.classList.contains("show") ? tip.classList.remove("show") : showTip(b);
    });
    document.addEventListener("pointerdown", (e) => {
      if (!save.contains(e.target) && !e.target.closest(".cand")) closeSave();
      if (!e.target.closest(".saved")) tip.classList.remove("show");
    });

    // Escape closes the save card wherever focus is
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && save.classList.contains("show")) closeSave(); });
    // cards are placed against the text, so close them when the layout changes
    addEventListener("resize", () => { closeSave(); tip.classList.remove("show"); });

    let pending = course, switchTimer;
    $$(".demo-tabs button").forEach((tab) =>
      tab.addEventListener("click", () => {
        if (tab.dataset.course === pending) return;
        pending = tab.dataset.course;
        $$(".demo-tabs button").forEach((t) => t.setAttribute("aria-pressed", String(t === tab)));
        closeSave();
        tip.classList.remove("show");
        doc.classList.add("fading");
        clearTimeout(switchTimer);
        switchTimer = setTimeout(() => { course = pending; render(); doc.classList.remove("fading"); }, 220);
      }),
    );

    render();

    // ---------- Autoplay: the first time the demo is on screen, it shows itself being used ----------
    if (!reduced) {
      const cursor = document.createElement("div");
      cursor.className = "cursor";
      cursor.setAttribute("aria-hidden", "true");
      cursor.innerHTML = '<svg viewBox="0 0 20 20"><path d="M4 2.5v13.2l3.4-3.1 2.3 5.1 2.3-1-2.3-5h4.7z" fill="#1d1c1a" stroke="#fff" stroke-width="1.3" stroke-linejoin="round"/></svg>';
      win.append(cursor);
      let stopped = false;
      const stop = () => {
        if (stopped) return;
        stopped = true;
        cursor.classList.remove("on");
        if (driving) { closeSave(); tip.classList.remove("show"); }
      };
      let driving = false;
      if ("IntersectionObserver" in window) {
        const away = new IntersectionObserver((en) => { if (driving && !en[0].isIntersecting) stop(); }, { threshold: 0.2 });
        away.observe(demo);
      }
      ["pointerdown", "keydown", "wheel"].forEach((t) => demo.addEventListener(t, (e) => { if (e.isTrusted) stop(); }, { passive: true }));
      // the film has the floor once it starts
      document.addEventListener("margin:film", stop);
      const inView = () => { const r = demo.getBoundingClientRect(); return r.top < innerHeight * 0.75 && r.bottom > innerHeight * 0.25; };
      demo.addEventListener("pointermove", (e) => { if (e.isTrusted && e.pointerType === "mouse") stop(); });
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const at = (el, dx = 0.5, dy = 0.7) => {
        const w = win.getBoundingClientRect(), r = el.getBoundingClientRect();
        cursor.style.transform = `translate(${r.left - w.left + r.width * dx - 4}px, ${r.top - w.top + r.height * dy - 2}px)`;
      };
      const press = async () => { cursor.classList.add("press"); await wait(140); cursor.classList.remove("press"); };
      async function play() {
        if (course !== "cs" || stopped) return;
        // a smooth scroll can fly past the demo; wait until someone is actually looking at it
        if (!inView()) return seen(demo, () => setTimeout(play, 700), 0.55);
        const w = win.getBoundingClientRect();
        cursor.style.transition = "none";
        cursor.style.transform = `translate(${w.width * 0.82}px, ${w.height * 0.9}px)`;
        cursor.offsetWidth;
        cursor.style.transition = "";
        cursor.classList.add("on");
        driving = true;
        await wait(300);
        const savedBtn = $(".saved", doc);
        if (stopped) return; at(savedBtn); await wait(800);
        if (stopped) return; showTip(savedBtn); await wait(1900);
        if (stopped) return; tip.classList.remove("show");
        const heap = $('.cand[data-term="heap"]', doc);
        if (!heap) return stop();
        at(heap); await wait(850);
        if (stopped) return; await press(); if (stopped) return; openSave(heap, false); await wait(1300);
        const pick = $(".sugg", save);
        if (stopped || !pick) return; at(pick, 0.6, 0.5); await wait(900);
        if (stopped) return; await press(); await wait(500);
        const go = $(".btn-mini", save);
        if (stopped || !go) return; at(go, 0.5, 0.5); await wait(850);
        if (stopped) return; await press(); if (stopped) return; go.click(); await wait(1100);
        const now = $('.saved[data-term="heap"]', doc);
        if (stopped || !now) return stop();
        at(now); await wait(800);
        if (stopped) return; showTip(now); await wait(2200);
        if (stopped) return; tip.classList.remove("show"); driving = false; stop();
      }
      seen(demo, () => setTimeout(play, 700), 0.55);
    }
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
  if (target) {
    target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    if (target.id === "main") target.focus({ preventScroll: true });
  }
  else window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  if (location.hash) history.replaceState(null, "", location.pathname + location.search);
});
