// BrandSystem: the customer's website as a small design system — container and spacing, type scale, and the real components
// (nav, buttons, cards, inputs, footer) as the browser computed them. Measured in the page, validated here, and turned into
// CSS + HTML components by htmlkit.mjs. Every value that reaches generated CSS is whitelisted (numbers, hex colours, keywords).
import { parseColor, lightness } from './color.mjs';

export const SYSTEM_VERSION = '1.0';

// ---- runs INSIDE the page (self-contained) ----
export const MEASURE_SYSTEM = () => {
  const vw = innerWidth;
  const vis = (el) => { const r = el.getBoundingClientRect(), cs = getComputedStyle(el); return r.width > 4 && r.height > 4 && cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0'; };
  const px = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? Math.round(n * 10) / 10 : null; };
  const transparent = (c) => !c || /rgba\(\s*\d+,\s*\d+,\s*\d+,\s*0\s*\)|transparent/.test(c);
  const bgOf = (el) => { for (let e = el; e; e = e.parentElement) { const c = getComputedStyle(e).backgroundColor; if (!transparent(c)) return c; } return 'rgb(255, 255, 255)'; };
  const text = (sel) => [...document.querySelectorAll(sel)].find((e) => vis(e) && (e.textContent || '').trim().length > 2);
  const type = (el) => { if (!el) return null; const cs = getComputedStyle(el), size = px(cs.fontSize); return { size, weight: cs.fontWeight, lh: cs.lineHeight === 'normal' ? 1.2 : px(cs.lineHeight) / size, ls: px(cs.letterSpacing) ?? 0, transform: cs.textTransform, color: cs.color, family: cs.fontFamily.split(',')[0].replace(/["']/g, '').trim() }; };
  const box = (el) => { const cs = getComputedStyle(el), r = el.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), bg: cs.backgroundColor, color: cs.color, radius: px(cs.borderTopLeftRadius), shadow: cs.boxShadow, bw: px(cs.borderTopWidth), bc: cs.borderTopColor, padT: px(cs.paddingTop), padL: px(cs.paddingLeft), fs: px(cs.fontSize), fw: cs.fontWeight, tt: cs.textTransform, td: cs.textDecorationLine }; };

  // container: the most common max-width between 600 and 1500 px
  const mw = new Map(); for (const el of document.querySelectorAll('main *, section, section > div, body > div')) { const v = px(getComputedStyle(el).maxWidth); if (v && v >= 600 && v <= 1500 && vis(el)) mw.set(v, (mw.get(v) ?? 0) + 1); }
  const container = [...mw.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const sections = [...document.querySelectorAll('section, main > div')].filter((s) => vis(s) && s.getBoundingClientRect().height > 150).slice(0, 14);
  const pads = sections.map((s) => px(getComputedStyle(s).paddingTop)).filter((v) => v != null).sort((a, b) => a - b);
  const gaps = []; for (let i = 1; i < sections.length; i++) { const a = sections[i - 1].getBoundingClientRect(), b = sections[i].getBoundingClientRect(); const g = b.top - a.bottom; if (g >= 0 && g < 400) gaps.push(g); }

  const nav = [...document.querySelectorAll('nav, header, [role="navigation"]')].find((n) => vis(n) && n.getBoundingClientRect().top < 120 && n.getBoundingClientRect().width > vw * 0.5);
  let navM = null;
  if (nav) {
    const cs = getComputedStyle(nav), links = [...nav.querySelectorAll('a')].filter(vis), l0 = links[Math.floor(links.length / 2)];
    const fixed = (() => { for (let e = nav; e; e = e.parentElement) { const p = getComputedStyle(e).position; if (p === 'fixed' || p === 'sticky') return p; } return 'static'; })();
    const lr = links.slice(0, 12).map((a) => a.getBoundingClientRect()), xs = lr.map((r) => r.left + r.width / 2);
    navM = { h: Math.round(nav.getBoundingClientRect().height), bg: bgOf(nav), color: l0 ? getComputedStyle(l0).color : cs.color, linkSize: l0 ? px(getComputedStyle(l0).fontSize) : 14, linkWeight: l0 ? getComputedStyle(l0).fontWeight : '400', position: fixed,
      blur: /blur/.test(cs.backdropFilter || cs.webkitBackdropFilter || ''), borderB: px(cs.borderBottomWidth), links: links.length, centered: xs.length > 3 && Math.abs(xs.reduce((a, b) => a + b, 0) / xs.length - vw / 2) < vw * 0.08, translucent: /rgba/.test(cs.backgroundColor) && !transparent(cs.backgroundColor) };
  }

  const btnEls = [...document.querySelectorAll('button, [role="button"], a[class*="button" i], a[class*="btn" i], a[class*="cta" i], input[type="submit"]')].filter((b) => vis(b) && (b.textContent || b.value || '').trim().length > 1).slice(0, 60);
  const bt = btnEls.map(box);
  const solid = bt.filter((b) => !transparent(b.bg) && b.h >= 24 && b.h <= 80), outline = bt.filter((b) => transparent(b.bg) && b.bw > 0 && b.h >= 24 && b.h <= 80);
  const mode = (arr, key) => { const m = new Map(); for (const a of arr) m.set(JSON.stringify(a[key]), (m.get(JSON.stringify(a[key])) ?? 0) + 1); const k = [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]; return k ? JSON.parse(k) : null; };
  const pickBtn = (arr) => { if (!arr.length) return null; const bg = mode(arr, 'bg'); return arr.find((b) => b.bg === bg) ?? arr[0]; };

  // cards: repeated, rounded or shadowed or bordered boxes of card size
  const cand = new Map();
  for (const el of document.querySelectorAll('div, li, article, a, figure')) {
    if (!vis(el)) continue; const r = el.getBoundingClientRect(); if (r.width < 180 || r.width > 760 || r.height < 120 || r.height > 760) continue;
    const cs = getComputedStyle(el), rad = px(cs.borderTopLeftRadius), has = (cs.boxShadow && cs.boxShadow !== 'none') || px(cs.borderTopWidth) > 0 || (!transparent(cs.backgroundColor) && cs.backgroundColor !== bgOf(el.parentElement));
    if (!(rad >= 4 && has)) continue; if ((el.textContent || '').trim().length < 12) continue;
    const key = `${Math.round(r.width / 20)}|${rad}|${cs.backgroundColor}`; const e = cand.get(key) ?? { n: 0, el }; e.n++; cand.set(key, e);
  }
  const cardTop = [...cand.values()].filter((c) => c.n >= 2).sort((a, b) => b.n - a.n)[0];
  const card = cardTop ? { ...box(cardTop.el), n: cardTop.n, parentBg: bgOf(cardTop.el.parentElement) } : null;

  const input = [...document.querySelectorAll('input[type="text"], input[type="search"], input[type="email"], input:not([type]), select, textarea')].find((i) => vis(i));
  const footer = [...document.querySelectorAll('footer')].find(vis);
  const fl = footer && [...footer.querySelectorAll('a')].find(vis);
  const para = [...document.querySelectorAll('main p, p')].find((p) => vis(p) && (p.textContent || '').trim().length > 40);
  const inlineLink = para && [...para.querySelectorAll('a')].find(vis);
  const heroH = text('h1'), hero = heroH ? (() => { let e = heroH; for (let i = 0; i < 6 && e.parentElement; i++) { if (e.getBoundingClientRect().height > innerHeight * 0.45) break; e = e.parentElement; } const r = e.getBoundingClientRect(), hr = heroH.getBoundingClientRect(); return { h: Math.round(r.height), center: Math.abs(hr.left + hr.width / 2 - vw / 2) < vw * 0.08, ctaGap: (() => { const bs = [...e.querySelectorAll('a[class*="button" i], a[class*="btn" i], button')].filter(vis).slice(0, 2).map((b) => b.getBoundingClientRect()); return bs.length > 1 ? Math.round(Math.abs(bs[1].left - bs[0].right)) : null; })() }; })() : null;

  return { vw, container, sectionPad: pads.length ? pads[Math.floor(pads.length / 2)] : null, sectionGap: gaps.length ? gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)] : null,
    h1: type(text('h1')), h2: type(text('h2')), h3: type(text('h3')), body: type(para), small: type(text('small, figcaption, [class*="caption" i], [class*="eyebrow" i]')),
    nav: navM, primary: pickBtn(solid), secondary: pickBtn(outline), card, input: input ? box(input) : null, footer: footer ? { ...box(footer), bg: bgOf(footer), linkSize: fl ? px(getComputedStyle(fl).fontSize) : null, linkColor: fl ? getComputedStyle(fl).color : null } : null,
    link: inlineLink ? { color: getComputedStyle(inlineLink).color, underline: /underline/.test(getComputedStyle(inlineLink).textDecorationLine) } : null, hero };
};

// ---- node side ----
const hex = (c) => (typeof c === 'string' ? parseColor(c) : null);
const num = (v, lo, hi, dflt) => (Number.isFinite(v) && v >= lo && v <= hi ? Math.round(v * 10) / 10 : dflt);
const N = String.raw`-?\d{1,3}(?:\.\d{1,2})?`, RGBA = String.raw`rgba?\(\s*\d{1,3}(?:\s*,\s*\d{1,3}){2}(?:\s*,\s*(?:0|1|0?\.\d{1,3}))?\s*\)`;
const SHADOW = new RegExp(`^(?:${RGBA}\\s+)?${N}px\\s+${N}px(?:\\s+${N}px){0,2}(?:\\s+${RGBA})?$`);
function cleanShadow(s) { if (!s || s === 'none') return null; const first = String(s).split(/,(?![^(]*\))/)[0].trim(); return SHADOW.test(first) && !/inset/.test(first) ? first.replace(/\s+/g, ' ') : null; }
const typeOf = (t, dflt) => (t ? { size: num(t.size, 10, 140, dflt.size), weight: [300, 400, 500, 600, 700, 800].reduce((a, b) => (Math.abs(b - parseInt(t.weight, 10)) < Math.abs(a - parseInt(t.weight, 10)) ? b : a), 400), line_height: num(t.lh, 0.9, 2.2, dflt.line_height), letter_spacing_em: num(t.ls / t.size, -0.06, 0.2, 0), transform: t.transform === 'uppercase' ? 'uppercase' : 'none', ...(hex(t.color) && { color: hex(t.color) }) } : { ...dflt, weight: dflt.weight, letter_spacing_em: 0, transform: 'none' });

/** Pure: raw measurements -> BrandSystem, or null when too little was found to be a design system. */
export function inferSystem(m) {
  if (!m || (!m.h1 && !m.primary && !m.nav)) return null;
  const btn = (b) => (b ? { bg: hex(b.bg), color: hex(b.color), radius: num(b.radius, 0, 60, 6), pad_y: num(b.padT, 4, 40, 12), pad_x: num(b.padL, 8, 80, 22), font_size: num(b.fs, 11, 24, 16), weight: [400, 500, 600, 700].reduce((a, c) => (Math.abs(c - parseInt(b.fw, 10)) < Math.abs(a - parseInt(b.fw, 10)) ? c : a), 500), border: b.bw > 0 && hex(b.bc) ? { width: num(b.bw, 1, 4, 1), color: hex(b.bc) } : null, uppercase: b.tt === 'uppercase', pill: b.radius >= b.h / 2 - 1 } : null);
  const p = btn(m.primary), s = btn(m.secondary);
  const card = m.card ? { bg: hex(m.card.bg) ?? null, radius: num(m.card.radius, 0, 48, 12), shadow: cleanShadow(m.card.shadow), border: m.card.bw > 0 && hex(m.card.bc) ? { width: num(m.card.bw, 1, 3, 1), color: hex(m.card.bc) } : null, padding: num(m.card.padT, 8, 64, 24), seen: num(m.card.n, 0, 99, 0) } : null;
  const n = m.nav;
  return { system_version: SYSTEM_VERSION,
    container: { max_width: num(m.container, 640, 1500, 1200), gutter: num(m.vw ? Math.min(48, Math.max(16, (m.vw - (m.container ?? 1200)) / 2 || 24)) : 24, 12, 64, 24) },
    section: { padding_y: num(m.sectionPad, 24, 200, null) ?? num(m.sectionGap, 24, 200, 80) },
    type: { h1: typeOf(m.h1, { size: 48, weight: 600, line_height: 1.1 }), h2: typeOf(m.h2, { size: 32, weight: 600, line_height: 1.2 }), h3: typeOf(m.h3, { size: 22, weight: 600, line_height: 1.3 }), body: typeOf(m.body, { size: 17, weight: 400, line_height: 1.5 }), small: typeOf(m.small, { size: 13, weight: 400, line_height: 1.4 }) },
    nav: n ? { height: num(n.h, 32, 120, 56), bg: hex(n.bg) ?? '#FFFFFF', color: hex(n.color) ?? '#1F1F1F', link_size: num(n.linkSize, 11, 20, 14), link_weight: parseInt(n.linkWeight, 10) >= 600 ? 600 : 400, sticky: n.position === 'fixed' || n.position === 'sticky', blur: !!n.blur, translucent: !!n.translucent, border_bottom: n.borderB > 0, centered: !!n.centered } : null,
    button: { primary: p, secondary: s },
    card, input: m.input ? { radius: num(m.input.radius, 0, 40, 6), border: m.input.bw > 0 && hex(m.input.bc) ? hex(m.input.bc) : null, pad_y: num(m.input.padT, 4, 24, 10), pad_x: num(m.input.padL, 6, 32, 12), font_size: num(m.input.fs, 12, 20, 16), bg: hex(m.input.bg) } : null,
    footer: m.footer ? { bg: hex(m.footer.bg) ?? '#F5F5F7', color: hex(m.footer.color) ?? '#6E6E73', link_color: hex(m.footer.linkColor) ?? null, link_size: num(m.footer.linkSize, 10, 18, 12) } : null,
    link: m.link ? { color: hex(m.link.color) ?? null, underline: !!m.link.underline } : { color: null, underline: false },
    hero: m.hero ? { height: num(m.hero.h, 200, 1400, null), centered: !!m.hero.center, cta_gap: num(m.hero.ctaGap, 4, 48, 14) } : null,
    provenance: 'measured' };
}

// ---- strict schema: every field that can reach CSS is a finite number in range, a #RRGGBB colour, a boolean or a whitelisted keyword ----
const isNum = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const isHex = (v) => typeof v === 'string' && /^#[0-9A-F]{6}$/.test(v);
const isBool = (v) => typeof v === 'boolean';
const maybe = (f) => (v) => v === null || v === undefined || f(v);
const TYPE_SPEC = { size: (v) => isNum(v, 6, 200), weight: (v) => Number.isInteger(v) && v >= 100 && v <= 900, line_height: (v) => isNum(v, 0.8, 3), letter_spacing_em: (v) => isNum(v, -0.2, 0.5), transform: (v) => v === 'uppercase' || v === 'none', color: maybe(isHex) };
const BORDER = maybe((o) => o && typeof o === 'object' && isNum(o.width, 0, 8) && isHex(o.color));
const BTN = { bg: maybe(isHex), color: maybe(isHex), radius: (v) => isNum(v, 0, 1000), pad_y: (v) => isNum(v, 0, 100), pad_x: (v) => isNum(v, 0, 200), font_size: (v) => isNum(v, 8, 48), weight: (v) => Number.isInteger(v) && v >= 100 && v <= 900, border: BORDER, uppercase: isBool, pill: isBool };
const SCHEMA = {
  container: { max_width: (v) => isNum(v, 320, 3000), gutter: (v) => isNum(v, 0, 200) },
  section: { padding_y: (v) => isNum(v, 0, 400) },
  nav: { height: (v) => isNum(v, 16, 300), bg: isHex, color: isHex, link_size: (v) => isNum(v, 8, 40), link_weight: (v) => Number.isInteger(v) && v >= 100 && v <= 900, sticky: isBool, blur: isBool, translucent: isBool, border_bottom: isBool, centered: isBool },
  card: { bg: maybe(isHex), radius: (v) => isNum(v, 0, 200), shadow: maybe((v) => typeof v === 'string' && v.length < 120 && SHADOW.test(v)), border: BORDER, padding: (v) => isNum(v, 0, 200), seen: (v) => isNum(v, 0, 99) },
  input: { radius: (v) => isNum(v, 0, 200), border: maybe(isHex), pad_y: (v) => isNum(v, 0, 100), pad_x: (v) => isNum(v, 0, 100), font_size: (v) => isNum(v, 8, 40), bg: maybe(isHex) },
  footer: { bg: maybe(isHex), color: maybe(isHex), link_color: maybe(isHex), link_size: (v) => isNum(v, 8, 40) },
  link: { color: maybe(isHex), underline: isBool },
  hero: { height: maybe((v) => isNum(v, 100, 3000)), centered: isBool, cta_gap: (v) => isNum(v, 0, 200) },
};
const check = (obj, spec, path, errs) => {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) { errs.push(`${path} must be an object`); return; }
  for (const [k, f] of Object.entries(spec)) if (!f(obj[k])) errs.push(`${path}.${k} is invalid`);
};
export function validateSystem(sys) {
  if (!sys || typeof sys !== 'object' || Array.isArray(sys) || sys.system_version !== SYSTEM_VERSION) return [`system_version must be "${SYSTEM_VERSION}".`];
  const errs = [];
  check(sys.container, SCHEMA.container, 'container', errs); check(sys.section, SCHEMA.section, 'section', errs);
  for (const k of ['h1', 'h2', 'h3', 'body', 'small']) check(sys.type?.[k], TYPE_SPEC, `type.${k}`, errs);
  if (sys.nav != null) check(sys.nav, SCHEMA.nav, 'nav', errs);
  for (const k of ['primary', 'secondary']) if (sys.button?.[k] != null) check(sys.button[k], BTN, `button.${k}`, errs);
  for (const k of ['card', 'input', 'footer', 'hero']) if (sys[k] != null) check(sys[k], SCHEMA[k], k, errs);
  check(sys.link ?? { underline: false }, SCHEMA.link, 'link', errs);
  return errs;
}
export const lightOf = (hexc) => lightness(hexc ?? '#FFFFFF');
