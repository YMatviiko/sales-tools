// render_output: apply an approved IR to the original template. HTML: token swap only, DOM untouched.
// PPTX: theme XML + per-shape overrides inside the original package (masters/layouts preserved, still editable).
import JSZip from 'jszip';
import { IR_VERSION, sha, formatOf, fontStack } from './map.mjs';
import { httpError } from './safeurl.mjs';
import { scanUpload } from './scan.mjs';
import { requireStyle, restyleCss } from './style.mjs';
import { fontNotes } from './fonts.mjs';
import { applyPptxStyle } from './pptxstyle.mjs';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const HEX = /^#[0-9A-Fa-f]{6}$/, FONT = /^[\w .\-]{1,60}$/;
const cssSafe = (v) => /^[\w #.,'"\-]{1,120}$/.test(v) && !/[;{}<>]/.test(v);
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function renderHtml(html, roles, style, brand) {
  const changes = [];
  let out = html.replace(/:root\s*\{([^}]*)\}/g, (blk, body) => '::ROOT::' + body.replace(/(--[\w-]+)(\s*:\s*)([^;]+)/g, (m, name, sep, val) => {
    const r = roles.find((x) => x.kind === 'css-var' && x.name === name && x.target);
    if (!r) return m;
    if (!cssSafe(r.target)) throw httpError(400, `Unsafe value for ${name}.`);
    changes.push(`${name}: ${val.trim()} → ${r.target}`);
    return `${name}${sep}${r.target}`;
  }) + '::END::').replace(/::ROOT::/g, ':root{').replace(/::END::/g, '}');
  const rules = roles.filter((r) => r.kind === 'css-rule');
  if (rules.length) {
    const css = rules.map((r) => {
      const props = Object.entries(r.props).map(([k, v]) => { if (!cssSafe(v) || !/^[a-z-]+$/.test(k)) throw httpError(400, `Unsafe rule ${r.id}.`); return `${k}:${v}`; }).join(';');
      if (!/^[\w.#, \-]+$/.test(r.selector)) throw httpError(400, `Unsafe selector ${r.id}.`);
      changes.push(`${r.selector} { ${props} }`);
      return `${r.selector}{${props}}`;
    }).join('\n');
    const block = `<style data-brand-override>\n${css}\n</style>`;
    out = /<\/head>/i.test(out) ? out.replace(/<\/head>/i, block + '\n</head>') : block + '\n' + out;
  }
  if (style) {
    const css = restyleCss({ brand_spec: { colors: brand.colors }, style });
    if (css) { const block = `<style data-brand-style>\n${css}\n</style>`; out = /<\/head>/i.test(out) ? out.replace(/<\/head>/i, block + '\n</head>') : block + '\n' + out; changes.push(`brand style block added (text style, ${style.html_backgrounds?.length ?? 0} image background(s))`); }
  }
  return { buf: Buffer.from(out), changes, preview: { kind: 'html', content: out } };
}

async function renderPptx(buf, roles, style, brand) {
  const zip = await JSZip.loadAsync(buf);
  const names = Object.keys(zip.files);
  const colorMap = new Map(), fontMap = new Map(), changes = [];
  for (const r of roles.filter((x) => x.target)) {
    if (['theme-color', 'hardcoded-color'].includes(r.kind)) { if (!HEX.test(r.target) || !HEX.test(r.current)) throw httpError(400, `Bad colour in ${r.id}.`); colorMap.set(r.current.toUpperCase(), r.target.toUpperCase().slice(1)); }
    if (r.kind === 'hardcoded-font' && r.target) { if (!FONT.test(r.target)) throw httpError(400, `Bad font in ${r.id}.`); fontMap.set(r.current, r.target); }
    if (r.kind === 'theme-font') { if (!FONT.test(r.target)) throw httpError(400, `Bad font in ${r.id}.`); fontMap.set(r.current, r.target); }
  }
  const themeRoles = roles.filter((r) => r.target && r.kind.startsWith('theme-'));
  for (const n of names.filter((x) => /^ppt\/theme\/theme\d+\.xml$/.test(x))) {
    let x = await zip.file(n).async('string');
    for (const r of themeRoles) {
      if (r.kind === 'theme-color') x = x.replace(new RegExp(`(<a:${r.slot}>\\s*)(?:<a:srgbClr val="[0-9a-fA-F]{6}"|<a:sysClr[^>]*?)\\s*/>`), `$1<a:srgbClr val="${r.target.slice(1).toUpperCase()}"/>`);
      else x = x.replace(new RegExp(`(<a:${r.slot}Font>\\s*<a:latin typeface=")[^"]*(")`), `$1${esc(r.target)}$2`);
    }
    zip.file(n, x);
  }
  for (const n of names.filter((x) => /^ppt\/(slides|slideLayouts|slideMasters|notesMasters)\/[^/]+\.xml$/.test(x))) {
    let x = await zip.file(n).async('string'), before = x;
    for (const [from, to] of colorMap) x = x.replace(new RegExp(`(<a:srgbClr val=")${from.slice(1)}(")`, 'gi'), `$1${to}$2`);
    for (const [from, to] of fontMap) x = x.replace(new RegExp(`(<a:latin typeface=")${reEsc(from)}(")`, 'g'), `$1${esc(to)}$2`);
    if (x !== before) { zip.file(n, x); changes.push(`overrides updated in ${n}`); }
  }
  for (const r of themeRoles) changes.unshift(`${r.slot}: ${r.current} → ${r.target}`);
  const styled = await applyPptxStyle(zip, { spec: brand, style, generated: false });
  changes.push(...styled);
  const out = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  // Structural preview (palette, fonts, slide titles). Not a pixel render of the slides.
  const titles = [];
  for (const n of names.filter((x) => /^ppt\/slides\/slide\d+\.xml$/.test(x)).sort((a, b) => parseInt(a.match(/\d+/)) - parseInt(b.match(/\d+/))))
    titles.push((await zip.file(n).async('string')).match(/<a:t>([^<]*)<\/a:t>/)?.[1] ?? '(no text)');
  const sw = themeRoles.filter((r) => r.kind === 'theme-color').map((r) => `<div class="sw"><i style="background:${esc(r.target)}"></i>${esc(r.slot)}<br><small>${esc(r.current)} → ${esc(r.target)}</small></div>`).join('');
  const fonts = themeRoles.filter((r) => r.kind === 'theme-font').map((r) => `<p style="font-family:${esc(fontStack(r.target))}"><b>${esc(r.slot === 'major' ? 'Headings' : 'Body')}:</b> ${esc(r.target)} (was ${esc(r.current)})</p>`).join('');
  const accent = themeRoles.find((r) => r.slot === 'accent1')?.target ?? '#444444';
  const html = `<!doctype html><meta charset="utf-8"><title>PPTX preview</title><style>body{font:14px system-ui;margin:24px}.sw{display:inline-block;margin:0 12px 12px 0;width:130px}.sw i{display:block;height:48px;border:1px solid #ccc}li{margin:4px 0}</style><p><em>Structural preview of the theme change — not a render of the slides. Open the .pptx in PowerPoint to check layout.</em></p>${sw}${fonts}<ol>${titles.map((t) => `<li style="color:${esc(accent)}">${esc(t)}</li>`).join('')}</ol>`;
  return { buf: out, changes, preview: { kind: 'html', content: html } };
}

export async function renderOutput({ ir, format }) {
  if (ir?.ir_version !== IR_VERSION) throw httpError(400, `Unsupported ir_version (expected ${IR_VERSION}).`);
  const buf = Buffer.from(ir.template?.content_base64 ?? '', 'base64');
  if (!buf.length || sha(buf) !== ir.template.sha256) throw httpError(400, 'Template does not match its sha256 — IR was altered.');
  const tf = formatOf(ir.template.filename ?? '');
  if (format !== tf) throw httpError(400, `Format "${format}" does not match the template (${tf}). Cross-format conversion is not supported.`);
  await scanUpload(buf);
  const roles = [...(ir.roles ?? []), ...(ir.uncertain ?? [])];
  const style = requireStyle(ir.style, { forPptx: format === 'pptx' }), brand = ir.brand ?? { colors: { primary: '#000000' } };
  const r = format === 'html' ? renderHtml(buf.toString('utf8'), roles, style, brand) : await renderPptx(buf, roles, style, brand);
  const base = ir.template.filename.replace(/\.[^.]+$/, '');
  return {
    file: { filename: `${base}.branded.${format}`, sha256: sha(r.buf), content_base64: r.buf.toString('base64') },
    preview: { ...r.preview, sandbox: 'Render only inside <iframe sandbox srcdoc> with no scripts / no same-origin.' },
    changes: r.changes,
    fonts: fontNotes(brand.typography),
  };
}
