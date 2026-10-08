// Local file/folder extraction for the CLI (never exposed over HTTP: a server must not read caller-chosen paths).
// Walks a folder (no symlinks, no dot-dirs/node_modules, bounded), reads every style-bearing file,
// and builds one BrandSpec from all of it. Unsupported files (PDF, images) are listed, not silently dropped.
import { readdir, readFile, lstat } from 'node:fs/promises';
import { join, basename, extname } from 'node:path';
import { buildSpec, cssSurfaces, textFromFile, TEXT_EXTS, DECK_EXTS, PDF_EXTS } from './extract.mjs';
import { scanUpload } from './scan.mjs';
import { fontNotes } from './fonts.mjs';
import { applyLicensedFonts } from './fontinstall.mjs';
import { buildAssets, styleDoc, textStyleFromCss, mediaFromPptx, ASSET_LIMITS } from './style.mjs';
import { httpError } from './safeurl.mjs';

const LIMITS = { files: 200, depth: 4, fileBytes: 25_000_000, totalBytes: 60_000_000 };
const SKIP_DIRS = new Set(['node_modules', '.git']);
const IMG_EXTS = new Set(['png', 'jpg', 'jpeg', 'svg']);
const FONT_EXTS = new Set(['ttf', 'otf', 'woff', 'woff2']);
const SUPPORTED = new Set([...TEXT_EXTS, ...DECK_EXTS, ...PDF_EXTS]);

async function walk(dir, depth, acc) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (acc.found.length + acc.skipped.length + acc.images.length + acc.fonts.length >= LIMITS.files) { acc.truncated = true; return; }
    if (e.isSymbolicLink()) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (depth < LIMITS.depth && !e.name.startsWith('.') && !SKIP_DIRS.has(e.name)) await walk(p, depth + 1, acc); continue; }
    if (!e.isFile() || e.name.startsWith('.')) continue;
    const x = extname(e.name).slice(1).toLowerCase();
    if (IMG_EXTS.has(x)) acc.images.push(p);
    if (FONT_EXTS.has(x)) { acc.fonts.push(p); continue; }
    if (SUPPORTED.has(x)) acc.found.push(p); else if (!IMG_EXTS.has(x)) acc.skipped.push(p);
  }
}

export async function extractFromPath(path) {
  let st;
  try { st = await lstat(path); } catch { throw httpError(404, `Not found: ${path}`); }
  if (st.isSymbolicLink()) throw httpError(400, 'Symlinks are not followed; pass the real path.');
  const acc = { found: [], skipped: [], images: [], fonts: [], truncated: false };
  if (st.isDirectory()) await walk(path, 0, acc);
  else { const x = extname(path).slice(1).toLowerCase(); if (IMG_EXTS.has(x)) acc.images.push(path); if (SUPPORTED.has(x)) acc.found.push(path); else if (!IMG_EXTS.has(x)) acc.skipped.push(path); }

  let total = 0; const texts = [], used = [], notes = [], cands = [], cssTexts = [], guides = [];
  for (const f of acc.found) {
    const buf = await readFile(f);
    if (buf.length > LIMITS.fileBytes || (total += buf.length) > LIMITS.totalBytes) { notes.push(`Skipped (size limit): ${f}`); continue; }
    await scanUpload(buf);
    try {
      const t = await textFromFile(basename(f), buf); texts.push(t); used.push(f);
      if (/\.(css|html?)$/i.test(f)) cssTexts.push(t); else if (!/\.(svg|json)$/i.test(f)) guides.push(t);
      if (/\.pptx$/i.test(f)) cands.push(...(await mediaFromPptx(buf, basename(f))));
    } catch (e) { notes.push(`Skipped (${e.message}): ${f}`); }
  }
  for (const f of acc.images) {
    const buf = await readFile(f);
    if (buf.length > ASSET_LIMITS.bytes) { notes.push(`Skipped image (over ${ASSET_LIMITS.bytes / 1e6} MB): ${basename(f)}`); continue; }
    await scanUpload(buf);
    cands.push({ buf, source: f, name: basename(f) });
  }
  if (!used.length) {
    const hint = acc.skipped.length ? ` Found ${acc.skipped.length} unsupported file(s).` : acc.images.length ? ' Images alone cannot give colours or fonts — also provide a URL, CSS/PPTX/PDF guide, or type the values.' : '';
    throw httpError(422, `No readable style sources in ${path}.${hint} Supported: ${[...DECK_EXTS, ...PDF_EXTS, ...TEXT_EXTS].join(', ')}.`);
  }
  if (acc.skipped.length) notes.push(`${acc.skipped.length} unsupported file(s) ignored: ${acc.skipped.slice(0, 5).map((f) => basename(f)).join(', ')}${acc.skipped.length > 5 ? ', …' : ''}`);
  if (acc.truncated) notes.push(`Folder scan stopped at ${LIMITS.files} files.`);
  if (!process.env.BRAND_SCAN_COMMAND) notes.push('Files were not malware-scanned (BRAND_SCAN_COMMAND not set).');
  const rank = { logo: 0, hero: 1 };
  const assets = buildAssets(cands, notes);
  assets.sort((a, b) => (rank[a.role] ?? 2) - (rank[b.role] ?? 2));
  const { style } = styleDoc({ assets, text: textStyleFromCss(cssTexts.join('\n')) });
  if (assets.length) notes.push(`${assets.length} brand image(s) collected: ${assets.map((a) => a.id).join(', ')}.`);
  const brand_spec = await applyLicensedFonts(buildSpec({ source: path, text: texts.join('\n'), guideText: guides.join('\n'), surfaces: cssTexts.length ? cssSurfaces(cssTexts.join('\n')) : undefined }), { suppliedFiles: acc.fonts });
  if (acc.fonts.length) notes.push(`${acc.fonts.length} font file(s) found in the folder: ${acc.fonts.slice(0, 4).map((f) => basename(f)).join(', ')}.`);
  return { brand_spec, brand_style: style, sources_used: used, notes: [...fontNotes(brand_spec.typography), ...notes] };
}
