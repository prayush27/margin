// Recently opened PDFs. Local files are remembered with File System Access handles
// (stored in IndexedDB) so they can be reopened in one click.

const DB = "margin";
const STORE = "recent";
const LIMIT = 30;

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const s = t.objectStore(STORE);
    const out = fn(s);
    t.oncomplete = () => resolve(out instanceof IDBRequest ? out.result : out);
    t.onerror = () => reject(t.error);
  });
}

export async function listRecent() {
  const all = await tx("readonly", (s) => s.getAll());
  return (all || []).sort((a, b) => b.openedAt - a.openedAt);
}

export async function getRecent(id) {
  return tx("readonly", (s) => s.get(id));
}

/** entry: { id?, name, url?, handle? } */
export async function touchRecent(entry) {
  const all = await listRecent();
  let existing = null;
  if (entry.url) existing = all.find((r) => r.url === entry.url);
  if (!existing && entry.handle) {
    for (const r of all) {
      if (r.handle && (await r.handle.isSameEntry?.(entry.handle).catch(() => false))) {
        existing = r;
        break;
      }
    }
  }
  const record = {
    ...(existing || {}),
    ...entry,
    id: existing?.id || entry.id || `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    openedAt: Date.now(),
  };
  await tx("readwrite", (s) => s.put(record));
  const stale = (await listRecent()).slice(LIMIT);
  if (stale.length) await tx("readwrite", (s) => stale.forEach((r) => s.delete(r.id)));
  return record;
}

export async function removeRecent(id) {
  await tx("readwrite", (s) => s.delete(id));
}

export function viewerUrl({ file, recent, page } = {}) {
  const u = new URL(chrome.runtime.getURL("src/viewer/viewer.html"));
  if (file) u.searchParams.set("file", file);
  if (recent) u.searchParams.set("recent", recent);
  if (page) u.hash = `page=${page}`;
  return u.toString();
}
