// Is the font actually on this computer? Decks reference fonts by name, so a font that is missing on the viewer's machine is
// silently replaced by PowerPoint (usually Calibri/Arial). This detects that and, with the user's consent, installs the free
// Google Fonts for the current user (no admin rights): macOS ~/Library/Fonts, Linux ~/.local/share/fonts. Windows needs a manual
// "Install" click per file, so there we only save the files and say so.
import { readdir, mkdir, writeFile, access, readFile } from 'node:fs/promises';
import { homedir, platform } from 'node:os';
import { basename } from 'node:path';
import { join } from 'node:path';
import { norm, fileMatchesFamily, resolveSpecFonts } from './fonts.mjs';
import { googleFamilies, fetchTtfs } from './fontfiles.mjs';

const home = homedir();
export const FONT_DIRS = {
  darwin: [join(home, 'Library/Fonts'), '/Library/Fonts', '/System/Library/Fonts', '/System/Library/Fonts/Supplemental'],
  linux: [join(home, '.fonts'), join(home, '.local/share/fonts'), '/usr/share/fonts', '/usr/local/share/fonts'],
  win32: [join(process.env.LOCALAPPDATA ?? join(home, 'AppData/Local'), 'Microsoft/Windows/Fonts'), 'C:\\Windows\\Fonts'],
};
export const userFontDir = (p = platform()) => ({ darwin: FONT_DIRS.darwin[0], linux: FONT_DIRS.linux[1], win32: null })[p] ?? null;

async function listFonts(dirs, depth = 3) {
  const out = [];
  const walk = async (d, n) => {
    let ents; try { ents = await readdir(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) { if (e.isDirectory()) { if (n > 0) await walk(join(d, e.name), n - 1); } else if (/\.(ttf|otf|ttc|woff2?)$/i.test(e.name)) out.push(e.name); }
  };
  for (const d of dirs) await walk(d, depth);
  return out;
}
export { fileMatchesFamily };

/** @returns {Promise<{family:string, installed:boolean}[]>} for the Google Fonts the brand uses (system fonts are assumed present). */
export async function fontStatus(spec, { dirs = FONT_DIRS[platform()] ?? [] } = {}) {
  const files = await listFonts(dirs), fr = spec.typography?.font_resolution ?? {};
  const licensed = ['heading', 'body'].filter((r) => fr[r]?.status === 'user-licensed').map((r) => fr[r].used);
  return [...googleFamilies(spec), ...new Set(licensed)].map((family) => ({ family, installed: files.some((f) => fileMatchesFamily(f, family)), ...(licensed.includes(family) && { licensed: true }) }));
}
export const missingFonts = (status) => status.filter((s) => !s.installed).map((s) => s.family);

export const fontNotice = (missing) => missing.length
  ? `${missing.join(' and ')} ${missing.length > 1 ? 'are' : 'is'} not installed on this computer. This preview shows ${missing.length > 1 ? 'them' : 'it'} loaded from the web, but PowerPoint will show a different font until ${missing.length > 1 ? 'they are' : 'it is'} installed.`
  : null;
export const withFontNotice = (html, missing) => {
  const n = fontNotice(missing); if (!n) return html;
  const bar = `<div style="font:14px/1.45 system-ui,sans-serif;background:#FFF3CD;color:#5B4300;border:1px solid #E5C76B;border-radius:6px;padding:10px 14px;margin:0 0 14px;max-width:720px;margin-inline:auto">⚠ ${n}</div>`;
  return /<body[^>]*>/i.test(html) ? html.replace(/<body[^>]*>/i, (m) => m + bar) : html.replace(/(<p style="text-align:center"><em>)/, bar + '$1');
};

/** Install (or, on Windows, just save) the brand's Google Fonts. `dryRun` reports without writing. */
export async function installFonts(spec, { dryRun = true, dir = userFontDir(), saveDir, dirs } = {}) {
  const status = await fontStatus(spec, dirs ? { dirs } : undefined), all = missingFonts(status);
  const licensedMissing = status.filter((x) => x.licensed && !x.installed).map((x) => x.family), todo = all.filter((f) => !licensedMissing.includes(f));
  const supplied = ['heading', 'body'].flatMap((r) => (licensedMissing.includes(spec.typography.font_resolution?.[r]?.used) ? spec.typography.font_resolution[r].files ?? [] : []));
  if (!todo.length && !licensedMissing.length) return { already_installed: status.map((s) => s.family), installed: [], would_install: [], folder: null, restart_needed: false };
  const target = dir ?? saveDir;
  if (!target) throw new Error('No folder to install fonts into on this system. Use fonts-download and install the files by hand.');
  if (dryRun) return { already_installed: status.filter((s) => s.installed).map((s) => s.family), installed: [], would_install: [...todo, ...licensedMissing], folder: target, restart_needed: false };
  await mkdir(target, { recursive: true });
  const files = [];
  for (const fam of todo) for (const t of await fetchTtfs(fam)) { const f = join(target, t.filename); await writeFile(f, t.buf); files.push(f); }
  for (const src of supplied) { const buf = await readFile(src); if (!isFontFile(buf) || buf.length > 30_000_000) continue; const f = join(target, basename(src)); await writeFile(f, buf); files.push(f); }
  const notInstalled = licensedMissing.filter((fam) => !supplied.some((f) => fileMatchesFamily(f, fam)));
  return { already_installed: status.filter((s) => s.installed).map((s) => s.family), installed: [...todo, ...licensedMissing.filter((f) => !notInstalled.includes(f))], not_installed: notInstalled, files, folder: target, restart_needed: true, manual_step: dir ? null : 'Open the folder, select the font files, right-click and choose Install.' };
}
const isFontFile = (b) => b.length > 12 && (b.readUInt32BE(0) === 0x00010000 || b.toString('ascii', 0, 4) === 'OTTO' || b.toString('ascii', 0, 4) === 'true' || b.toString('ascii', 0, 4) === 'ttcf');
export const exists = (p) => access(p).then(() => true, () => false);

// Font choice is made WITHOUT asking the user (they are not designers). A proprietary customer font is used when there is
// evidence it is licensed for us, never merely because it exists on the web:
//   1. the customer SUPPLIED the font files (they are in the brand folder the user pointed at), or
//   2. the font is INSTALLED on this computer as a normal font (not a hidden OS font), i.e. the user already has it set up.
// No evidence -> the nearest free Google Font, reported as a plain statement.
const OS_DIRS = { darwin: ['/System/Library/Fonts'], linux: ['/usr/share/fonts'], win32: ['C:\\Windows\\Fonts'] };
export async function applyLicensedFonts(spec, { suppliedFiles = [], dirs } = {}) {
  const fr = spec.typography?.font_resolution; if (!fr) return spec;
  const want = ['heading', 'body'].filter((r) => fr[r]?.status === 'substituted');
  if (!want.length) return spec;
  const userDirs = dirs ?? (FONT_DIRS[platform()] ?? []).filter((d) => !(OS_DIRS[platform()] ?? []).some((o) => d.startsWith(o)));
  const installed = await listFonts(userDirs), why = {}, keep = [], files = {};
  for (const r of want) {
    const fam = spec.typography.source_fonts?.[r] ?? fr[r].requested;
    const mine = suppliedFiles.filter((f) => fileMatchesFamily(f, fam));
    if (mine.length) { why[r] = 'supplied by the customer'; keep.push(fam); files[r] = mine.slice(0, 12); }
    else if (installed.some((f) => fileMatchesFamily(f, fam))) { why[r] = 'installed on this computer'; keep.push(fam); }
  }
  if (!keep.length) return spec;
  const out = resolveSpecFonts(spec, { keep });
  for (const [r, w] of Object.entries(why)) { const x = out.typography.font_resolution[r]; x.evidence = w; x.note = x.note.replace('because the user holds a licence for it', `because it is ${w}`); if (files[r]) x.files = files[r]; }
  return out;
}
