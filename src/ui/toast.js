// Small bottom-left messages such as "Neck cutoff in year 412".
const MAX = 4;
const LIFE = 3500;

export function toast(text) {
  const host = document.getElementById('toasts');
  if (!host) return;
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  while (host.children.length > MAX) host.removeChild(host.firstChild);
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, LIFE + Math.max(0, text.length - 40) * 45); // longer messages stay up longer
}
