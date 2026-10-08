// A tiny drawing language for slides: box, text, line (with arrow), table, pic. Every catalog slide is a list of these in slide
// inches (13.333 x 7.5). One list renders to native PowerPoint shapes/tables (editable) AND to the HTML preview.
import { lightness, contrast, bestInk } from './color.mjs';
import { mix, forBackground } from './charts.mjs';
import { slidePalette } from './palette.mjs';
import { withDefaults } from './design.mjs';
import { dataUri, isRaster } from './style.mjs';
import { fontStackFor } from './fonts.mjs';
import { W, H, cqw, pickImage, layoutSpecs, altKey } from './layouts.mjs';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const hx = (c) => c.slice(1).toUpperCase();
export const SLIDE = { W, H };

/** Context for drawing on a slide of the given tone: colours legible on that background, brand-driven sizes and corners. */
export function sceneCtx(spec, style, tone = 'light', comp = 'top') {
  const { L, P, defaults, margin: m0 } = layoutSpecs(spec, style), D = withDefaults(style?.design), key = comp === 'panel' ? 'catalog-panel' : 'catalog';
  const lay = tone === defaults[key] ? L[key] : L[altKey(key)], bg = lay.bg, ink = lay.ink;       // the catalog layout's own background and ink
  const acc = forBackground(P.primary, bg, 3), second = forBackground(P.secondary ?? P.primary, bg, 3);
  // Cards lift off the slide: white (with a soft shadow) on a tinted or light slide, a lighter shade on a dark one.
  const dark = lightness(bg) < 0.5, card = dark ? mix(bg, '#FFFFFF', 0.1) : (lightness(bg) > 0.985 ? (P.tint ?? mix(bg, '#000000', 0.04)) : '#FFFFFF');
  const pop = [P.accent, P.primary, P.secondary, ...(P.accents ?? [])].find((c) => c && lightness(c) > 0.1 && contrast(c, bg) >= 2.2) ?? acc;
  const margin = m0 ?? { airy: 1.2, balanced: 0.85, dense: 0.6 }[D.density];
  const bodyPt = { airy: 20, balanced: 18, dense: 16 }[D.density], G = style?.graphics, inch = (px) => Math.round(Math.min(px, 40) / 96 * 100) / 100;
  const radius = G?.corners?.card ? Math.min(0.3, inch(G.corners.card)) : { square: 0.02, soft: 0.14, pill: 0.28 }[D.corners];
  const headFill = P.bandFill ?? (dark ? mix(bg, '#FFFFFF', 0.16) : (P.brandDark ? P.primary : (contrast(P.primary, '#FFFFFF') >= 4.5 ? P.primary : P.sectionBg)));
  return { W, H, tone, bg, ink, cardInk: lightness(card) > 0.55 ? (contrast(ink, card) >= 4.5 ? ink : bestInk(card)) : '#FFFFFF', onHead: bestInk(headFill), soft: mix(ink, bg, 0.38), faint: mix(ink, bg, 0.86), card, line: mix(ink, bg, 0.8), accent: acc, accent2: second, onAccent: bestInk(acc),
    head: headFill, margin, pop, shadow: !dark, comp, panel: comp === 'panel' ? lay.panel : null,
    inner: comp === 'panel' ? W - (lay.contentLeft ?? 5.65) - margin : W - 2 * margin, left: comp === 'panel' ? (lay.contentLeft ?? 5.65) : margin, right: W - margin, top: lay.contentTop ?? 2.3, bottom: 6.95, center: comp === 'panel' ? false : D.align === 'center', bodyPt, radius, D, spec, style, P };
}

// ---------- text fitting (heuristic: no font metrics available) ----------
/** Largest size (pt) <= max at which `text` fits a w x h inch box; never below min. */
export function fitSize(text, w, h, max, { min = 10, lh = 1.22, cw = 0.5 } = {}) {
  const t = String(text ?? '');
  for (let pt = max; pt >= min; pt--) {
    const perLine = Math.max(1, Math.floor((w * 72) / (pt * cw)));
    const words = t.split(/\s+/); let lines = 1, cur = 0;
    for (const word of words) { const n = word.length; if (n > perLine) { lines += Math.ceil(n / perLine) - 1; cur = n % perLine; } else if (cur + n + (cur ? 1 : 0) > perLine) { lines++; cur = n; } else cur += n + (cur ? 1 : 0); }
    if (lines * pt * lh <= h * 72) return pt;
  }
  return min;
}
export const textFits = (text, w, h, pt, o = {}) => fitSize(text, w, h, pt, { ...o, min: pt }) === pt;

// ---------- element constructors ----------
export const box = (x, y, w, h, o = {}) => ({ k: 'box', x, y, w, h, shape: 'round', ...o });
export const text = (x, y, w, h, t, o = {}) => ({ k: 'text', x, y, w, h, text: t, ...o });
export const line = (x1, y1, x2, y2, o = {}) => ({ k: 'line', x1, y1, x2, y2, ...o });
export const table = (x, y, w, colW, rows, o = {}) => ({ k: 'table', x, y, w, colW, rows, ...o });
export const pic = (x, y, w, h, o = {}) => ({ k: 'pic', x, y, w, h, ...o });

/** Elbow connector between two boxes as 1-3 line segments, arrow on the last. */
export function connect(a, b, o = {}) {
  const ax = a.x + a.w / 2, ay = a.y + a.h / 2, bx = b.x + b.w / 2, by = b.y + b.h / 2, arrow = o.arrow !== false;
  const segs = [];
  const seg = (x1, y1, x2, y2, last) => segs.push(line(x1, y1, x2, y2, { color: o.color, width: o.width ?? 1.75, arrow: last && arrow, dash: o.dash }));
  if (Math.abs(ay - by) < 0.05) { const right = bx > ax; seg(right ? a.x + a.w : a.x, ay, right ? b.x : b.x + b.w, by, true); }
  else if (Math.abs(ax - bx) < 0.05) { const down = by > ay; seg(ax, down ? a.y + a.h : a.y, bx, down ? b.y : b.y + b.h, true); }
  else { const down = by > ay, y1 = down ? a.y + a.h : a.y, y2 = down ? b.y : b.y + b.h, ym = (y1 + y2) / 2; seg(ax, y1, ax, ym, false); seg(ax, ym, bx, ym, false); seg(bx, ym, bx, y2, true); }
  return segs;
}

// ---------- PowerPoint renderer ----------
const SHAPE = (p) => ({ rect: p.ShapeType.rect, round: p.ShapeType.roundRect, diamond: p.ShapeType.diamond, ellipse: p.ShapeType.ellipse, chevron: p.ShapeType.chevron, pentagon: p.ShapeType.homePlate }); // eslint-disable-line
export function drawPptx(pptx, slide, scene, ctx, { head, body, boldHead }) {
  const font = (f) => (f === 'head' ? head : body);
  for (const e of scene) {
    if (e.k === 'box') {
      const shape = SHAPE(pptx)[e.shape] ?? pptx.ShapeType.roundRect, hasT = e.text !== undefined && e.text !== '';
      const o = { shape, x: e.x, y: e.y, w: e.w, h: e.h, fill: e.fill ? { color: hx(e.fill) } : { type: 'none' }, line: e.stroke ? { color: hx(e.stroke), width: e.strokeW ?? 1, ...(e.dash ? { dashType: 'dash' } : {}) } : { type: 'none' },
        ...(e.shape === 'round' ? { rectRadius: Math.min(e.h / 2, e.radius ?? ctx.radius) } : {}), ...(e.shadow ? { shadow: { type: 'outer', color: '000000', opacity: 0.14, blur: 9, offset: 2.5, angle: 90 } } : {}) };
      if (hasT) Object.assign(o, { fontFace: font(e.font ?? 'body'), fontSize: e.size ?? 14, bold: !!e.bold && (e.font !== 'head' || boldHead), color: hx(e.color ?? ctx.ink), align: e.align ?? 'center', valign: e.valign ?? 'middle', margin: e.margin ?? 6 });
      slide.addText(hasT ? String(e.text) : '', o);
    } else if (e.k === 'text') {
      const runs = Array.isArray(e.text) ? e.text.map((t) => ({ text: t, options: { bullet: e.bullets ? { indent: 14 } : false, breakLine: true, paraSpaceAfter: e.gap ?? 4 } })) : String(e.text);
      slide.addText(runs, { x: e.x, y: e.y, w: e.w, h: e.h, fontFace: font(e.font ?? 'body'), fontSize: e.size ?? 16, bold: !!e.bold && (e.font !== 'head' || boldHead), italic: !!e.italic, color: hx(e.color ?? ctx.ink), align: e.align ?? 'left', valign: e.valign ?? 'top', margin: 0, ...(e.fit ? { fit: 'shrink' } : {}) });
    } else if (e.k === 'line') {
      const x = Math.min(e.x1, e.x2), y = Math.min(e.y1, e.y2), w = Math.abs(e.x2 - e.x1), h = Math.abs(e.y2 - e.y1), fh = e.x2 < e.x1, fv = e.y2 < e.y1;
      slide.addShape(pptx.ShapeType.line, { x, y, w, h, flipH: fh, flipV: fv, line: { color: hx(e.color ?? ctx.line), width: e.width ?? 1.5, ...(e.arrow ? { endArrowType: 'triangle' } : {}), ...(e.dash ? { dashType: 'dash' } : {}) } });
    } else if (e.k === 'table') {
      const rows = e.rows.map((r, ri) => r.map((c, ci) => { const cell = typeof c === 'object' ? c : { text: String(c) }; const head = ri === 0 && e.header !== false; return { text: cell.text, options: { bold: head || !!cell.bold || (ci === 0 && e.firstColBold), fill: head ? { color: hx(e.headFill ?? ctx.head) } : cell.fill ? { color: hx(cell.fill) } : e.zebra === true && ri % 2 === 0 ? { color: hx(ctx.card) } : { color: hx(ctx.card) }, color: hx(head ? e.headColor ?? ctx.onHead : cell.color ?? ctx.cardInk), align: cell.align ?? (ci === 0 ? 'left' : e.align ?? 'left'), valign: 'middle', fontFace: font('body'), fontSize: e.size ?? 13 } }; }));
      const none = { type: 'none' }, rule = { type: 'solid', pt: 0.75, color: hx(ctx.line) };
      slide.addTable(rows, { x: e.x, y: e.y, w: e.w, colW: e.colW, rowH: e.rowH ?? 0.5, border: [none, none, rule, none], margin: [0.04, 0.14, 0.04, 0.14] });
    } else if (e.k === 'pic') {
      const a = e.image ? pickImage(ctx.style, e.image) : null;
      if (a) slide.addImage({ data: `${a.mime};base64,${a.content_base64}`, x: e.x, y: e.y, w: a.width / 100, h: a.height / 100, sizing: { type: 'cover', w: e.w, h: e.h }, altText: e.label ?? a.id });
      else slide.addText(e.label ?? 'Add picture', { shape: pptx.ShapeType.roundRect, x: e.x, y: e.y, w: e.w, h: e.h, rectRadius: Math.min(ctx.radius, e.h / 2), fill: { color: hx(ctx.card) }, line: { color: hx(ctx.soft), width: 1.25, dashType: 'dash' }, fontFace: body, fontSize: 12, color: hx(ctx.soft), align: 'center', valign: 'middle' });
    }
  }
}

// ---------- HTML renderer ----------
const pct = (v, t) => `${((v / t) * 100).toFixed(3)}%`, bx = (x, y, w, h) => `left:${pct(x, W)};top:${pct(y, H)};width:${pct(w, W)};height:${pct(h, H)}`;
const JA = { left: 'flex-start', center: 'center', right: 'flex-end' }, VA = { top: 'flex-start', middle: 'center', bottom: 'flex-end' };
export function drawHtml(scene, ctx, stacks) {
  const colors = new Set(scene.filter((e) => e.k === 'line' && e.arrow).map((e) => e.color ?? ctx.line));
  const defs = [...colors].map((c, i) => `<marker id="ar${i}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="${7}" markerHeight="${7}" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${c}"/></marker>`).join('');
  const ci = (c) => [...colors].indexOf(c ?? ctx.line);
  let html = '';
  const lineSvg = (inner) => `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none"><defs>${defs}</defs>${inner}</svg>`;
  for (const e of scene) {
    if (e.k === 'line') html += lineSvg(`<line x1="${e.x1}" y1="${e.y1}" x2="${e.x2}" y2="${e.y2}" stroke="${e.color ?? ctx.line}" stroke-width="${(e.width ?? 1.5) / 72}" ${e.dash ? `stroke-dasharray="${0.08} ${0.06}"` : ''} ${e.arrow ? `marker-end="url(#ar${ci(e.color)})"` : ''} stroke-linecap="round"/>`);
    else if (e.k === 'box') {
      const radius = e.shape === 'ellipse' ? '50%' : e.shape === 'rect' || e.shape === 'diamond' ? '0' : `${Math.min(e.h / 2, e.radius ?? ctx.radius) / e.h * 100}%/${50}%`;
      const clip = e.shape === 'diamond' ? 'clip-path:polygon(50% 0,100% 50%,50% 100%,0 50%);' : e.shape === 'chevron' ? 'clip-path:polygon(0 0,82% 0,100% 50%,82% 100%,0 100%,18% 50%);' : e.shape === 'pentagon' ? 'clip-path:polygon(0 0,86% 0,100% 50%,86% 100%,0 100%);' : '';
      html += `<div style="position:absolute;${bx(e.x, e.y, e.w, e.h)};background:${e.fill ?? 'transparent'};${e.stroke ? `border:${Math.max(1, (e.strokeW ?? 1))}px ${e.dash ? 'dashed' : 'solid'} ${e.stroke};` : ''}border-radius:${e.shape === 'round' ? `${Math.min(e.h / 2, e.radius ?? ctx.radius) * 72 / 10}cqw`.replace(/.*/, `${(Math.min(e.h / 2, e.radius ?? ctx.radius) / W * 100).toFixed(3)}cqw`) : radius};${clip}${e.shadow ? 'box-shadow:0 4px 14px rgba(0,0,0,.14);' : ''}display:flex;align-items:${VA[e.valign ?? 'middle']};justify-content:${JA[e.align ?? 'center']};text-align:${e.align ?? 'center'};padding:${(6 / 72 / W * 100).toFixed(2)}cqw;font:${e.bold ? 700 : 400} ${cqw(e.size ?? 14)}/1.2 ${(e.font ?? 'body') === 'head' ? stacks.head : stacks.body};color:${e.color ?? ctx.ink};overflow:hidden;overflow-wrap:anywhere">${esc(e.text ?? '')}</div>`;
    } else if (e.k === 'text') {
      const inner = Array.isArray(e.text) ? `<ul style="margin:0;padding-left:1.1em;${e.bullets ? '' : 'list-style:none;padding-left:0'}">${e.text.map((t) => `<li style="margin:0 0 .3em">${esc(t)}</li>`).join('')}</ul>` : esc(e.text);
      html += `<div style="position:absolute;${bx(e.x, e.y, e.w, e.h)};display:flex;flex-direction:column;justify-content:${VA[e.valign ?? 'top']};text-align:${e.align ?? 'left'};font:${e.bold ? 700 : 400} ${cqw(e.size ?? 16)}/1.25 ${(e.font ?? 'body') === 'head' ? stacks.head : stacks.body};${e.italic ? 'font-style:italic;' : ''}color:${e.color ?? ctx.ink};overflow:hidden;overflow-wrap:anywhere">${inner}</div>`;
    } else if (e.k === 'table') {
      const total = e.colW.reduce((a, b) => a + b, 0), rh = e.rowH ?? 0.46;
      const cells = e.rows.map((r, ri) => r.map((c, ci2) => { const cell = typeof c === 'object' ? c : { text: String(c) }, head = ri === 0 && e.header !== false; return `<div style="grid-column:${ci2 + 1};grid-row:${ri + 1};display:flex;align-items:center;justify-content:${JA[cell.align ?? (ci2 === 0 ? 'left' : e.align ?? 'left')]};padding:0 ${(0.1 / W * 100 * 1.0).toFixed(2)}cqw;background:${head ? e.headFill ?? ctx.head : cell.fill ?? ctx.card};color:${head ? e.headColor ?? ctx.onHead : cell.color ?? ctx.cardInk};font:${head || cell.bold || (ci2 === 0 && e.firstColBold) ? 700 : 400} ${cqw(e.size ?? 13)}/1.2 ${stacks.body};border-bottom:1px solid ${ctx.line};box-sizing:border-box;overflow:hidden">${esc(cell.text)}</div>`; }).join('')).join('');
      html += `<div style="position:absolute;${bx(e.x, e.y, e.w, rh * e.rows.length)};display:grid;grid-template-columns:${e.colW.map((c) => `${(c / total * 100).toFixed(2)}fr`).join(' ')};grid-template-rows:repeat(${e.rows.length},1fr)">${cells}</div>`;
    } else if (e.k === 'pic') {
      const a = e.image ? pickImage(ctx.style, e.image) : null;
      html += a ? `<div style="position:absolute;${bx(e.x, e.y, e.w, e.h)};background:url(${dataUri(a)}) center/cover;border-radius:${(Math.min(ctx.radius, e.h / 2) / W * 100).toFixed(3)}cqw"></div>` : `<div style="position:absolute;${bx(e.x, e.y, e.w, e.h)};border:2px dashed ${ctx.soft};background:${ctx.card};border-radius:${(Math.min(ctx.radius, e.h / 2) / W * 100).toFixed(3)}cqw;display:grid;place-items:center;font:400 ${cqw(12)} ${stacks.body};color:${ctx.soft}">${esc(e.label ?? 'Add picture')}</div>`;
    }
  }
  return html;
}
export { fontStackFor, isRaster };
