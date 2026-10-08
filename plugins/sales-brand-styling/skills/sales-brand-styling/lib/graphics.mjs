// Graphics language: HOW a customer's site draws its shapes, beyond colours and fonts — which elements have rounded corners (and how
// round), whether it uses gradients, tiled patterns or shadows, and whether it has "graphic sections": inset or full-width coloured
// panels that carry a headline, numbers or a call to action (e.g. the investor-relations block on aholddelhaize.com).
// Measured in the live page (needs a browser), validated here, then used by the PowerPoint layouts, the HTML one-pager and the
// HTML prototype. Every value that reaches generated CSS / XML is whitelisted (numbers, hex colours, keywords).
import { parseColor, lightness } from './color.mjs';

export const GRAPHICS_VERSION = '1.0';
const ROLES = ['button', 'card', 'media', 'input', 'chip'];

// ---- runs INSIDE the page (self-contained) ----
export const MEASURE_GRAPHICS = () => {
  const vw = innerWidth, PH = Math.min(document.documentElement.scrollHeight, 6000);
  const transparent = (c) => !c || /rgba\(\s*\d+,\s*\d+,\s*\d+,\s*0\s*\)|^transparent$/.test(c);
  const alpha = (c) => { const m = /rgba\(\s*\d+,\s*\d+,\s*\d+,\s*([\d.]+)/.exec(c); return m ? parseFloat(m[1]) : 1; };
  const vis = (el, r, cs) => r.width > 4 && r.height > 4 && cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0' && r.top + scrollY < PH;
  const radii = { button: [], card: [], media: [], input: [], chip: [] }, grads = [], panels = [], patterns = { tile: 0, svg: 0 }, shadow = { n: 0, cards: 0 };
  const pageBg = (() => { for (const e of [document.body, document.documentElement]) { const c = getComputedStyle(e).backgroundColor; if (!transparent(c)) return c; } return 'rgb(255, 255, 255)'; })();
  const num = (s) => { const m = /^\s*[-+€$£]?\s*\d[\d.,]*\s*(?:%|[a-zA-Z]{0,4})\s*$/.exec(s); return !!m; };
  const all = [...document.querySelectorAll('body *')].slice(0, 6000);
  for (const el of all) {
    const cs = getComputedStyle(el), r = el.getBoundingClientRect();
    if (!vis(el, r, cs)) continue;
    const tag = el.tagName, bg = cs.backgroundColor, bgi = cs.backgroundImage, solid = !transparent(bg) && alpha(bg) > 0.6, rad = Math.min(...['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomLeftRadius', 'borderBottomRightRadius'].map((k) => parseFloat(cs[k]) || 0));   // all four corners rounded; a notch or tab rounded on one side is not a rounded element
    const bordered = ['Top', 'Right', 'Bottom', 'Left'].some((s) => parseFloat(cs[`border${s}Width`]) > 0 && cs[`border${s}Style`] !== 'none');
    const filled = solid || bordered || /url\(/.test(bgi);
    const ratio = rad / Math.min(r.width, r.height);
    if (rad > 0.5 && ratio <= 0.5) {
      if (tag === 'IMG' || tag === 'VIDEO' || tag === 'PICTURE' || (/url\(/.test(bgi) && r.width > 160 && r.height > 100)) { if (r.width > 100 && r.height > 60) radii.media.push(rad); }
      else if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') radii.input.push(rad);
      else if ((tag === 'A' || tag === 'BUTTON' || el.getAttribute('role') === 'button') && filled && r.height >= 24 && r.height <= 90 && r.width > 40) radii.button.push(rad);
      else if (filled && r.width >= 200 && r.height >= 100 && r.width < vw * 0.98) radii.card.push(rad);
      else if (filled && r.height <= 40 && r.width <= 220 && tag !== 'A' && tag !== 'BUTTON') radii.chip.push(rad);
    } else if (rad > 0.5 && ratio > 0.5 && filled && (tag === 'A' || tag === 'BUTTON') && r.height >= 24 && r.height <= 90 && r.width > r.height * 1.5) radii.button.push(9999);
    else if (!rad && filled && (tag === 'A' || tag === 'BUTTON') && r.height >= 24 && r.height <= 90 && r.width > 40) radii.button.push(0);
    else if (!rad && (tag === 'IMG') && r.width > 160 && r.height > 100) radii.media.push(0);
    if (cs.boxShadow && cs.boxShadow !== 'none' && r.width >= 160 && r.height >= 80) { shadow.n++; }
    if (/gradient\(/.test(bgi) && r.width >= 200 && r.height >= 100) {
      const cols = [...bgi.matchAll(/rgba?\([^)]+\)/g)].map((m) => m[0]), ang = /(-?\d+(?:\.\d+)?)deg/.exec(bgi)?.[1] ?? (/to (top|bottom|left|right)/.exec(bgi)?.[1] ?? null);
      grads.push({ kind: /radial/.test(bgi) ? 'radial' : 'linear', angle: ang, cols: cols.slice(0, 4), area: r.width * r.height });
    }
    if (/url\(/.test(bgi) && /(^|,)\s*repeat/.test(cs.backgroundRepeat) && !/no-repeat/.test(cs.backgroundRepeat) && r.width >= 240 && r.height >= 120) patterns.tile++;
    // Graphic sections: a coloured panel (inset or full width) with a heading inside it, clearly different from the page.
    if (r.height >= 180 && r.width >= 320 && (solid || /gradient\(|url\(/.test(bgi)) && !(r.width > vw * 0.98 && r.height > PH * 0.7) && tag !== 'BODY' && tag !== 'HTML' && !/fixed|sticky/.test(cs.position)) {
      const head = el.querySelector('h1,h2,h3'), hv = head && head.getBoundingClientRect().height > 4;
      if (!hv) continue;
      const kids = [...el.querySelectorAll('*')].filter((k) => k.children.length === 0 && num((k.textContent || '').trim())).length;
      const imgs = el.querySelectorAll('img').length, btn = el.querySelectorAll('a[class*="button" i], a[class*="btn" i], button').length;
      panels.push({ bg: solid ? bg : null, grad: /gradient\(/.test(bgi), image: /url\(/.test(bgi), radius: rad, inset: r.width < vw * 0.96, w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top + scrollY), color: cs.color, stats: kids, imgs, btn,
        heading: (head.textContent || '').trim().slice(0, 60), key: /invest|result|figure|number|stat|fact|impact|cta|highlight|feature|promo/i.test(`${el.id} ${el.className} ${head.textContent}`) });
    }
  }
  for (const s of document.querySelectorAll('svg')) { const r = s.getBoundingClientRect(); if (r.width > 160 && r.height > 160 && getComputedStyle(s).position === 'absolute') patterns.svg++; }
  return { pageBg, radii, grads: grads.slice(0, 20), panels: panels.slice(0, 40), patterns, shadow, scale: document.querySelectorAll('svg').length };
};

// ---- pure inference ----
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const mode = (a) => { const m = new Map(); for (const v of a) m.set(v, (m.get(v) ?? 0) + 1); return [...m.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? null; };
const round = (v) => (v == null ? null : Math.round(Math.min(v, 999)));
const hexOf = (c) => parseColor(c);
const angleOf = (a) => { if (a == null) return 180; const n = parseFloat(a); if (Number.isFinite(n)) return Math.round(((n % 360) + 360) % 360); return { top: 0, right: 90, bottom: 180, left: 270 }[a] ?? 180; };

/** Pure: measurements -> the graphics language + provenance. Returns null when the page gave nothing to judge. */
export function inferGraphics(m) {
  if (!m || !m.radii) return null;
  const R = m.radii, counted = ROLES.reduce((t, k) => t + (R[k]?.length ?? 0), 0);
  const pick = (k) => { const v = R[k] ?? []; return v.length ? (mode(v) === 9999 ? 9999 : round(mode(v) ?? median(v))) : null; };
  const corners = Object.fromEntries(ROLES.map((k) => [k, pick(k)]));
  const sampled = counted > 0;
  // Gradients count only when they cover a real share of the page's shapes, not a single decorative fade.
  const gradArea = (m.grads ?? []).reduce((t, g) => t + g.area, 0), gcols = (m.grads ?? []).map((g) => g.cols.map(hexOf).filter(Boolean)).filter((c) => c.length >= 2).sort((a, b) => b.length - a.length)[0];
  const gradient = (m.grads ?? []).length >= 1 && gcols ? { used: true, kind: m.grads[0].kind, angle: angleOf(m.grads[0].angle), stops: [gcols[0], gcols.at(-1)], count: m.grads.length, area_share: Math.round(Math.min(1, gradArea / (1440 * 900 * 6)) * 100) / 100 } : { used: false };
  const pattern = (m.patterns?.tile ?? 0) >= 2 ? { used: true, kind: 'tile' } : (m.patterns?.svg ?? 0) >= 2 ? { used: true, kind: 'shapes' } : { used: false };
  const shadow = (m.shadow?.n ?? 0) >= 3 ? 'soft' : 'none';
  // The graphic section: prefer ones that look like a feature block (numbers, call to action, keyword), then inset rounded ones, then the biggest colour band.
  const pageBg = hexOf(m.pageBg), cand = (m.panels ?? []).map((p) => ({ ...p, hex: p.bg ? hexOf(p.bg) : null, ink: hexOf(p.color) }))
    .filter((p) => (p.hex && (!pageBg || p.hex !== pageBg)) || p.grad || p.image);
  const score = (p) => (p.key ? 3 : 0) + (p.stats >= 3 ? 3 : p.stats >= 1 ? 1 : 0) + (p.inset ? 2 : 0) + (p.radius > 0 ? 1 : 0) + (p.btn ? 1 : 0) - (p.imgs > 2 ? 2 : 0);
  const best = cand.sort((a, b) => score(b) - score(a) || b.w * b.h - a.w * a.h)[0];
  const sections = best ? { bg: best.hex, gradient: !!best.grad, image: !!best.image, inset: !!best.inset, radius: round(best.radius), ink: best.hex ? (lightness(best.hex) > 0.55 ? '#1F1F1F' : '#FFFFFF') : '#FFFFFF', with_numbers: best.stats >= 3, with_button: best.btn > 0, example: best.heading, count: cand.filter((p) => p.hex === best.hex && p.inset === best.inset).length } : null;
  const prov = { corners: sampled ? 'measured' : 'unmeasured', gradient: 'measured', pattern: 'measured', sections: 'measured' };
  return { graphics_version: GRAPHICS_VERSION, corners, gradient, pattern, shadow, section: sections, provenance: prov, measured: sampled };
}

// ---- validation ----
const isHex = (v) => typeof v === 'string' && /^#[0-9A-F]{6}$/.test(v);
const isNum = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
export function validateGraphics(g) {
  if (!g || typeof g !== 'object' || Array.isArray(g) || g.graphics_version !== GRAPHICS_VERSION) return [`graphics_version must be "${GRAPHICS_VERSION}".`];
  const errs = [];
  for (const k of ROLES) { const v = g.corners?.[k]; if (v != null && !isNum(v, 0, 9999)) errs.push(`graphics.corners.${k} must be 0..9999 px.`); }
  const gr = g.gradient; if (gr && gr.used) { if (!['linear', 'radial'].includes(gr.kind) || !isNum(gr.angle, 0, 360) || !Array.isArray(gr.stops) || gr.stops.length !== 2 || !gr.stops.every(isHex)) errs.push('graphics.gradient is invalid.'); }
  if (g.pattern && g.pattern.used && !['tile', 'shapes'].includes(g.pattern.kind)) errs.push('graphics.pattern.kind must be tile|shapes.');
  if (g.shadow !== undefined && !['none', 'soft'].includes(g.shadow)) errs.push('graphics.shadow must be none|soft.');
  const s = g.section; if (s) { if (s.bg != null && !isHex(s.bg)) errs.push('graphics.section.bg must be a #RRGGBB colour.'); if (!isHex(s.ink)) errs.push('graphics.section.ink must be a #RRGGBB colour.'); if (s.radius != null && !isNum(s.radius, 0, 999)) errs.push('graphics.section.radius is invalid.'); for (const k of ['gradient', 'image', 'inset', 'with_numbers', 'with_button']) if (typeof s[k] !== 'boolean') errs.push(`graphics.section.${k} must be true or false.`); }
  return errs;
}

// ---- how the layouts and HTML use it ----
export const radiusPx = (v, fallback) => (v == null ? fallback : v >= 9999 ? 999 : v);
/** Corner radius of an element kind, in px (pill buttons -> 999). `fallback` is the coarse design.corners value. */
export const cornerOf = (g, kind, fallback) => radiusPx(g?.corners?.[kind], fallback);
const WORD = (v) => (v == null ? null : v >= 9999 ? 'fully round' : v <= 0 ? 'square' : v <= 6 ? 'slightly rounded' : v <= 14 ? 'softly rounded' : 'very round');
const LABEL = { button: 'buttons', card: 'cards and panels', media: 'pictures', input: 'form fields', chip: 'tags' };

/** Plain-language findings for the brand board / chat. */
export function graphicsWords(g) {
  if (!g) return null;
  const out = [];
  const cs = ROLES.map((k) => [k, WORD(g.corners?.[k])]).filter(([, w]) => w);
  if (cs.length) out.push('Corners: ' + cs.map(([k, w]) => `${LABEL[k]} ${w}${g.corners[k] > 0 && g.corners[k] < 9999 ? ` (${g.corners[k]}px)` : ''}`).join(', '));
  out.push(g.gradient?.used ? `Gradients: used (${g.gradient.kind}, between ${g.gradient.stops.join(' and ')})` : 'Gradients: not used, colours are flat');
  out.push(g.pattern?.used ? `Patterns: ${g.pattern.kind === 'tile' ? 'repeating tile patterns' : 'decorative shapes'} appear in backgrounds` : 'Patterns: none');
  out.push(g.shadow === 'soft' ? 'Shadows: soft shadows lift cards' : 'Shadows: none, cards are flat');
  const s = g.section;
  out.push(s ? `Graphic section: ${s.inset ? 'an inset' : 'a full-width'} ${s.gradient ? 'gradient' : s.image ? 'picture' : 'coloured'} panel${s.radius ? ` with ${WORD(s.radius)} corners` : ''}${s.with_numbers ? ', showing key numbers' : ''}${s.with_button ? ' and a button' : ''}${s.example ? ` (e.g. "${s.example}")` : ''}` : 'Graphic section: none found');
  return out;
}

export const GRAPHICS_KEYS = ['button', 'card', 'media', 'input', 'chip', 'gradient', 'pattern', 'shadow'];
