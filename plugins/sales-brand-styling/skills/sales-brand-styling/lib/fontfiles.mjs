// Fetch free Google Fonts files so the output is actually usable: TTFs to install for PowerPoint, or woff2 embedded in HTML.
// Only fonts.googleapis.com / fonts.gstatic.com over https are ever contacted; only Google Fonts families (OFL/Apache) are fetched.
import { catalog, findGoogle } from './fonts.mjs';
import { httpError } from './safeurl.mjs';

const HOSTS = new Set(['fonts.googleapis.com', 'fonts.gstatic.com']);
const CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const MAX = 2_500_000;

async function get(url, { ua, binary } = {}) {
  const u = new URL(url);
  if (u.protocol !== 'https:' || !HOSTS.has(u.hostname)) throw httpError(400, `Refusing to fetch ${u.hostname}.`);
  const res = await fetch(u, { redirect: 'error', signal: AbortSignal.timeout(15_000), headers: ua ? { 'user-agent': ua } : {} });
  if (!res.ok) throw httpError(502, `Font fetch failed (${res.status}) for ${u.pathname}.`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX) throw httpError(413, 'Font file too large.');
  return binary ? buf : buf.toString('utf8');
}
const weightsFor = (family) => [400, 700].filter((w) => catalog().byName.get(family)?.w.includes(w));
const cssUrl = (family, weights) => `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, '+')}:wght@${weights.join(';')}`;
export const googleFamilies = (spec) => [...new Set(['heading', 'body'].map((r) => spec.typography[`${r}_font`]))].filter((f) => findGoogle(f)).map((f) => findGoogle(f).f);

/** TTFs (no User-Agent => Google returns truetype). -> [{family, weight, filename, buf}] */
export async function fetchTtfs(family) {
  if (!catalog().byName.has(family)) throw httpError(400, `${family} is not a Google Fonts family.`);
  const css = await get(cssUrl(family, weightsFor(family)));
  const out = [];
  for (const m of css.matchAll(/font-weight:\s*(\d+);[\s\S]*?src:\s*url\(([^)]+)\)/g))
    out.push({ family, weight: +m[1], filename: `${family.replace(/\s+/g, '')}-${m[1]}.ttf`, buf: await get(m[2], { binary: true }) });
  if (!out.length) throw httpError(502, `No font files found for ${family}.`);
  return out;
}

/** @font-face CSS with the latin woff2 subset inlined (self-contained; no request to Google at view time). */
export async function embeddedFontFaces(spec) {
  const faces = [];
  for (const family of googleFamilies(spec)) {
    const css = await get(cssUrl(family, weightsFor(family)), { ua: CHROME });
    const block = [...css.matchAll(/\/\*\s*([\w-]+)\s*\*\/\s*(@font-face\s*\{[^}]*\})/g)].filter((m) => m[1] === 'latin');
    for (const [, , face] of block) {
      const url = face.match(/url\(([^)]+)\)/)?.[1];
      const b64 = (await get(url, { binary: true })).toString('base64');
      faces.push(face.replace(/src:[^;]+;/, `src:url(data:font/woff2;base64,${b64}) format('woff2');`).replace(/\s+/g, ' '));
    }
  }
  return faces.join('\n');
}
