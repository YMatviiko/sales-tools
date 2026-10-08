// The slide catalog: 42 slide types beyond the 9 core layouts, each = allowed fields + a builder that returns a scene
// (lib/scene.mjs) + a sample. The same definition validates input, draws native PowerPoint shapes/tables and the HTML preview.
import { box, text, line, table, pic, connect, fitSize, textFits } from './scene.mjs';
import { mix, forBackground } from './charts.mjs';
import { contrast } from './color.mjs';
import { registerCatalog } from './layouts.mjs';
import { httpError } from './safeurl.mjs';

// ---------- field DSL ----------
const s = (max, o = {}) => ({ t: 's', max, ...o });
const l = (maxN, maxLen, o = {}) => ({ t: 'l', maxN, maxLen, ...o });
const ob = (maxN, shape, o = {}) => ({ t: 'o', maxN, shape, ...o });
const bo = () => ({ t: 'b' });
const en = (vals) => ({ t: 'e', vals });
const nu = (min, max) => ({ t: 'n', min, max });
const COMMON = { title: s(90, { req: true }), subtitle: s(140), tone: en(['light', 'dark']), comp: en(['top', 'panel']) };

function check(v, spec, path) {
  const bad = (m) => { throw httpError(400, `${path}: ${m}`); };
  if (spec.t === 's') { if (typeof v !== 'string' || (!v.length && spec.req) || v.length > spec.max) bad(`must be text up to ${spec.max} characters${spec.req ? ' (required)' : ''}.`); }
  else if (spec.t === 'l') { if (!Array.isArray(v) || v.length > spec.maxN || v.length < (spec.min ?? 0)) bad(`must be a list of ${spec.min ? spec.min + '-' : 'up to '}${spec.maxN} items.`); v.forEach((x, i) => { if (typeof x !== 'string' || x.length > spec.maxLen) bad(`item ${i + 1} must be text up to ${spec.maxLen} characters.`); }); }
  else if (spec.t === 'o') { if (!Array.isArray(v) || v.length > spec.maxN || v.length < (spec.min ?? 0)) bad(`must be a list of ${spec.min ? spec.min + '-' : 'up to '}${spec.maxN} items.`); v.forEach((x, i) => { if (!x || typeof x !== 'object' || Array.isArray(x)) bad(`item ${i + 1} must be an object.`); checkObj(x, spec.shape, `${path}[${i + 1}]`); }); }
  else if (spec.t === 'b') { if (typeof v !== 'boolean') bad('must be true or false.'); }
  else if (spec.t === 'e') { if (!spec.vals.includes(v)) bad(`must be one of ${spec.vals.join(', ')}.`); }
  else if (spec.t === 'n') { if (!Number.isInteger(v) || v < spec.min || v > spec.max) bad(`must be a whole number ${spec.min}-${spec.max}.`); }
}
function checkObj(o, shape, path, extra = {}) {
  for (const k of Object.keys(o)) if (!(k in shape) && !(k in extra)) throw httpError(400, `${path}: unknown field "${k}". Allowed: ${[...Object.keys(extra), ...Object.keys(shape)].join(', ')}.`);
  for (const [k, spec] of Object.entries(shape)) { if (o[k] === undefined) { if (spec.req) throw httpError(400, `${path}.${k}: is required.`); continue; } check(o[k], spec, `${path}.${k}`); }
}

// ---------- geometry helpers ----------
const cols = (X, n, gap = 0.3, x0 = X.left, w = X.inner) => { const cw = (w - gap * (n - 1)) / n; return Array.from({ length: n }, (_, i) => ({ x: x0 + i * (cw + gap), w: cw })); };
const y0 = (X, c) => (X.panel ? X.top + 0.25 : X.top + (c.subtitle ? 0.55 : 0.1));
// The subtitle sits under the headline, or inside the brand panel on panel slides. `fixed` keeps it out of vertical re-centring.
const sub = (X, c) => (!c.subtitle ? [] : X.panel
  ? [{ ...text(X.panel.x + 0.5, 5.2, X.panel.w - 1.0, 1.4, c.subtitle, { size: 18, color: mix(X.panel.ink, X.panel.bg, 0.22), valign: 'bottom' }), fixed: true }]
  : [{ ...text(X.left, X.top - 0.05, X.inner, 0.5, c.subtitle, { size: 18, color: X.soft }), fixed: true }]);
const label = (X, x, y, w, t, o = {}) => text(x, y, w, 0.3, String(t).toUpperCase(), { size: 11, bold: true, color: o.color ?? X.accent, ...o });
const rag = (X, level) => forBackground({ high: '#D1433A', medium: '#C98A00', low: '#2E9E5B', red: '#D1433A', amber: '#C98A00', green: '#2E9E5B' }[String(level).toLowerCase()] ?? '#808080', X.bg, 3);
const num = (X, x, y, d, n, o = {}) => box(x, y, d, d, { shape: 'ellipse', fill: o.fill ?? X.accent, text: String(n), size: o.size ?? Math.round(d * 28), bold: true, color: o.color ?? X.onAccent, margin: 0 });
const card = (X, x, y, w, h, o = {}) => box(x, y, w, h, { shape: 'round', fill: o.fill ?? X.card, stroke: o.stroke, strokeW: o.strokeW, radius: X.radius, shadow: X.shadow && !o.stroke && !o.fill });
const fit = (t, w, h, max, min = 10, o = {}) => fitSize(t, w, h, max, { min, ...o });
const bulletText = (X, x, y, w, h, items, o = {}) => text(x, y, w, h, items.map((t) => `${o.mark ?? ''}${t}`), { size: fit(items.join(' '), w, h, o.size ?? X.bodyPt, 11, { lh: 1.6 }), color: o.color ?? X.ink, bullets: o.bullets ?? false, gap: 5 });
const alignOf = (X) => (X.center ? 'center' : 'left');
const initials = (name, role) => { const pick = (t) => String(t ?? '').split(/\s+/).map((w) => w.replace(/[^\p{L}]/gu, '')[0]).filter(Boolean).slice(0, 2).join('').toUpperCase(); return pick(name) || pick(role) || '•'; };
// Progressive phase colour that keeps the label readable: lighter steps only while white-on-fill contrast stays >= 3.5.
const stage = (X, i, n) => { for (let t = Math.min(0.5, i * 0.12 + 0.0); t >= 0; t -= 0.04) { const c = mix(X.accent, X.bg, t); if (contrast(c, X.onAccent) >= 3.5) return c; } return X.accent; };

// ---------- the catalog ----------
export const GROUPS = { opening: 'Opening and context', case: 'Making the case', delivery: 'IT process and delivery', technical: 'Technical depth', plans: 'Plans and timelines', proof: 'Proof and people', commercial: 'Commercial and closing' };
export const TYPES = {};
const def = (name, group, summary, fields, build, example) => { TYPES[name] = { name, group, summary, fields: { ...COMMON, ...fields }, build, example }; };

// ===== Opening and context =====
def('agenda', 'opening', 'Numbered list of 3-7 items; optional "you are here" marker.', { items: l(7, 60, { min: 3 }), current: nu(1, 7) }, (X, c) => {
  const n = c.items.length, top = y0(X, c), rh = Math.min(0.85, (6.8 - top) / n), w = Math.min(X.inner, 9), x = X.center ? (X.W - w) / 2 : X.left, out = [...sub(X, c)];
  c.items.forEach((t, i) => { const y = top + i * rh, on = c.current === i + 1; if (on) out.push(card(X, x - 0.15, y - 0.04, w + 0.3, rh - 0.1, { fill: X.card })); out.push(num(X, x, y + (rh - 0.6) / 2 - 0.05, 0.6, i + 1, { fill: on ? X.accent : X.faint, color: on ? X.onAccent : X.ink }), text(x + 0.9, y, w - 0.9, rh - 0.1, t, { size: fit(t, w - 0.9, rh - 0.1, 26, 14), bold: on, valign: 'middle', color: X.ink })); });
  return out;
}, { title: 'Agenda', items: ['Your situation and goals', 'How we would approach it', 'Delivery and governance', 'Commercials and next steps'], current: 2 });

def('at-a-glance', 'opening', '2-4 big numbers with labels (e.g. years, countries, customers).', { items: ob(4, { value: s(12, { req: true }), label: s(60, { req: true }) }, { min: 2 }) }, (X, c) => {
  const g = cols(X, c.items.length, 0.5), top = y0(X, c) + 0.9, out = [...sub(X, c)];
  c.items.forEach((it, i) => out.push(text(g[i].x, top + 0.25, g[i].w, 1.5, it.value, { font: 'head', bold: true, size: fit(it.value, g[i].w, 1.5, 66, 30), color: X.accent, valign: 'middle' }), text(g[i].x, top + 1.85, g[i].w, 1.2, it.label, { size: fit(it.label, g[i].w, 1.2, 20, 12), color: X.ink })));
  return out;
}, { title: '[Company] at a glance', items: [{ value: '15+', label: 'years delivering IT services' }, { value: '40', label: 'countries with delivery teams' }, { value: '98%', label: 'customer satisfaction' }] });

def('big-number', 'opening', 'One huge figure with a caption and optional note.', { value: s(14, { req: true }), caption: s(120, { req: true }), note: s(160) }, (X, c) => {
  const a = alignOf(X); return [text(X.left, 1.9, X.inner, 2.5, c.value, { font: 'head', bold: true, size: fit(c.value, X.inner, 2.5, 150, 60), color: X.accent, align: a, valign: 'middle' }), text(X.left, 4.5, X.inner, 1.0, c.caption, { size: fit(c.caption, X.inner, 1.0, 32, 18), align: a, bold: true }), ...(c.note ? [text(X.left, 5.65, X.inner, 0.8, c.note, { size: fit(c.note, X.inner, 0.8, 16, 11), color: X.soft, align: a })] : [])];
}, { title: 'The result in one number', value: '38%', caption: 'faster ticket resolution in the first year', note: 'Measured across all supported services.' });

def('customer-context', 'opening', '"What we heard from you": 3-4 points and one quote.', { points: l(4, 100, { min: 2 }), quote: s(200), cite: s(60) }, (X, c) => {
  const top = y0(X, c), hasQ = !!c.quote, stack = hasQ && !!X.panel, lw = hasQ && !stack ? X.inner * 0.58 : X.inner, ph = stack ? 0.78 : 1.0, out = [...sub(X, c), label(X, X.left, top, lw, 'What we heard')];
  c.points.forEach((p, i) => { const y = top + 0.45 + i * ph; out.push(num(X, X.left, y + 0.08, 0.42, i + 1, { size: 13 }), text(X.left + 0.65, y, lw - 0.65, ph - 0.1, p, { size: fit(p, lw - 0.65, ph - 0.1, stack ? 17 : 20, 12), valign: 'middle' })); });
  if (stack) { const qy = top + 0.6 + c.points.length * ph, qh = Math.min(1.9, 6.9 - qy); out.push(card(X, X.left, qy, X.inner, qh), box(X.left + 0.3, qy + 0.25, 0.08, qh - 0.5, { shape: 'rect', fill: X.accent }), text(X.left + 0.6, qy + 0.1, X.inner - 0.9, qh - 0.2, `“${c.quote}”${c.cite ? '  — ' + c.cite : ''}`, { size: fit(c.quote, X.inner - 0.9, qh - 0.2, 20, 13), italic: true, font: 'head', valign: 'middle' })); }
  else if (hasQ) { const qx = X.left + lw + 0.5, qw = X.inner - lw - 0.5; out.push(card(X, qx, top, qw, 4.1), box(qx + 0.3, top + 0.3, 0.08, 2.4, { shape: 'rect', fill: X.accent }), text(qx + 0.6, top + 0.3, qw - 0.9, 2.9, `“${c.quote}”`, { size: fit(c.quote, qw - 0.9, 2.9, 24, 14), italic: true, font: 'head', valign: 'middle' }), ...(c.cite ? [text(qx + 0.6, top + 3.3, qw - 0.9, 0.5, c.cite, { size: 13, color: X.soft })] : [])); }
  return out;
}, { title: 'What we heard from you', points: ['Reduce time to resolve incidents', 'One accountable partner across all services', 'Predictable monthly cost'], quote: 'We need fewer hand-offs and clearer ownership.', cite: 'Head of IT, customer' });

def('objectives', 'opening', 'Goals and how success is measured (3-5 rows).', { items: ob(5, { goal: s(90, { req: true }), measure: s(70, { req: true }) }, { min: 2 }) }, (X, c) => {
  const top = y0(X, c), rh = Math.min(0.95, (6.7 - top - 0.5) / c.items.length), lw = X.inner * 0.58, out = [...sub(X, c), label(X, X.left, top, lw, 'Objective'), label(X, X.left + lw + 0.3, top, X.inner - lw - 0.3, 'How we measure it')];
  c.items.forEach((it, i) => { const y = top + 0.5 + i * rh; out.push(line(X.left, y - 0.06, X.right, y - 0.06, { color: X.line, width: 0.75 }), text(X.left, y, lw, rh - 0.1, it.goal, { size: fit(it.goal, lw, rh - 0.1, 20, 13), valign: 'middle', bold: true }), text(X.left + lw + 0.3, y, X.inner - lw - 0.3, rh - 0.1, it.measure, { size: fit(it.measure, X.inner - lw - 0.3, rh - 0.1, 18, 12), valign: 'middle', color: X.accent, bold: true })); });
  return out;
}, { title: 'Objectives and success measures', items: [{ goal: 'Faster incident resolution', measure: 'Mean time to resolve under 4 hours' }, { goal: 'Stable services', measure: '99.9% monthly availability' }, { goal: 'Lower run cost', measure: '15% reduction in year one' }] });

// ===== Making the case =====
def('problem-solution', 'case', 'Two contrasting columns: today versus with us.', { problem_title: s(30), problem: l(4, 90, { min: 1 }), solution_title: s(30), solution: l(4, 90, { min: 1 }) }, (X, c) => {
  const top = y0(X, c), [a, b] = cols(X, 2, 0.8), h = 4.2, out = [...sub(X, c), card(X, a.x, top, a.w, h), card(X, b.x, top, b.w, h, { fill: X.card, stroke: X.accent, strokeW: 2 })];
  out.push(label(X, a.x + 0.35, top + 0.3, a.w - 0.7, c.problem_title ?? 'Today', { color: X.soft }), bulletText(X, a.x + 0.35, top + 0.75, a.w - 0.7, h - 1.0, c.problem, { bullets: true }), label(X, b.x + 0.35, top + 0.3, b.w - 0.7, c.solution_title ?? 'With us'), bulletText(X, b.x + 0.35, top + 0.75, b.w - 0.7, h - 1.0, c.solution, { bullets: true }), line(a.x + a.w + 0.1, top + h / 2, b.x - 0.1, top + h / 2, { color: X.accent, width: 2.5, arrow: true }));
  return out;
}, { title: 'From today to a managed service', problem: ['Several suppliers, unclear ownership', 'Slow, manual hand-offs', 'Costs vary month to month'], solution: ['One accountable partner', 'Automated, tracked workflows', 'Fixed monthly price'] });

def('benefits', 'case', '3-6 benefit cards with a headline and a line of text.', { items: ob(6, { title: s(40, { req: true }), text: s(130) }, { min: 3 }) }, (X, c) => {
  const n = c.items.length, top = y0(X, c), out = [...sub(X, c)];
  if (X.panel) {                                   // narrow area beside the brand panel: one wide row per benefit
    const h = Math.min(1.45, (6.75 - top - 0.2 * (n - 1)) / n);
    c.items.forEach((it, i) => { const y = top + i * (h + 0.2); out.push(card(X, X.left, y, X.inner, h), text(X.left + 0.3, y, 1.0, h, String(i + 1).padStart(2, '0'), { font: 'head', bold: true, size: 36, color: X.pop, valign: 'middle' }), text(X.left + 1.4, y + 0.1, X.inner - 1.7, h * 0.42, it.title, { font: 'head', bold: true, size: fit(it.title, X.inner - 1.7, h * 0.42, 22, 13), valign: 'bottom' }), ...(it.text ? [text(X.left + 1.4, y + h * 0.5, X.inner - 1.7, h * 0.45, it.text, { size: fit(it.text, X.inner - 1.7, h * 0.45, 17, 11), color: X.soft })] : [])); });
    return out;
  }
  const per = n <= 4 ? n : 3, rows = Math.ceil(n / per), g = cols(X, per, 0.3), h = rows === 1 ? 3.9 : 2.55;
  c.items.forEach((it, i) => { const r = Math.floor(i / per), x = g[i % per].x, w = g[i % per].w, y = top + r * (h + 0.3); out.push(card(X, x, y, w, h), text(x + 0.35, y + 0.25, w - 0.7, 0.8, String(i + 1).padStart(2, '0'), { font: 'head', bold: true, size: 40, color: X.pop, valign: 'middle' }), text(x + 0.3, y + 1.05, w - 0.6, 1.0, it.title, { font: 'head', bold: true, size: fit(it.title, w - 0.6, 1.0, 24, 13), valign: 'top' }), ...(it.text ? [text(x + 0.3, y + 2.15, w - 0.6, h - 2.3, it.text, { size: fit(it.text, w - 0.6, h - 2.3, 18, 12), color: X.soft })] : [])); });
  return out;
}, { title: 'Why customers choose us', items: [{ title: 'One partner', text: 'A single point of accountability for every service.' }, { title: 'Faster delivery', text: 'Standard playbooks and automation cut lead times.' }, { title: 'Predictable cost', text: 'Fixed monthly pricing with clear scope.' }] });

def('before-after', 'case', 'Two halves: before and after, with a figure or a sentence each.', { before_title: s(30), before_value: s(14), before_text: s(140), after_title: s(30), after_value: s(14), after_text: s(140) }, (X, c) => {
  const top = y0(X, c), [a, b] = cols(X, 2, 1.0), h = 4.0, out = [...sub(X, c), card(X, a.x, top, a.w, h), card(X, b.x, top, b.w, h, { stroke: X.accent, strokeW: 2 })];
  const half = (p, x, w, t, v, tx, accent) => { out.push(label(X, x + 0.35, top + 0.3, w - 0.7, t, { color: accent ? X.accent : X.soft })); if (v) out.push(text(x + 0.35, top + 0.8, w - 0.7, 1.4, v, { font: 'head', bold: true, size: fit(v, w - 0.7, 1.4, 72, 30), color: accent ? X.accent : X.ink, valign: 'middle' })); if (tx) out.push(text(x + 0.35, top + (v ? 2.3 : 1), w - 0.7, h - (v ? 2.5 : 1.2), tx, { size: fit(tx, w - 0.7, h - 2.5, 20, 12), color: X.ink })); };
  half(0, a.x, a.w, c.before_title ?? 'Before', c.before_value, c.before_text, false); half(1, b.x, b.w, c.after_title ?? 'After', c.after_value, c.after_text, true);
  out.push(line(a.x + a.w + 0.15, top + h / 2, b.x - 0.15, top + h / 2, { color: X.accent, width: 3, arrow: true }));
  return out;
}, { title: 'Before and after', before_value: '9 days', before_text: 'average time to onboard a new service', after_value: '2 days', after_text: 'with the standard onboarding playbook' });

def('comparison', 'case', 'Table comparing us with alternatives (ticks or short text).', { columns: l(4, 24, { min: 2 }), rows: ob(7, { label: s(50, { req: true }), values: l(4, 28) }, { min: 2 }), recommended: nu(1, 4) }, (X, c) => {
  const nc = c.columns.length, lw = X.inner * 0.32, vw = (X.inner - lw) / nc, rec = c.recommended;
  const head = [{ text: '' }, ...c.columns.map((t, i) => ({ text: t, align: 'center', fill: i + 1 === rec ? mix(X.accent, '#000000', 0.25) : undefined }))];
  const rows = c.rows.map((r) => [{ text: r.label, bold: true }, ...Array.from({ length: nc }, (_, i) => { const v = r.values?.[i] ?? ''; return { text: v, align: 'center', bold: v === '✓', color: v === '✓' ? X.accent : v === '✗' ? X.soft : X.ink, fill: i + 1 === rec ? mix(X.accent, X.bg, 0.88) : undefined }; })]);
  return [...sub(X, c), table(X.left, y0(X, c), X.inner, [lw, ...Array(nc).fill(vw)], [head, ...rows], { rowH: Math.min(0.55, 4.3 / (rows.length + 1)), size: 14 })];
}, { title: 'How we compare', columns: ['Us', 'In-house', 'Typical vendor'], recommended: 1, rows: [{ label: '24x7 coverage', values: ['✓', '✗', '✓'] }, { label: 'Single point of contact', values: ['✓', '✗', '✗'] }, { label: 'Fixed monthly price', values: ['✓', 'n/a', '✗'] }] });

def('options', 'case', '2-3 options with pros and cons; mark the recommended one.', { items: ob(3, { title: s(40, { req: true }), pros: l(3, 70), cons: l(3, 70), recommended: bo() }, { min: 2 }) }, (X, c) => {
  const top = y0(X, c), g = cols(X, c.items.length, 0.4), h = 4.3, out = [...sub(X, c)];
  c.items.forEach((it, i) => { const { x, w } = g[i], r = !!it.recommended; out.push(card(X, x, top, w, h, { stroke: r ? X.accent : undefined, strokeW: r ? 2.5 : 1 }), text(x + 0.3, top + 0.25, w - 0.6, 0.9, it.title, { font: 'head', bold: true, size: fit(it.title, w - 0.6, 0.9, 20, 14), valign: 'middle' }));
    if (r) out.push(box(x + w - 1.75, top - 0.18, 1.55, 0.36, { shape: 'round', fill: X.accent, text: 'Recommended', size: 11, bold: true, color: X.onAccent, radius: 0.18 }));
    const pr = (it.pros ?? []).map((t) => `+  ${t}`), co = (it.cons ?? []).map((t) => `–  ${t}`);
    out.push(bulletText(X, x + 0.3, top + 1.2, w - 0.6, 1.5, pr, { color: X.ink, size: 15 }), bulletText(X, x + 0.3, top + 2.8, w - 0.6, 1.3, co, { color: X.soft, size: 15 })); });
  return out;
}, { title: 'Options', items: [{ title: 'Keep as is', pros: ['No change effort'], cons: ['Costs keep rising', 'No improvement'] }, { title: 'Managed service', recommended: true, pros: ['One accountable partner', 'Fixed monthly price', 'Faster resolution'], cons: ['Transition effort'] }, { title: 'Build in-house', pros: ['Full control'], cons: ['Hiring time', 'Higher cost'] }] });

def('value-case', 'case', 'Three figures (cost, saving, payback) with a short note.', { items: ob(3, { value: s(14, { req: true }), label: s(50, { req: true }) }, { min: 3 }), note: s(200) }, (X, c) => {
  const g = cols(X, 3, 0.4), top = y0(X, c) + 0.2, out = [...sub(X, c)];
  c.items.forEach((it, i) => out.push(card(X, g[i].x, top, g[i].w, 3.1), text(g[i].x + 0.3, top + 0.3, g[i].w - 0.6, 1.6, it.value, { font: 'head', bold: true, size: fit(it.value, g[i].w - 0.6, 1.6, 56, 26), color: X.accent, valign: 'middle' }), text(g[i].x + 0.3, top + 2.0, g[i].w - 0.6, 0.9, it.label, { size: fit(it.label, g[i].w - 0.6, 0.9, 18, 12), color: X.ink })));
  if (c.note) out.push(text(X.left, top + 3.5, X.inner, 0.9, c.note, { size: fit(c.note, X.inner, 0.9, 16, 11), color: X.soft }));
  return out;
}, { title: 'The business case', items: [{ value: '€1.2M', label: 'annual run cost today' }, { value: '−18%', label: 'projected saving per year' }, { value: '14 months', label: 'payback period' }], note: 'Based on the cost model shared on [date]; assumptions in the appendix.' });

// ===== IT process and delivery =====
def('process-steps', 'delivery', '3-6 numbered steps in a row, each with a short description.', { steps: ob(6, { title: s(36, { req: true }), text: s(110) }, { min: 3 }) }, (X, c) => {
  const n = c.steps.length, g = cols(X, n, 0.25), cy = y0(X, c) + 0.6, d = 0.8, out = [...sub(X, c)];
  g.forEach((q, i) => { if (i < n - 1) out.push(line(q.x + d + 0.05, cy + d / 2, g[i + 1].x - 0.1, cy + d / 2, { color: X.accent, width: 2, arrow: true })); });
  c.steps.forEach((st, i) => { const { x, w } = g[i]; out.push(num(X, x, cy, d, i + 1, { size: 22 }), text(x, cy + 1.1, w, 0.9, st.title, { font: 'head', bold: true, size: fit(st.title, w, 0.9, 20, 12) }), ...(st.text ? [text(x, cy + 2.05, w, 2.2, st.text, { size: fit(st.text, w, 2.2, 15, 11), color: X.soft })] : [])); });
  return out;
}, { title: 'How it works', steps: [{ title: 'Discover', text: 'Map services, owners and tooling.' }, { title: 'Design', text: 'Agree scope, roles and service levels.' }, { title: 'Transition', text: 'Move services with no gap in cover.' }, { title: 'Run', text: 'Operate, report and improve.' }] });

def('process-flow', 'delivery', 'Flow diagram: boxes, decisions and arrows (3-10 nodes).', { nodes: ob(10, { id: s(20, { req: true }), text: s(50, { req: true }), kind: en(['start', 'step', 'decision', 'end']) }, { min: 3 }), links: ob(14, { from: s(20, { req: true }), to: s(20, { req: true }), label: s(20) }) }, (X, c) => {
  const n = c.nodes.length, per = n <= 5 ? n : Math.ceil(n / 2), rows = Math.ceil(n / per), top = y0(X, c) + 0.1, area = 6.7 - top, rowH = area / rows, gap = 0.5, w = Math.min(2.3, (X.inner - gap * (per - 1)) / per), pos = {};
  const out = [...sub(X, c)];
  c.nodes.forEach((nd, i) => { const r = Math.floor(i / per), k = i % per, inRow = Math.min(per, n - r * per), x0 = X.left + (X.inner - (inRow * w + (inRow - 1) * gap)) / 2, dec = nd.kind === 'decision', h = dec ? 1.5 : 1.0, bw = dec ? w + 0.3 : w, x = x0 + k * (w + gap) - (dec ? 0.15 : 0), y = top + r * rowH + (rowH - h) / 2 - (rows > 1 ? 0.15 : 0);
    const shape = dec ? 'diamond' : nd.kind === 'start' || nd.kind === 'end' ? 'round' : 'round', fill = nd.kind === 'start' || nd.kind === 'end' ? X.accent : dec ? X.faint : X.card;
    pos[nd.id] = { x, y, w: bw, h, r, k, e: box(x, y, bw, h, { shape, fill, stroke: nd.kind === 'step' || !nd.kind ? X.line : undefined, radius: nd.kind === 'start' || nd.kind === 'end' ? 0.5 : X.radius, text: nd.text, size: fit(nd.text, bw * (dec ? 0.62 : 0.88), h * (dec ? 0.55 : 0.8), 15, 10), bold: nd.kind === 'start' || nd.kind === 'end', color: nd.kind === 'start' || nd.kind === 'end' ? X.onAccent : X.ink }) }; out.push(pos[nd.id].e); });
  const links = c.links?.length ? c.links : c.nodes.slice(1).map((nd, i) => ({ from: c.nodes[i].id, to: nd.id }));
  for (const lk of links) {
    const a = pos[lk.from], b = pos[lk.to]; if (!a || !b) throw httpError(400, `slide process-flow: link ${lk.from} -> ${lk.to} refers to an unknown node id.`);
    let segs;
    if (a.r === b.r && Math.abs(a.k - b.k) > 1) { const yt = Math.min(a.y, b.y) - 0.3, ax = a.x + a.w / 2, bx = b.x + b.w / 2; segs = [line(ax, a.y, ax, yt, { color: X.accent, width: 1.75 }), line(ax, yt, bx, yt, { color: X.accent, width: 1.75 }), line(bx, yt, bx, b.y, { color: X.accent, width: 1.75, arrow: true })]; }
    else segs = connect(a, b, { color: X.accent, width: 1.75 });
    out.push(...segs); if (lk.label) { const m = segs[Math.floor(segs.length / 2)]; out.push(text(Math.min(m.x1, m.x2) + 0.05, Math.min(m.y1, m.y2) - 0.3, 1.0, 0.28, lk.label, { size: 11, bold: true, color: X.soft })); }
  }
  return out;
}, { title: 'Incident handling flow', nodes: [{ id: 'a', text: 'Incident raised', kind: 'start' }, { id: 'b', text: 'Triage and prioritise' }, { id: 'c', text: 'Major incident?', kind: 'decision' }, { id: 'd', text: 'Resolve and verify' }, { id: 'e', text: 'Closed', kind: 'end' }], links: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }, { from: 'c', to: 'd', label: 'No' }, { from: 'd', to: 'e' }] });

def('swimlane', 'delivery', 'Who does what, by team, across stages (2-4 lanes).', { lanes: l(4, 24, { min: 2 }), steps: ob(12, { lane: s(24, { req: true }), text: s(44, { req: true }), col: nu(1, 6) }, { min: 2 }) }, (X, c) => {
  const top = y0(X, c), nl = c.lanes.length, lh = Math.min(1.35, (6.8 - top) / nl), lw = 1.7, x0 = X.left + lw + 0.2, ncol = Math.max(...c.steps.map((st, i) => st.col ?? i + 1)), cw = (X.right - x0) / Math.max(ncol, 3), out = [...sub(X, c)];
  c.lanes.forEach((nm, i) => out.push(box(X.left, top + i * lh, X.inner, lh - 0.08, { shape: 'round', fill: i % 2 ? X.bg : X.card, stroke: X.line, radius: 0.06 }), box(X.left, top + i * lh, lw, lh - 0.08, { shape: 'round', fill: X.accent, text: nm, size: fit(nm, lw - 0.2, lh - 0.3, 14, 10), bold: true, color: X.onAccent, radius: 0.06 })));
  const placed = c.steps.map((st, i) => { const li = c.lanes.indexOf(st.lane); if (li < 0) throw httpError(400, `slide swimlane: step "${st.text}" uses lane "${st.lane}" which is not in lanes.`); const w = cw - 0.2, h = Math.min(0.85, lh - 0.35); return { x: x0 + ((st.col ?? i + 1) - 1) * cw + 0.05, y: top + li * lh + (lh - 0.08 - h) / 2, w, h, t: st.text }; });
  placed.forEach((p, i) => { if (i) out.push(...connect(placed[i - 1], p, { color: X.accent, width: 1.5 })); });
  placed.forEach((p) => out.push(box(p.x, p.y, p.w, p.h, { shape: 'round', fill: X.bg, stroke: X.accent, strokeW: 1.5, text: p.t, size: fit(p.t, p.w - 0.15, p.h - 0.1, 13, 9), radius: X.radius })));
  return out;
}, { title: 'Who does what', lanes: ['Customer', 'Service desk', 'Resolver team'], steps: [{ lane: 'Customer', text: 'Raise request', col: 1 }, { lane: 'Service desk', text: 'Log and classify', col: 2 }, { lane: 'Resolver team', text: 'Fix and test', col: 3 }, { lane: 'Service desk', text: 'Confirm with customer', col: 4 }] });

def('service-description', 'delivery', 'What the service is, for whom, what is included and excluded, and hours.', { what: s(260, { req: true }), for_whom: s(160), included: l(5, 70, { min: 1 }), excluded: l(4, 70), hours: s(80) }, (X, c) => {
  const top = y0(X, c), lw = X.inner * 0.46, rx = X.left + lw + 0.5, rw = X.inner - lw - 0.5, out = [...sub(X, c), label(X, X.left, top, lw, 'The service'), text(X.left, top + 0.4, lw, 2.2, c.what, { size: fit(c.what, lw, 2.2, 20, 13) })];
  if (c.for_whom) out.push(label(X, X.left, top + 2.8, lw, 'Who it is for', { color: X.soft }), text(X.left, top + 3.2, lw, 1.0, c.for_whom, { size: fit(c.for_whom, lw, 1.0, 16, 11), color: X.soft }));
  out.push(card(X, rx, top, rw, c.excluded?.length ? 2.4 : 3.6), label(X, rx + 0.3, top + 0.25, rw - 0.6, 'Included'), bulletText(X, rx + 0.3, top + 0.65, rw - 0.6, (c.excluded?.length ? 2.4 : 3.6) - 0.8, c.included, { mark: '✓  ', size: 16 }));
  if (c.excluded?.length) out.push(card(X, rx, top + 2.6, rw, 1.65), label(X, rx + 0.3, top + 2.8, rw - 0.6, 'Not included', { color: X.soft }), bulletText(X, rx + 0.3, top + 3.15, rw - 0.6, 1.0, c.excluded, { mark: '✕  ', size: 14, color: X.soft }));
  if (c.hours) out.push(box(X.left, 6.35, 5.5, 0.45, { shape: 'round', fill: X.faint, text: `Coverage: ${c.hours}`, size: 13, align: 'left', radius: 0.22, margin: 12 }));
  return out;
}, { title: 'Service description: Service Desk', what: 'First-line support for all users: we log, classify, resolve or route every request and keep users informed.', for_whom: 'All employees and contractors across your locations.', included: ['Single point of contact', 'Incident and request handling', 'Monthly service report'], excluded: ['On-site hardware repair', 'Application development'], hours: 'Mon-Fri 08:00-18:00, on-call outside hours' });

def('sla', 'delivery', 'Service levels as a table: priority, response, resolution (and coverage).', { rows: ob(6, { priority: s(24, { req: true }), response: s(24, { req: true }), resolution: s(24, { req: true }), coverage: s(24) }, { min: 2 }), note: s(160) }, (X, c) => {
  const cov = c.rows.some((r) => r.coverage), head = ['Priority', 'Response', 'Resolution', ...(cov ? ['Coverage'] : [])], w = [2.3, 2.4, 2.4, ...(cov ? [2.4] : [])], k = X.inner / w.reduce((a, b) => a + b, 0);
  const rows = c.rows.map((r) => [{ text: r.priority, bold: true }, r.response, r.resolution, ...(cov ? [r.coverage ?? '—'] : [])]);
  return [...sub(X, c), table(X.left, y0(X, c), X.inner, w.map((v) => v * k), [head, ...rows], { rowH: Math.min(0.6, 4.2 / (rows.length + 1)), size: 15 }), ...(c.note ? [text(X.left, 6.3, X.inner, 0.5, c.note, { size: 12, color: X.soft })] : [])];
}, { title: 'Service levels', rows: [{ priority: 'P1 Critical', response: '15 minutes', resolution: '4 hours', coverage: '24x7' }, { priority: 'P2 High', response: '1 hour', resolution: '8 hours', coverage: '24x7' }, { priority: 'P3 Medium', response: '4 hours', resolution: '3 days', coverage: 'Business hours' }], note: 'Times measured from ticket creation.' });

def('raci', 'delivery', 'Roles and responsibilities by activity (R, A, C, I).', { roles: l(5, 22, { min: 2 }), activities: ob(8, { activity: s(54, { req: true }), assign: l(5, 3) }, { min: 2 }) }, (X, c) => {
  const nr = c.roles.length, aw = X.inner * 0.34, rw = (X.inner - aw) / nr, top = y0(X, c);
  const head = [{ text: 'Activity' }, ...c.roles.map((r) => ({ text: r, align: 'center' }))];
  const rows = c.activities.map((a) => [{ text: a.activity, bold: true }, ...Array.from({ length: nr }, (_, i) => { const v = a.assign?.[i] ?? ''; const on = /A|R/.test(v); return { text: v, align: 'center', bold: on, color: on ? X.onAccent : X.ink, fill: /A/.test(v) ? X.accent : /R/.test(v) ? mix(X.accent, X.bg, 0.45) : undefined }; })]);
  return [...sub(X, c), table(X.left, top, X.inner, [aw, ...Array(nr).fill(rw)], [head, ...rows], { rowH: Math.min(0.55, 4.2 / (rows.length + 1)), size: 14, zebra: false }), text(X.left, 6.45, X.inner, 0.4, 'R  Responsible    A  Accountable    C  Consulted    I  Informed', { size: 12, color: X.soft })];
}, { title: 'Roles and responsibilities (RACI)', roles: ['Customer', 'Service manager', 'Resolver team'], activities: [{ activity: 'Approve changes', assign: ['A', 'R', 'C'] }, { activity: 'Resolve incidents', assign: ['I', 'A', 'R'] }, { activity: 'Report service levels', assign: ['I', 'R', 'C'] }] });

def('governance', 'delivery', 'Meetings (who, how often) and an optional escalation path.', { meetings: ob(5, { name: s(40, { req: true }), who: s(60), cadence: s(30) }, { min: 1 }), escalation: l(4, 40) }, (X, c) => {
  const top = y0(X, c), has = !!c.escalation?.length, tw = has ? X.inner * 0.64 : X.inner, rows = c.meetings.map((m) => [{ text: m.name, bold: true }, m.who ?? '—', m.cadence ?? '—']), out = [...sub(X, c)];
  out.push(table(X.left, top, tw, [tw * 0.36, tw * 0.4, tw * 0.24], [['Meeting', 'Who attends', 'How often'], ...rows], { rowH: Math.min(0.7, 4.2 / (rows.length + 1)), size: 14 }));
  if (has) { const ex = X.left + tw + 0.5, ew = X.inner - tw - 0.5, n = c.escalation.length, h = Math.min(0.8, 3.8 / n); out.push(label(X, ex, top, ew, 'Escalation path')); c.escalation.forEach((t, i) => { const y = top + 0.45 + (n - 1 - i) * (h + 0.3); const b = { x: ex, y, w: ew, h }; out.push(box(ex, y, ew, h, { shape: 'round', fill: i === n - 1 ? X.accent : X.card, text: t, size: fit(t, ew - 0.2, h - 0.1, 14, 10), bold: i === n - 1, color: i === n - 1 ? X.onAccent : X.ink, radius: X.radius })); if (i > 0) out.push(line(ex + ew / 2, y + h + 0.3, ex + ew / 2, y + h, { color: X.accent, width: 1.75, arrow: true })); void b; }); }
  return out;
}, { title: 'Governance', meetings: [{ name: 'Service review', who: 'Service manager, customer lead', cadence: 'Monthly' }, { name: 'Operations stand-up', who: 'Resolver team leads', cadence: 'Weekly' }, { name: 'Executive review', who: 'Sponsors', cadence: 'Quarterly' }], escalation: ['Service desk', 'Service manager', 'Delivery director'] });

def('incident-and-change', 'delivery', 'How incidents and changes are handled, as steps with owners.', { incident_steps: ob(5, { title: s(30, { req: true }), owner: s(24) }, { min: 2 }), change_steps: ob(5, { title: s(30, { req: true }), owner: s(24) }, { min: 2 }) }, (X, c) => {
  const top = y0(X, c), out = [...sub(X, c)], band = (y, name, steps) => { out.push(label(X, X.left, y, 3, name)); const g = cols(X, steps.length, 0.12); steps.forEach((st, i) => out.push(box(g[i].x, y + 0.4, g[i].w, 0.85, { shape: 'pentagon', fill: i === 0 ? X.accent : X.card, text: st.title, size: fit(st.title, g[i].w * 0.7, 0.6, 14, 10), bold: true, color: i === 0 ? X.onAccent : X.ink }), ...(st.owner ? [text(g[i].x + 0.05, y + 1.4, g[i].w * 0.85, 0.4, st.owner, { size: 12, color: X.soft, align: 'left' })] : []))); };
  band(top, 'Incidents', c.incident_steps); band(top + 2.15, 'Changes', c.change_steps); return out;
}, { title: 'Incident and change management', incident_steps: [{ title: 'Detect', owner: 'Monitoring' }, { title: 'Triage', owner: 'Service desk' }, { title: 'Resolve', owner: 'Resolver team' }, { title: 'Review', owner: 'Service manager' }], change_steps: [{ title: 'Request', owner: 'Customer' }, { title: 'Assess', owner: 'Change board' }, { title: 'Implement', owner: 'Resolver team' }, { title: 'Verify', owner: 'Service desk' }] });

def('onboarding-transition', 'delivery', 'Phases from kick-off to steady state, plus what the customer provides.', { phases: ob(5, { name: s(26, { req: true }), weeks: s(14), text: s(100) }, { min: 3 }), customer_provides: l(4, 70) }, (X, c) => {
  const top = y0(X, c), n = c.phases.length, g = cols(X, n, 0.1), out = [...sub(X, c)], has = !!c.customer_provides?.length;
  c.phases.forEach((p, i) => out.push(box(g[i].x, top, g[i].w, 0.95, { shape: 'pentagon', fill: stage(X, n - 1 - i, n), text: p.name, size: fit(p.name, g[i].w * 0.7, 0.6, 16, 11), bold: true, color: X.onAccent }), ...(p.weeks ? [text(g[i].x, top + 1.05, g[i].w, 0.35, p.weeks, { size: 13, bold: true, color: X.accent })] : []), ...(p.text ? [text(g[i].x, top + 1.45, g[i].w - 0.2, 1.7, p.text, { size: fit(p.text, g[i].w - 0.2, 1.7, 14, 10), color: X.soft })] : [])));
  if (has) out.push(card(X, X.left, top + 3.35, X.inner, 1.3), label(X, X.left + 0.3, top + 3.5, 4, 'What we need from you'), text(X.left + 0.3, top + 3.85, X.inner - 0.6, 0.75, c.customer_provides.map((t) => `•  ${t}`).join('     '), { size: fit(c.customer_provides.join('     '), X.inner - 0.6, 0.75, 15, 11) }));
  return out;
}, { title: 'Onboarding and transition', phases: [{ name: 'Kick-off', weeks: 'Weeks 1-2', text: 'Confirm scope, owners and plan.' }, { name: 'Knowledge transfer', weeks: 'Weeks 3-6', text: 'Document and shadow current operations.' }, { name: 'Parallel run', weeks: 'Weeks 7-10', text: 'Operate alongside the current team.' }, { name: 'Steady state', weeks: 'Week 11+', text: 'Full service and monthly reviews.' }], customer_provides: ['Access to systems', 'Named contacts', 'Current runbooks'] });

def('roles-team', 'delivery', 'Team structure: roles with optional names and a line each.', { roles: ob(6, { role: s(40, { req: true }), name: s(40), text: s(90) }, { min: 2 }) }, (X, c) => {
  const n = c.roles.length, per = n <= 3 ? n : n === 4 ? 4 : 3, rows = Math.ceil(n / per), g = cols(X, per, 0.3), top = y0(X, c), h = rows === 1 ? 3.6 : 2.2, out = [...sub(X, c)];
  c.roles.forEach((r, i) => { const { x, w } = g[i % per], y = top + Math.floor(i / per) * (h + 0.3); out.push(card(X, x, y, w, h), box(x + 0.3, y + 0.3, 0.7, 0.7, { shape: 'ellipse', fill: X.accent, text: initials(r.name, r.role), size: 18, bold: true, color: X.onAccent, margin: 0 }), text(x + 1.2, y + 0.3, w - 1.5, 0.7, r.role, { font: 'head', bold: true, size: fit(r.role, w - 1.5, 0.7, 18, 12), valign: 'middle' }), ...(r.name ? [text(x + 0.3, y + 1.15, w - 0.6, 0.35, r.name, { size: 14, color: X.accent, bold: true })] : []), ...(r.text ? [text(x + 0.3, y + (r.name ? 1.55 : 1.2), w - 0.6, h - 1.7, r.text, { size: fit(r.text, w - 0.6, h - 1.7, 14, 10), color: X.soft })] : [])); });
  return out;
}, { title: 'Your team', roles: [{ role: 'Service manager', name: '[Name]', text: 'Owns the relationship and service levels.' }, { role: 'Technical lead', name: '[Name]', text: 'Owns architecture and quality.' }, { role: 'Service desk lead', name: '[Name]', text: 'Runs daily operations.' }] });

def('tools-and-platforms', 'delivery', 'The tools used, grouped by purpose.', { groups: ob(4, { name: s(30, { req: true }), tools: l(6, 26, { min: 1 }) }, { min: 2 }) }, (X, c) => {
  const g = cols(X, c.groups.length, 0.35), top = y0(X, c), out = [...sub(X, c)];
  c.groups.forEach((gr, i) => { out.push(box(g[i].x, top, g[i].w, 0.55, { shape: 'round', fill: X.accent, text: gr.name, size: fit(gr.name, g[i].w - 0.2, 0.4, 15, 11), bold: true, color: X.onAccent, radius: X.radius })); gr.tools.forEach((t, j) => out.push(box(g[i].x, top + 0.75 + j * 0.62, g[i].w, 0.5, { shape: 'round', fill: X.card, stroke: X.line, text: t, size: fit(t, g[i].w - 0.2, 0.4, 14, 10), radius: X.radius }))); });
  return out;
}, { title: 'Tools and platforms', groups: [{ name: 'Service management', tools: ['ServiceNow', 'Jira Service Management'] }, { name: 'Monitoring', tools: ['Datadog', 'Grafana', 'PagerDuty'] }, { name: 'Automation', tools: ['Ansible', 'Terraform'] }] });

def('kpi-reporting', 'delivery', 'The metrics reported: target, how often, to whom.', { kpis: ob(6, { name: s(44, { req: true }), target: s(16), frequency: s(20, { req: true }), audience: s(30) }, { min: 2 }) }, (X, c) => {
  const w = [0.38, 0.17, 0.2, 0.25].map((v) => v * X.inner), rows = c.kpis.map((k) => [{ text: k.name, bold: true }, k.target ?? '—', k.frequency, k.audience ?? '—']);
  return [...sub(X, c), table(X.left, y0(X, c), X.inner, w, [['Metric', 'Target', 'Reported', 'To'], ...rows], { rowH: Math.min(0.62, 4.3 / (rows.length + 1)), size: 14 })];
}, { title: 'What we report', kpis: [{ name: 'Mean time to resolve', target: '< 4 h', frequency: 'Monthly', audience: 'Service review' }, { name: 'Availability', target: '99.9%', frequency: 'Monthly', audience: 'Service review' }, { name: 'Customer satisfaction', target: '> 90%', frequency: 'Quarterly', audience: 'Executive review' }] });

// ===== Technical depth =====
def('architecture', 'technical', 'Layered architecture: stacked bands of components with arrows between layers.', { layers: ob(5, { name: s(28, { req: true }), components: l(5, 26, { min: 1 }) }, { min: 2 }) }, (X, c) => {
  const n = c.layers.length, top = y0(X, c), gap = 0.32, h = Math.min(1.05, (6.8 - top - gap * (n - 1)) / n), lw = 2.2, out = [...sub(X, c)];
  c.layers.forEach((ly, i) => { const y = top + i * (h + gap); out.push(box(X.left, y, lw, h, { shape: 'round', fill: X.accent, text: ly.name, size: fit(ly.name, lw - 0.2, h - 0.2, 16, 11), bold: true, color: X.onAccent, radius: X.radius })); const g = cols(X, ly.components.length, 0.2, X.left + lw + 0.25, X.inner - lw - 0.25); ly.components.forEach((t, j) => out.push(box(g[j].x, y, g[j].w, h, { shape: 'round', fill: X.card, stroke: X.line, text: t, size: fit(t, g[j].w - 0.2, h - 0.2, 15, 10), radius: X.radius }))); if (i < n - 1) out.push(line(X.left + lw / 2, y + h, X.left + lw / 2, y + h + gap, { color: X.accent, width: 2, arrow: true })); });
  return out;
}, { title: 'Solution architecture', layers: [{ name: 'Experience', components: ['Web portal', 'Mobile app'] }, { name: 'Services', components: ['API gateway', 'Workflow engine', 'Identity'] }, { name: 'Data', components: ['Operational database', 'Data lake'] }, { name: 'Infrastructure', components: ['Cloud platform', 'Monitoring', 'Backup'] }] });

def('integration-map', 'technical', 'A central platform with connected systems around it.', { center: s(30, { req: true }), systems: l(8, 26, { min: 3 }) }, (X, c) => {
  const n = c.systems.length, left = Math.ceil(n / 2), right = n - left, top = y0(X, c), area = 6.7 - top, cw = 3.0, ch = 1.4, cx = (X.W - cw) / 2, cy = top + (area - ch) / 2, sw = 2.6, out = [...sub(X, c)];
  const centre = { x: cx, y: cy, w: cw, h: ch }, side = (items, xs, isLeft) => items.forEach((t, i) => { const h = 0.7, gap = (area - items.length * h) / (items.length + 1), y = top + gap + i * (h + gap), b = { x: xs, y, w: sw, h }; out.push(line(isLeft ? xs + sw : xs, y + h / 2, isLeft ? cx : cx + cw, cy + ch / 2, { color: X.accent, width: 1.75 }), box(xs, y, sw, h, { shape: 'round', fill: X.card, stroke: X.line, text: t, size: fit(t, sw - 0.2, h - 0.1, 15, 10), radius: X.radius })); void b; });
  side(c.systems.slice(0, left), X.left, true); side(c.systems.slice(left), X.right - sw, false); void right;
  out.push(box(cx, cy, cw, ch, { shape: 'round', fill: X.accent, text: c.center, size: fit(c.center, cw - 0.3, ch - 0.3, 22, 12), bold: true, color: X.onAccent, radius: X.radius }));
  return out;
}, { title: 'Integrations', center: 'Service platform', systems: ['HR system', 'Finance / ERP', 'Identity provider', 'Monitoring', 'CRM', 'Email and chat'] });

def('environments', 'technical', 'Dev, test and production side by side with what differs.', { envs: l(4, 20, { min: 2 }), rows: ob(6, { label: s(40, { req: true }), values: l(4, 40) }, { min: 2 }) }, (X, c) => {
  const ne = c.envs.length, lw = X.inner * 0.28, vw = (X.inner - lw) / ne, head = [{ text: '' }, ...c.envs.map((e) => ({ text: e, align: 'center' }))], rows = c.rows.map((r) => [{ text: r.label, bold: true }, ...Array.from({ length: ne }, (_, i) => ({ text: r.values?.[i] ?? '—', align: 'center' }))]);
  return [...sub(X, c), table(X.left, y0(X, c), X.inner, [lw, ...Array(ne).fill(vw)], [head, ...rows], { rowH: Math.min(0.62, 4.3 / (rows.length + 1)), size: 14 })];
}, { title: 'Environments', envs: ['Development', 'Test', 'Production'], rows: [{ label: 'Purpose', values: ['Build and debug', 'Verify releases', 'Live service'] }, { label: 'Data', values: ['Synthetic', 'Masked copy', 'Live'] }, { label: 'Release cadence', values: ['Continuous', 'Weekly', 'Monthly'] }] });

def('tech-stack', 'technical', 'Layers (front end, back end, data, infrastructure) and the technologies in each.', { layers: ob(5, { name: s(28, { req: true }), items: l(6, 24, { min: 1 }) }, { min: 2 }) }, (X, c) => {
  const n = c.layers.length, top = y0(X, c), h = Math.min(0.85, (6.8 - top) / n - 0.18), lw = 2.4, out = [...sub(X, c)];
  c.layers.forEach((ly, i) => { const y = top + i * (h + 0.18); out.push(box(X.left, y, lw, h, { shape: 'round', fill: X.faint, text: ly.name, size: fit(ly.name, lw - 0.2, h - 0.1, 15, 10), bold: true, radius: X.radius })); let x = X.left + lw + 0.25; ly.items.forEach((t) => { const w = Math.max(1.3, Math.min(2.6, t.length * 0.14 + 0.5)); if (x + w <= X.right + 0.01) out.push(box(x, y + (h - 0.55) / 2, w, 0.55, { shape: 'round', fill: X.bg, stroke: X.accent, strokeW: 1.25, text: t, size: fit(t, w - 0.2, 0.45, 14, 10), radius: 0.28 })); x += w + 0.15; }); });
  return out;
}, { title: 'Technology stack', layers: [{ name: 'Front end', items: ['React', 'TypeScript'] }, { name: 'Back end', items: ['Java', 'Node.js', 'REST / GraphQL'] }, { name: 'Data', items: ['PostgreSQL', 'Kafka', 'Data lake'] }, { name: 'Infrastructure', items: ['Kubernetes', 'Terraform', 'Cloud'] }] });

def('security-compliance', 'technical', 'Controls and standards as a grid, with certifications listed alongside.', { areas: ob(6, { title: s(36, { req: true }), text: s(110) }, { min: 3 }), standards: l(5, 22) }, (X, c) => {
  const has = !!c.standards?.length, gw = has ? X.inner * 0.72 : X.inner, n = c.areas.length, per = n <= 4 ? 2 : 3, g = cols(X, per, 0.3, X.left, gw), rows = Math.ceil(n / per), top = y0(X, c), h = rows === 1 ? 2.2 : 2.0, out = [...sub(X, c)];
  c.areas.forEach((a, i) => { const { x, w } = g[i % per], y = top + Math.floor(i / per) * (h + 0.3); out.push(card(X, x, y, w, h), text(x + 0.25, y + 0.25, w - 0.5, 0.6, a.title, { font: 'head', bold: true, size: fit(a.title, w - 0.5, 0.6, 18, 12), color: X.accent }), ...(a.text ? [text(x + 0.25, y + 0.9, w - 0.5, h - 1.1, a.text, { size: fit(a.text, w - 0.5, h - 1.1, 14, 10), color: X.soft })] : [])); });
  if (has) { const sx = X.left + gw + 0.4, sw = X.inner - gw - 0.4; out.push(label(X, sx, top, sw, 'Standards')); c.standards.forEach((t, i) => out.push(box(sx, top + 0.45 + i * 0.7, sw, 0.55, { shape: 'round', fill: X.bg, stroke: X.accent, strokeW: 1.25, text: t, size: fit(t, sw - 0.2, 0.45, 14, 10), bold: true, color: X.accent, radius: 0.28 }))); }
  return out;
}, { title: 'Security and compliance', areas: [{ title: 'Access control', text: 'Least privilege, MFA and quarterly reviews.' }, { title: 'Data protection', text: 'Encryption in transit and at rest.' }, { title: 'Monitoring', text: '24x7 detection and response.' }, { title: 'Resilience', text: 'Tested backup and recovery.' }], standards: ['ISO 27001', 'SOC 2', 'GDPR'] });

def('migration-plan', 'technical', 'Current state, steps, target state.', { current_title: s(30), current: l(4, 60, { min: 1 }), target_title: s(30), target: l(4, 60, { min: 1 }), steps: l(5, 40, { min: 2 }) }, (X, c) => {
  const top = y0(X, c), bw = 3.3, h = 4.1, mid = X.inner - 2 * bw - 1.0, mx = X.left + bw + 0.5, out = [...sub(X, c), card(X, X.left, top, bw, h), card(X, X.right - bw, top, bw, h, { stroke: X.accent, strokeW: 2.5 })];
  out.push(label(X, X.left + 0.3, top + 0.25, bw - 0.6, c.current_title ?? 'Today', { color: X.soft }), bulletText(X, X.left + 0.3, top + 0.7, bw - 0.6, h - 0.9, c.current, { bullets: true, size: 15 }), label(X, X.right - bw + 0.3, top + 0.25, bw - 0.6, c.target_title ?? 'Target'), bulletText(X, X.right - bw + 0.3, top + 0.7, bw - 0.6, h - 0.9, c.target, { bullets: true, size: 15 }));
  const n = c.steps.length, sh = Math.min(0.7, (h - 0.2) / n - 0.15), pitch = (h - 0.2 - sh) / Math.max(1, n - 1);
  c.steps.forEach((t, i) => out.push(box(mx, top + 0.1 + (n === 1 ? (h - sh) / 2 : i * pitch), mid, sh, { shape: 'round', fill: X.faint, text: `${i + 1}  ${t}`, size: fit(t, mid - 0.3, sh - 0.1, 14, 10), radius: X.radius, align: 'left', margin: 12 })));
  out.push(line(X.left + bw + 0.05, top + h / 2, mx - 0.05, top + h / 2, { color: X.accent, width: 2.5, arrow: true }), line(mx + mid + 0.05, top + h / 2, X.right - bw - 0.05, top + h / 2, { color: X.accent, width: 2.5, arrow: true }));
  return out;
}, { title: 'Migration plan', current: ['On-premises data centre', 'Manual deployments', 'Single site'], steps: ['Assess and plan', 'Build the landing zone', 'Migrate in waves', 'Decommission'], target: ['Cloud platform', 'Automated pipelines', 'Multi-region resilience'] });

// ===== Plans and timelines =====
def('timeline', 'plans', 'Milestones along a line (3-6).', { milestones: ob(6, { when: s(16, { req: true }), title: s(40, { req: true }), text: s(80) }, { min: 3 }) }, (X, c) => {
  const n = c.milestones.length, g = cols(X, n, 0.2), ly = y0(X, c) + 1.9, out = [...sub(X, c), line(X.left, ly, X.right, ly, { color: X.line, width: 3 })];
  c.milestones.forEach((m, i) => { const { x, w } = g[i]; out.push(text(x, ly - 0.95, w, 0.5, m.when, { font: 'head', bold: true, size: fit(m.when, w, 0.5, 20, 12), color: X.accent, valign: 'bottom' }), box(x, ly - 0.17, 0.34, 0.34, { shape: 'ellipse', fill: X.accent, margin: 0 }), text(x, ly + 0.4, w - 0.1, 0.9, m.title, { bold: true, size: fit(m.title, w - 0.1, 0.9, 17, 11) }), ...(m.text ? [text(x, ly + 1.35, w - 0.1, 1.6, m.text, { size: fit(m.text, w - 0.1, 1.6, 14, 10), color: X.soft })] : [])); });
  return out;
}, { title: 'Timeline', milestones: [{ when: 'Month 1', title: 'Kick-off', text: 'Plan and team agreed.' }, { when: 'Month 3', title: 'Transition complete', text: 'Services running with us.' }, { when: 'Month 6', title: 'First review', text: 'Targets reviewed.' }, { when: 'Month 12', title: 'Renewal', text: 'Annual review.' }] });

def('roadmap', 'plans', 'Phases or quarters as columns with deliverables.', { phases: ob(5, { name: s(22, { req: true }), when: s(22), items: l(4, 44, { min: 1 }) }, { min: 3 }) }, (X, c) => {
  const n = c.phases.length, g = cols(X, n, 0.2), top = y0(X, c), out = [...sub(X, c)];
  c.phases.forEach((p, i) => { const { x, w } = g[i]; out.push(box(x, top, w, 0.85, { shape: 'pentagon', fill: stage(X, i, n), text: p.name, size: fit(p.name, w * 0.7, 0.55, 16, 11), bold: true, color: X.onAccent }), ...(p.when ? [text(x, top + 0.95, w, 0.35, p.when, { size: 13, bold: true, color: X.accent })] : []), card(X, x, top + 1.4, w, 2.9), bulletText(X, x + 0.2, top + 1.6, w - 0.4, 2.6, p.items, { bullets: true, size: 14 })); });
  return out;
}, { title: 'Roadmap', phases: [{ name: 'Foundation', when: 'Q1', items: ['Onboard services', 'Baseline metrics'] }, { name: 'Stabilise', when: 'Q2', items: ['Reduce repeat incidents', 'Automate top requests'] }, { name: 'Optimise', when: 'Q3', items: ['Self-service portal', 'Cost review'] }, { name: 'Innovate', when: 'Q4', items: ['AIOps pilot'] }] });

def('risks', 'plans', 'Top risks with likelihood, impact and mitigation.', { rows: ob(6, { risk: s(64, { req: true }), likelihood: en(['Low', 'Medium', 'High']), impact: en(['Low', 'Medium', 'High']), mitigation: s(100, { req: true }) }, { min: 2 }) }, (X, c) => {
  const w = [0.32, 0.12, 0.12, 0.44].map((v) => v * X.inner), rows = c.rows.map((r) => [{ text: r.risk, bold: true }, { text: r.likelihood ?? '—', align: 'center', bold: true, color: r.likelihood ? rag(X, r.likelihood === 'High' ? 'high' : r.likelihood === 'Low' ? 'low' : 'medium') : X.soft }, { text: r.impact ?? '—', align: 'center', bold: true, color: r.impact ? rag(X, r.impact === 'High' ? 'high' : r.impact === 'Low' ? 'low' : 'medium') : X.soft }, r.mitigation]);
  return [...sub(X, c), table(X.left, y0(X, c), X.inner, w, [['Risk', { text: 'Likelihood', align: 'center' }, { text: 'Impact', align: 'center' }, 'Mitigation'], ...rows], { rowH: Math.min(0.78, 4.4 / (rows.length + 1)), size: 13 })];
}, { title: 'Risks and mitigations', rows: [{ risk: 'Knowledge gaps during transition', likelihood: 'Medium', impact: 'High', mitigation: 'Documented handover and a parallel run period.' }, { risk: 'Delayed access to systems', likelihood: 'Medium', impact: 'Medium', mitigation: 'Access checklist agreed at kick-off.' }, { risk: 'Scope creep', likelihood: 'Low', impact: 'Medium', mitigation: 'Change control through governance.' }] });

def('next-steps', 'plans', 'Actions with owner and date.', { items: ob(6, { action: s(90, { req: true }), owner: s(24), date: s(16) }, { min: 1 }) }, (X, c) => {
  const w = [0.6, 0.22, 0.18].map((v) => v * X.inner), rows = c.items.map((it, i) => [{ text: `${i + 1}.  ${it.action}`, bold: true }, it.owner ?? '—', it.date ?? '—']);
  return [...sub(X, c), table(X.left, y0(X, c), X.inner, w, [['Action', 'Owner', 'By'], ...rows], { rowH: Math.min(0.7, 4.4 / (rows.length + 1)), size: 15 })];
}, { title: 'Next steps', items: [{ action: 'Confirm scope and service levels', owner: 'Customer', date: '[date]' }, { action: 'Agree transition plan', owner: 'Both', date: '[date]' }, { action: 'Sign and kick off', owner: 'Both', date: '[date]' }] });

def('scope', 'plans', 'In scope and out of scope, side by side.', { in_scope: l(6, 70, { min: 1 }), out_of_scope: l(5, 70, { min: 1 }) }, (X, c) => {
  const top = y0(X, c), [a, b] = cols(X, 2, 0.5), h = 4.3;
  return [...sub(X, c), card(X, a.x, top, a.w, h, { stroke: X.accent, strokeW: 2 }), label(X, a.x + 0.35, top + 0.3, a.w - 0.7, 'In scope'), bulletText(X, a.x + 0.35, top + 0.8, a.w - 0.7, h - 1.0, c.in_scope, { mark: '✓  ' }), card(X, b.x, top, b.w, h), label(X, b.x + 0.35, top + 0.3, b.w - 0.7, 'Out of scope', { color: X.soft }), bulletText(X, b.x + 0.35, top + 0.8, b.w - 0.7, h - 1.0, c.out_of_scope, { mark: '✕  ', color: X.soft })];
}, { title: 'Scope', in_scope: ['Service desk and incident management', 'Monitoring and reporting', 'Monthly service reviews'], out_of_scope: ['Application development', 'Hardware procurement'] });

def('status-summary', 'plans', 'Progress against plan: workstreams with a green / amber / red status.', { summary: s(160), rows: ob(7, { workstream: s(40, { req: true }), status: en(['green', 'amber', 'red']), note: s(90) }, { min: 2 }) }, (X, c) => {
  const lab = { green: '●  On track', amber: '●  At risk', red: '●  Off track' }, w = [0.32, 0.18, 0.5].map((v) => v * X.inner), top = y0(X, c) + (c.summary ? 0.55 : 0), rows = c.rows.map((r) => [{ text: r.workstream, bold: true }, { text: lab[r.status], bold: true, color: rag(X, r.status) }, r.note ?? '—']);
  return [...sub(X, c), ...(c.summary ? [text(X.left, y0(X, c) - 0.05, X.inner, 0.5, c.summary, { size: fit(c.summary, X.inner, 0.5, 18, 12), bold: true })] : []), table(X.left, top, X.inner, w, [['Workstream', 'Status', 'Comment'], ...rows], { rowH: Math.min(0.62, (6.8 - top) / (rows.length + 1)), size: 14 })];
}, { title: 'Progress against plan', summary: 'Overall on track; one item needs a decision.', rows: [{ workstream: 'Transition', status: 'green', note: 'Wave 2 complete.' }, { workstream: 'Tooling', status: 'amber', note: 'Licence delivery delayed one week.' }, { workstream: 'Reporting', status: 'green', note: 'First report issued.' }] });

// ===== Proof and people =====
def('case-study', 'proof', 'Customer, challenge, solution, result, a picture slot and one headline figure.', { customer: s(40), challenge: s(220, { req: true }), solution: s(220, { req: true }), result: s(220, { req: true }), metric_value: s(14), metric_label: s(40), image: s(40) }, (X, c) => {
  const top = y0(X, c), pw = 4.2, tx = X.left + pw + 0.5, tw = X.inner - pw - 0.5, out = [...sub(X, c), pic(X.left, top, pw, 3.1, { image: c.image, label: 'Add customer picture' })];
  if (c.customer) out.push(text(X.left, top + 3.25, pw, 0.4, c.customer, { bold: true, size: 15 }));
  if (c.metric_value) out.push(card(X, X.left, top + 3.75, pw, 0.95, { fill: X.accent }), text(X.left + 0.25, top + 3.8, 1.9, 0.85, c.metric_value, { font: 'head', bold: true, size: fit(c.metric_value, 1.9, 0.85, 34, 18), color: X.onAccent, valign: 'middle' }), text(X.left + 2.2, top + 3.8, pw - 2.4, 0.85, c.metric_label ?? '', { size: fit(c.metric_label ?? '', pw - 2.4, 0.85, 14, 10), color: X.onAccent, valign: 'middle' }));
  [['Challenge', c.challenge], ['Solution', c.solution], ['Result', c.result]].forEach(([k, v], i) => out.push(label(X, tx, top + i * 1.55, tw, k), text(tx, top + 0.38 + i * 1.55, tw, 1.1, v, { size: fit(v, tw, 1.1, 17, 11) })));
  return out;
}, { title: 'Case study', customer: '[Customer name]', challenge: 'Several suppliers, slow resolution and unclear ownership.', solution: 'One managed service with a single service desk and automated workflows.', result: 'Resolution time cut by more than a third within the first year.', metric_value: '38%', metric_label: 'faster resolution' });

def('testimonial', 'proof', 'A quote with a photo slot, name and role.', { quote: s(240, { req: true }), name: s(40, { req: true }), role: s(60), image: s(40) }, (X, c) => {
  const a = alignOf(X), t = X.top, out = [text(X.left, t - 0.05, a === 'center' ? X.inner : 1.4, 1.1, '“', { font: 'head', bold: true, size: 96, color: X.accent, align: a === 'center' ? 'center' : 'left' })];
  out.push(text(X.left, t + 0.95, X.inner, 2.3, c.quote, { font: 'head', size: fit(c.quote, X.inner, 2.3, 30, 16), italic: true, align: a, valign: 'middle' }));
  const px = a === 'center' ? (X.W - 0.9) / 2 : X.left, ty = Math.min(5.5, t + 3.45), tx = a === 'center' ? X.left : X.left + 1.15, tw = a === 'center' ? X.inner : X.inner - 1.15;
  out.push(pic(px, ty, 0.9, 0.9, { image: c.image, label: 'Photo' }), text(tx, a === 'center' ? ty + 0.98 : ty + 0.05, tw, 0.4, c.name, { bold: true, size: 17, align: a }), ...(c.role ? [text(tx, a === 'center' ? ty + 1.38 : ty + 0.5, tw, 0.4, c.role, { size: 14, color: X.soft, align: a })] : []));
  return out;
}, { title: 'What customers say', quote: 'They took ownership from day one, and our users noticed the difference within weeks.', name: '[Name]', role: '[Role, Customer]' });

def('logo-wall', 'proof', 'A grid of customer logos or names (up to 12).', { items: ob(12, { name: s(30, { req: true }), image: s(40) }, { min: 2 }) }, (X, c) => {
  const n = c.items.length, per = n <= 4 ? n : n <= 6 ? 3 : 4, rows = Math.ceil(n / per), g = cols(X, per, 0.3), top = y0(X, c), h = Math.min(1.5, (6.6 - top - 0.3 * (rows - 1)) / rows), out = [...sub(X, c)];
  c.items.forEach((it, i) => { const { x, w } = g[i % per], y = top + Math.floor(i / per) * (h + 0.3); out.push(card(X, x, y, w, h)); if (it.image) out.push(pic(x + 0.2, y + 0.2, w - 0.4, h - 0.4, { image: it.image, label: it.name })); else out.push(text(x + 0.15, y, w - 0.3, h, it.name, { bold: true, size: fit(it.name, w - 0.3, h - 0.2, 20, 11), align: 'center', valign: 'middle', color: X.soft })); });
  return out;
}, { title: 'Trusted by', items: [{ name: '[Customer one]' }, { name: '[Customer two]' }, { name: '[Customer three]' }, { name: '[Customer four]' }, { name: '[Customer five]' }, { name: '[Customer six]' }] });

def('team', 'proof', 'People with photo slots, names and roles (up to 6).', { people: ob(6, { name: s(36, { req: true }), role: s(50), image: s(40) }, { min: 2 }) }, (X, c) => {
  const n = c.people.length, per = n <= 4 ? n : 3, g = cols(X, per, 0.4), top = y0(X, c), d = Math.min(1.9, g[0].w - 0.4), out = [...sub(X, c)];
  c.people.forEach((p, i) => { const { x, w } = g[i % per], y = top + Math.floor(i / per) * (d + 1.45), px = x + (w - d) / 2; out.push(pic(px, y, d, d, { image: p.image, label: 'Photo' }), text(x, y + d + 0.25, w, 0.45, p.name, { bold: true, size: fit(p.name, w, 0.45, 18, 12), align: 'center' }), ...(p.role ? [text(x, y + d + 0.72, w, 0.4, p.role, { size: fit(p.role, w, 0.4, 14, 10), color: X.soft, align: 'center' })] : [])); });
  return out;
}, { title: 'Meet the team', people: [{ name: '[Name]', role: 'Service manager' }, { name: '[Name]', role: 'Technical lead' }, { name: '[Name]', role: 'Service desk lead' }] });

// ===== Commercial and closing =====
def('pricing', 'commercial', '2-3 packages with price and what is in each; highlight one.', { plans: ob(3, { name: s(24, { req: true }), price: s(20, { req: true }), period: s(16), features: l(5, 50), highlight: bo() }, { min: 2 }) }, (X, c) => {
  const g = cols(X, c.plans.length, 0.4), top = y0(X, c), h = 4.5, out = [...sub(X, c)];
  c.plans.forEach((p, i) => { const { x, w } = g[i], hl = !!p.highlight, ink = hl ? X.onAccent : X.ink, soft = hl ? X.onAccent : X.soft; out.push(card(X, x, top, w, h, { fill: hl ? X.accent : X.card }), text(x + 0.3, top + 0.3, w - 0.6, 0.45, p.name, { bold: true, size: 17, color: ink }), text(x + 0.3, top + 0.85, w - 0.6, 0.95, p.price, { font: 'head', bold: true, size: fit(p.price, w - 0.6, 0.95, 44, 22), color: ink, valign: 'middle' }), ...(p.period ? [text(x + 0.3, top + 1.8, w - 0.6, 0.35, p.period, { size: 13, color: soft })] : []), line(x + 0.3, top + 2.3, x + w - 0.3, top + 2.3, { color: hl ? X.onAccent : X.line, width: 0.75 }), bulletText(X, x + 0.3, top + 2.5, w - 0.6, 1.8, p.features ?? [], { mark: '✓  ', color: ink, size: 15 })); });
  return out;
}, { title: 'Packages', plans: [{ name: 'Essential', price: '[price]', period: 'per month', features: ['Business-hours support', 'Monthly report'] }, { name: 'Standard', price: '[price]', period: 'per month', features: ['24x7 support', 'Monthly review', 'Service manager'], highlight: true }, { name: 'Premium', price: '[price]', period: 'per month', features: ['Everything in Standard', 'Dedicated team', 'Quarterly roadmap'] }] });

def('investment', 'commercial', 'Line items and a total.', { rows: ob(8, { item: s(60, { req: true }), amount: s(16, { req: true }) }, { min: 1 }), total: s(18), note: s(160) }, (X, c) => {
  const w = [0.72, 0.28].map((v) => v * Math.min(X.inner, 9.5)), x = X.center ? (X.W - w[0] - w[1]) / 2 : X.left, rows = c.rows.map((r) => [{ text: r.item, bold: true }, { text: r.amount, align: 'right' }]);
  if (c.total) rows.push([{ text: 'Total', bold: true, fill: X.accent, color: X.onAccent }, { text: c.total, align: 'right', bold: true, fill: X.accent, color: X.onAccent }]);
  return [...sub(X, c), table(x, y0(X, c), w[0] + w[1], w, [['Item', { text: 'Amount', align: 'right' }], ...rows], { rowH: Math.min(0.62, 4.3 / (rows.length + 1)), size: 15 }), ...(c.note ? [text(x, 6.4, w[0] + w[1], 0.45, c.note, { size: 12, color: X.soft })] : [])];
}, { title: 'Investment', rows: [{ item: 'Transition (one-off)', amount: '[amount]' }, { item: 'Managed service (per month)', amount: '[amount]' }, { item: 'Optional: dedicated team', amount: '[amount]' }], total: '[total]', note: 'Prices exclude VAT.' });

def('qa-contact', 'commercial', 'Questions slide with contact details.', { contacts: ob(3, { name: s(40, { req: true }), role: s(50), email: s(60), phone: s(30) }, { min: 1 }) }, (X, c) => {
  const n = c.contacts.length, g = cols(X, n, 0.4), out = [...sub(X, c)];
  c.contacts.forEach((p, i) => { const { x, w } = g[i], y = y0(X, c) + 0.6; out.push(card(X, x, y, w, 2.2), text(x + 0.3, y + 0.3, w - 0.6, 0.45, p.name, { bold: true, size: 18 }), ...(p.role ? [text(x + 0.3, y + 0.8, w - 0.6, 0.4, p.role, { size: 14, color: X.soft })] : []), ...(p.email ? [text(x + 0.3, y + 1.3, w - 0.6, 0.4, p.email, { size: 14, color: X.accent, bold: true })] : []), ...(p.phone ? [text(x + 0.3, y + 1.7, w - 0.6, 0.4, p.phone, { size: 14 })] : [])); });
  return out;
}, { title: 'Questions?', contacts: [{ name: '[Name]', role: 'Account lead', email: '[email]', phone: '[phone]' }, { name: '[Name]', role: 'Service manager', email: '[email]' }] });

// The brand panel is not left empty: a kicker (the slide's group) on top, and, when there is no subtitle, a quiet geometric motif at the bottom
// (concentric rings in the panel's accent, fully inside the panel).
function panelDecor(X, c, kicker) {
  const P = X.panel, out = [{ ...text(P.x + 0.5, 0.82, P.w - 1.0, 0.4, kicker, { size: 12, bold: true, color: P.pop ?? P.ink }), fixed: true }];
  if (!c.subtitle) { const cx = P.x + P.w / 2, cy = P.y + P.h - 1.5, tint = mix(P.pop ?? P.ink, P.bg, 0.62); for (const d of [2.5, 1.8, 1.1]) out.push({ ...box(cx - d / 2, cy - d / 2, d, d, { shape: 'ellipse', stroke: tint, strokeW: 1.75 }), fixed: true }); }
  return out;
}

// ---------- polish: make a slide look designed, whatever the builder drew ----------
// 1. text grows (up to ~30%) to use the space it has; 2. tables use the room they can have; 3. content is vertically balanced instead of
// hugging the top of the slide.
const yRange = (e) => (e.k === 'line' ? [Math.min(e.y1, e.y2), Math.max(e.y1, e.y2)] : e.k === 'table' ? [e.y, e.y + (e.rowH ?? 0.5) * e.rows.length] : [e.y, e.y + e.h]);
export function polish(scene, X) {
  for (const e of scene) {
    if ((e.k === 'text' || e.k === 'box') && e.size && e.text !== undefined && e.text !== '') {
      const txt = Array.isArray(e.text) ? e.text.join(' ') : String(e.text), w = e.k === 'box' ? Math.max(0.2, e.w - 0.35) : e.w, h = e.k === 'box' ? Math.max(0.2, e.h - 0.2) : e.h, lh = Array.isArray(e.text) ? 1.6 : 1.22;
      e.size = fitSize(txt, w, h, Math.min(Math.round(e.size * 1.3), e.size + 8), { min: e.size, lh });
      if (e.size < 13 && textFits(txt, w, h, 13, { lh })) e.size = 13;
    }
    if (e.k === 'table') { e.size = Math.max(e.size ?? 13, 14); e.rowH = Math.max(0.3, Math.min((e.rowH ?? 0.46) * 1.2, 0.85, (6.85 - e.y) / e.rows.length)); }
  }
  const body = scene.filter((e) => !e.fixed);
  if (body.length) {
    const top = Math.min(...body.map((e) => yRange(e)[0])), bottom = Math.max(...body.map((e) => yRange(e)[1])), availTop = X.panel ? X.top : X.top + 0.05, availBottom = 6.85;
    const room = availBottom - bottom;
    if (top - availTop < 0.5 && room > 0.7) { const dy = Math.min(room * 0.4, 0.55); for (const e of body) { if (e.k === 'line') { e.y1 += dy; e.y2 += dy; } else e.y += dy; } }
  }
  return scene;
}
for (const t of Object.values(TYPES)) {
  const raw = t.build, kicker = GROUPS[t.group];
  t.build = (X, c) => polish([...(X.panel ? panelDecor(X, c, kicker) : []), ...raw(X, c)], X);
}

// ---------- public API ----------
export const CATALOG_TYPES = Object.keys(TYPES);
export const isCatalog = (layout) => Object.hasOwn(TYPES, layout);

export function validateCatalogSlide(s, at) {
  const t = TYPES[s.layout]; if (!t) return;
  checkObj(s, t.fields, at, { layout: {} });
}

/** The catalog as plain data (for the skill / CLI): groups, types, one-line summaries and allowed fields. */
export function catalogDoc() {
  const desc = (f) => (f.t === 's' ? `text ≤${f.max}${f.req ? ', required' : ''}` : f.t === 'l' ? `list of ${f.min ? f.min + '-' : 'up to '}${f.maxN} texts ≤${f.maxLen}` : f.t === 'o' ? `list of ${f.min ? f.min + '-' : 'up to '}${f.maxN} objects {${Object.entries(f.shape).map(([k, v]) => `${k}${v.req ? '*' : ''}`).join(', ')}}` : f.t === 'b' ? 'true/false' : f.t === 'e' ? f.vals.join(' | ') : `whole number ${f.min}-${f.max}`);
  return Object.entries(GROUPS).map(([key, title]) => ({ group: title, types: Object.values(TYPES).filter((t) => t.group === key).map((t) => ({ layout: t.name, summary: t.summary, fields: Object.fromEntries(Object.entries(t.fields).filter(([k]) => k !== 'tone').map(([k, f]) => [k, desc(f)])) })) }));
}

/** Storylines: ready-made slide sequences (a plan to fill in, not content). */
export const STORYLINES = {
  'sales-proposal': { name: 'Sales proposal', slides: ['title', 'agenda', 'customer-context', 'objectives', 'problem-solution', 'benefits', 'case-study', 'options', 'timeline', 'pricing', 'next-steps', 'qa-contact'] },
  'it-service-description': { name: 'IT service description', slides: ['title', 'agenda', 'service-description', 'process-steps', 'process-flow', 'governance', 'sla', 'raci', 'tools-and-platforms', 'kpi-reporting', 'onboarding-transition', 'risks', 'next-steps'] },
  'technical-deep-dive': { name: 'Technical deep-dive', slides: ['title', 'architecture', 'integration-map', 'tech-stack', 'environments', 'security-compliance', 'migration-plan', 'roadmap', 'risks'] },
  'project-kickoff': { name: 'Project kick-off', slides: ['title', 'objectives', 'scope', 'roles-team', 'governance', 'timeline', 'risks', 'next-steps'] },
  'status-report': { name: 'Status report', slides: ['title', 'at-a-glance', 'status-summary', 'chart', 'risks', 'next-steps'] },
};
export const SAMPLE_OF = (name) => ({ layout: name, ...TYPES[name].example });
const PANEL_OK = ['agenda', 'customer-context', 'objectives', 'benefits', 'service-description', 'scope', 'next-steps', 'kpi-reporting', 'sla', 'status-summary', 'governance', 'testimonial'];
registerCatalog(CATALOG_TYPES, PANEL_OK);
