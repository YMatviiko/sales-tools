// Minimal PNG decoder (8-bit, non-interlaced, gray/RGB/RGBA/palette) and an area-weighted dominant-colour finder.
// Used on page screenshots to learn which colours actually cover the page, which CSS counts cannot tell you.
import zlib from 'node:zlib';
import { rgbToHex, chroma, lightness } from './color.mjs';

export function decodePng(buf) {
  if (buf.length < 33 || buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let w, h, depth, ctype, interlace, pos = 8; const idat = []; let plte = null;
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos), type = buf.toString('ascii', pos + 4, pos + 8), d = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); depth = d[8]; ctype = d[9]; interlace = d[12]; }
    else if (type === 'PLTE') plte = d; else if (type === 'IDAT') idat.push(d); else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (depth !== 8 || interlace !== 0 || ![0, 2, 3, 6].includes(ctype)) throw new Error('unsupported PNG variant');
  if (w * h > 60_000_000) throw new Error('image too large');
  const ch = { 0: 1, 2: 3, 3: 1, 6: 4 }[ctype], stride = w * ch, raw = zlib.inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? out[dst + x - ch] : 0, b = y ? out[dst - stride + x] : 0, c = x >= ch && y ? out[dst - stride + x - ch] : 0;
      let v = raw[src + x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      out[dst + x] = v & 255;
    }
  }
  return { width: w, height: h, channels: ch, ctype, data: out, plte };
}

/** Top colours by area. Returns [{hex, share}] (share of sampled pixels), near-duplicates merged. */
export function dominantColors(img, { step = 3, top = 10 } = {}) {
  const { width: w, height: h, channels: ch, ctype, data, plte } = img, bins = new Map(); let n = 0;
  for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) {
    const i = (y * w + x) * ch; let r, g, b;
    if (ctype === 3) { const k = data[i] * 3; r = plte[k]; g = plte[k + 1]; b = plte[k + 2]; }
    else if (ch === 1) r = g = b = data[i]; else { r = data[i]; g = data[i + 1]; b = data[i + 2]; }
    if (ctype === 6 && data[i + 3] < 128) continue;
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4), e = bins.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    e.n++; e.r += r; e.g += g; e.b += b; bins.set(key, e); n++;
  }
  const list = [...bins.values()].map((e) => ({ n: e.n, c: [e.r / e.n, e.g / e.n, e.b / e.n] })).sort((a, b) => b.n - a.n), merged = [];
  for (const e of list) {
    const m = merged.find((x) => Math.hypot(x.c[0] - e.c[0], x.c[1] - e.c[1], x.c[2] - e.c[2]) < 26);
    if (m) { m.c = m.c.map((v, i) => (v * m.n + e.c[i] * e.n) / (m.n + e.n)); m.n += e.n; } else merged.push({ ...e });
  }
  return merged.sort((a, b) => b.n - a.n).slice(0, top).map((e) => ({ hex: rgbToHex(...e.c), share: Math.round((e.n / n) * 1000) / 1000 }));
}
export const surfaceRole = (hex) => (chroma(hex) >= 0.1 && lightness(hex) > 0.12 && lightness(hex) < 0.9 ? 'colour' : lightness(hex) >= 0.5 ? 'light' : 'dark');

// ---- RGBA PNG encoder + background knock-out (so a logo captured from a coloured header sits cleanly on any slide) ----
function crc32(buf) { let x = 0xffffffff; for (const v of buf) { let c = (x ^ v) & 255; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; x = c ^ (x >>> 8); } return (x ^ 0xffffffff) >>> 0; }
export function encodeRgba(w, h, rgba) {
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 6;
  const raw = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) { raw[y * (1 + w * 4)] = 0; rgba.copy(raw, y * (1 + w * 4) + 1, y * w * 4, (y + 1) * w * 4); }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
/** Makes the (uniform) background transparent. Returns the original buffer if the corners are not a single flat colour. */
export function knockOutBackground(buf) {
  let img; try { img = decodePng(buf); } catch { return buf; }
  const { width: w, height: h, channels: ch, data, ctype } = img; if (ctype === 3 || (ch !== 3 && ch !== 4)) return buf;
  const px = (x, y) => { const i = (y * w + x) * ch; return [data[i], data[i + 1], data[i + 2], ch === 4 ? data[i + 3] : 255]; };
  const corners = [px(0, 0), px(w - 1, 0), px(0, h - 1), px(w - 1, h - 1)];
  if (corners.some((c) => c[3] < 200)) return buf;                          // already transparent
  const bg = corners[0]; if (corners.some((c) => Math.hypot(c[0] - bg[0], c[1] - bg[1], c[2] - bg[2]) > 18)) return buf;
  const out = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const r = data[i * ch], g = data[i * ch + 1], b = data[i * ch + 2], d = Math.hypot(r - bg[0], g - bg[1], b - bg[2]);
    out[i * 4] = r; out[i * 4 + 1] = g; out[i * 4 + 2] = b; out[i * 4 + 3] = Math.round(Math.min(1, Math.max(0, (d - 14) / 70)) * 255);
  }
  return encodeRgba(w, h, out);
}

/**
 * Visual rhythm of a long page: one slice per screen, each classified by tone (light / dark / colour) and by how photographic
 * it is (share of the slice covered by its two flattest colours). Works on pixels, so it does not depend on how the site's HTML is nested.
 */
export function pageRhythm(img, { slice = 900 } = {}) {
  const { width: w, height: h, channels: ch, ctype, data, plte } = img, step = 6, out = [];
  for (let y0 = 0; y0 + slice * 0.6 <= h; y0 += slice) {
    const y1 = Math.min(h, y0 + slice), bins = new Map(); let n = 0, lum = 0, chr = 0;
    for (let y = y0; y < y1; y += step) for (let x = 0; x < w; x += step) {
      const i = (y * w + x) * ch; let r, g, b;
      if (ctype === 3) { const k = data[i] * 3; r = plte[k]; g = plte[k + 1]; b = plte[k + 2]; } else if (ch === 1) r = g = b = data[i]; else { r = data[i]; g = data[i + 1]; b = data[i + 2]; }
      const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4); bins.set(key, (bins.get(key) ?? 0) + 1);
      lum += (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; chr += (Math.max(r, g, b) - Math.min(r, g, b)) / 255; n++;
    }
    const top2 = [...bins.values()].sort((a, b) => b - a).slice(0, 2).reduce((t, v) => t + v, 0) / n, L = lum / n, C = chr / n;
    out.push({ tone: L < 0.38 ? 'dark' : L > 0.72 ? 'light' : C > 0.25 ? 'colour' : L < 0.55 ? 'dark' : 'light', imagery: top2 >= 0.8 ? 'flat' : top2 >= 0.5 ? 'mixed' : 'image', lum: Math.round(L * 100) / 100 });
  }
  return out;
}
