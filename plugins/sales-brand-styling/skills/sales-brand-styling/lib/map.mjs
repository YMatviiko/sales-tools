// map_template: parse a template into an IR of semantic roles and attach brand targets.
// Deterministic wherever the role is clear; ambiguous items go to `uncertain` with target: null
// so the skill can ask the sales manager (render only applies roles whose target is set).
import JSZip from 'jszip';
import { createHash } from 'node:crypto';
import { parseColor, lightness } from './color.mjs';
import { requireBrandSpec } from './brandspec.mjs';
import { httpError } from './safeurl.mjs';
import { scanUpload } from './scan.mjs';
import { requireStyle } from './style.mjs';
import { cssGeneric, fontStackFor, fontNotes } from './fonts.mjs';

export const IR_VERSION = '1.0';
const sha = (b) => createHash('sha256').update(b).digest('hex');
export const fontStack = (name) => `'${String(name).replace(/['\\<>{};]/g, '')}', ${cssGeneric(name)}`;

function targets(spec) {
  const n = [...(spec.colors.neutrals ?? [])].sort((a, b) => lightness(a) - lightness(b));
  return {
    primary: spec.colors.primary, secondary: spec.colors.secondary,
    accents: spec.colors.accents ?? [], darkNeutral: n[0], lightNeutral: n.at(-1),
    heading: spec.typography.heading_font, body: spec.typography.body_font,
    headingStack: fontStackFor(spec, 'heading'), bodyStack: fontStackFor(spec, 'body'),
  };
}

function pickBuffer(template) {
  const buf = Buffer.from(template?.content_base64 ?? '', 'base64');
  if (!buf.length) throw httpError(400, 'Empty template.');
  if (buf.length > 25_000_000) throw httpError(413, 'Template too large (25 MB max).');
  return buf;
}
export const formatOf = (name) => ({ html: 'html', htm: 'html', pptx: 'pptx', potx: 'pptx' })[(name.split('.').pop() || '').toLowerCase()];

// ---------- HTML ----------
const VAR_ROLES = [
  [/secondary/, 'secondary'], [/(primary|brand)/, 'primary'], [/(accent|cta|highlight)/, 'accent'],
  [/(^|-)(bg|background|surface|canvas)/, 'background'], [/(^|-)(text|fg|foreground|ink|body-color)/, 'text'],
  [/font.*(head|display|title)|(head|display|title).*font/, 'heading_font'], [/font/, 'body_font'],
];
function roleTarget(role, t) {
  return { primary: t.primary, secondary: t.secondary, accent: t.accents[0], background: t.lightNeutral, text: t.darkNeutral,
    heading_font: t.heading && t.headingStack, body_font: t.body && t.bodyStack }[role] ?? null;
}

function mapHtml(html, spec) {
  const t = targets(spec), roles = [], uncertain = [], covered = new Set();
  for (const block of html.matchAll(/:root\s*\{([^}]*)\}/g)) {
    for (const m of block[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+)/g)) {
      const [, name, raw] = m, value = raw.trim(), isColor = !!parseColor(value);
      const isFont = /font/.test(name);
      if (!isColor && !isFont) continue;
      const kind = VAR_ROLES.find(([re]) => re.test(name.toLowerCase()));
      const role = kind?.[1];
      const colorRole = role && !/font/.test(role) && isColor, fontRole = role && /font/.test(role) && isFont;
      const target = colorRole || fontRole ? roleTarget(role, t) : null;
      const entry = { id: `var:${name}`, kind: 'css-var', name, role: role ?? 'unknown', current: value, target, confidence: target ? 'high' : 'low' };
      (target ? roles : uncertain).push(entry);
      if (target) covered.add(role);
    }
  }
  const has = (re) => re.test(html);
  if (!covered.has('heading_font') && has(/<h[1-6][\s>]/i) && t.heading)
    roles.push({ id: 'sel:headings', kind: 'css-rule', selector: 'h1,h2,h3,h4,h5,h6', props: { 'font-family': t.headingStack, color: t.primary }, role: 'title', confidence: 'high' });
  if (!covered.has('body_font') && t.body)
    roles.push({ id: 'sel:body', kind: 'css-rule', selector: 'body', props: { 'font-family': t.bodyStack }, role: 'body', confidence: 'high' });
  const ctaSel = ['.btn', '.button', '.cta', 'button'].filter((s) => has(new RegExp(s.startsWith('.') ? `class="[^"]*\\b${s.slice(1)}\\b` : '<button\\b', 'i')));
  if (!covered.has('accent') && !covered.has('primary') && ctaSel.length) {
    const bg = t.accents[0] ?? t.primary;
    roles.push({ id: 'sel:cta', kind: 'css-rule', selector: ctaSel.join(','), props: { 'background-color': bg, color: lightness(bg) > 0.55 ? '#111111' : '#FFFFFF' }, role: 'cta', confidence: 'low' });
    uncertain.push({ id: 'note:cta', kind: 'note', role: 'cta', current: ctaSel.join(','), target: null, confidence: 'low', reason: 'CTA inferred from class names, template has no colour variables — confirm.' });
  }
  const inline = (html.match(/style="[^"]*#[0-9a-fA-F]{3,6}/g) ?? []).length;
  if (inline) uncertain.push({ id: 'note:inline', kind: 'note', role: 'unknown', current: `${inline} inline style colour(s)`, target: null, confidence: 'low', reason: 'Inline style colours are not changed (DOM is left untouched).' });
  return { roles, uncertain };
}

// ---------- PPTX ----------
const SLOTS = ['dk1', 'lt1', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'dk2', 'lt2', 'hlink'];
export function themeColors(xml) {
  const out = {};
  for (const s of SLOTS) {
    const m = xml.match(new RegExp(`<a:${s}>\\s*<a:srgbClr val="([0-9a-fA-F]{6})"`)) ?? xml.match(new RegExp(`<a:${s}>\\s*<a:sysClr[^>]*lastClr="([0-9a-fA-F]{6})"`));
    if (m) out[s] = '#' + m[1].toUpperCase();
  }
  return out;
}
export function themeFonts(xml) {
  const f = (k) => xml.match(new RegExp(`<a:${k}Font>\\s*<a:latin typeface="([^"]*)"`))?.[1];
  return { major: f('major'), minor: f('minor') };
}

async function mapPptx(buf, spec) {
  const t = targets(spec);
  const zip = await JSZip.loadAsync(buf);
  const names = Object.keys(zip.files);
  const theme = names.filter((n) => /^ppt\/theme\/theme\d+\.xml$/.test(n)).sort()[0];
  if (!theme) throw httpError(422, 'No theme found in PPTX (is it a valid PowerPoint file?).');
  const txml = await zip.file(theme).async('string');
  const cur = themeColors(txml), fonts = themeFonts(txml);
  const wanted = { dk1: t.darkNeutral, lt1: t.lightNeutral, accent1: t.primary, accent2: t.secondary, accent3: t.accents[0], accent4: t.accents[1], accent5: t.accents[2], accent6: t.accents[3], dk2: t.darkNeutral, lt2: t.lightNeutral, hlink: t.primary };
  const roles = [], uncertain = [];
  if (wanted.dk1 && lightness(wanted.dk1) > 0.4) delete wanted.dk1;      // would make body text unreadable on white
  if (wanted.lt1 && lightness(wanted.lt1) < 0.8) delete wanted.lt1;      // would make slide backgrounds dark by accident
  for (const [slot, target] of Object.entries(wanted)) if (cur[slot] && target) roles.push({ id: `theme:${slot}`, kind: 'theme-color', slot, role: slot.startsWith('accent') ? 'accent' : slot === 'hlink' ? 'link' : slot === 'dk1' ? 'text' : slot === 'lt1' ? 'background' : 'background', current: cur[slot], target, confidence: 'high' });
  if (fonts.major && t.heading) roles.push({ id: 'theme:major', kind: 'theme-font', slot: 'major', role: 'title', current: fonts.major, target: t.heading, confidence: 'high' });
  if (fonts.minor && t.body) roles.push({ id: 'theme:minor', kind: 'theme-font', slot: 'minor', role: 'body', current: fonts.minor, target: t.body, confidence: 'high' });
  // Hard-coded per-shape colours: remap those that equal a theme colour, surface the rest.
  const themeSet = new Set(Object.values(cur)), seen = new Map();
  for (const n of names.filter((x) => /^ppt\/(slides|slideLayouts|slideMasters)\/[^/]+\.xml$/.test(x)))
    for (const m of (await zip.file(n).async('string')).matchAll(/<a:srgbClr val="([0-9a-fA-F]{6})"/g)) { const c = '#' + m[1].toUpperCase(); if (!themeSet.has(c)) seen.set(c, (seen.get(c) ?? 0) + 1); }
  for (const [c, count] of seen) uncertain.push({ id: `hardcoded:${c}`, kind: 'hardcoded-color', role: 'unknown', current: c, count, target: null, confidence: 'low', reason: `${count} shape(s) use ${c}, which is not a theme colour. Left unchanged unless you pick a target.` });
  const fontSeen = new Map(), themeFontSet = new Set([fonts.major, fonts.minor]);
  for (const n of names.filter((x) => /^ppt\/(slides|slideLayouts|slideMasters)\/[^/]+\.xml$/.test(x)))
    for (const m of (await zip.file(n).async('string')).matchAll(/<a:latin typeface="([^"+][^"]*)"/g)) if (!themeFontSet.has(m[1])) fontSeen.set(m[1], (fontSeen.get(m[1]) ?? 0) + 1);
  for (const [f, count] of fontSeen) uncertain.push({ id: `hardcoded-font:${f}`, kind: 'hardcoded-font', role: 'unknown', current: f, count, target: null, confidence: 'low', reason: `${count} run(s) use "${f}" directly instead of the theme font. Left unchanged unless you pick a font.` });
  const charts = names.filter((x) => /^ppt\/charts\/chart\d+\.xml$/.test(x)).length, pics = names.filter((x) => /^ppt\/media\//.test(x)).length;
  if (charts) uncertain.push({ id: 'note:charts', kind: 'note', role: 'unknown', current: `${charts} chart(s)`, target: null, confidence: 'low', reason: 'Chart colours are not restyled — check them by hand.' });
  if (pics) uncertain.push({ id: 'note:images', kind: 'note', role: 'unknown', current: `${pics} embedded image(s)`, target: null, confidence: 'low', reason: 'Existing pictures (incl. any previous company logo) are not changed.' });
  return { roles, uncertain };
}

export async function mapTemplate({ template, brand_spec, brand_style }) {
  const spec = requireBrandSpec(brand_spec);
  requireStyle(brand_style, { forPptx: formatOf(template?.filename ?? '') === 'pptx' });
  const buf = pickBuffer(template);
  const format = formatOf(template.filename ?? '');
  if (!format) throw httpError(415, 'Template must be .html or .pptx.');
  const scan = await scanUpload(buf);
  const { roles, uncertain } = format === 'html' ? mapHtml(buf.toString('utf8'), spec) : await mapPptx(buf, spec);
  const suggestions = [];
  if (brand_style?.assets?.length) {
    if (format === 'html') {
      const cls = new Set([...buf.toString('utf8').matchAll(/class="([^"]+)"/g)].flatMap((m) => m[1].split(/\s+/)).filter((c) => /hero|banner|masthead|jumbotron|cover|header|splash/i.test(c)));
      for (const c of cls) suggestions.push({ kind: 'html_background', selector: '.' + c, note: 'Candidate for a brand image background (needs your OK).' });
    } else {
      suggestions.push({ kind: 'pptx_backgrounds', note: 'Image backgrounds can go on title/section/closing layouts; layouts are matched by their PowerPoint layout type.' });
    }
  }
  return {
    suggestions,
    ir: { ir_version: IR_VERSION, brand: { colors: spec.colors, typography: spec.typography }, style: brand_style ?? null, format, template: { filename: template.filename, sha256: sha(buf), content_base64: template.content_base64 }, roles, uncertain },
    fonts: fontNotes(spec.typography),
    notes: [...(scan.scanned ? [] : ['Upload was not malware-scanned (BRAND_SCAN_COMMAND not set).']), ...(uncertain.length ? [`${uncertain.length} item(s) need confirmation before render.`] : [])],
  };
}
export { sha };
