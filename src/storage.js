// Browser storage for saved rivers (IndexedDB, usable from the page and the
// worker). Two slots: 'autosave' (the river on screen) and 'previous' (the
// last river worth keeping, moved aside when a different river is autosaved).
// A small 'meta' record says what each slot holds without loading it.
// Every call resolves to null/false instead of throwing when storage is
// unavailable (private windows, blocked site data).
const DB = 'meander';
const STORE = 'saves';

function open() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('no IndexedDB')); return; }
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function run(mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => { db.close(); resolve(req.result); };
    tx.onerror = () => { db.close(); reject(tx.error); };
    tx.onabort = () => { db.close(); reject(tx.error); };
  }));
}

export async function getSlot(name) {
  try { return (await run('readonly', (s) => s.get(name))) ?? null; } catch { return null; }
}

export async function putSlot(name, value) {
  try { await run('readwrite', (s) => s.put(value, name)); return true; } catch { return false; }
}

export async function getMeta() {
  return (await getSlot('meta')) || {};
}
