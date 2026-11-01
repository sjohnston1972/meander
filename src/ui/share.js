// Settings to and from the URL hash, and screenshots.
import { RANGES, CHOICES } from '../config.js';

const SEP = '&';

export function encodeSettings(settings, defaults) {
  const parts = [`seed=${settings.seed}`];
  for (const key of Object.keys(defaults)) {
    if (key === 'seed') continue;
    const v = settings[key];
    if (v === undefined || v === defaults[key]) continue;
    const enc = typeof v === 'number' ? String(Math.round(v * 1e6) / 1e6) : typeof v === 'boolean' ? (v ? '1' : '0') : encodeURIComponent(String(v));
    parts.push(`${key}=${enc}`);
  }
  return parts.join(SEP);
}

export function decodeSettings(hash, defaults) {
  const out = { ...defaults };
  if (!hash) return out;
  const text = hash.startsWith('#') ? hash.slice(1) : hash;
  for (const part of text.split(SEP)) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const key = part.slice(0, eq);
    if (!(key in defaults)) continue;
    let raw;
    try { raw = decodeURIComponent(part.slice(eq + 1)); } catch { continue; }
    const d = defaults[key];
    if (typeof d === 'number') {
      const n = Number(raw);
      if (!Number.isFinite(n)) continue;
      const r = RANGES[key];
      out[key] = r ? Math.min(r[1], Math.max(r[0], n)) : n;
    } else if (typeof d === 'boolean') {
      if (raw === '1' || raw === 'true') out[key] = true;
      else if (raw === '0' || raw === 'false') out[key] = false;
    } else if (typeof d === 'string') {
      const allowed = CHOICES[key];
      if (allowed ? allowed.includes(raw) : raw.length > 0 && raw.length < 40) out[key] = raw;
    }
  }
  return out;
}

export function shareUrl(settings, defaults) {
  return `${location.origin}${location.pathname}#${encodeSettings(settings, defaults)}`;
}

export async function copyLink(settings, defaults) {
  const url = shareUrl(settings, defaults);
  history.replaceState(null, '', `#${encodeSettings(settings, defaults)}`);
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    return false;
  }
}

export function saveScreenshot(renderer, scene, camera, year) {
  renderer.render(scene, camera);
  renderer.domElement.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `meander-year-${Math.floor(year)}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }, 'image/png');
}
