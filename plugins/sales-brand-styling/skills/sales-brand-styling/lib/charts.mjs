// Data visualisations in the customer's palette. One chart definition drives three outputs:
//   - a native, editable PowerPoint chart (data lives in the file: right-click > Edit Data)
//   - an inline SVG for the deck preview and the brand board
//   - an inline SVG for HTML pages
// Numbers come from the user (or a CSV they point to); the plugin never invents data. Sample charts are labelled as sample.
import { contrast, lightness } from './color.mjs';
import { httpError } from './safeurl.mjs';

export const CHART_TYPES = ['column', 'bar', 'stacked', 'line', 'area', 'pie', 'doughnut'];
const LIM = { labels: 24, series: 6, text: 40, source: 140 };
const hexOk = (c) => /^#[0-9A-Fa-f]{6}$/.test(c ?? '');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function checkChart(c, where = 'chart') {
  const bad = (m) => { throw httpError(400, `${where}: ${m}`); };
  if (!c || typeof c !== 'object' || Array.isArray(c)) bad('must be an object.');
  if (!CHART_TYPES.includes(c.type)) bad(`type must be one of ${CHART_TYPES.join(', ')}.`);
  if (!Array.isArray(c.labels) || c.labels.length < 1 || c.labels.length > LIM.labels || c.labels.some((l) => typeof l !== 'string' || !l.length || l.length > LIM.text)) bad(`labels must be 1-${LIM.labels} short strings.`);
  if (!Array.isArray(c.series) || c.series.length < 1 || c.series.length > LIM.series) bad(`series must be 1-${LIM.series} items.`);
  for (const s of c.series) {
    if (!s || typeof s.name !== 'string' || !s.name.length || s.name.length > LIM.text) bad('each series needs a short name.');
    if (!Array.isArray(s.values) || s.values.length !== c.labels.length || s.values.some((v) => typeof v !== 'number' || !Number.isFinite(v) || Math.abs(v) > 1e12)) bad(`series "${String(s.name).slice(0, 20)}" needs one finite number per label.`);
  }
  if (['pie', 'doughnut'].includes(c.type)) {
    if (c.series.length !== 1) bad('pie and doughnut charts take exactly one series.');
    if (c.labels.length < 2 || c.labels.length > 8) bad('pie and doughnut charts take 2-8 slices (group the rest as "Other").');
    if (c.series[0].values.some((v) => v < 0) || !(c.series[0].values.reduce((a, b) => a + b, 0) > 0)) bad('pie slices must be zero or more and not all zero.');
  }
  if (c.type === 'stacked' && c.series.length < 2) bad('a stacked chart needs at least 2 series.');
  if (c.unit !== undefined && !/^[%$€£]$|^[A-Za-z]{1,4}$/.test(c.unit)) bad('unit must be %, $, €, £ or up to 4 letters (e.g. k, M, pts).');
  if (c.source !== undefined && (typeof c.source !== 'string' || c.source.length > LIM.source)) bad(`source must be text up to ${LIM.source} characters.`);
  if (c.highlight !== undefined && !(Number.isInteger(c.highlight) && c.highlight >= 0 && c.highlight < c.labels.length) && !(typeof c.highlight === 'string' && c.labels.includes(c.highlight))) bad('highlight must be one of the labels (or its position).');
  if (c.sample !== undefined && typeof c.sample !== 'boolean') bad('sample must be true or false.');
  return c;
}

// ---------- colour ----------
const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const rgbToHex = (r) => '#' + r.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase();
export const mix = (a, b, t) => rgbToHex(hexToRgb(a).map((v, i) => v * (1 - t) + hexToRgb(b)[i] * t));
const dist = (a, b) => Math.hypot(...hexToRgb(a).map((v, i) => v - hexToRgb(b)[i]));
/** Nudges a colour toward white (on dark backgrounds) or black (on light ones) until marks stay visible (>= 3:1). */
export function forBackground(color, bg, min = 3) {
  const target = lightness(bg) < 0.5 ? '#FFFFFF' : '#000000';
  let c = color;
  for (let i = 0; i < 14 && contrast(c, bg) < min; i++) c = mix(c, target, 0.1);
  return c;
}

/** n distinguishable series colours from the brand: primary first, then secondary and accents, then tints; all legible on `bg`. */
export function chartPalette(spec, n, bg) {
  const c = spec.colors, base = [c.primary, c.secondary, ...(c.accents ?? [])].filter(hexOk).map((x) => forBackground(x.toUpperCase(), bg));
  const out = [];
  const add = (x) => { if (out.length < n && out.every((o) => dist(o, x) >= 56)) out.push(x); };
  base.forEach(add);
  const target = lightness(bg) < 0.5 ? '#FFFFFF' : '#000000', opp = target === '#FFFFFF' ? '#000000' : '#FFFFFF';
  for (const t of [0.35, -0.3, 0.6, -0.5]) for (const b of base.slice(0, 2)) add(forBackground(t > 0 ? mix(b, target, t) : mix(b, opp, -t), bg));
  const grey = mix(lightness(bg) < 0.5 ? '#FFFFFF' : '#000000', bg, 0.5);
  [grey, mix(grey, bg, 0.4), mix(grey, bg, -0.3)].forEach(add);
  while (out.length < n) out.push(mix(out[out.length - 1] ?? grey, bg, 0.25 * (out.length + 1) % 0.9));   // last resort: never crash on an exotic brand
  return out.slice(0, n);
}

/** Colours per series, or per point for a single series with a highlight (everything muted except the point to look at). */
export function seriesColors(spec, chart, bg, ink) {
  const pie = chart.type === 'pie' || chart.type === 'doughnut', n = pie ? chart.labels.length : chart.series.length;
  const pal = chartPalette(spec, Math.max(n, 1), bg);
  if (!pie && n === 1 && chart.highlight !== undefined) {
    const idx = typeof chart.highlight === 'number' ? chart.highlight : chart.labels.indexOf(chart.highlight), muted = mix(ink, bg, 0.72);
    return chart.labels.map((_, i) => (i === idx ? pal[0] : muted));
  }
  return pie ? pal : (n === 1 ? [pal[0]] : pal);
}

// ---------- number formatting ----------
export function fmt(v, unit) {
  const a = Math.abs(v), d = a >= 100 ? 0 : a >= 10 ? 1 : 2;
  let s = new Intl.NumberFormat('en-US', { maximumFractionDigits: d }).format(v);
  if (unit && /^[$€£]$/.test(unit)) s = (v < 0 ? '-' : '') + unit + s.replace('-', '');
  else if (unit) s += unit === '%' ? '%' : ` ${unit}`;
  return s;
}
const niceStep = (max, ticks = 4) => { const raw = max / ticks, p = 10 ** Math.floor(Math.log10(raw || 1)), m = raw / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p; };
export function axisScale(min, max) {
  const lo = Math.min(0, min), hi = Math.max(0, max) || 1, step = niceStep(hi - lo), top = Math.ceil(hi / step) * step, bottom = lo < 0 ? Math.floor(lo / step) * step : 0, ticks = [];
  for (let v = bottom; v <= top + step / 1000; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return { min: bottom, max: top, ticks };
}

// ---------- SVG ----------
const num = (v) => Math.round(v * 10) / 10;
/**
 * @param {object} o  chart, colors[], ink, bg, grid (hex), fontCss (CSS font stack, already safe), w, h (viewBox units, ~points)
 */
export function chartSvg({ chart, colors, ink, bg, w, h, font, labelPt = 13 }) {
  const { type, labels, series, unit } = chart, muted = mix(ink, bg, 0.35), grid = mix(ink, bg, 0.85), fs = labelPt, T = (x, y, t, o = '') => `<text x="${num(x)}" y="${num(y)}" font-size="${fs}" ${o}>${esc(t)}</text>`;
  const head = `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(`${type} chart: ${series.map((s) => s.name).join(', ')}`)}" viewBox="0 0 ${num(w)} ${num(h)}" width="100%" style="max-width:100%;height:auto;display:block" font-family="${esc(font)}" fill="${ink}">`;
  const wrap = (body, legend = '') => `${head}${body}${legend}</svg>`;
  const showLegend = series.length > 1 || type === 'pie' || type === 'doughnut';

  if (type === 'pie' || type === 'doughnut') {
    const vals = series[0].values, tot = vals.reduce((a, b) => a + b, 0), cx = w * 0.3, cy = h / 2, r = Math.min(h * 0.44, w * 0.26), inner = type === 'doughnut' ? r * 0.58 : 0;
    let a0 = -Math.PI / 2, body = '';
    vals.forEach((v, i) => {
      const a1 = a0 + (v / tot) * Math.PI * 2, large = a1 - a0 > Math.PI ? 1 : 0, p = (R, a) => [cx + R * Math.cos(a), cy + R * Math.sin(a)];
      const [x0, y0] = p(r, a0), [x1, y1] = p(r, a1), [x2, y2] = p(inner, a1), [x3, y3] = p(inner, a0);
      body += vals.length === 1 || v === tot ? `<circle cx="${num(cx)}" cy="${num(cy)}" r="${num(r)}" fill="${colors[i]}"/>` : `<path d="M${num(x0)},${num(y0)} A${num(r)},${num(r)} 0 ${large} 1 ${num(x1)},${num(y1)} ${inner ? `L${num(x2)},${num(y2)} A${num(inner)},${num(inner)} 0 ${large} 0 ${num(x3)},${num(y3)}` : `L${num(cx)},${num(cy)}`}Z" fill="${colors[i]}" stroke="${bg}" stroke-width="2"/>`;
      a0 = a1;
    });
    const lx = w * 0.62; let ly = h / 2 - labels.length * fs * 0.95;
    const rows = labels.map((l, i) => { const y = ly + i * fs * 1.9; return `<rect x="${num(lx)}" y="${num(y - fs * 0.75)}" width="${fs}" height="${fs}" rx="2" fill="${colors[i]}"/>` + T(lx + fs * 1.6, y + fs * 0.25, `${l}  ${Math.round((vals[i] / tot) * 100)}%`); }).join('');
    return wrap(body + rows);
  }

  const all = series.flatMap((s) => s.values), stacked = type === 'stacked';
  const stackTop = stacked ? Math.max(...labels.map((_, i) => series.reduce((a, s) => a + Math.max(0, s.values[i]), 0))) : Math.max(...all), stackBot = stacked ? 0 : Math.min(...all);
  const sc = axisScale(stackBot, stackTop), horiz = type === 'bar';
  const legendH = showLegend ? fs * 2.6 : 0, left = horiz ? Math.min(w * 0.22, 160) : fs * (String(fmt(sc.max, unit)).length * 0.62 + 1.4), bottom = horiz ? fs * 2 : fs * 2.4, top = fs * 1.2, right = type === 'line' && series.length > 1 ? fs * 3.2 : fs;
  const px0 = left, px1 = w - right, py0 = top, py1 = h - bottom - legendH;
  const vx = (v) => px0 + ((v - sc.min) / (sc.max - sc.min)) * (px1 - px0), vy = (v) => py1 - ((v - sc.min) / (sc.max - sc.min)) * (py1 - py0);
  let body = '';
  for (const t of sc.ticks) {
    if (horiz) body += `<line x1="${num(vx(t))}" x2="${num(vx(t))}" y1="${num(py0)}" y2="${num(py1)}" stroke="${t === 0 ? muted : grid}" stroke-width="${t === 0 ? 1.2 : 1}"/>` + T(vx(t), py1 + fs * 1.4, fmt(t, unit), `text-anchor="middle" fill="${muted}"`);
    else body += `<line x1="${num(px0)}" x2="${num(px1)}" y1="${num(vy(t))}" y2="${num(vy(t))}" stroke="${t === 0 ? muted : grid}" stroke-width="${t === 0 ? 1.2 : 1}"/>` + T(px0 - fs * 0.6, vy(t) + fs * 0.35, fmt(t, unit), `text-anchor="end" fill="${muted}"`);
  }
  const n = labels.length, band = ((horiz ? py1 - py0 : px1 - px0)) / n, many = n > 8;
  labels.forEach((l, i) => {
    if (horiz) body += T(px0 - fs * 0.6, py0 + band * (i + 0.5) + fs * 0.35, l, `text-anchor="end"`);
    else if (!many || i % 2 === 0) body += T(px0 + band * (i + 0.5), py1 + fs * 1.5, l.length > 12 && many ? l.slice(0, 11) + '…' : l, `text-anchor="middle"`);
  });
  const showVals = !many && series.length <= 2 && type !== 'area';
  if (type === 'column' || type === 'bar' || stacked) {
    const k = stacked ? 1 : series.length, gap = band * 0.28, bw = (band - gap) / k, perPt = series.length === 1 && colors.length === n;
    series.forEach((s, si) => s.values.forEach((v, i) => {
      const col = perPt ? colors[i] : colors[si]; let off = 0;
      if (stacked) off = series.slice(0, si).reduce((a, q) => a + Math.max(0, q.values[i]), 0);
      if (horiz) { const y = py0 + band * i + gap / 2 + (stacked ? 0 : bw * si), x0 = vx(stacked ? off : Math.min(0, v)), x1 = vx(stacked ? off + v : Math.max(0, v)); body += `<rect x="${num(Math.min(x0, x1))}" y="${num(y)}" width="${num(Math.abs(x1 - x0))}" height="${num(bw)}" rx="2" fill="${col}"/>`; if (showVals) body += T(Math.max(x0, x1) + 6, y + bw / 2 + fs * 0.35, fmt(v, unit), `fill="${ink}"`); }
      else { const x = px0 + band * i + gap / 2 + (stacked ? 0 : bw * si), y0 = vy(stacked ? off : Math.max(0, v)), y1 = vy(stacked ? off + v : Math.min(0, v)); body += `<rect x="${num(x)}" y="${num(Math.min(y0, y1))}" width="${num(bw)}" height="${num(Math.abs(y1 - y0))}" rx="2" fill="${col}"/>`; if (showVals && !stacked) body += T(x + bw / 2, Math.min(y0, y1) - fs * 0.5, fmt(v, unit), `text-anchor="middle" fill="${ink}"`); }
    }));
  } else {
    const xs = (i) => px0 + band * (i + 0.5);
    series.forEach((s, si) => {
      const pts = s.values.map((v, i) => `${num(xs(i))},${num(vy(v))}`);
      if (type === 'area') body += `<polygon points="${num(xs(0))},${num(vy(0))} ${pts.join(' ')} ${num(xs(n - 1))},${num(vy(0))}" fill="${colors[si]}" fill-opacity="0.28"/>`;
      body += `<polyline points="${pts.join(' ')}" fill="none" stroke="${colors[si]}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>`;
      if (n <= 14) s.values.forEach((v, i) => { body += `<circle cx="${num(xs(i))}" cy="${num(vy(v))}" r="4" fill="${bg}" stroke="${colors[si]}" stroke-width="2.5"/>`; });
      // single series: label every point; several series: label only the last point of each (labels on close lines collide)
      if (showVals && n <= 8) s.values.forEach((v, i) => { if (series.length === 1 || i === n - 1) body += series.length === 1 ? T(xs(i), vy(v) - fs * 0.9, fmt(v, unit), `text-anchor="middle"`) : T(xs(i) + fs * 0.8, vy(v) + fs * 0.35, fmt(v, unit), `fill="${colors[si]}" font-weight="600"`); });
    });
  }
  let legend = '';
  if (showLegend) { let x = px0; const y = h - fs * 0.6; legend = series.map((s, i) => { const seg = `<rect x="${num(x)}" y="${num(y - fs * 0.8)}" width="${fs}" height="${fs}" rx="2" fill="${colors[i]}"/>` + T(x + fs * 1.5, y + fs * 0.1, s.name); x += fs * 2.6 + s.name.length * fs * 0.58; return seg; }).join(''); }
  return wrap(body, legend);
}

// ---------- PowerPoint (native chart) ----------
/** Options for pptxgenjs addChart, styled from the brand. `P` = {ink, bg}; fonts = {body}. */
export function pptxChart(pptx, chart, { colors, ink, bg, fontBody, box }) {
  const muted = mix(ink, bg, 0.35).slice(1), grid = mix(ink, bg, 0.88).slice(1), many = chart.labels.length > 8, pie = chart.type === 'pie' || chart.type === 'doughnut';
  const data = pie || chart.series.length ? chart.series.map((s) => ({ name: s.name, labels: chart.labels, values: s.values })) : [];
  const kind = { column: pptx.charts.BAR, bar: pptx.charts.BAR, stacked: pptx.charts.BAR, line: pptx.charts.LINE, area: pptx.charts.AREA, pie: pptx.charts.PIE, doughnut: pptx.charts.DOUGHNUT }[chart.type];
  const unitFmt = !chart.unit ? '#,##0.##' : /^[$€£]$/.test(chart.unit) ? `"${chart.unit}"#,##0.##` : chart.unit === '%' ? '#,##0.##"%"' : `#,##0.## "${chart.unit}"`;
  return { data, kind, opts: {
    x: box.x, y: box.y, w: box.w, h: box.h, chartColors: colors.map((c) => c.slice(1)), showTitle: false, showLegend: chart.series.length > 1 || pie, legendPos: pie ? 'r' : 'b', legendFontFace: fontBody, legendFontSize: 12, legendColor: ink.slice(1),
    ...(chart.type === 'column' ? { barDir: 'col', barGrouping: 'clustered' } : chart.type === 'bar' ? { barDir: 'bar', barGrouping: 'clustered' } : chart.type === 'stacked' ? { barDir: 'col', barGrouping: 'stacked' } : {}),
    barGapWidthPct: 55, lineSize: 3, lineDataSymbolSize: 8, lineDataSymbol: 'circle', holeSize: 58, dataBorder: pie ? { pt: 1.5, color: bg.slice(1) } : undefined,
    catAxisLabelFontFace: fontBody, catAxisLabelFontSize: 12, catAxisLabelColor: ink.slice(1), valAxisLabelFontFace: fontBody, valAxisLabelFontSize: 11, valAxisLabelColor: muted, valAxisLabelFormatCode: unitFmt,
    valGridLine: { color: grid, size: 0.75, style: 'solid' }, catGridLine: { style: 'none' }, valAxisLineShow: false, catAxisLineShow: true,
    showValue: !many && chart.type !== 'area' && chart.type !== 'stacked' && (chart.series.length === 1 || (chart.series.length <= 2 && chart.type !== 'line')), dataLabelFontFace: fontBody, dataLabelFontSize: 12, dataLabelColor: pie ? (lightness(colors[0]) > 0.6 ? '1F1F1F' : 'FFFFFF') : ink.slice(1), dataLabelFormatCode: pie ? '0%' : unitFmt, dataLabelPosition: pie ? 'bestFit' : chart.type === 'bar' || chart.type === 'column' ? 'outEnd' : 't',
    ...(pie ? { showPercent: true, showValue: false } : {}),
  } };
}

// ---------- CSV ----------
const splitRow = (line, d) => { const out = []; let cur = '', q = false; for (const ch of line) { if (ch === '"') q = !q; else if (ch === d && !q) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out.map((x) => x.trim()); };
/** First column = labels, every other numeric column = a series (header row = names). */
export function chartFromCsv(text, type = 'column', unit) {
  const lines = String(text).replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2 || lines.length > LIM.labels + 1) throw httpError(400, `CSV needs a header row and 1-${LIM.labels} data rows.`);
  const d = [',', ';', '\t'].map((x) => [x, lines[0].split(x).length]).sort((a, b) => b[1] - a[1])[0][0], rows = lines.map((l) => splitRow(l, d)), head = rows[0], body = rows.slice(1);
  const parse = (x) => { const n = Number(String(x).replace(/[\s,$€£%]/g, '').replace(/^\((.*)\)$/, '-$1')); return Number.isFinite(n) && String(x).trim() !== '' ? n : null; };
  const series = [];
  for (let c = 1; c < head.length; c++) { const vals = body.map((r) => parse(r[c])); if (vals.every((v) => v !== null)) series.push({ name: head[c] || `Series ${c}`, values: vals }); }
  if (!series.length) throw httpError(422, 'No numeric columns found. Put labels in the first column and numbers in the others.');
  return checkChart({ type, labels: body.map((r) => r[0] || '—'), series: series.slice(0, LIM.series), ...(unit && { unit }) });
}
