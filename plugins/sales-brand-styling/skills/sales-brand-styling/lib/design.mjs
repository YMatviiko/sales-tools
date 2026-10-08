// Design language: HOW a brand lays things out, beyond colours and fonts — image-led or text-led, airy or dense,
// centred or left-aligned, display-size headings or compact, square or pill corners. Measured on the live page
// (needs a browser); otherwise left at neutral defaults and flagged as unmeasured so nobody mistakes a guess for a finding.
/** Sequence of screens -> rhythm summary ({pattern, tones, imagery}) used to alternate slide backgrounds the way the site alternates sections. */
export function inferRhythm(slices) {
  if (!Array.isArray(slices) || slices.length < 3) return null;
  const tone = (t) => (t === 'colour' ? 'dark' : t);                // a colour-flooded screen reads as a dark band on a slide
  const tones = slices.map((x) => tone(x.tone)), flips = tones.slice(1).filter((t, i) => t !== tones[i]).length, flipRate = flips / (tones.length - 1);
  const share = (t) => tones.filter((x) => x === t).length / tones.length;
  const pattern = flipRate >= 0.5 ? 'alternating' : share('dark') >= 0.7 ? 'dark' : share('light') >= 0.7 ? 'light' : 'mixed';
  const imageShare = slices.filter((x) => x.imagery === 'image').length / slices.length;
  return { pattern, flip_rate: Math.round(flipRate * 100) / 100, tones: tones.slice(0, 8), imagery: slices.slice(0, 8).map((x) => x.imagery), screens: slices.length, image_screens: Math.round(imageShare * 100) / 100 };
}
export const DESIGN_DEFAULTS = { align: 'left', density: 'balanced', imagery: 'balanced', heading_scale: 'standard', corners: 'square' };
const ENUMS = { align: ['left', 'center'], density: ['airy', 'balanced', 'dense'], imagery: ['image-led', 'balanced', 'text-led'], heading_scale: ['display', 'standard', 'compact'], corners: ['square', 'soft', 'pill'] };
export const DESIGN_KEYS = Object.keys(ENUMS);

// Runs INSIDE the page (self-contained). Document-space geometry, sampled after the page has been scrolled so lazy images exist.
export const MEASURE_DESIGN = () => {
  const vw = innerWidth, H = Math.min(document.documentElement.scrollHeight, 5400), area = vw * H;
  const vis = (el) => { const r = el.getBoundingClientRect(), cs = getComputedStyle(el); return r.width > 4 && r.height > 4 && cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0'; };
  const G = 20, cols = Math.ceil(vw / G), rows = Math.ceil(H / G), grid = new Uint8Array(cols * rows);
  let fullBleed = 0;
  for (const el of document.querySelectorAll('img, video, picture, canvas, section, div, a, figure')) {
    if (!vis(el)) continue;
    const cs = getComputedStyle(el), r = el.getBoundingClientRect();
    const media = /^(IMG|VIDEO|PICTURE|CANVAS)$/.test(el.tagName), bg = cs.backgroundImage && cs.backgroundImage !== 'none' && /url\(/.test(cs.backgroundImage);
    if (!(media || bg) || r.width < 120 || r.height < 80) continue;
    if (el.tagName === 'IMG' && /logo|icon|sprite|badge/i.test(`${el.className} ${el.alt} ${el.src}`)) continue;
    const x0 = Math.max(0, r.left + scrollX), y0 = Math.max(0, r.top + scrollY);
    for (let y = Math.floor(y0 / G); y < Math.min(rows, Math.ceil((y0 + r.height) / G)); y++) for (let x = Math.floor(x0 / G); x < Math.min(cols, Math.ceil((x0 + Math.min(r.width, vw)) / G)); x++) grid[y * cols + x] = 1;
    if (r.width >= vw * 0.9 && r.height >= 200) fullBleed++;
  }
  let covered = 0; for (const v of grid) covered += v;
  let chars = 0;
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = tw.nextNode(); n; n = tw.nextNode()) { const t = n.nodeValue.trim(); if (t.length < 2) continue; const el = n.parentElement; if (!el || /^(SCRIPT|STYLE|NOSCRIPT)$/.test(el.tagName) || !vis(el)) continue; if (el.getBoundingClientRect().top + scrollY > H) continue; chars += t.length; }
  const h1 = [...document.querySelectorAll('h1')].find(vis) ?? [...document.querySelectorAll('h2')].find(vis);
  const hr = h1?.getBoundingClientRect(), hcs = h1 && getComputedStyle(h1), mid = hr ? hr.left + hr.width / 2 : 0;
  const centered = hr ? (hcs.textAlign === 'center' && Math.abs(mid - vw / 2) < vw * 0.08) || (Math.abs(mid - vw / 2) < vw * 0.03 && hr.width < vw * 0.6) : null;
  const btn = [...document.querySelectorAll('button, a[class*="button" i], a[class*="btn" i], [role="button"]')].find((b) => vis(b) && getComputedStyle(b).backgroundColor !== 'rgba(0, 0, 0, 0)');
  return { pageH: H, imageShare: covered / (cols * rows), fullBleed, textDensity: chars / (area / 10000), h1px: hcs ? parseFloat(hcs.fontSize) : null, centered,
    radiusRatio: btn ? parseFloat(getComputedStyle(btn).borderTopLeftRadius) / btn.getBoundingClientRect().height : null };
};

/** Pure: measurements -> design language + provenance. Returns null when the page gave too little to judge (bot wall, empty shell). */
export function inferDesign(m) {
  if (!m || m.pageH < 1200 || (m.imageShare < 0.01 && m.textDensity < 2)) return null;
  const d = { align: m.centered === true ? 'center' : 'left',
    imagery: m.imageShare >= 0.45 || m.fullBleed >= 2 ? 'image-led' : m.imageShare >= 0.12 ? 'balanced' : 'text-led',
    density: m.textDensity < 8 ? 'airy' : m.textDensity < 14 ? 'balanced' : 'dense',
    heading_scale: m.h1px >= 48 ? 'display' : m.h1px >= 30 ? 'standard' : m.h1px ? 'compact' : 'standard',
    corners: m.radiusRatio == null ? 'soft' : m.radiusRatio >= 0.45 ? 'pill' : m.radiusRatio >= 0.12 ? 'soft' : 'square' };
  return { ...d, measured: { image_share: Math.round(m.imageShare * 100) / 100, full_bleed_images: m.fullBleed, text_density: Math.round(m.textDensity * 10) / 10, h1_px: m.h1px ? Math.round(m.h1px) : null, centered: m.centered ?? null } };
}

export const withDefaults = (d) => ({ ...DESIGN_DEFAULTS, ...(d ?? {}) });
export function validateDesign(d) {
  const errs = [];
  for (const k of DESIGN_KEYS) if (d?.[k] !== undefined && !ENUMS[k].includes(d[k])) errs.push(`design.${k} must be one of ${ENUMS[k].join(', ')}.`);
  if (d?.rhythm !== undefined) { const r = d.rhythm; if (!['alternating', 'dark', 'light', 'mixed'].includes(r?.pattern) || !Array.isArray(r.tones) || r.tones.some((t) => !['light', 'dark'].includes(t))) errs.push('design.rhythm must be {pattern, tones[light|dark]}.'); }
  return errs;
}

const WORDS = {
  align: { center: 'centred text', left: 'left-aligned text' },
  density: { airy: 'lots of white space', balanced: 'a balanced amount of text', dense: 'dense, text-rich pages' },
  imagery: { 'image-led': 'large, image-led pages', balanced: 'a mix of images and text', 'text-led': 'mostly text, few images' },
  heading_scale: { display: 'very large headlines', standard: 'standard-size headlines', compact: 'compact headlines' },
  corners: { square: 'sharp corners', soft: 'softly rounded corners', pill: 'fully rounded (pill) buttons' },
};
export const designWords = (d) => ['imagery', 'density', 'heading_scale', 'align', 'corners'].map((k) => WORDS[k][d[k]]);
export const rhythmWords = (r) => (!r ? null : { alternating: 'sections alternate between light and dark', dark: 'mostly dark sections', light: 'mostly light sections', mixed: 'a mix of light and dark sections' }[r.pattern]);
