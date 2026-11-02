// Time-lapse recording: copies each rendered frame of the 3D view onto a 2D
// canvas with the year written in the corner, and records that canvas as a
// video with MediaRecorder (WebM where supported, MP4 on Safari).

const MAX_SECONDS = 180; // recordings stop and save themselves after this long
const MAX_WIDTH = 1280;  // video width cap, pixels

const TYPES = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];

export function recordingSupported() {
  return typeof MediaRecorder !== 'undefined' && !!HTMLCanvasElement.prototype.captureStream
    && TYPES.some((t) => MediaRecorder.isTypeSupported?.(t));
}

export function createRecorder(source) {
  let rec = null, chunks = [], comp = null, ctx = null;
  let firstYear = 0, lastYear = 0, startedAt = 0, mime = '';
  let onAutoStop = null;

  function start(year) {
    if (rec || !recordingSupported()) return false;
    mime = TYPES.find((t) => MediaRecorder.isTypeSupported(t));
    comp = document.createElement('canvas');
    const scale = Math.min(1, MAX_WIDTH / source.width);
    comp.width = Math.max(2, Math.round((source.width * scale) / 2) * 2);
    comp.height = Math.max(2, Math.round((source.height * scale) / 2) * 2);
    ctx = comp.getContext('2d');
    const stream = comp.captureStream(30);
    rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
    chunks = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    rec.start(1000);
    firstYear = lastYear = year;
    startedAt = performance.now();
    return true;
  }

  // Call straight after rendering a frame, while the WebGL image is still there.
  function frame(year) {
    if (!rec) return;
    ctx.drawImage(source, 0, 0, comp.width, comp.height);
    const pad = Math.round(comp.height * 0.03);
    const size = Math.round(comp.height * 0.035);
    ctx.font = `600 ${size}px system-ui, sans-serif`;
    ctx.textBaseline = 'top';
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 4;
    ctx.fillStyle = '#f2f6f8';
    ctx.fillText(`Year ${Math.floor(year).toLocaleString()}`, pad, pad);
    ctx.font = `${Math.round(size * 0.6)}px system-ui, sans-serif`;
    ctx.fillStyle = 'rgba(242,246,248,0.75)';
    ctx.fillText('Meander', pad, pad + size * 1.2);
    ctx.shadowBlur = 0;
    lastYear = year;
    if (performance.now() - startedAt > MAX_SECONDS * 1000) stop().then((r) => onAutoStop?.(r));
  }

  // Stops and resolves to { blob, name, seconds }, or null if nothing was recorded.
  function stop() {
    if (!rec) return Promise.resolve(null);
    const r = rec;
    rec = null;
    const seconds = (performance.now() - startedAt) / 1000;
    return new Promise((resolve) => {
      r.onstop = () => {
        const blob = new Blob(chunks, { type: mime.split(';')[0] });
        chunks = [];
        const ext = mime.startsWith('video/mp4') ? 'mp4' : 'webm';
        resolve(blob.size ? { blob, seconds, name: `meander-timelapse-year-${Math.floor(firstYear)}-to-${Math.floor(lastYear)}.${ext}` } : null);
      };
      r.stop();
    });
  }

  return {
    start, frame, stop,
    get recording() { return !!rec; },
    onAutoStop(cb) { onAutoStop = cb; },
  };
}
