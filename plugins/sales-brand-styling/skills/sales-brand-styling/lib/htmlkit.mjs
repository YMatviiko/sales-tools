// HTML kit: components (nav, hero, feature, cards, quote, cta, footer, buttons, inputs) rendered from the brand.
//   mode "prototype": the customer's real measured components (lib/system.mjs) -> same patterns, sizes, radii, nav behaviour.
//   mode "onepager":  the brand's design language only (colours, fonts, rhythm, imagery, alignment, scale, corners) with generic
//                     components, like the PowerPoint output.
// Content comes from JSON blocks; every string is escaped, hrefs are #anchors or https only, images are brand asset ids (data: URIs).
import { requireBrandSpec } from './brandspec.mjs';
import { requireStyle, dataUri } from './style.mjs';
import { slidePalette } from './palette.mjs';
import { withDefaults } from './design.mjs';
import { validateSystem } from './system.mjs';
import { fontStackFor } from './fonts.mjs';
import { bestInk, contrast, lightness } from './color.mjs';
import { assignTones } from './layouts.mjs';
import { checkChart, chartSvg, seriesColors } from './charts.mjs';
import { httpError } from './safeurl.mjs';
import { guardCss } from './style.mjs';
import { cornerOf, validateGraphics } from './graphics.mjs';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const rgba = (c, a) => `rgba(${[1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)).join(',')},${a})`;
const mixHex = (a, b, t) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t).toString(16).padStart(2, '0')).join('').toUpperCase();
const px = (n) => `${Math.round(n * 10) / 10}px`;
const inkOn = (bg, ink) => (lightness(bg) > 0.55 ? (ink && contrast(ink, bg) >= 4.5 ? ink : bestInk(bg)) : '#FFFFFF');

/** Component tokens: measured (prototype) or derived from the design language (onepager). */
export function tokens(spec, style, mode) {
  const P = slidePalette(spec), D = withDefaults(style?.design), sys = mode === 'prototype' ? style?.system : null;
  const G = style?.graphics; if (G) { const e = validateGraphics(G); if (e.length) throw httpError(400, 'Invalid graphics: ' + e.join('; ')); }
  if (sys) { const e = validateSystem(sys); if (e.length) throw httpError(400, 'Invalid system: ' + e.join('; ')); }
  const scale = { display: 56, standard: 44, compact: 34 }[D.heading_scale];
  const rad = { square: 2, soft: 10, pill: 999 }[D.corners], dens = { airy: 112, balanced: 80, dense: 56 }[D.density];
  const pill = (b) => b?.pill ? 999 : null;
  const gBtn = cornerOf(G, 'button', rad), gCard = cornerOf(G, 'card', Math.min(rad, 24)), gInput = cornerOf(G, 'input', Math.min(rad, 12)), flat = G?.shadow === 'none';
  const prim = sys?.button?.primary, sec = sys?.button?.secondary;
  const pbg = prim?.bg ?? P.primary;
  return {
    P, D, measured: !!sys, center: sys?.hero ? sys.hero.centered : D.align === 'center',
    container: sys?.container.max_width ?? (D.density === 'dense' ? 1240 : D.density === 'airy' ? 1080 : 1160), gutter: sys?.container.gutter ?? 24, sectionY: sys?.section.padding_y ?? dens,
    type: { h1: sys?.type.h1 ?? { size: scale, weight: 700, line_height: 1.08, letter_spacing_em: 0, transform: 'none' }, h2: sys?.type.h2 ?? { size: Math.round(scale * 0.66), weight: 700, line_height: 1.15, letter_spacing_em: 0, transform: 'none' },
      h3: sys?.type.h3 ?? { size: Math.round(scale * 0.46), weight: 600, line_height: 1.25, letter_spacing_em: 0, transform: 'none' }, body: sys?.type.body ?? { size: D.density === 'airy' ? 19 : 17, weight: 400, line_height: 1.5, letter_spacing_em: 0, transform: 'none' }, small: sys?.type.small ?? { size: 13, weight: 400, line_height: 1.4, letter_spacing_em: 0, transform: 'none' } },
    nav: sys?.nav ?? { height: 64, bg: P.contentBg, color: inkOn(P.contentBg, P.ink), link_size: 15, link_weight: 400, sticky: true, blur: false, translucent: false, border_bottom: true, centered: false },
    btn: { bg: pbg, color: contrast(pbg, prim?.color ?? '#FFFFFF') >= 3 ? (prim?.color ?? inkOn(pbg)) : inkOn(pbg), radius: pill(prim) ?? prim?.radius ?? gBtn, pad_y: prim?.pad_y ?? 12, pad_x: prim?.pad_x ?? 24, font_size: prim?.font_size ?? 16, weight: prim?.weight ?? 600, uppercase: !!prim?.uppercase },
    btn2: { color: sec?.color ?? P.primary, border: sec?.border?.color ?? sec?.color ?? P.primary, radius: pill(sec) ?? sec?.radius ?? (pill(prim) ?? prim?.radius ?? gBtn) },
    card: sys?.card ?? { bg: null, radius: gCard, shadow: flat || D.density === 'dense' ? null : '0 6px 24px rgba(0,0,0,0.08)', border: flat ? null : D.density === 'dense' ? { width: 1, color: '#D9DEE6' } : null, padding: 24 },
    input: sys?.input ?? { radius: gInput, border: '#B8C0CC', pad_y: 11, pad_x: 14, font_size: 16, bg: null },
    footer: sys?.footer ?? { bg: P.dark, color: inkOn(P.dark), link_color: null, link_size: 14 }, link: sys?.link ?? { color: null, underline: true },
    // Graphics language: media corners, gradient / pattern on dark sections, and the customer's own graphic-section style.
    mediaR: cornerOf(G, 'media', sys?.card?.radius ?? gCard), G,
    grad: G?.gradient?.used ? G.gradient : null, patt: G?.pattern?.used ? G.pattern : null,
    panel: (() => { const s = G?.section, bg = s?.bg ?? P.sectionBg; return { bg, ink: lightness(bg) > 0.55 ? (P.ink ?? '#1F1F1F') : '#FFFFFF', radius: s?.inset === false ? 0 : (s?.radius ?? gCard), inset: s ? s.inset : true, grad: !!s?.gradient }; })(),
    heroH: sys?.hero?.height ?? null, ctaGap: sys?.hero?.cta_gap ?? 14,
  };
}

const TYPE = (t, extra = '') => `font-weight:${t.weight};line-height:${t.line_height};${t.letter_spacing_em ? `letter-spacing:${t.letter_spacing_em}em;` : ''}${t.transform === 'uppercase' ? 'text-transform:uppercase;' : ''}${extra}`;
const FLUID = (size, min = 0.55) => `clamp(${px(size * min)},${(size / 14.4).toFixed(2)}vw + ${px(size * min * 0.4)},${px(size)})`;

export function kitCss(spec, style, mode = 'prototype', fontCss = '') {
  const T = tokens(spec, style, mode), { P } = T, ch = T.center ? 'center' : 'left', ink = P.ink ?? '#1F1F1F';
  const darkInk = '#FFFFFF', lightInk = inkOn(P.contentBg, ink), navFg = inkOn(T.nav.bg, T.nav.color);
  const navBg = T.nav.translucent ? rgba(T.nav.bg, 0.8) : T.nav.bg;
  const cardBg = T.card.bg ?? (lightness(P.contentBg) > 0.9 ? '#FFFFFF' : P.contentBg), cardInk = inkOn(cardBg, ink);
  const heading = fontStackFor(spec, 'heading'), body = fontStackFor(spec, 'body');
  const css = `${fontCss}
:root{--bx-primary:${P.primary};--bx-accent:${P.accent};--bx-dark:${P.sectionBg};--bx-light:${P.contentBg};--bx-ink:${lightInk};--bx-ink-dark:${darkInk};--bx-font-head:${heading};--bx-font-body:${body};--bx-radius:${px(T.card.radius)};--bx-container:${T.container}px;--bx-gutter:${T.gutter}px;--bx-section-y:${T.sectionY}px}
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bx-light);color:var(--bx-ink);font-family:var(--bx-font-body);font-size:${px(T.type.body.size)};${TYPE(T.type.body)}}
img{max-width:100%;display:block}
.bx-container{max-width:var(--bx-container);margin-inline:auto;padding-inline:max(var(--bx-gutter),16px)}
.bx-section{padding-block:min(var(--bx-section-y),14vw)}
.bx-tone-light{background:var(--bx-light);color:${lightInk}}
.bx-tone-dark{background:${T.grad ? `linear-gradient(${T.grad.angle}deg,var(--bx-dark),${lightness(T.grad.stops[1]) < 0.5 ? T.grad.stops[1] : mixHex(P.sectionBg, '#000000', 0.3)})` : 'var(--bx-dark)'};color:${darkInk}}
.bx-panel.bx-pattern{background-image:radial-gradient(${rgba('#FFFFFF', 0.14)} 1.5px,transparent 1.6px);background-size:18px 18px}
.bx-tone-dark .bx-muted{color:${rgba('#FFFFFF', 0.7)}}.bx-muted{color:${rgba(lightInk, 0.68)}}
.bx-h1,.bx-h2,.bx-h3{font-family:var(--bx-font-head);margin:0;text-wrap:balance}
.bx-h1{font-size:${FLUID(T.type.h1.size)};${TYPE(T.type.h1)}}
.bx-h2{font-size:${FLUID(T.type.h2.size, 0.62)};${TYPE(T.type.h2)}}
.bx-h3{font-size:${px(Math.min(T.type.h3.size, 30))};${TYPE(T.type.h3)}}
.bx-small{font-size:${px(T.type.small.size)};${TYPE(T.type.small)}}
.bx-p{margin:0;max-width:62ch}
.bx-link{color:${T.link.color ?? 'var(--bx-primary)'};text-decoration:${T.link.underline ? 'underline' : 'none'}}.bx-link:hover{text-decoration:underline}
.bx-btn{display:inline-flex;align-items:center;justify-content:center;gap:.4em;padding:${px(T.btn.pad_y)} ${px(T.btn.pad_x)};font:${T.btn.weight} ${px(T.btn.font_size)}/1.2 var(--bx-font-body);${T.btn.uppercase ? 'text-transform:uppercase;letter-spacing:.04em;' : ''}border:1px solid ${T.btn.bg};border-radius:${px(T.btn.radius)};background:${T.btn.bg};color:${T.btn.color};text-decoration:none;cursor:pointer;transition:filter .15s}
.bx-btn:hover{filter:brightness(.92)}.bx-btn:focus-visible,.bx-input:focus-visible,.bx-nav a:focus-visible{outline:2px solid var(--bx-accent);outline-offset:2px}
.bx-btn--secondary{background:transparent;color:${T.btn2.color};border-color:${T.btn2.border};border-radius:${px(T.btn2.radius)}}
.bx-tone-dark .bx-btn--secondary{color:${contrast(T.btn2.color, P.sectionBg) >= 3 ? T.btn2.color : '#FFFFFF'};border-color:${contrast(T.btn2.border, P.sectionBg) >= 3 ? T.btn2.border : '#FFFFFF'}}
.bx-btn-row{display:flex;flex-wrap:wrap;gap:${px(T.ctaGap)};justify-content:${T.center ? 'center' : 'flex-start'}}
.bx-nav{position:${T.nav.sticky ? 'sticky' : 'relative'};top:0;z-index:50;background:${navBg};color:${navFg};${T.nav.blur ? 'backdrop-filter:saturate(180%) blur(20px);-webkit-backdrop-filter:saturate(180%) blur(20px);' : ''}${T.nav.border_bottom ? `border-bottom:1px solid ${rgba(navFg, 0.14)};` : ''}}
.bx-nav__inner{display:flex;align-items:center;gap:24px;min-height:${px(T.nav.height)}}
.bx-nav__brand{font:700 ${px(T.nav.link_size + 4)}/1 var(--bx-font-head);color:inherit;text-decoration:none;display:flex;align-items:center;gap:10px}.bx-nav__brand img{height:${px(Math.max(16, T.nav.height * 0.5))};width:auto}
.bx-nav__links{display:flex;gap:${T.nav.centered ? 28 : 22}px;${T.nav.centered ? 'margin-inline:auto;' : 'margin-left:auto;'}list-style:none;padding:0;margin-block:0}
.bx-nav a{color:inherit;text-decoration:none;font-size:${px(T.nav.link_size)};font-weight:${T.nav.link_weight}}.bx-nav__links a{opacity:.85}.bx-nav__links a:hover{opacity:1}
.bx-nav .bx-btn{font-size:${px(Math.min(T.btn.font_size, T.nav.link_size + 1))};padding:${px(Math.min(T.btn.pad_y, 8))} ${px(Math.min(T.btn.pad_x, 16))};color:${T.btn.color}}
@media (max-width:760px){.bx-nav__links{display:none}.bx-nav__inner{justify-content:space-between}}
.bx-hero{text-align:${ch};${T.heroH ? `min-height:min(${T.heroH}px,86vh);` : ''}display:flex;align-items:center}
.bx-hero .bx-container{display:grid;gap:${px(Math.max(16, T.sectionY / 5))};justify-items:${T.center ? 'center' : 'start'}}
.bx-hero .bx-p{${T.center ? 'margin-inline:auto;' : ''}font-size:${px(T.type.body.size * 1.15)}}
.bx-statement{text-align:${ch}}.bx-statement .bx-container{display:grid;gap:20px;justify-items:${T.center ? 'center' : 'start'}}
.bx-statement .bx-h1{font-size:${FLUID(T.type.h1.size * 1.1)}}
.bx-feature .bx-container{display:grid;grid-template-columns:1fr 1fr;gap:clamp(24px,5vw,64px);align-items:center}
.bx-feature--reverse .bx-feature__text{order:2}.bx-feature__text{display:grid;gap:16px;justify-items:start}
.bx-feature--stack .bx-container{grid-template-columns:1fr;text-align:center;justify-items:center}.bx-feature--stack .bx-feature__text{justify-items:center}
@media (max-width:800px){.bx-feature .bx-container{grid-template-columns:1fr}.bx-feature--reverse .bx-feature__text{order:0}}
.bx-media{border-radius:${px(T.mediaR)};overflow:hidden;background:${rgba('#808080', 0.12)}}.bx-media img{width:100%;height:100%;object-fit:cover}
.bx-section-head{display:grid;gap:12px;margin-bottom:clamp(24px,4vw,48px);text-align:${ch};justify-items:${T.center ? 'center' : 'start'}}
.bx-grid{display:grid;gap:${px(Math.max(16, T.card.padding))};grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr))}
.bx-card{background:${cardBg};color:${cardInk};border-radius:${px(T.card.radius)};padding:${px(T.card.padding)};${T.card.shadow ? `box-shadow:${T.card.shadow};` : ''}${T.card.border ? `border:${px(T.card.border.width)} solid ${T.card.border.color};` : ''}display:grid;gap:10px;align-content:start}
.bx-tone-dark .bx-card{background:${rgba('#FFFFFF', 0.08)};color:#FFFFFF;box-shadow:none}
.bx-card .bx-media{margin:-${px(T.card.padding)} -${px(T.card.padding)} 6px;border-radius:0}
.bx-quote{text-align:${ch}}.bx-quote blockquote{margin:0 ${T.center ? 'auto' : '0'};max-width:30ch;font:italic ${T.type.h2.weight} ${FLUID(T.type.h2.size * 1.1)}/1.25 var(--bx-font-head)}.bx-quote cite{display:block;margin-top:20px;font-style:normal}
.bx-input{width:100%;padding:${px(T.input.pad_y)} ${px(T.input.pad_x)};font:400 ${px(T.input.font_size)}/1.3 var(--bx-font-body);border:1px solid ${T.input.border ?? 'currentColor'};border-radius:${px(T.input.radius)};background:${T.input.bg ?? '#FFFFFF'};color:#1F1F1F}
.bx-field{display:grid;gap:6px}.bx-label{font-size:${px(T.type.small.size)};font-weight:600}
.bx-form{display:grid;gap:14px;max-width:420px;${T.center ? 'margin-inline:auto;' : ''}}
.bx-cta{text-align:${ch}}.bx-cta .bx-container{display:grid;gap:18px;justify-items:${T.center ? 'center' : 'start'}}
.bx-footer{background:${T.footer.bg};color:${inkOn(T.footer.bg, T.footer.color)};padding-block:clamp(32px,5vw,56px);font-size:${px(T.footer.link_size)}}
.bx-footer a{color:${T.footer.link_color && contrast(T.footer.link_color, T.footer.bg) >= 3 ? T.footer.link_color : 'inherit'};text-decoration:none}.bx-footer a:hover{text-decoration:underline}
.bx-footer__cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:28px;margin-bottom:28px}.bx-footer h4{margin:0 0 10px;font-size:${px(T.footer.link_size)};font-weight:600}.bx-footer ul{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.bx-footer__legal{opacity:.75;border-top:1px solid ${rgba(inkOn(T.footer.bg, T.footer.color), 0.18)};padding-top:18px}
/* graphic section: the customer's own highlighted panel (inset, rounded, coloured; numbers or a call to action inside) */
.bx-panel{background:${T.panel.grad && T.grad ? `linear-gradient(${T.grad.angle}deg,${T.panel.bg},${mixHex(T.panel.bg, '#000000', 0.3)})` : T.panel.bg};color:${T.panel.ink};border-radius:${px(T.panel.radius)};padding:clamp(28px,5vw,56px);display:grid;gap:clamp(18px,3vw,32px)}
.bx-panel .bx-muted{color:${rgba(T.panel.ink, 0.75)}}.bx-panel .bx-h2{color:${T.panel.ink}}
.bx-panel .bx-btn{background:${lightness(T.panel.bg) < 0.5 ? '#FFFFFF' : T.btn.bg};color:${lightness(T.panel.bg) < 0.5 ? (contrast(T.panel.bg, '#FFFFFF') >= 3 ? T.panel.bg : '#1F1F1F') : T.btn.color};border-color:transparent}
.bx-stats{display:grid;gap:clamp(16px,3vw,32px);grid-template-columns:repeat(auto-fit,minmax(min(100%,150px),1fr))}.bx-stat{display:grid;gap:4px}
.bx-stat b{font:${T.type.h2.weight} ${FLUID(T.type.h2.size * 1.1, 0.6)}/1.1 var(--bx-font-head)}.bx-stat span{font-size:${px(T.type.small.size + 1)};opacity:.85}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}`.replace(/\n{2,}/g, '\n');
  return guardCss(css);
}

// ---------- blocks -> HTML ----------
const BLOCK_LAYOUT = { panel: 'content', hero: 'title', statement: 'statement', feature: 'image', cards: 'two-column', text: 'content', quote: 'quote', cta: 'closing', chart: 'chart' };
const href = (h) => (/^#[\w-]{0,60}$/.test(h ?? '') || /^https:\/\/[^\s"'<>]{1,300}$/.test(h ?? '') ? h : '#');
const BLOCKS = new Set(['nav', 'panel', 'hero', 'statement', 'feature', 'cards', 'text', 'quote', 'cta', 'form', 'footer', 'chart']);

const arr = (v, max, what, i) => { if (v === undefined) return []; if (!Array.isArray(v) || v.length > max) throw httpError(400, `block ${i + 1}: ${what} must be a list of at most ${max}.`); return v; };
const obj = (v, what, i) => { if (!v || typeof v !== 'object' || Array.isArray(v)) throw httpError(400, `block ${i + 1}: each ${what} must be an object.`); return v; };
export function checkBlocks(blocks) {
  if (!Array.isArray(blocks) || !blocks.length || blocks.length > 40) throw httpError(400, 'blocks must be a non-empty array (max 40).');
  blocks.forEach((b, i) => {
    obj(b, 'block', i);
    if (!BLOCKS.has(b.type)) throw httpError(400, `block ${i + 1}: type must be one of ${[...BLOCKS].join(', ')}.`);
    if (b.tone !== undefined && b.tone !== 'light' && b.tone !== 'dark') throw httpError(400, `block ${i + 1}: tone must be light or dark.`);
    if (b.id !== undefined && !/^[\w-]{1,40}$/.test(String(b.id))) throw httpError(400, `block ${i + 1}: id may only contain letters, digits, - and _.`);
    const items = arr(b.items, 12, 'items', i).map((x) => obj(x, 'item', i)), links = arr(b.links, 12, 'links', i).map((x) => obj(x, 'link', i)), ctas = arr(b.ctas, 4, 'ctas', i).map((x) => obj(x, 'cta', i));
    const paragraphs = arr(b.paragraphs, 12, 'paragraphs', i), fields = arr(b.fields, 8, 'fields', i).map((x) => obj(x, 'field', i)), columns = arr(b.columns, 6, 'columns', i).map((x) => obj(x, 'column', i));
    const colLinks = columns.flatMap((c) => arr(c.links, 12, 'column links', i).map((x) => obj(x, 'link', i)));
    if (b.cta !== undefined) obj(b.cta, 'cta', i);
    if (b.type === 'chart') checkChart(b.chart, `block ${i + 1} chart`);
    const strs = [b.title, b.text, b.subtitle, b.brand, b.cite, b.legal, b.alt, ...paragraphs, ...links.map((l) => l.text), ...items.flatMap((it) => [it.title, it.text, it.alt]), ...ctas.map((c) => c.text), b.cta?.text, ...fields.flatMap((f) => [f.label, f.placeholder]), ...columns.map((c) => c.title), ...colLinks.map((l) => l.text)].filter((x) => x !== undefined);
    if (strs.some((x) => typeof x !== 'string' || x.length > 600)) throw httpError(400, `block ${i + 1}: text must be strings up to 600 characters.`);
    for (const x of [b.image, ...items.map((it) => it.image)]) if (x !== undefined && !/^[a-z0-9-]{1,40}$/.test(String(x))) throw httpError(400, `block ${i + 1}: image must be a brand asset id.`);
  });
}

export function pageBody(spec, style, blocks, mode = 'prototype') {
  checkBlocks(blocks);
  const assets = style?.assets ?? [], asset = (id) => (id ? assets.find((a) => a.id === id) : null);
  const logo = assets.find((a) => a.role === 'logo');
  const fakeSlides = blocks.filter((b) => b.type !== 'nav' && b.type !== 'footer').map((b) => ({ layout: BLOCK_LAYOUT[b.type] ?? 'content', tone: b.tone }));
  const tones = fakeSlides.length ? assignTones(fakeSlides, spec, style) : [];
  let ti = 0;
  const T = tokens(spec, style, mode);
  const btn = (c, secondary) => `<a class="bx-btn${secondary ? ' bx-btn--secondary' : ''}" href="${esc(href(c.href))}">${esc(c.text)}</a>`;
  const media = (b, cls = '') => { const a = asset(b.image); return a ? `<div class="bx-media ${cls}" style="aspect-ratio:${Number(a.width) | 0}/${(Number(a.height) | 0) > (Number(a.width) | 0) * 0.45 ? Number(a.height) | 0 : Math.round((Number(a.width) | 0) * 0.5)};max-height:560px"><img alt="${esc(b.alt ?? '')}" src="${dataUri(a)}"></div>` : ''; };
  const out = blocks.map((b, i) => {
    if (b.type === 'nav') {
      const links = (b.links ?? []).map((l) => `<li><a href="${esc(href(l.href))}">${esc(l.text)}</a></li>`).join('');
      return `<header class="bx-nav"><div class="bx-container bx-nav__inner"><a class="bx-nav__brand" href="#top">${logo && logo.mime !== 'image/svg+xml' ? `<img alt="" src="${dataUri(logo)}">` : ''}${esc(b.brand ?? '')}</a><ul class="bx-nav__links">${links}</ul>${b.cta ? btn(b.cta) : ''}</div></header>`;
    }
    if (b.type === 'footer') {
      const cols = (b.columns ?? []).map((c) => `<div><h4>${esc(c.title)}</h4><ul>${(c.links ?? []).map((l) => `<li><a href="${esc(href(l.href))}">${esc(l.text)}</a></li>`).join('')}</ul></div>`).join('');
      return `<footer class="bx-footer"><div class="bx-container">${cols ? `<div class="bx-footer__cols">${cols}</div>` : ''}<div class="bx-footer__legal">${esc(b.legal ?? '')}</div></div></footer>`;
    }
    const tone = tones[ti++] === 'dark' ? 'dark' : 'light', cls = `bx-section bx-tone-${tone}`, id = b.id && /^[\w-]{1,40}$/.test(b.id) ? ` id="${b.id}"` : '';
    const ctas = (b.ctas ?? []).map((c, k) => btn(c, k > 0)).join('');
    if (b.type === 'panel') return `<section${id} class="${cls}"><div class="bx-container"><div class="bx-panel${T.patt ? ' bx-pattern' : ''}"><div class="bx-section-head" style="margin:0"><h2 class="bx-h2">${esc(b.title)}</h2>${b.subtitle ? `<p class="bx-p bx-muted">${esc(b.subtitle)}</p>` : ''}</div>${(b.items ?? []).length ? `<div class="bx-stats">${b.items.map((it) => `<div class="bx-stat"><b>${esc(it.title)}</b><span>${esc(it.text ?? '')}</span></div>`).join('')}</div>` : ''}${ctas ? `<div class="bx-btn-row">${ctas}</div>` : ''}</div></div></section>`;
    if (b.type === 'hero') return `<section${id} class="${cls} bx-hero"><div class="bx-container"><h1 class="bx-h1">${esc(b.title)}</h1>${b.subtitle ? `<p class="bx-p bx-muted">${esc(b.subtitle)}</p>` : ''}${ctas ? `<div class="bx-btn-row">${ctas}</div>` : ''}${b.image ? media(b, 'bx-hero__media') : ''}</div></section>`;
    if (b.type === 'statement') return `<section${id} class="${cls} bx-statement"><div class="bx-container"><h2 class="bx-h1">${esc(b.title)}</h2>${b.subtitle ? `<p class="bx-p bx-muted">${esc(b.subtitle)}</p>` : ''}${ctas ? `<div class="bx-btn-row">${ctas}</div>` : ''}</div></section>`;
    if (b.type === 'feature') { const stack = T.center && T.D.imagery === 'image-led'; return `<section${id} class="${cls} bx-feature${b.reverse ? ' bx-feature--reverse' : ''}${stack ? ' bx-feature--stack' : ''}"><div class="bx-container"><div class="bx-feature__text"><h2 class="bx-h2">${esc(b.title)}</h2>${b.text ? `<p class="bx-p bx-muted">${esc(b.text)}</p>` : ''}${ctas ? `<div class="bx-btn-row">${ctas}</div>` : ''}</div>${media(b)}</div></section>`; }
    if (b.type === 'cards') return `<section${id} class="${cls}"><div class="bx-container"><div class="bx-section-head"><h2 class="bx-h2">${esc(b.title)}</h2>${b.subtitle ? `<p class="bx-p bx-muted">${esc(b.subtitle)}</p>` : ''}</div><div class="bx-grid">${(b.items ?? []).map((it) => `<article class="bx-card">${it.image ? media(it) : ''}<h3 class="bx-h3">${esc(it.title)}</h3>${it.text ? `<p class="bx-p bx-muted">${esc(it.text)}</p>` : ''}</article>`).join('')}</div></div></section>`;
    if (b.type === 'text') return `<section${id} class="${cls}"><div class="bx-container"><div class="bx-section-head"><h2 class="bx-h2">${esc(b.title)}</h2></div>${(b.paragraphs ?? []).map((p) => `<p class="bx-p" style="margin-bottom:1em">${esc(p)}</p>`).join('')}</div></section>`;
    if (b.type === 'chart') { const bg = tone === 'dark' ? T.P.sectionBg : T.P.contentBg, ink = tone === 'dark' ? '#FFFFFF' : (T.P.ink ?? '#1F1F1F'); return `<section${id} class="${cls}"><div class="bx-container"><div class="bx-section-head"><h2 class="bx-h2">${esc(b.title)}</h2>${b.subtitle ? `<p class="bx-p bx-muted">${esc(b.subtitle)}</p>` : ''}</div><figure style="margin:0">${chartSvg({ chart: b.chart, colors: seriesColors(spec, b.chart, bg, inkOn(bg, ink)), ink: inkOn(bg, ink), bg, w: 960, h: 480, font: fontStackFor(spec, 'body'), labelPt: 15 })}${(b.chart.source || b.chart.sample) ? `<figcaption class="bx-small bx-muted" style="margin-top:10px">${esc(`${b.chart.sample ? 'Sample data. ' : ''}${b.chart.source ?? ''}`.trim())}</figcaption>` : ''}</figure></div></section>`; }
    if (b.type === 'quote') return `<section${id} class="${cls} bx-quote"><div class="bx-container"><blockquote>${esc(b.text)}</blockquote>${b.cite ? `<cite class="bx-muted">${esc(b.cite)}</cite>` : ''}</div></section>`;
    if (b.type === 'cta') return `<section${id} class="${cls} bx-cta"><div class="bx-container"><h2 class="bx-h1">${esc(b.title)}</h2>${b.subtitle ? `<p class="bx-p bx-muted">${esc(b.subtitle)}</p>` : ''}<div class="bx-btn-row">${ctas}</div></div></section>`;
    if (b.type === 'form') return `<section${id} class="${cls}"><div class="bx-container"><div class="bx-section-head"><h2 class="bx-h2">${esc(b.title)}</h2></div><form class="bx-form" onsubmit="return false">${(b.fields ?? []).map((f, k) => `<div class="bx-field"><label class="bx-label" for="f${i}-${k}">${esc(f.label)}</label><input class="bx-input" id="f${i}-${k}" type="${/^(email|text|tel|search)$/.test(f.kind) ? f.kind : 'text'}" placeholder="${esc(f.placeholder ?? '')}"></div>`).join('')}${b.cta ? `<button class="bx-btn" type="submit">${esc(b.cta.text)}</button>` : ''}</form></div></section>`;
    return '';
  });
  return out.join('\n');
}

export function pageHtml({ brand_spec: spec, brand_style: style, blocks, mode = 'prototype', title, fontCss = '' }) {
  requireBrandSpec(spec); requireStyle(style);
  if (!['prototype', 'onepager'].includes(mode)) throw httpError(400, 'mode must be prototype or onepager.');
  if (mode === 'prototype' && !style?.system) throw httpError(422, 'No measured components for this brand (it needs a live-page measurement). Use mode "onepager", or measure a site with a browser available.');
  const body = pageBody(spec, style, blocks, mode);
  return `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title ?? 'Page')}</title>\n<style>\n${kitCss(spec, style, mode, fontCss)}\n</style></head>\n<body id="top">\n${body}\n</body></html>`;
}

/** Reference sheet: every measured component on one page, to confirm "yes, that's their nav/buttons/cards". */
export function componentsSheet({ brand_spec: spec, brand_style: style, mode = 'prototype', fontCss = '' }) {
  const blocks = [
    { type: 'nav', brand: 'Brand', links: [{ text: 'Products', href: '#' }, { text: 'Solutions', href: '#' }, { text: 'Pricing', href: '#' }, { text: 'Support', href: '#' }], cta: { text: 'Get started', href: '#' } },
    { type: 'hero', title: 'A headline in their style', subtitle: 'One supporting line that sets up the page.', ctas: [{ text: 'Primary action', href: '#' }, { text: 'Secondary action', href: '#' }] },
    { type: 'statement', title: 'One clear message, said big.', subtitle: 'A short line that supports it.' },
    { type: 'cards', title: 'Cards', items: [{ title: 'First card', text: 'Short supporting text.' }, { title: 'Second card', text: 'Short supporting text.' }, { title: 'Third card', text: 'Short supporting text.' }] },
    { type: 'form', title: 'Form', fields: [{ label: 'Email', kind: 'email', placeholder: 'name@company.com' }], cta: { text: 'Submit' } },
    { type: 'footer', columns: [{ title: 'Company', links: [{ text: 'About', href: '#' }, { text: 'Careers', href: '#' }] }, { title: 'Support', links: [{ text: 'Contact', href: '#' }, { text: 'Help', href: '#' }] }], legal: '© Brand. All rights reserved.' },
  ];
  return pageHtml({ brand_spec: spec, brand_style: style, blocks, mode, title: 'Components', fontCss });
}

// ---------- checker for hand-edited prototypes ----------
const HEXRE = /#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g, RGBRE = /rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/g;
export function checkHtml(html, spec, style) {
  const allowed = new Set(['#FFFFFF', '#000000']), add = (c) => { if (/^#[0-9a-f]{6}$/i.test(c ?? '')) allowed.add(c.toUpperCase()); };
  const c = spec.colors; [c.primary, c.secondary, ...(c.accents ?? []), ...(c.neutrals ?? []), ...(c.surfaces ?? []).map((s) => s.hex)].forEach(add);
  const TK = tokens(spec, style, style?.system ? 'prototype' : 'onepager'), { P } = TK; [P.light, P.dark, P.ink, P.titleBg, P.sectionBg, P.contentBg, P.accent].forEach(add);
  JSON.stringify({ ...TK, P: undefined }).match(/#[0-9A-Fa-f]{6}/g)?.forEach(add);                // the kit's own derived colours are on-brand by construction
  const sys = style?.system; if (sys) JSON.stringify(sys).match(/#[0-9A-F]{6}/g)?.forEach(add);
  const norm3 = (h) => (h.length === 4 ? '#' + [...h.slice(1)].map((x) => x + x).join('') : h).toUpperCase();
  const near = (h) => [...allowed].some((a) => { const v = (x, i) => parseInt(x.slice(i, i + 2), 16); return Math.hypot(v(h, 1) - v(a, 1), v(h, 3) - v(a, 3), v(h, 5) - v(a, 5)) < 14; });
  const css = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n') + '\n' + [...html.matchAll(/\sstyle="([^"]*)"/gi)].map((m) => m[1]).join('\n');
  const body = css.replace(/url\(data:[^)]*\)/g, '').replace(/@font-face\s*\{[^}]*\}/g, '');
  const errors = [], warnings = [], seen = new Set();
  for (const m of body.matchAll(HEXRE)) { const h = norm3(m[0]); if (!seen.has(h) && !near(h)) { seen.add(h); errors.push(`colour ${h} is not in the brand palette`); } }
  for (const m of body.matchAll(RGBRE)) { const h = '#' + [m[1], m[2], m[3]].map((n) => (+n).toString(16).padStart(2, '0')).join('').toUpperCase(); if (!seen.has(h) && !near(h) && !['#000000', '#FFFFFF', '#808080'].includes(h)) { seen.add(h); errors.push(`colour ${h} (rgb) is not in the brand palette`); } }
  const fonts = new Set([spec.typography.heading_font, spec.typography.body_font, spec.typography.font_resolution?.heading?.web_fallback, spec.typography.font_resolution?.body?.web_fallback].filter(Boolean).map((f) => f.toLowerCase()));
  const generic = new Set(['sans-serif', 'serif', 'monospace', 'cursive', 'system-ui', 'inherit', 'initial', 'currentcolor']);
  for (const m of body.matchAll(/font-family\s*:\s*([^;}{]+)/gi)) for (const f of m[1].split(',').map((x) => x.trim().replace(/^["']|["']$/g, '').toLowerCase())) if (f && !f.startsWith('var(') && !generic.has(f) && !fonts.has(f)) errors.push(`font "${f}" is not the brand font`);
  for (const m of html.matchAll(/<(script|link|img|iframe)\b[^>]*(?:src|href)=["'](https?:\/\/[^"']+)/gi)) if (!/fonts\.(googleapis|gstatic)\.com/.test(m[2]) && m[1].toLowerCase() !== 'a') warnings.push(`external ${m[1]} ${m[2].slice(0, 60)} (the page should be self-contained)`);
  const uses = (html.match(/class="[^"]*\bbx-/g) ?? []).length;
  if (!uses) warnings.push('no bx- components used: build from the kit so the patterns match the customer\'s site');
  return { ok: !errors.length, errors: [...new Set(errors)], warnings: [...new Set(warnings)], component_uses: uses };
}
