// Settings that arrive from outside (a save file, the autosave) are checked
// against the defaults: unknown keys dropped, numbers clamped to the slider
// ranges, strings limited to the allowed choices.
import { RANGES, CHOICES } from './config.js';

export function sanitizeSettings(raw, defaults) {
  const out = { ...defaults };
  if (!raw || typeof raw !== 'object') return out;
  for (const key of Object.keys(defaults)) {
    const v = raw[key];
    const d = defaults[key];
    if (typeof d === 'number') {
      if (typeof v !== 'number' || !Number.isFinite(v)) continue;
      const r = RANGES[key];
      out[key] = r ? Math.min(r[1], Math.max(r[0], v)) : v;
    } else if (typeof d === 'boolean') {
      if (typeof v === 'boolean') out[key] = v;
    } else if (typeof d === 'string') {
      if (typeof v !== 'string') continue;
      const allowed = CHOICES[key];
      if (allowed ? allowed.includes(v) : v.length > 0 && v.length < 40) out[key] = v;
    }
  }
  return out;
}

// Touch screens start at Low quality, unless a link names the river: the grid
// size changes the river, so a shared link must keep its quality.
export function startQuality(settings, { touch, fromLink }) {
  return touch && !fromLink ? 'low' : settings.quality;
}
