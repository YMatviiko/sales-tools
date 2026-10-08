// Plain-English health check. Each item: ok (works), warn (works with a limit), fail (blocks the main workflow).
import { access, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const exists = (p) => access(p).then(() => true, () => false);

export async function doctor() {
  const out = [], add = (level, what, detail) => out.push({ level, what, detail });
  const major = +process.versions.node.split('.')[0];
  major >= 18 ? add('ok', 'Node.js', `version ${process.versions.node}`) : add('fail', 'Node.js', `version ${process.versions.node} is too old; install Node 18 or newer from nodejs.org.`);
  for (const [pkg, what] of [['jszip', 'PowerPoint files'], ['pptxgenjs', 'building decks'], ['pdf', 'reading PDF style guides']]) {
    try { await (pkg === 'pdf' ? (await import('./pdf.mjs')).loadPdfJs() : import(pkg)); add('ok', what, 'ready'); } catch { add('fail', what, `missing — run "npm install" in ${root}`); }
  }
  (await exists(join(root, 'data', 'google-fonts.json'))) ? add('ok', 'Free-font list', 'present') : add('fail', 'Free-font list', 'data/google-fonts.json is missing; run "node scripts/update-google-fonts.mjs".');
  try {
    const r = await fetch('https://fonts.googleapis.com/css2?family=Inter', { method: 'HEAD', signal: AbortSignal.timeout(6000) });
    r.ok ? add('ok', 'Internet access to Google Fonts', 'works (needed for font downloads and embedding)') : add('warn', 'Internet access to Google Fonts', `answered ${r.status}`);
  } catch { add('warn', 'Internet access to Google Fonts', 'not reachable: decks and boards still work, but fonts cannot be downloaded or embedded'); }
  let chromium = null;
  try { ({ chromium } = await import('playwright-core')); } catch { add('fail', 'Website measuring', `the browser-control package is missing — run "node setup.mjs" in ${root}. Without it nothing on a live website can be measured.`); }
  if (chromium) {
    try { const { launchBrowser } = await import('./extract.mjs'); const br = await launchBrowser(chromium); await br.close(); add('ok', 'Website screenshots', 'a browser was found: website colours, fonts, layout and components are measured on the live page'); }
    catch { add('warn', 'Website screenshots', 'no browser found (install Google Chrome, or set BRAND_CHROME_PATH): website reading still works from the page styles, but fonts, logo, layout and components are less accurate, and there is no screenshot for comparison'); }
  }
  process.env.BRAND_SCAN_COMMAND ? add('ok', 'Virus scan of uploaded files', 'configured') : add('warn', 'Virus scan of uploaded files', 'not configured: files you point at are read without scanning (set BRAND_SCAN_COMMAND, e.g. clamscan, before using customer uploads at scale)');
  const v = (await readFile(join(root, 'VERSION'), 'utf8')).trim();
  return { version: v, ready: !out.some((x) => x.level === 'fail'), checks: out };
}
export const doctorText = (d) => `sales-brand-styling v${d.version}\n` + d.checks.map((c) => `${{ ok: '✓', warn: '!', fail: '✗' }[c.level]} ${c.what}: ${c.detail}`).join('\n') + `\n\n${d.ready ? 'Ready to use.' : 'NOT ready: fix the ✗ items first.'}`;
