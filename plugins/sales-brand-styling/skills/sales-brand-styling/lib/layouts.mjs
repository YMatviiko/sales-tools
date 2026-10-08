// Slide layouts, defined ONCE and consumed three ways: the PowerPoint masters (draft.mjs), the deck preview (draft.mjs)
// and the brand board (board.mjs). Everything adapts to the brand's measured design language (design.mjs):
//   align         centred or left-aligned titles (Apple centres; most corporate sites don't)
//   heading_scale display-size, standard or compact headlines
//   density       airy brands get wide margins, no decorative bars and a calmer body size; dense ones get tighter margins
//   imagery       image-led brands get image layouts (large picture + short headline); text-led brands keep the picture small
import { slidePalette } from './palette.mjs';
import { withDefaults } from './design.mjs';
import { bestInk, contrast, lightness } from './color.mjs';
import { dataUri, isRaster } from './style.mjs';
import { chartSvg, seriesColors } from './charts.mjs';
import { cornerOf } from './graphics.mjs';
import { decodePng } from './png.mjs';

export const W = 13.333, H = 7.5;
export const LAYOUTS = ['title', 'section', 'content', 'two-column', 'quote', 'closing', 'statement', 'image', 'chart', 'highlight', 'catalog', 'catalog-panel'];
// Catalog slide types (lib/catalog.mjs) all sit on the one `catalog` layout: a headline in the header band; everything else is drawn
// (shapes, tables, pictures). They are registered by catalog.mjs so layouts.mjs does not depend on it.
const CATALOG = new Set(), PANEL_OK = new Set();
export const registerCatalog = (names, panelOk = []) => { names.forEach((n) => CATALOG.add(n)); panelOk.forEach((n) => PANEL_OK.add(n)); };
export const isCatalogName = (n) => CATALOG.has(n);
// A catalog slide sits on one of two compositions: `catalog` (headline on top, content below) or `catalog-panel` (a full-height brand panel
// with the headline on the left, content on the right).
export const layoutKey = (n, comp) => (CATALOG.has(n) ? (comp === 'panel' ? 'catalog-panel' : 'catalog') : n);
/** Composition per slide: eligible catalog slides alternate panel / top so a deck has rhythm; an explicit `comp` wins. prevPanel = the slide before was a panel. */
export function assignComp(slides, prevPanel = false) {
  let last = prevPanel;
  return slides.map((s) => {
    if (!CATALOG.has(s.layout)) { last = false; return undefined; }
    const comp = s.comp ?? (PANEL_OK.has(s.layout) && !last ? 'panel' : 'top');
    last = comp === 'panel'; return comp;
  });
}
export const masterName = (l) => 'BRAND_' + l.toUpperCase().replace('-', '_');
// Layouts whose background tone (light/dark) can follow the site's rhythm. `<name>:alt` is the opposite tone of the default.
export const FLEX_LAYOUTS = ['content', 'two-column', 'statement', 'image', 'chart', 'catalog', 'catalog-panel'];
export const altKey = (l) => `${l}:alt`;
export const masterNames = () => [...LAYOUTS.map(masterName), ...FLEX_LAYOUTS.map((l) => masterName(l) + '_ALT')];
export const masterFor = (layout0, tone, defaults, comp) => { const layout = layoutKey(layout0, comp); return (FLEX_LAYOUTS.includes(layout) && tone && defaults?.[layout] && tone !== defaults[layout] ? masterName(layout) + '_ALT' : masterName(layout)); };
const PT_TO_CQW = 100 / (W * 72);                     // 1pt in container-query width units, so previews scale like the slide
export const cqw = (pt) => `${(pt * PT_TO_CQW).toFixed(3)}cqw`;

const SCALE = {
  display: { title: 60, section: 48, content: 36, statement: 66, quote: 40, imageTitle: 40 },
  standard: { title: 44, section: 38, content: 30, statement: 54, quote: 34, imageTitle: 32 },
  compact: { title: 36, section: 32, content: 26, statement: 44, quote: 30, imageTitle: 28 },
};
const hex = (c) => '#' + c.replace('#', '').toUpperCase();
const mix = (a, b, t) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t).toString(16).padStart(2, '0')).join('').toUpperCase();

/** The picture a slide should show: the outline's `image` id, else the best brand asset (raster only, photos/heroes first). */
export function pickImage(style, id) {
  const raster = (style?.assets ?? []).filter(isRaster);
  if (id) return raster.find((a) => a.id === id) ?? null;
  const rank = { hero: 0, photo: 1, illustration: 2, logo: 9 };
  // Real photographs first (a JPEG with some weight); a PNG banner/card (e.g. a social-share logo card) only when nothing better exists.
  const photo = (a) => (a.mime === 'image/jpeg' && (a.bytes ?? a.content_base64.length * 0.75) > 25_000 ? 0 : 1);
  return [...raster].filter((a) => a.role !== 'logo').sort((a, b) => photo(a) - photo(b) || (rank[a.role] ?? 5) - (rank[b.role] ?? 5) || b.width * b.height - a.width * a.height)[0] ?? null;
}
const ART = new WeakMap();
/** A transparent PNG graphic (artwork) rather than a photograph: it needs a light surface behind it to be seen. */
export function isArtwork(a) {
  if (!a || a.mime !== 'image/png') return false;
  if (!ART.has(a)) { let v = false; try { const img = decodePng(Buffer.from(a.content_base64, 'base64')); if (img.ctype === 6) { const px = (x, y) => img.data[(y * img.width + x) * 4 + 3]; v = [px(0, 0), px(img.width - 1, 0), px(0, img.height - 1), px(img.width - 1, img.height - 1)].every((al) => al < 40); } } catch { /* not decodable: treat as a photo */ } ART.set(a, v); }
  return ART.get(a);
}
/** Is the logo dark (so it disappears on a dark slide)? Measured on its opaque pixels; unknown -> assume it is fine. */
const LOGO_DARK = new WeakMap();
export function logoIsDark(a) {
  if (!a || a.mime !== 'image/png') return false;
  if (!LOGO_DARK.has(a)) { let v = false; try { const img = decodePng(Buffer.from(a.content_base64, 'base64')); if (img.ctype === 6 || img.ctype === 2) { let n = 0, sum = 0; const ch = img.channels; for (let i = 0; i < img.width * img.height; i += 3) { if (ch === 4 && img.data[i * 4 + 3] < 128) continue; const o = i * ch; sum += (0.2126 * img.data[o] + 0.7152 * img.data[o + 1] + 0.0722 * img.data[o + 2]) / 255; n++; } v = n > 20 && sum / n < 0.5; } } catch { /* unknown */ } LOGO_DARK.set(a, v); }
  return LOGO_DARK.get(a);
}
/** The brand's best picture for the title slide: only when it is big enough to fill the frame. */
export function titlePicture(style, id) { const a = id ? pickImage(style, id) : pickImage(style); return a && Math.min(a.width, a.height) >= 600 ? a : null; }
export const imageFit = () => 'cover';   // pictures fill their frame (centre-cropped); a picture floating small in a big frame reads as a mistake

const ok6 = (c) => /^#[0-9A-Fa-f]{6}$/.test(c);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const isHex = (c) => typeof c === 'string' && /^#[0-9A-Fa-f]{6}$/.test(c);

/**
 * The slide text styles (H1, H2, H3, body): measured on the customer's page when we have them (`style.system.type`),
 * otherwise the generic scale for the brand's heading size. Sizes are scaled from web pixels to slide points, but kept inside
 * a range that stays readable on a slide; weight, line height and colour are taken over as measured.
 */
export function typeScale(style) {
  const D = withDefaults(style?.design), G = SCALE[D.heading_scale], T = style?.system?.type ?? {};
  const bodyDef = { airy: 22, balanced: 20, dense: 18 }[D.density];
  const ok = (t) => t && Number.isFinite(t.size) && t.size > 0;
  const bold = (t, d = true) => (t && t.weight !== undefined ? parseInt(t.weight, 10) >= 600 : d);
  const lh = (t, d = 1.15) => (t && Number.isFinite(t.line_height) ? clamp(t.line_height, 1.0, 1.4) : d);
  const col = (t) => (t && isHex(t.color) ? t.color.toUpperCase() : null);
  const h1 = ok(T.h1) ? T.h1 : null, h2 = ok(T.h2) ? T.h2 : null, h3 = ok(T.h3) ? T.h3 : null, body = ok(T.body) ? T.body : null;
  const title = h1 ? clamp(Math.round(h1.size * 0.62), 36, 66) : G.title;
  const heading = h2 ? clamp(Math.round(h2.size * 0.95), 26, 40) : G.content;
  return {
    measured: !!(h1 || h2 || body),
    S: { ...G, title, section: h1 ? clamp(Math.round(h1.size * 0.5), 32, 54) : G.section, content: heading, statement: h1 ? clamp(Math.round(h1.size * 0.68), 44, 72) : G.statement,
         quote: G.quote, imageTitle: h1 ? clamp(Math.round(h1.size * 0.42), 28, 44) : G.imageTitle, sub: h3 ? clamp(Math.round(h3.size * 1.2), 18, 26) : 20 },
    bodyPt: body ? clamp(Math.round(body.size * 1.3), 16, 24) : bodyDef,
    weight: { h1: bold(h1), h2: bold(h2), h3: bold(h3) },
    lh: { h1: lh(h1, 1.1), h2: lh(h2, 1.15), body: lh(body, 1.4) },
    color: { h1: col(h1), h2: col(h2), h3: col(h3), body: col(body) },
  };
}

/** One-line description of the slide text styles, for reports. */
export function typeReport(style) {
  const t = typeScale(style), w = (b) => (b ? 'bold' : 'regular');
  return `text styles${t.measured ? ' (measured on their site)' : ' (generic scale: the site gave no type sizes)'}: title ${t.S.title}pt ${w(t.weight.h1)}, slide heading ${t.S.content}pt ${w(t.weight.h2)}, sub-heading ${t.S.sub}pt, body ${t.bodyPt}pt${t.color.h1 ? `, headings ${t.color.h1}` : ''}`;
}

export function layoutSpecs(spec, style) {
  const P = slidePalette(spec), D = withDefaults(style?.design), TS = typeScale(style), S = TS.S;
  const center = D.align === 'center', al = center ? 'center' : 'left';
  const margin = { airy: 1.2, balanced: 0.85, dense: 0.6 }[D.density], inner = W - 2 * margin;
  const bar = D.density !== 'airy';                    // minimalist brands carry no decorative rules
  const bodyPt = TS.bodyPt;
  const inkOn = (bg) => (lightness(bg) > 0.55 ? (contrast(P.ink, bg) >= 4.5 ? P.ink : bestInk(bg)) : '#FFFFFF');
  // Heading colour on a background: the site's own heading colour when it reads well there, else the slide ink.
  const headOn = (bg, k = 'h2') => { const c = TS.color[k] ?? TS.color.h1; return c && contrast(c, bg) >= 4.5 ? c : (bg === P.contentBg && P.headingOnContent && contrast(P.headingOnContent, bg) >= 4.5 ? P.headingOnContent : inkOn(bg)); };
  // A colour for rules and highlights that stands out from `bg`: a bright brand colour on dark slides, the main colour on light ones.
  const popOn = (bg) => [P.accent, P.primary, P.secondary, ...P.accents].find((c) => c && lightness(c) > 0.1 && contrast(c, bg) >= 2.2) ?? inkOn(bg);
  const dark = lightness(P.titleBg) < 0.4;
  const T = (name, type, x, y, w, h, o) => ({ name, type, x, y, w, h, align: al, valign: 'top', ...o });
  const logoBox = center ? { x: (W - 1.8) / 2, y: 0.55, w: 1.8, h: 0.65 } : { x: margin, y: 0.5, w: 1.8, h: 0.7 };
  // Graphics language measured on the site: corner radii per element, gradients, tiled patterns, inset graphic sections.
  const G = style?.graphics, inch = (px) => Math.round(Math.min(px, 40) / 96 * 100) / 100;
  const cardR = G?.corners?.card ? inch(G.corners.card) : 0, mediaR = G?.corners?.media ? inch(G.corners.media) : 0, secR = G?.section?.radius ? inch(G.section.radius) : cardR;
  const inset = !!G?.section?.inset, grad = G?.gradient?.used ? G.gradient : null, patt = G?.pattern?.used ? G.pattern : null;
  const rect = (x, y, w, h, fill, o = {}) => ({ type: 'rect', x, y, w, h, fill, ...o });
  // A colour field that follows the site's gradient (when it uses one) and keeps the brand colour as its solid fallback.
  const field = (x, y, w, h, fill, o = {}) => (grad && lightness(fill) < 0.5 ? rect(x, y, w, h, fill, { ...o, grad: { from: fill, to: grad.stops.find((c) => c.toUpperCase() !== fill.toUpperCase() && contrast(c, '#FFFFFF') >= 3) ?? mix(fill, '#000000', 0.3), angle: grad.angle } }) : rect(x, y, w, h, fill, o));
  const dots = (x, y, w, h, bg, o = {}) => (patt ? [rect(x, y, w, h, bg, { ...o, patt: { fg: mix(bg, lightness(bg) < 0.5 ? '#FFFFFF' : '#000000', 0.14), bg } })] : []);
  const accentBar = (y, bg) => rect(center ? (W - 1.2) / 2 : margin, y, 1.2, 0.07, popOn(bg));
  const L = {};

  // Backgrounds: every kind of slide gets its own colour from the brand's families, so the deck is not one flat colour.
  const lightBg = P.contentBg, darkBg = P.sectionBg;
  const quoteBg = P.brandDark ? P.deep : P.sectionBg, statementLight = P.bgs.light[2] ?? P.tint;
  const bandOf = (tone) => (tone === 'dark' ? (P.brandDark ? P.deep : P.lift) : (P.bandFill ?? P.tint));

  // Title / closing: a colour block on the side of a light title slide (the 'section' of the slide), a full colour field when dark.
  const hero = (bg, block) => {
    const w = block ? inner - 4.4 - (inset && secR ? 0 : 0.4) : inner;
    const pb = block ? (inset && secR ? { x: W - 4.15, y: 0.35, w: 3.8, h: H - 0.7, r: secR } : { x: W - 4.4, y: 0, w: 4.4, h: H, r: 0 }) : null;   // the colour block doubles as the picture frame
    const lg = style?.assets?.find((a) => a.role === 'logo' && isRaster(a)), chip = lightness(bg) < 0.5 && logoIsDark(lg);   // a dark logo on a dark slide sits on a light chip
    return { bg, ink: inkOn(bg), logo: logoBox, ...(chip && { logoChip: { x: logoBox.x - 0.2, y: logoBox.y - 0.12, w: logoBox.w + 0.4, h: logoBox.h + 0.24, fill: P.tint ?? '#FFFFFF', r: 0.16 } }), ...(pb && { pic: pb }),
      objects: [...(block ? (inset && secR ? [field(W - 4.15, 0.35, 3.8, H - 0.7, block, { r: secR }), ...dots(W - 4.15, 0.35, 3.8, H - 0.7, block, { r: secR })] : [field(W - 4.4, 0, 4.4, H, block), ...dots(W - 4.4, 0, 4.4, H, block), rect(W - 4.4 - 0.22, 0, 0.22, H, popOn(bg))]) : []), ...(bar && !block ? [accentBar(4.45, bg)] : [])],
      ph: [T('title', 'title', margin, 2.0, w, 2.3, { font: 'head', size: S.title, bold: TS.weight.h1, lh: TS.lh.h1, color: headOn(bg, 'h1'), valign: 'bottom' }),
           T('subtitle', 'body', margin, bar && !block ? 4.65 : 4.5, w, 1.1, { font: 'body', size: bodyPt, color: mix(inkOn(bg), bg, 0.3) })] };
  };
  const art = isArtwork(titlePicture(style));
  const sideBlock = !center && lightness(P.titleBg) > 0.55 ? (art ? (P.bgs.light.at(-1) ?? P.tint) : (P.brandDark ? P.primary : P.tint)) : null;
  L.title = hero(P.titleBg, sideBlock); L.closing = hero(lightness(P.titleBg) > 0.55 ? P.closingBg : P.titleBg, null);

  L.section = { bg: P.sectionBg, ink: inkOn(P.sectionBg), objects: [...(grad ? [field(0, 0, W, H, P.sectionBg)] : []), ...dots(0, 0, W, H, P.sectionBg), ...(!center ? [rect(0, 0, 0.35, H, popOn(P.sectionBg))] : [])],
    ph: [T('title', 'title', margin, 2.6, inner, 2.3, { font: 'head', size: S.section, bold: TS.weight.h1, lh: TS.lh.h1, color: inkOn(P.sectionBg), valign: 'middle' })] };

  const colW = (inner - 0.6) / 2;
  const toneOfBg = (c) => (lightness(c) < 0.5 ? 'dark' : 'light');
  const defaults = { content: 'light', 'two-column': 'light', statement: dark ? 'light' : 'dark', image: dark ? 'dark' : 'light', chart: 'light', catalog: 'light', 'catalog-panel': 'light' };

  // The layouts whose tone can follow the site's rhythm, built for a given tone. Each has its own sections: a header band, panels.
  const flex = (tone) => {
    const isDark = tone === 'dark', bg = isDark ? darkBg : lightBg, ink = inkOn(bg), soft = mix(ink, bg, 0.35);
    const band = bandOf(tone), bandInk = inkOn(band), panel = isDark ? P.lift : P.tint, panelInk = inkOn(panel);
    // Editorial headline, not a heavy band: a large heading with a short accent rule under it. Panels carry the brand colour where it earns its place.
    const BH = 1.85;
    const head = (extra = {}) => T('title', 'title', margin, 0.45, inner, 1.15, { font: 'head', size: S.content + 4, bold: TS.weight.h2, lh: TS.lh.h2, color: headOn(bg, 'h2'), valign: 'bottom', align: 'left', ...extra });
    const top = [rect(margin, 1.74, 0.9, 0.08, popOn(bg), { r: 0.04 })];
    const bodyTop = 2.35;
    const cbg = isDark ? P.lift : '#FFFFFF', cardBg = lightness(P.contentBg) > 0.97 ? P.tint : cbg, cardInk = inkOn(cardBg);
    const cards = cardR > 0;                              // rounded cards on the site -> rounded cards in two columns
    return {
      content: { bg, ink, objects: top, ph: [head(), T('body', 'body', margin, bodyTop, inner, H - bodyTop - 0.5, { font: 'body', size: bodyPt, lh: TS.lh.body, color: ink, align: 'left' })] },
      'two-column': cards
        ? { bg, ink, objects: [...top, rect(margin - 0.3, bodyTop - 0.2, colW + 0.6, H - bodyTop - 0.1, panel, { r: cardR }), rect(margin + colW + 0.6 - 0.3, bodyTop - 0.2, colW + 0.6, H - bodyTop - 0.1, cardBg, { r: cardR })],
            ph: [head(),
              T('left', 'body', margin, bodyTop, colW, H - bodyTop - 0.5, { font: 'body', size: bodyPt - 2, lh: TS.lh.body, color: panelInk, align: 'left' }),
              T('right', 'body', margin + colW + 0.6, bodyTop, colW, H - bodyTop - 0.5, { font: 'body', size: bodyPt - 2, lh: TS.lh.body, color: cardInk, align: 'left' })] }
        : { bg, ink, objects: [...top, rect(0, BH + 0.08, W / 2, H - BH - 0.08, panel)],
        ph: [head(),
          T('left', 'body', margin, bodyTop, colW - 0.1, H - bodyTop - 0.5, { font: 'body', size: bodyPt - 2, lh: TS.lh.body, color: panelInk, align: 'left' }),
          T('right', 'body', W / 2 + 0.6, bodyTop, W / 2 - margin - 0.6, H - bodyTop - 0.5, { font: 'body', size: bodyPt - 2, lh: TS.lh.body, color: ink, align: 'left' })] },
      // The one layout under every catalog slide type: a headline, everything else is drawn (shapes, tables, pictures).
      catalog: { bg, ink, objects: top, contentTop: 2.3, ph: [head()] },
      // Panel composition: a full-height brand panel on the left carries the headline; the content sits on the right.
      'catalog-panel': (() => {
        const pc = isDark ? (P.brandDark ? P.deep : P.lift) : (P.bandFill ?? P.sectionBg), pi = inkOn(pc), px = 0.45, pw = 4.6, pr = secR || 0.22;
        return { bg, ink, objects: [field(px, 0.45, pw, H - 0.9, pc, { r: pr }), ...dots(px, 0.45, pw, H - 0.9, pc, { r: pr }), rect(px + 0.5, 1.45, 0.9, 0.08, popOn(pc), { r: 0.04 })], panel: { x: px, y: 0.45, w: pw, h: H - 0.9, bg: pc, ink: pi, pop: popOn(pc) }, contentTop: 0.95, contentLeft: px + pw + 0.6,
          ph: [T('title', 'title', px + 0.5, 1.8, pw - 1.0, 3.0, { font: 'head', size: S.content + 8, bold: TS.weight.h1, lh: TS.lh.h1, color: headOn(pc, 'h1'), valign: 'top', align: 'left' })] };
      })(),
      // A chart with a headline that states the point, an optional one-line takeaway, and the source underneath. The chart sits on a card.
      chart: { bg, ink, objects: [...top, rect(margin - 0.25, 2.5, inner + 0.5, 4.25, cardBg, { r: cardR || 0.12, shadow: true })], chartBox: { x: margin, y: 2.6, w: inner, h: 4.05 }, chartBg: cardBg,
        ph: [head(), T('subtitle', 'body', margin, 1.92, inner, 0.45, { font: 'body', size: bodyPt - 4, color: soft, align: 'left' }), T('source', 'body', margin, 6.85, inner, 0.4, { font: 'body', size: 12, color: soft, align: 'left' })] },
      // One big message and nothing else: the signature slide of airy, display-headline brands. Its own background colour, not the plain one.
      statement: (() => { const pc = isDark ? (P.brandDark ? P.deep : P.lift) : (P.bandFill ?? P.sectionBg), pi = inkOn(pc), r = secR || 0.25;
        return { bg, ink, objects: [field(0.45, 0.45, W - 0.9, H - 0.9, pc, { r }), ...dots(0.45, 0.45, W - 0.9, H - 0.9, pc, { r }), rect(margin + 0.3, 1.45, 1.2, 0.09, popOn(pc), { r: 0.045 })],
          ph: [T('title', 'title', margin + 0.3, 1.85, inner - 0.6, 3.3, { font: 'head', size: S.statement, bold: TS.weight.h1, lh: TS.lh.h1, color: headOn(pc, 'h1'), valign: 'top' }),
            T('subtitle', 'body', margin + 0.3, 5.35, inner - 0.6, 1.0, { font: 'body', size: bodyPt + 2, color: mix(pi, pc, 0.25) })] }; })(),
      // Image-led: big picture + short headline. Centred brands stack text over a full-width picture band; others split into a text panel and a picture.
      image: center
        ? { bg, ink, objects: [], pic: { x: 0, y: 2.75, w: W, h: 4.75, r: 0 },
            ph: [T('title', 'title', margin, 0.55, inner, 1.3, { font: 'head', size: S.imageTitle, bold: TS.weight.h1, lh: TS.lh.h1, color: headOn(bg, 'h1'), valign: 'middle' }),
                 T('subtitle', 'body', margin, 1.85, inner, 0.7, { font: 'body', size: bodyPt, color: soft })] }
        : { bg, ink, objects: cards ? [rect(0.35, 0.35, margin + 5.6 + 0.4 - 0.35, H - 0.7, panel, { r: cardR })] : [rect(0, 0, margin + 5.6 + 0.4, H, panel), rect(margin + 5.6 + 0.4, 0, 0.12, H, popOn(bg))], pic: { x: margin + 5.6 + 0.4 + 0.12 + 0.4, y: cards ? 0.35 : 0.9, w: W - (margin + 5.6 + 0.4 + 0.12 + 0.4) - 0.6, h: cards ? H - 0.7 : H - 1.8, r: mediaR },
            ph: [T('title', 'title', margin, 1.9, 5.6, 2.3, { font: 'head', size: S.imageTitle, bold: TS.weight.h1, lh: TS.lh.h1, color: headOn(panel, 'h1'), valign: 'bottom' }),
                 T('subtitle', 'body', margin, 4.4, 5.6, 1.6, { font: 'body', size: bodyPt, color: mix(panelInk, panel, 0.3) })] },
    };
  };
  const byTone = { light: flex('light'), dark: flex('dark') };
  for (const name of FLEX_LAYOUTS) {
    const d = defaults[name], o = d === 'light' ? 'dark' : 'light';
    L[name] = byTone[d][name]; L[altKey(name)] = byTone[o][name];
  }

  L.quote = { bg: quoteBg, ink: inkOn(quoteBg), objects: [...(grad ? [field(0, 0, W, H, quoteBg)] : []), ...(center ? [] : [rect(margin, 1.7, 0.08, 3.4, popOn(quoteBg))])],
    ph: [T('title', 'title', margin + (center ? 0 : 0.4), 1.6, inner - (center ? 0 : 0.4), 3.0, { font: 'head', size: S.quote, italic: true, color: inkOn(quoteBg), valign: 'middle' }),
         T('subtitle', 'body', margin + (center ? 0 : 0.4), 4.8, inner - (center ? 0 : 0.4), 0.8, { font: 'body', size: bodyPt - 2, color: mix(inkOn(quoteBg), quoteBg, 0.3) })] };

  // Highlight: the customer's own "graphic section" — a big rounded brand-colour panel with a headline and key-number tiles, plus a
  // lighter side card. Always built (with or without a measured section) so the template always carries it.
  {
    const pbg = G?.section?.bg && ok6(G.section.bg) ? G.section.bg : P.sectionBg, pink = inkOn(pbg), rr = secR || 0.2, bgH = P.contentBg;
    const sideBg = lightness(bgH) > 0.97 ? P.tint : '#FFFFFF', sideInk = inkOn(sideBg), px0 = 0.45, pw = 8.75, ix = px0 + 0.55, iw = pw - 1.1, statPt = clamp(S.content + 6, 30, 44), slot = iw / 4;
    const ST = (i) => T(`stat${i}`, 'body', ix + (i - 1) * slot, 3.35, slot - 0.15, 1.5, { font: 'head', size: statPt, bold: true, color: popOn(pbg), valign: 'top', lh: 1.05 });
    L.highlight = { bg: bgH, ink: inkOn(bgH), logo: null, statPt, objects: [field(px0, 0.45, pw, H - 0.9, pbg, { r: rr }), ...dots(px0, 0.45, pw, H - 0.9, pbg, { r: rr }), rect(px0 + pw + 0.3, 0.45, W - (px0 + pw + 0.3) - 0.45, H - 0.9, sideBg, { r: cardR || rr })],
      ph: [T('title', 'title', ix, 0.95, iw, 1.5, { font: 'head', size: S.content + 2, bold: TS.weight.h2, lh: TS.lh.h2, color: pink, valign: 'top', align: 'left' }),
           T('subtitle', 'body', ix, 2.45, iw, 0.7, { font: 'body', size: bodyPt - 2, color: mix(pink, pbg, 0.25), align: 'left' }),
           ST(1), ST(2), ST(3), ST(4),
           T('aside_title', 'body', px0 + pw + 0.8, 0.95, W - (px0 + pw + 0.3) - 0.45 - 0.7, 1.9, { font: 'head', size: S.content - 4, bold: TS.weight.h2, lh: TS.lh.h2, color: headOn(sideBg, 'h2'), valign: 'top', align: 'left' }),
           T('aside', 'body', px0 + pw + 0.8, 3.0, W - (px0 + pw + 0.3) - 0.45 - 0.7, 3.4, { font: 'body', size: bodyPt - 2, lh: TS.lh.body, color: sideInk, align: 'left' })] };
  }

  return { L, P, D, TS, G, margin, bodyPt, defaults, fixedTone: { title: toneOfBg(P.titleBg), closing: toneOfBg(L.closing.bg), section: toneOfBg(P.sectionBg), quote: toneOfBg(quoteBg), highlight: toneOfBg(P.contentBg) } };
}

// ---------- HTML rendering (deck preview and brand board share this) ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const pct = (v, t) => `${((v / t) * 100).toFixed(3)}%`;
const box = (x, y, w, h) => `left:${pct(x, W)};top:${pct(y, H)};width:${pct(w, W)};height:${pct(h, H)}`;
const rgba = (c, a) => `rgba(${[1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)).join(',')},${a})`;
const inkOn2 = (bg, ink) => (lightness(bg) > 0.55 ? (contrast(ink, bg) >= 4.5 ? ink : bestInk(bg)) : '#FFFFFF');
const VAL = { top: 'flex-start', middle: 'center', bottom: 'flex-end' };

/** @param {{title?:string,subtitle?:string,bullets?:string[],left?:string[],right?:string[],image?:string}} content */
export function slideHtml(layout0, content, { spec, style, stacks, headingStyle, extraHtml = '' }) {
  const layout = layoutKey(layout0, content.comp);
  const { L, defaults } = layoutSpecs(spec, style), l = L[FLEX_LAYOUTS.includes(layout) && content.tone && defaults[layout] && content.tone !== defaults[layout] ? altKey(layout) : layout], ST = style?.text?.heading ?? {}, assets = style?.assets ?? [];
  const bgs = style?.backgrounds ?? {}, ov = bgs.overlay_opacity ?? 0.6;
  const key = ['title', 'section', 'closing'].includes(layout) ? layout : null, bgA = key && assets.find((a) => a.id === bgs[key] && isRaster(a));
  const bg = bgA ? `background:linear-gradient(${rgba(l.bg, ov)},${rgba(l.bg, ov)}),url(${dataUri(bgA)}) center/cover` : `background:${content.bgc ?? l.bg}`;
  let h = '';
  for (const o of l.objects) h += `<div style="position:absolute;${box(o.x, o.y, o.w, o.h)};background:${o.grad ? `linear-gradient(${o.grad.angle}deg,${o.grad.from},${o.grad.to})` : o.fill};${o.r ? `border-radius:${cqw(o.r * 72)};` : ''}${o.patt ? `background-image:radial-gradient(${o.patt.fg} 1.5px,transparent 1.6px);background-size:${cqw(16)} ${cqw(16)};` : ''}"></div>`;
  const lg = assets.find((a) => a.role === 'logo' && isRaster(a));
  if (l.logoChip) h += `<div style="position:absolute;${box(l.logoChip.x, l.logoChip.y, l.logoChip.w, l.logoChip.h)};background:${l.logoChip.fill};border-radius:${(l.logoChip.r / W * 100).toFixed(2)}cqw"></div>`;
  if (l.logo && lg) h += `<div style="position:absolute;${box(l.logo.x, l.logo.y, l.logo.w, l.logo.h)};background:url(${dataUri(lg)}) ${l.logo.x > 2 ? 'center' : 'left center'}/contain no-repeat"></div>`;
  const autoPhoto = titlePicture(style);
  const img = layout === 'image' && content.image !== 'none' ? pickImage(style, content.image) : layout === 'title' && l.pic && content.image !== 'none' ? (content.image ? pickImage(style, content.image) : autoPhoto) : null;
  if (l.pic) h += img ? `<div style="position:absolute;${box(l.pic.x, l.pic.y, l.pic.w, l.pic.h)};background:url(${dataUri(img)}) center/${imageFit(img)} no-repeat;${l.pic.r ? `border-radius:${cqw(l.pic.r * 72)};` : ''}"></div>`
    : `<div style="position:absolute;${box(l.pic.x, l.pic.y, l.pic.w, l.pic.h)};border:2px dashed ${rgba(l.ink, 0.35)};display:grid;place-items:center;font:${cqw(14)} system-ui;color:${rgba(l.ink, 0.6)}">Click to add picture</div>`;
  if (l.chartBox && content.chart) {
    const cb = l.chartBox, cbg = l.chartBg ?? l.bg, colors = seriesColors(spec, content.chart, cbg, inkOn2(cbg, l.ink));
    h += `<div style="position:absolute;${box(cb.x, cb.y, cb.w, cb.h)}">${chartSvg({ chart: content.chart, colors, ink: inkOn2(cbg, l.ink), bg: cbg, w: cb.w * 72, h: cb.h * 72, font: stacks.body, labelPt: 13 })}</div>`;
  }
  const st = content.stats ?? [], text = { title: content.title, subtitle: content.subtitle, aside_title: content.aside_title, aside: content.aside, stat1: st[0], stat2: st[1], stat3: st[2], stat4: st[3], body: content.bullets, left: content.left, right: content.right, source: content.chart ? `${content.chart.sample ? 'Sample data. ' : ''}${content.chart.source ?? ''}`.trim() || undefined : undefined };
  for (const p of l.ph) {
    const v = text[p.name]; if (v === undefined || (Array.isArray(v) && !v.length)) continue;
    const common = `position:absolute;${box(p.x, p.y, p.w, p.h)};display:flex;flex-direction:column;justify-content:${VAL[p.valign]};text-align:${p.align};color:${p.color};font:${p.bold ? 700 : 400} ${cqw(p.size)}/${p.lh ?? 1.15} ${p.font === 'head' ? stacks.head : stacks.body};${p.italic ? 'font-style:italic;' : ''}overflow:hidden;overflow-wrap:anywhere;`;
    if (v && typeof v === 'object' && !Array.isArray(v)) h += `<div style="${common}"><div style="font-weight:700;line-height:1.05">${esc(v.value)}</div><div style="font:400 ${cqw(14)}/1.3 ${stacks.body};opacity:.85;margin-top:.3em">${esc(v.label ?? '')}</div></div>`;
    else if (Array.isArray(v)) h += `<div style="${common};font-weight:400;line-height:1.4;overflow:visible"><ul style="margin:0;padding-left:1.6em">${v.map((b) => `<li style="margin:0 0 .45em">${esc(b)}</li>`).join('')}</ul></div>`;
    else h += `<div style="${common}${p.type === 'title' ? headingStyle : ''}">${esc(v)}</div>`;
  }
  void ST;
  return `<div class="s" style="${bg}">${h}${extraHtml}</div>`;
}

/**
 * Background tone (light/dark) for every slide, following the visual rhythm measured on the customer's site.
 * Title, section, quote and closing slides keep their own tone; the flexible layouts (content, two-column, statement, image)
 * alternate (rhythm "alternating"), stay dark/light ("dark"/"light"), or keep their default ("mixed" or not measured).
 * A slide's own `tone` always wins.
 */
export function assignTones(slides, spec, style, prevTone = null) {
  const { defaults, fixedTone } = layoutSpecs(spec, style), pattern = style?.design?.rhythm?.pattern, tones = [];
  let prev = prevTone;
  for (const s of slides) {
    let t;
    const lk = layoutKey(s.layout, s.comp);
    if (fixedTone[lk]) t = fixedTone[lk];
    else if (s.tone) t = s.tone;
    else if (pattern === 'alternating' && prev) t = prev === 'dark' ? 'light' : 'dark';
    else if (pattern === 'dark' || pattern === 'light') t = pattern;
    else t = defaults[lk] ?? 'light';
    tones.push(t); prev = t;
  }
  return tones;
}

/**
 * Background colour per slide. The tone (light/dark) picks the master; within the light family consecutive content slides take
 * different brand tints (e.g. pale green, mint, soft teal) so the deck is not one flat colour. Dark slides keep the brand's dark
 * colour, because the header band on them is a shade of it. Returns undefined where the master's own colour applies.
 */
export function assignBackgrounds(slides, spec, style, tones, offset = 0) {
  const { P, L, defaults } = layoutSpecs(spec, style), light = P.bgs.light;
  return slides.map((s, i) => {
    const t = tones[i], master = L[FLEX_LAYOUTS.includes(s.layout) && t && defaults[s.layout] && t !== defaults[s.layout] ? altKey(s.layout) : s.layout];
    if (!master || t !== 'light' || !['content', 'chart', 'two-column'].includes(s.layout) || light.length < 2) return undefined;
    const pool = s.layout === 'two-column' ? [light[0], light.at(-1)] : light, c = pool[(i + offset) % pool.length];
    return c !== master.bg ? c : undefined;
  });
}

/** Tone of an existing slide, from the name of the layout it uses (BRAND_CONTENT, BRAND_CONTENT_ALT, BRAND_TITLE, ...). */
export function toneOfLayoutName(name, spec, style) {
  const m = /^BRAND_([A-Z_]+?)(_ALT)?$/.exec(name ?? ''); if (!m) return null;
  const layout = m[1].toLowerCase().replace('_', '-'), { defaults, fixedTone } = layoutSpecs(spec, style);
  if (fixedTone[layout]) return fixedTone[layout];
  const d = defaults[layout]; if (!d) return null;
  return m[2] ? (d === 'light' ? 'dark' : 'light') : d;
}
