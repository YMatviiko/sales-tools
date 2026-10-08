// Small colour helpers shared by extraction, mapping and rendering.
export function normalizeHex(c) {
  if (typeof c !== 'string') return null;
  const m = String(c).trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = [...h].map((x) => x + x).join('');
  return '#' + h.toUpperCase();
}
export function rgbToHex(r, g, b) {
  if (![r, g, b].every((v) => Number.isFinite(v))) return null;
  return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase();
}
// Accepts #hex, rgb()/rgba() with integer or percent channels; returns #RRGGBB or null.
export function parseColor(s) {
  if (typeof s !== 'string') return null;
  const hex = normalizeHex(s);
  if (hex) return hex;
  const m = String(s).trim().match(/^rgba?\(\s*(\d+(?:\.\d+)?)(%?)[\s,]+(\d+(?:\.\d+)?)(%?)[\s,]+(\d+(?:\.\d+)?)(%?)/i);
  if (!m) return null;
  const ch = (v, pct) => (pct ? (parseFloat(v) * 255) / 100 : parseFloat(v));
  return rgbToHex(ch(m[1], m[2]), ch(m[3], m[4]), ch(m[5], m[6]));
}
export function toHsl(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  return { h, s, l };
}
export const saturation = (hex) => toHsl(hex).s;
export const lightness = (hex) => toHsl(hex).l;
// Chroma (max-min), not HSL saturation: HSL saturation inflates for very light/dark tints like #F4F6FA or #1B2430.
export const chroma = (hex) => { const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255); return Math.max(...v) - Math.min(...v); };
export const isNeutral = (hex) => chroma(hex) < 0.1 || lightness(hex) > 0.94;
const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
export const relLum = (hex) => { const [r, g, b] = [1, 3, 5].map((i) => lin(parseInt(hex.slice(i, i + 2), 16))); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const contrast = (a, b) => { const [x, y] = [relLum(a), relLum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
export const bestInk = (bg) => (contrast(bg, '#FFFFFF') >= contrast(bg, '#1F1F1F') ? '#FFFFFF' : '#1F1F1F');
