// All Margin data lives in chrome.storage.local on this computer. No server.
//
// terms:    [{ id, term, aliases[], definition, courseId, context, source:{url,title,page}, createdAt, updatedAt, stats }]
// courses:  [{ id, name, color, createdAt }]
// settings: see DEFAULT_SETTINGS

import { courseKey, courseSitesFromTerms } from "./sites.js";

export const DEFAULT_SETTINGS = {
  enabled: true,
  scope: "study", // "study" (school and learning sites, plus allowedHosts) | "everywhere"
  allowedHosts: [],
  disabledHosts: [],
  underline: "all", // "all" | "first"
  selectionPill: true,
  openPdfs: false, // opt-in: PDFs open in Chrome's viewer until you say yes
  pdfAsked: false,
  activeCourse: "all",
  lastCourse: null,
  darkPdf: false,
  welcomed: false,
  sidebarCourse: null, // class shown in the side panel when a page doesn't say which
  courseSites: {}, // courseKey(url) -> course id, e.g. "canvas.wisc.edu/courses/12345": "cs"
  seenSidebar: false, // shows a "New" tag on the popup's Class sidebar button until it's opened
  lastBackup: null, // when terms were last exported
  backupSnooze: 0, // don't remind about backups before this time
};

export const COURSE_COLORS = ["#e0962b", "#3b82f6", "#22a06b", "#8b5cf6", "#e5527a", "#14a3a3", "#d9622b", "#6b7280"];

export function uid() {
  if (globalThis.crypto?.randomUUID) {
    try {
      return crypto.randomUUID();
    } catch {
      /* not a secure context */
    }
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export async function getAll() {
  const d = await chrome.storage.local.get(["terms", "courses", "settings"]);
  return {
    terms: d.terms || [],
    courses: d.courses || [],
    settings: { ...DEFAULT_SETTINGS, ...(d.settings || {}) },
  };
}

export async function getSettings() {
  const { settings } = await chrome.storage.local.get("settings");
  return { ...DEFAULT_SETTINGS, ...(settings || {}) };
}

export async function updateSettings(patch) {
  const settings = { ...(await getSettings()), ...patch };
  await chrome.storage.local.set({ settings });
  return settings;
}

function normalize(s) {
  return (s || "").trim().replace(/\s+/g, " ");
}

export async function addCourse(name) {
  const { courses } = await getAll();
  const clean = normalize(name);
  const existing = courses.find((c) => c.name.toLowerCase() === clean.toLowerCase());
  if (existing) return existing;
  const course = {
    id: uid(),
    name: clean || "General",
    color: COURSE_COLORS[courses.length % COURSE_COLORS.length],
    createdAt: Date.now(),
  };
  courses.push(course);
  await chrome.storage.local.set({ courses });
  return course;
}

export async function updateCourse(id, patch) {
  const { courses } = await getAll();
  const c = courses.find((x) => x.id === id);
  if (!c) return;
  Object.assign(c, patch);
  await chrome.storage.local.set({ courses });
}

export async function deleteCourse(id, { deleteTerms = false } = {}) {
  const { courses, terms } = await getAll();
  const nextTerms = deleteTerms
    ? terms.filter((t) => t.courseId !== id)
    : terms.map((t) => (t.courseId === id ? { ...t, courseId: null } : t));
  await chrome.storage.local.set({ courses: courses.filter((c) => c.id !== id), terms: nextTerms });
}

/** Adds a term. If the same term already exists in the same course, updates it instead. */
export async function saveTerm(input) {
  const { terms } = await getAll();
  const term = normalize(input.term);
  if (!term) throw new Error("A term needs a name.");
  const now = Date.now();
  const existing = input.id
    ? terms.find((t) => t.id === input.id)
    : terms.find((t) => t.term.toLowerCase() === term.toLowerCase() && t.courseId === (input.courseId ?? null));
  if (existing) {
    Object.assign(existing, {
      term,
      aliases: input.aliases ?? existing.aliases ?? [],
      definition: input.definition ?? existing.definition,
      courseId: input.courseId === undefined ? existing.courseId : input.courseId,
      context: input.context ?? existing.context,
      source: input.source ?? existing.source,
      defSource: input.defSource !== undefined ? input.defSource : existing.defSource ?? null,
      updatedAt: now,
    });
    await chrome.storage.local.set({ terms });
    return { term: existing, created: false };
  }
  const created = {
    id: uid(),
    term,
    aliases: (input.aliases || []).map(normalize).filter(Boolean),
    definition: (input.definition || "").trim(),
    courseId: input.courseId ?? null,
    context: input.context || "",
    source: input.source || null,
    defSource: input.defSource || null,
    createdAt: now,
    updatedAt: now,
    stats: { box: 0, right: 0, wrong: 0, last: 0 },
  };
  terms.push(created);
  await chrome.storage.local.set({ terms });
  await rememberCourseSite(created.source?.url, created.courseId);
  return { term: created, created: true };
}

/** Fills in course pages from terms saved before Margin tracked them. Choices already made win. */
export async function backfillCourseSites() {
  const { terms, courses, settings } = await getAll();
  const known = new Set(courses.map((c) => c.id));
  const found = Object.entries(courseSitesFromTerms(terms)).filter(([key, id]) => known.has(id) && !settings.courseSites[key]);
  if (found.length) await updateSettings({ courseSites: { ...Object.fromEntries(found), ...settings.courseSites } });
  return found.length;
}

const DAY = 86400000;
/** Time to remind about a backup? After 15+ terms and 30 days since the last backup (or the first term). */
export function backupDue({ terms = [], settings = {} }, now = Date.now()) {
  if (terms.length < 15 || now < (settings.backupSnooze || 0)) return false;
  const since = settings.lastBackup || Math.min(...terms.map((t) => t.createdAt ?? now));
  return now - since > 30 * DAY;
}

/** Remembers that pages like `url` (e.g. one Canvas course) belong to `courseId`. */
export async function rememberCourseSite(url, courseId) {
  const key = url && courseId ? courseKey(url) : "";
  if (!key) return;
  const s = await getSettings();
  if (s.courseSites[key] === courseId) return;
  await updateSettings({ courseSites: { ...s.courseSites, [key]: courseId } });
}

export async function updateTerm(id, patch) {
  const { terms } = await getAll();
  const t = terms.find((x) => x.id === id);
  if (!t) return null;
  Object.assign(t, patch, { updatedAt: Date.now() });
  await chrome.storage.local.set({ terms });
  return t;
}

export async function deleteTerm(id) {
  const { terms } = await getAll();
  await chrome.storage.local.set({ terms: terms.filter((t) => t.id !== id) });
}

export async function recordReview(id, correct) {
  const { terms } = await getAll();
  const t = terms.find((x) => x.id === id);
  if (!t) return;
  const s = t.stats || { box: 0, right: 0, wrong: 0, last: 0 };
  t.stats = {
    box: correct ? Math.min((s.box || 0) + 1, 5) : 0,
    right: (s.right || 0) + (correct ? 1 : 0),
    wrong: (s.wrong || 0) + (correct ? 0 : 1),
    last: Date.now(),
  };
  await chrome.storage.local.set({ terms });
}

export async function importData({ courses = [], terms = [] }, { replace = false } = {}) {
  const current = replace ? { courses: [], terms: [] } : await getAll();
  const courseIds = new Map();
  for (const c of courses) {
    const match = current.courses.find((x) => x.name.toLowerCase() === (c.name || "").toLowerCase());
    if (match) {
      courseIds.set(c.id, match.id);
    } else {
      const nc = {
        id: uid(),
        name: normalize(c.name) || "General",
        color: c.color || COURSE_COLORS[current.courses.length % COURSE_COLORS.length],
        createdAt: c.createdAt || Date.now(),
      };
      current.courses.push(nc);
      courseIds.set(c.id, nc.id);
    }
  }
  let added = 0;
  for (const t of terms) {
    const name = normalize(t.term);
    if (!name) continue;
    const courseId = t.courseId ? courseIds.get(t.courseId) ?? null : null;
    const dupe = current.terms.find((x) => x.term.toLowerCase() === name.toLowerCase() && x.courseId === courseId);
    if (dupe) {
      if (!dupe.definition && t.definition) dupe.definition = t.definition;
      continue;
    }
    current.terms.push({
      id: uid(),
      term: name,
      aliases: t.aliases || [],
      definition: t.definition || "",
      courseId,
      context: t.context || "",
      source: t.source || null,
      createdAt: t.createdAt || Date.now(),
      updatedAt: Date.now(),
      stats: t.stats || { box: 0, right: 0, wrong: 0, last: 0 },
    });
    added++;
  }
  await chrome.storage.local.set({ courses: current.courses, terms: current.terms });
  return added;
}

export function onChange(cb) {
  const listener = (changes, area) => {
    if (area === "local") cb(changes);
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

export function termsForCourse(terms, courseId) {
  if (!courseId || courseId === "all") return terms;
  return terms.filter((t) => t.courseId === courseId);
}
