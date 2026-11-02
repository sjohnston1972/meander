// Autosave, run inside the worker so the main thread never copies the grid.
// The river on screen is written to the 'autosave' slot. When a different
// river (new seed, reset, link) is first saved, the old one moves to
// 'previous' if it ran long enough to be worth keeping.
import { getSlot, putSlot, getMeta } from '../storage.js';

export const AUTOSAVE_SECONDS = 20;
const KEEP_PREVIOUS_YEARS = 100;

export function newRiverId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

export async function writeAutosave(engine, riverId) {
  const meta = await getMeta();
  const cur = meta.autosave;
  if (cur && cur.riverId !== riverId && cur.year >= KEEP_PREVIOUS_YEARS) {
    const old = await getSlot('autosave');
    if (old) {
      await putSlot('previous', old);
      meta.previous = cur;
    }
  }
  const info = { riverId, year: engine.year, seed: engine.settings.seed, savedAt: Date.now() };
  const ok = await putSlot('autosave', { ...info, state: engine.serialize() });
  if (ok) {
    meta.autosave = info;
    await putSlot('meta', meta);
  }
  return ok;
}
