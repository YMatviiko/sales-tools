// BrandStyle: text styling, backgrounds and brand imagery — the companion to BrandSpec.
// Assets are customer-owned images; every one is size-checked, sniffed by magic bytes (never trusted by
// extension/Content-Type), and only png/jpeg/svg are kept. SVG is allowed for HTML only (PowerPoint output skips it).
import { readFile } from 'node:fs/promises';
import { basename, extname, join, dirname } from 'node:path';
import { safeFetch, httpError } from './safeurl.mjs';
import { parseColor, lightness } from './color.mjs';
import { fontStackFor } from './fonts.mjs';
import { slidePalette } from './palette.mjs';
import { validateDesign, withDefaults } from './design.mjs';
import { validateSystem } from './system.mjs';
import { validateGraphics } from './graphics.mjs';

/** Final defence: generated CSS goes inside <style>, so it must never contain markup, an at-rule import or a url() to anywhere but a data: URI. */
export function guardCss(css) {
  const stripped = css.replace(/url\(\s*["']?data:[^)]*\)/g, '');
  if (/<|\\|@import|expression\s*\(|url\(\s*["']?(?!data:)/i.test(stripped.replace(/@font-face\s*\{[^}]*\}/g, '').replace(/@import url\('https:\/\/fonts\.googleapis\.com[^']*'\);/g, '')))
    throw httpError(400, 'Refusing to emit CSS that contains markup or an external reference.');
  return css;
}
export const STYLE_VERSION = '1.1';
export const ACCEPTED_STYLE_VERSIONS = ['1.0', '1.1'];
export const ASSET_LIMITS = { count: 16, bytes: 2_000_000, total: 12_000_000 };
const ROLES = ['logo', 'hero', 'illustration', 'photo'];
const MIMES = ['image/png', 'image/jpeg', 'image/svg+xml'];
const ID_RE = /^[a-z0-9-]{1,40}$/;

// ---------- image sniffing ----------
export function imageInfo(buf) {
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47 && buf.toString('ascii', 12, 16) === 'IHDR')
    return { mime: 'image/png', width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    for (let i = 2; i + 9 < buf.length;) {
      if (buf[i] !== 0xff) { i++; continue; }
      const m = buf[i + 1];
      if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { mime: 'image/jpeg', height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      i += 2 + buf.readUInt16BE(i + 2);
    }
    return null;
  }
  const head = buf.toString('utf8', 0, Math.min(buf.length, 2048));
  if (/<svg[\s>]/i.test(head)) {
    const vb = head.match(/viewBox=["']\s*[\d.-]+[\s,]+[\d.-]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
    const w = head.match(/<svg[^>]*\swidth=["']([\d.]+)/i)?.[1], h = head.match(/<svg[^>]*\sheight=["']([\d.]+)/i)?.[1];
    const width = Math.round(+(w ?? vb?.[1] ?? 300)), height = Math.round(+(h ?? vb?.[2] ?? 150));
    return width > 0 && height > 0 ? { mime: 'image/svg+xml', width, height } : null;
  }
  return null;
}
export const unsafeSvg = (t) => /<script|<foreignObject|<!ENTITY|\son\w+\s*=|javascript:|(?:xlink:)?href\s*=\s*["']\s*(?:https?:|\/\/|data:text)/i.test(t);
export const isRaster = (a) => a.mime === 'image/png' || a.mime === 'image/jpeg';
export const dataUri = (a) => `data:${a.mime};base64,${a.content_base64}`;

function roleByName(name, info) {
  if (/logo|wordmark|brandmark/i.test(name)) return 'logo';
  if (/hero|banner|cover|background|(^|[-_.])bg([-_.]|$)|header/i.test(name)) return 'hero';
  if (/illustration|illustr|icon|pattern|graphic|vector/i.test(name) || info.mime === 'image/svg+xml') return 'illustration';
  return info.width >= 1000 && info.width / info.height >= 1.3 ? 'hero' : 'photo';
}

// A real logo is small and roughly compact: not a 3000px photo banner, not a JPEG hero that has "logo" in its alt text.
export const logoShaped = (info, bytes) => { const ar = info.width / info.height; return ar >= 0.3 && ar <= 8 && info.width <= 1600 && (info.mime !== 'image/jpeg' || (info.width <= 700 && bytes <= 60_000)); };
export const heroShaped = (a) => { const ar = a.width / a.height; return a.width >= 900 && ar >= 1.2 && ar <= 2.4; };
// Only a real photograph is trusted as an automatic slide background; a PNG (og:image logo card, graphic, screenshot) is not. The user can still choose one.
export const photoBackground = (a) => a.mime === 'image/jpeg' && heroShaped(a) && (a.bytes ?? a.content_base64.length * 0.75) > 30_000;

export function buildAssets(cands, notes) {
  // cands: [{buf, source, role, name}] in priority order -> bounded asset list with stable ids
  const out = [], counts = {}; let total = 0;
  const caps = { logo: 2, hero: 3, illustration: 4, photo: 3 };
  for (const c of cands) {
    const info = imageInfo(c.buf);
    if (!info) { notes.push(`Skipped (unrecognised image): ${c.source}`); continue; }
    if (info.width < 48 || info.height < 48) continue;                      // tracking pixels, favicons-in-miniature
    let role = c.role ?? roleByName(c.name ?? c.source, info);
    if (role === 'logo' && !logoShaped(info, c.buf.length)) role = roleByName(String(c.name ?? c.source).replace(/logo|wordmark|brandmark/gi, ''), info);
    if ((counts[role] ?? 0) >= caps[role]) continue;
    if (out.length >= ASSET_LIMITS.count || total + c.buf.length > ASSET_LIMITS.total) { notes.push('Image limit reached; further images ignored.'); break; }
    counts[role] = (counts[role] ?? 0) + 1; total += c.buf.length;
    out.push({ id: `${role}-${counts[role]}`, role, ...info, bytes: c.buf.length, source: c.source, content_base64: c.buf.toString('base64') });
  }
  return out;
}

// ---------- text style from CSS ----------
function toPt(v, base = 30) {
  const m = String(v).trim().match(/^(-?[\d.]+)(px|em|rem|pt)?$/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  return Math.round(({ px: n * 0.75, pt: n, em: n * base, rem: n * base }[m[2] ?? 'px']) * 10) / 10;
}
export function textStyleFromCss(css) {
  const rules = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].filter(([, sel]) => /(^|[\s,])(h1|h2)\b|\.(?:[\w-]*)(heading|headline|title)[\w-]*/i.test(sel));
  const h = {}, prov = {};
  for (const [, , body] of rules) {
    const tt = body.match(/text-transform\s*:\s*(\w+)/i)?.[1]?.toLowerCase();
    if (tt && h.case === undefined) { h.case = tt === 'uppercase' ? 'upper' : 'none'; prov['text.heading.case'] = 'css'; }
    const ls = body.match(/letter-spacing\s*:\s*([^;]+)/i)?.[1];
    const pt = ls && toPt(ls);
    if (pt !== null && pt !== undefined && h.letter_spacing === undefined && Math.abs(pt) <= 10) { h.letter_spacing = pt; prov['text.heading.letter_spacing'] = 'css'; }
    const fw = body.match(/font-weight\s*:\s*(\w+)/i)?.[1];
    if (fw && h.weight === undefined) { h.weight = fw === 'bold' || +fw >= 600 ? 700 : 400; prov['text.heading.weight'] = 'css'; }
  }
  return Object.keys(h).length ? { heading: h, prov } : null;
}

// ---------- asset discovery ----------
const attr = (tag, name) => tag.match(new RegExp(`\\s${name}\\s*=\\s*["']([^"']*)["']`, 'i'))?.[1];

export async function styleFromHtml(html, css, baseUrl, extra = [], { renderedLogo = false } = {}) {
  const notes = [], seen = new Set(), cand = [];
  const add = (u, role, name) => {
    if (!u || u.startsWith('data:')) return;
    let abs; try { abs = new URL(u, baseUrl).href; } catch { return; }
    // Once the logo has been captured from the page header, other "logo"-ish images are product lockups / partner marks, not the brand logo.
    if (renderedLogo && role === 'logo') { role = undefined; name = String(name ?? abs).replace(/logo|wordmark|brandmark|brand/gi, ''); }
    if (!seen.has(abs) && cand.length < 14) { seen.add(abs); cand.push({ url: abs, role, name: name ?? abs }); }
  };
  for (const m of html.matchAll(/<meta[^>]+>/gi)) if (/property=["']og:image|name=["']twitter:image/i.test(m[0])) add(attr(m[0], 'content'), 'hero');
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const t = m[0], hint = [attr(t, 'alt'), attr(t, 'class'), attr(t, 'id'), attr(t, 'src')].join(' ');
    add(attr(t, 'src'), /logo|brand/i.test(hint) ? 'logo' : undefined, hint);
  }
  for (const m of html.matchAll(/<link[^>]+>/gi)) if (/rel=["'][^"']*(apple-touch-icon|icon)/i.test(m[0])) add(attr(m[0], 'href'), 'logo', 'icon logo');
  for (const m of css.matchAll(/background(?:-image)?\s*:[^;}]*url\(\s*["']?([^"')]+)/gi)) add(m[1], undefined, m[1]);

  const got = [...extra];
  for (const c of cand) {
    try { const r = await safeFetch(c.url, { maxBytes: ASSET_LIMITS.bytes, timeoutMs: 8000 }); got.push({ buf: r.body, source: c.url, role: c.role, name: c.name }); }
    catch { /* unreachable or oversize: skip */ }
  }
  // logos first, then heroes, then the rest, preserving discovery order inside each group
  const rank = { logo: 0, hero: 1 };
  got.sort((a, b) => (rank[a.role] ?? 2) - (rank[b.role] ?? 2));
  const assets = buildAssets(got, notes);
  if (cand.length && !assets.length) notes.push('No usable brand images found on the page (webp/avif/gif are not read).');
  const text = textStyleFromCss(css);
  return styleDoc({ assets, text, notes });
}

export function styleDoc({ assets = [], text, notes = [] }) {
  const style = { style_version: STYLE_VERSION, assets, provenance: {} };
  if (text) { style.text = { heading: text.heading }; Object.assign(style.provenance, text.prov); }
  const hero = assets.filter((a) => a.role === 'hero' && photoBackground(a)).sort((a, b) => (b.mime === 'image/jpeg') - (a.mime === 'image/jpeg') || b.width * b.height - a.width * a.height)[0];
  if (hero) { style.backgrounds = { title: hero.id, closing: hero.id, overlay_opacity: 0.6 }; style.provenance.backgrounds = 'heuristic'; }
  return { style, notes };
}

export async function styleFromFiles(paths) {
  const notes = [], cands = [];
  for (const f of paths) {
    const buf = await readFile(f);
    if (buf.length > ASSET_LIMITS.bytes) { notes.push(`Skipped (over ${ASSET_LIMITS.bytes / 1e6} MB): ${basename(f)}`); continue; }
    cands.push({ buf, source: f, name: basename(f) });
  }
  const rank = { logo: 0, hero: 1 };
  cands.forEach((c) => { const i = imageInfo(c.buf); c.role = i ? roleByName(c.name, i) : undefined; });
  cands.sort((a, b) => (rank[a.role] ?? 2) - (rank[b.role] ?? 2));
  return { assets: buildAssets(cands, notes), notes };
}

// Write assets next to the style file (not inlined) so the JSON stays human-editable.
export async function saveStyle(path, style) {
  const { mkdir, writeFile } = await import('node:fs/promises');
  const dir = join(dirname(path), 'brand-assets');
  await mkdir(dir, { recursive: true });
  const out = { ...style, assets: [] };
  for (const a of style.assets ?? []) {
    const file = `brand-assets/${a.id}.${{ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/svg+xml': 'svg' }[a.mime]}`;
    await writeFile(join(dirname(path), file), Buffer.from(a.content_base64, 'base64'));
    const { content_base64, ...meta } = a; out.assets.push({ ...meta, file });
  }
  await writeFile(path, JSON.stringify(out, null, 2));
  return path;
}

// Images embedded in a customer PPTX (ppt/media) are brand imagery candidates.
export async function mediaFromPptx(buf, label) {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(buf), out = [];
  for (const n of Object.keys(zip.files).filter((x) => /^ppt\/media\/[^/]+\.(png|jpe?g|svg)$/i.test(x)).slice(0, 40)) {
    const b = await zip.file(n).async('nodebuffer');
    if (b.length <= ASSET_LIMITS.bytes) out.push({ buf: b, source: `${label}:${n}`, name: n });
  }
  return out;
}

// ---------- validation ----------
export function validateStyle(style, { forPptx = false } = {}) {
  const errs = [];
  if (!style || typeof style !== 'object') return ['BrandStyle must be an object.'];
  if (!ACCEPTED_STYLE_VERSIONS.includes(style.style_version)) errs.push(`style_version must be one of ${ACCEPTED_STYLE_VERSIONS.join(', ')}.`);
  errs.push(...validateDesign(style.design));
  if (style.system !== undefined) errs.push(...validateSystem(style.system));
  if (style.graphics !== undefined) errs.push(...validateGraphics(style.graphics));
  const ids = new Set();
  let total = 0;
  if (style.assets !== undefined && (!Array.isArray(style.assets) || style.assets.some((a) => !a || typeof a !== 'object'))) return [...errs, 'assets must be a list of objects.'];
  for (const a of style.assets ?? []) {
    if (!Number.isInteger(a.width) || a.width < 1 || a.width > 20000 || !Number.isInteger(a.height) || a.height < 1 || a.height > 20000) errs.push(`asset ${a.id}: width and height must be whole numbers 1-20000.`);
    if (!ID_RE.test(a.id ?? '')) errs.push(`asset id "${a.id}" must match ${ID_RE}.`);
    if (ids.has(a.id)) errs.push(`duplicate asset id ${a.id}.`);
    ids.add(a.id);
    if (!ROLES.includes(a.role)) errs.push(`asset ${a.id}: bad role.`);
    if (!MIMES.includes(a.mime)) errs.push(`asset ${a.id}: mime must be png, jpeg or svg.`);
    if (typeof a.content_base64 !== 'string' || !/^[A-Za-z0-9+/=]+$/.test(a.content_base64)) { errs.push(`asset ${a.id}: missing image data.`); continue; }
    const buf = Buffer.from(a.content_base64, 'base64'); total += buf.length;
    const info = imageInfo(buf);
    if (!info || info.mime !== a.mime) errs.push(`asset ${a.id}: file contents are not a ${a.mime}.`);
    if (a.mime === 'image/svg+xml' && unsafeSvg(buf.toString('utf8'))) errs.push(`asset ${a.id}: SVG contains scripts, event handlers or external references.`);
    if (buf.length > ASSET_LIMITS.bytes) errs.push(`asset ${a.id}: over ${ASSET_LIMITS.bytes / 1e6} MB.`);
  }
  if ((style.assets?.length ?? 0) > ASSET_LIMITS.count || total > ASSET_LIMITS.total) errs.push('Too many / too large assets.');
  const h = style.text?.heading;
  if (h) {
    if (h.case !== undefined && !['none', 'upper'].includes(h.case)) errs.push('text.heading.case must be none|upper.');
    if (h.weight !== undefined && ![400, 700].includes(h.weight)) errs.push('text.heading.weight must be 400|700.');
    if (h.letter_spacing !== undefined && !(typeof h.letter_spacing === 'number' && h.letter_spacing >= -2 && h.letter_spacing <= 10)) errs.push('text.heading.letter_spacing must be -2..10 (pt).');
  }
  const bg = style.backgrounds ?? {};
  for (const k of ['title', 'section', 'closing']) if (bg[k] !== undefined) {
    const a = (style.assets ?? []).find((x) => x.id === bg[k]);
    if (!a) errs.push(`backgrounds.${k}: unknown asset "${bg[k]}".`);
    else if (forPptx && !isRaster(a)) errs.push(`backgrounds.${k}: PowerPoint output needs png/jpg (asset ${a.id} is SVG).`);
  }
  for (const k of ['placements', 'html_backgrounds']) if (style[k] !== undefined && (!Array.isArray(style[k]) || style[k].length > 12 || style[k].some((x) => !x || typeof x !== 'object'))) return [...errs, `${k} must be a list (max 12) of objects.`];
  for (const p of style.placements ?? []) {
    const a = (style.assets ?? []).find((x) => x.id === p.asset);
    if (!a) errs.push(`placement: unknown asset "${p.asset}".`);
    else if (forPptx && !isRaster(a)) errs.push(`placement: PowerPoint output needs png/jpg (asset ${a.id} is SVG).`);
    if (!['title', 'section', 'content', 'two-column', 'quote', 'closing', 'statement', 'image', 'chart', 'highlight'].includes(p.layout)) errs.push(`placement: bad layout "${p.layout}".`);
    if (!['right', 'left', 'corner-br', 'corner-bl', 'corner-tr', 'band-bottom'].includes(p.position)) errs.push(`placement: bad position "${p.position}".`);
  }
  for (const t of style.html_backgrounds ?? []) {
    if (!(style.assets ?? []).some((x) => x.id === t.asset)) errs.push(`html_backgrounds: unknown asset "${t.asset}".`);
    if (!/^[\w.#\-\s>,]{1,80}$/.test(t.selector ?? '') ) errs.push(`html_backgrounds: unsafe selector "${t.selector}".`);
  }
  if ((style.placements?.length ?? 0) > 12) errs.push('At most 12 placements.');
  if (bg.overlay_opacity !== undefined && !(bg.overlay_opacity >= 0.2 && bg.overlay_opacity <= 0.9)) errs.push('backgrounds.overlay_opacity must be 0.2..0.9.');
  return errs;
}
export function requireStyle(style, opts) {
  if (style === undefined || style === null) return null;
  const e = validateStyle(style, opts);
  if (e.length) throw httpError(400, 'Invalid BrandStyle: ' + e.join(' '));
  return style;
}

// ---------- CLI persistence ----------
// brand-style.json keeps `file` paths (relative to it); hydrate to inline base64 for the library.
export async function loadStyle(path) {
  const style = JSON.parse(await readFile(path, 'utf8'));
  for (const a of style.assets ?? []) if (!a.content_base64 && a.file) a.content_base64 = (await readFile(join(dirname(path), a.file))).toString('base64');
  return style;
}

// ---------- CSS generation (HTML artifacts) ----------
const cssId = (s) => String(s).toLowerCase().replace(/[^a-z0-9-]/g, '-');
const inkOf = (bg) => (lightness(bg) > 0.55 ? '#1F1F1F' : '#FFFFFF');
const rgba = (hex, a) => `rgba(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(',')},${a})`;

export function brandCss({ brand_spec: spec, style, fontCss = '' }) {
  const c = spec.colors, SP = slidePalette(spec), dark = SP.dark, light = SP.light;
  const sec = c.secondary ?? c.accents?.[0] ?? c.primary;
  const heading = fontStackFor(spec, 'heading'), body = fontStackFor(spec, 'body');
  const h = style?.text?.heading ?? {}, ov = style?.backgrounds?.overlay_opacity ?? 0.6, D = withDefaults(style?.design);
  const radius = { square: '0', soft: '8px', pill: '999px' }[D.corners], hSize = { display: 'clamp(2.4rem,6vw,4.5rem)', standard: 'clamp(1.8rem,4vw,2.75rem)', compact: 'clamp(1.4rem,3vw,2rem)' }[D.heading_scale], gap = { airy: '6rem', balanced: '3.5rem', dense: '2rem' }[D.density];
  const assets = style?.assets ?? [], byId = (id) => assets.find((a) => a.id === id);
  const L = [
    ...(fontCss ? [fontCss] : []),
    `/* Brand styles — generated by sales-brand-styling. Source: ${String(spec.source ?? 'unknown').replace(/[*/<>]/g, '')} */`,
    `:root{--brand-primary:${c.primary};--brand-secondary:${sec};${(c.accents ?? []).map((a, i) => `--brand-accent-${i + 1}:${a};`).join('')}--brand-dark:${dark};--brand-light:${light};--brand-font-heading:${heading};--brand-font-body:${body}}`,
    `body{background:var(--brand-light);color:var(--brand-dark);font-family:var(--brand-font-body)}`,
    `h1,h2,h3,h4,h5,h6{font-family:var(--brand-font-heading);font-weight:${h.weight ?? 700};${h.case === 'upper' ? 'text-transform:uppercase;' : ''}${h.letter_spacing !== undefined ? `letter-spacing:${(h.letter_spacing / 0.75 / 16).toFixed(3)}em;` : ''}}`,
    `h1{font-size:${hSize};line-height:1.08}${D.align === 'center' ? 'h1,.brand-hero,.brand-closing,.brand-section{text-align:center}' : ''}`,
    `section,.brand-section-pad{padding-block:${gap}}`,
    `h1,h2{color:${SP.headingOnContent}}`,
    `a{color:var(--brand-primary)}`,
    `.brand-btn{display:inline-block;background:var(--brand-primary);color:${inkOf(c.primary)};padding:.6em 1.2em;border-radius:${radius};text-decoration:none;font-family:var(--brand-font-body)}`,
    `.brand-panel{background:${SP.titleBg};color:${inkOf(SP.titleBg)}}.brand-panel h1,.brand-panel h2,.brand-panel h3{color:inherit}`,
    `.brand-dark{background:var(--brand-dark);color:${inkOf(dark)}}.brand-dark h1,.brand-dark h2,.brand-dark h3{color:inherit}`,
  ];
  const hero = (cls, id, base) => {
    const a = id && byId(id); if (!a) return;
    L.push(`.${cls}{background:linear-gradient(${rgba(base, ov)},${rgba(base, ov)}),url("${dataUri(a)}") center/cover no-repeat;color:${inkOf(base)}}.${cls} h1,.${cls} h2,.${cls} h3{color:inherit}`);
  };
  hero('brand-hero', style?.backgrounds?.title, SP.titleBg);
  hero('brand-section', style?.backgrounds?.section, SP.sectionBg);
  hero('brand-closing', style?.backgrounds?.closing, SP.titleBg);
  for (const a of assets) {
    if (a.role === 'logo') L.push(`.brand-${cssId(a.id)}{display:inline-block;height:2.5rem;aspect-ratio:${Number(a.width) | 0}/${Number(a.height) | 0};background:url("${dataUri(a)}") center/contain no-repeat}`);
    else L.push(`.brand-img-${cssId(a.id)}{aspect-ratio:${Number(a.width) | 0}/${Number(a.height) | 0};background:url("${dataUri(a)}") center/cover no-repeat}`);
  }
  for (const t of style?.html_backgrounds ?? []) {
    const a = byId(t.asset); if (!a) continue;
    const base = t.tone === 'dark' ? dark : c.primary;
    L.push(`${t.selector}{background:linear-gradient(${rgba(base, ov)},${rgba(base, ov)}),url("${dataUri(a)}") center/cover no-repeat;color:${inkOf(base)}}`);
  }
  const lg = assets.find((a) => a.role === 'logo');
  if (lg) L.push(`.brand-logo{display:inline-block;height:2.5rem;aspect-ratio:${Number(lg.width) | 0}/${Number(lg.height) | 0};background:url("${dataUri(lg)}") center/contain no-repeat}`);
  return guardCss(L.join('\n'));
}

// Restyling an existing page may only add: heading text style + the image backgrounds the user approved.
export function restyleCss({ brand_spec: spec, style }) {
  const L = [], h = style?.text?.heading ?? {}, ov = style?.backgrounds?.overlay_opacity ?? 0.6;
  const n = [...(spec.colors.neutrals ?? [])].sort((a, b) => lightness(a) - lightness(b)), dark = n[0] ?? '#1F1F1F';
  const rule = `${h.weight !== undefined ? `font-weight:${h.weight};` : ''}${h.case === 'upper' ? 'text-transform:uppercase;' : h.case === 'none' ? 'text-transform:none;' : ''}${h.letter_spacing !== undefined ? `letter-spacing:${(h.letter_spacing / 0.75 / 16).toFixed(3)}em;` : ''}`;
  if (rule) L.push(`h1,h2,h3,h4,h5,h6{${rule}}`);
  for (const t of style?.html_backgrounds ?? []) {
    const a = (style.assets ?? []).find((x) => x.id === t.asset); if (!a) continue;
    const base = t.tone === 'dark' ? dark : spec.colors.primary;
    L.push(`${t.selector}{background:linear-gradient(${rgba(base, ov)},${rgba(base, ov)}),url("${dataUri(a)}") center/cover no-repeat;color:${inkOf(base)}}`);
  }
  return guardCss(L.join('\n'));
}
export { parseColor, extname };
