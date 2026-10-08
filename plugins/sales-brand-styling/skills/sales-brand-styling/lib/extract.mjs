// extract_brand_spec: URL (fetch + CSS analysis, optional Playwright for computed CSS/screenshot)
// or uploaded file (explicit style-guide values first, then colour histogram).
import JSZip from 'jszip';
import { parseColor, saturation, lightness, isNeutral, toHsl } from './color.mjs';
import { safeFetch, httpError } from './safeurl.mjs';
import { scanUpload } from './scan.mjs';
import { SCHEMA_VERSION } from './brandspec.mjs';
import { styleFromHtml } from './style.mjs';
import { applyFontPolicy, fontNotes } from './fonts.mjs';
import { applyLicensedFonts } from './fontinstall.mjs';
import { decodePng, dominantColors, surfaceRole, knockOutBackground, pageRhythm } from './png.mjs';
import { slidePalette } from './palette.mjs';
import { MEASURE_DESIGN, inferDesign, designWords, inferRhythm, rhythmWords } from './design.mjs';
import { MEASURE_SYSTEM, inferSystem } from './system.mjs';
import { MEASURE_GRAPHICS, inferGraphics, graphicsWords } from './graphics.mjs';

const GENERIC_FONTS = new Set(['inherit', 'initial', 'sans-serif', 'serif', 'monospace', 'system-ui', 'ui-sans-serif', 'cursive', '-apple-system', 'blinkmacsystemfont', 'segoe ui', 'arial', 'helvetica', 'helvetica neue', 'times new roman']);
const COLOR_RE = /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|rgba?\([^)]+\)/g;

function histogram(text) {
  const h = new Map();
  for (const m of text.match(COLOR_RE) ?? []) { const c = parseColor(m); if (c) h.set(c, (h.get(c) ?? 0) + 1); }
  return h;
}
const GENERIC_OF = new Map();
function fontsFrom(text) {
  const out = new Map();
  for (const m of text.matchAll(/font-family\s*:\s*([^;}{]+)/gi)) {
    const kw = m[1].split(',').map((x) => x.trim().toLowerCase()).find((x) => ['serif', 'sans-serif', 'monospace', 'cursive'].includes(x));
    const first = m[1].split(',')[0].trim().replace(/!important/gi, '').replace(/["']/g, '').trim();
    if (first && !first.startsWith('var(') && !GENERIC_FONTS.has(first.toLowerCase())) { out.set(first, (out.get(first) ?? 0) + 1); if (kw && !GENERIC_OF.has(first)) GENERIC_OF.set(first, kw); }
  }
  return [...out.entries()].sort((a, b) => b[1] - a[1]).map(([f]) => f);
}
// Style-guide text such as "Primary Blue: #1A73E8" / "Heading font: Inter" — read, don't infer.
function explicitValues(text) {
  const colors = {}, fonts = {};
  for (const m of text.matchAll(/(?<![\w-])(primary|secondary|accent|background|neutral)[\w\s-]{0,20}?[:=\-–]\s*(#[0-9a-f]{3,6}\b|rgba?\([^)]+\))/gi)) {
    const c = parseColor(m[2]); if (c) (colors[m[1].toLowerCase()] ??= []).push(c);
  }
  // Case-sensitive on the value so CSS pseudo-classes ("body:lang(ar)", ".title:hover") are never read as font names.
  for (const m of text.matchAll(/\b([Hh]eading|[Hh]eadline|[Tt]itle|[Bb]ody|[Tt]ext)\s*(?:[Ff]ont|[Tt]ypeface)?\s*[:=]\s*([A-Z][\w ]{1,30})(?![\w(])/g))
    fonts[/^[BbTt]/.test(m[1]) && /^(body|text)/i.test(m[1]) ? 'body' : 'heading'] ??= m[2].trim();
  return { colors, fonts };
}
function cssVarColors(css) {
  const out = {};
  for (const m of css.matchAll(/--([\w-]*(?:primary|brand|accent|secondary)[\w-]*)\s*:\s*([^;}{]+)/gi)) { const c = parseColor(m[2].trim()); if (c) out[m[1].toLowerCase()] = c; }
  return out;
}
// Which colours cover the page, estimated from CSS background declarations (used when no screenshot is available).
export function cssSurfaces(css) {
  const h = new Map(); let n = 0;
  for (const m of css.matchAll(/background(?:-color)?\s*:\s*([^;}{]*)/gi)) {
    for (const c of m[1].match(COLOR_RE) ?? []) { const x = parseColor(c); if (x) { h.set(x, (h.get(x) ?? 0) + 1); n++; } }
  }
  return [...h.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([hex, c]) => ({ hex, share: Math.round((c / n) * 1000) / 1000 }));
}
const TONE_RULES = [
  ['minimal', (s) => (s.neutralShare ?? 0) > 0.7 || (s.palette <= 4 && s.avgSat < 0.35)],
  ['playful', (s) => s.avgSat > 0.55 && s.palette >= 5 && (s.neutralShare ?? 0) < 0.5],
  ['corporate', (s) => s.dominantHue >= 190 && s.dominantHue <= 260 && s.avgSat < 0.8],
  ['bold', (s) => s.avgSat > 0.7 && (s.neutralShare ?? 0) < 0.5],
  ['dark', (s) => (s.darkAreaShare ?? s.darkShare) > 0.5],
];

// `guideText` = text written by a human as a style guide ("Primary: #1A73E8"). Scraped markup/CSS must NOT be passed
// there (default: same as `text`, for callers that only have a guide). `surfaces` = [{hex, share}] of what covers the page.
export function buildSpec({ source, text, guideText, surfaces, surfaceSource }) {
  const prov = {};
  const explicit = explicitValues(guideText ?? text);
  const vars = cssVarColors(text);
  const hist = histogram(text);
  const ranked = [...hist.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  const chromatic = ranked.filter((c) => !isNeutral(c));
  const neutrals = ranked.filter(isNeutral).slice(0, 5);

  let primary = explicit.colors.primary?.[0]; if (primary) prov['colors.primary'] = 'explicit';
  if (!primary) { primary = Object.entries(vars).find(([k]) => /primary|brand/.test(k))?.[1]; if (primary) prov['colors.primary'] = 'css'; }
  if (!primary) { primary = chromatic[0] ?? ranked[0]; prov['colors.primary'] = 'histogram'; }
  if (!primary) throw httpError(422, 'No colours found in the source — cannot build a BrandSpec.');
  let secondary = explicit.colors.secondary?.[0] ?? Object.entries(vars).find(([k]) => /secondary/.test(k))?.[1];
  if (secondary) prov['colors.secondary'] = explicit.colors.secondary ? 'explicit' : 'css';
  else { secondary = chromatic.find((c) => c !== primary); if (secondary) prov['colors.secondary'] = 'histogram'; }
  const accents = [...(explicit.colors.accent ?? []), ...chromatic.filter((c) => c !== primary && c !== secondary)].filter((v, i, a) => a.indexOf(v) === i).slice(0, 3);

  const fonts = fontsFrom(text);
  const heading = explicit.fonts.heading ?? fonts[0] ?? 'system-ui';
  const body = explicit.fonts.body ?? fonts[1] ?? fonts[0] ?? 'system-ui';
  prov['typography.heading_font'] = explicit.fonts.heading ? 'explicit' : fonts[0] ? 'css' : 'heuristic';
  prov['typography.body_font'] = explicit.fonts.body ? 'explicit' : fonts.length ? 'css' : 'heuristic';

  const pal = [primary, ...(secondary ? [secondary] : []), ...accents];
  const stats = {
    palette: pal.length,
    avgSat: pal.reduce((a, c) => a + saturation(c), 0) / pal.length,
    dominantHue: toHsl(primary).h,
    darkShare: ranked.length ? ranked.filter((c) => lightness(c) < 0.25).length / ranked.length : 0,
    neutralShare: surfaces?.length ? surfaces.filter((x) => surfaceRole(x.hex) !== 'colour').reduce((t, x) => t + x.share, 0) : undefined,
    darkAreaShare: surfaces?.length ? surfaces.filter((x) => surfaceRole(x.hex) === 'dark').reduce((t, x) => t + x.share, 0) : undefined,
  };
  const tone = TONE_RULES.filter(([, f]) => f(stats)).map(([k]) => k);
  prov.tone_keywords = 'heuristic';
  if (surfaces?.length) prov['colors.surfaces'] = surfaceSource ?? 'css';

  return {
    schema_version: SCHEMA_VERSION,
    source,
    colors: { primary, ...(secondary && { secondary }), accents, neutrals, ...(surfaces?.length && { surfaces }) },
    typography: applyFontPolicy({ heading_font: heading, body_font: body, scale: 'unknown' }, { names: { heading, body }, generics: { heading: GENERIC_OF.get(heading), body: GENERIC_OF.get(body) } }),
    tone_keywords: tone.length ? tone : ['corporate'],
    provenance: prov,
  };
}
async function collectCss(html, baseUrl) {
  let css = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n');
  css += '\n' + [...html.matchAll(/style="([^"]*)"/gi)].map((m) => m[1]).join(';\n');
  const links = [...html.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]*>/gi)].map((m) => m[0].match(/href=["']([^"']+)["']/i)?.[1]).filter(Boolean).slice(0, 5);
  for (const href of links) {
    try { css += '\n' + (await safeFetch(new URL(href, baseUrl).href, { maxBytes: 1_500_000, accept: 'text/css' })).body.toString('utf8'); } catch { /* skip unreachable stylesheet */ }
  }
  return css;
}

export async function launchBrowser(chromium) {
  const tries = [process.env.BRAND_CHROME_PATH && { executablePath: process.env.BRAND_CHROME_PATH }, { channel: 'chrome' }, { channel: 'msedge' }, {}].filter(Boolean);
  let last;
  for (const t of tries) { try { return await chromium.launch({ ...t, args: ['--no-sandbox'] }); } catch (e) { last = e; } }
  throw last;
}

// Measured in the page itself (computed styles), which CSS text alone cannot give: which font is really rendered,
// what the buttons/links look like. Runs inside the browser, so it must be self-contained.
const MEASURE = () => {
  const vis = (el) => { const r = el.getBoundingClientRect(), cs = getComputedStyle(el); return r.width > 20 && r.height > 8 && cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0' && r.bottom > 0; };
  const first = (sel) => [...document.querySelectorAll(sel)].find(vis);
  const fam = (cs) => cs.fontFamily.split(',').map((x) => x.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
  const pick = (el) => { if (!el) return null; const cs = getComputedStyle(el); return { families: fam(cs), weight: cs.fontWeight, size: cs.fontSize, letterSpacing: cs.letterSpacing, transform: cs.textTransform, color: cs.color }; };
  const solid = (c) => c && !/rgba\(\s*\d+,\s*\d+,\s*\d+,\s*0\s*\)|transparent/.test(c);
  const buttons = [...document.querySelectorAll('button, [role="button"], a[class*="button" i], a[class*="btn" i], a[class*="cta" i], input[type="submit"]')].filter(vis).slice(0, 40)
    .map((el) => { const cs = getComputedStyle(el); return { bg: cs.backgroundColor, color: cs.color }; }).filter((b) => solid(b.bg));
  const links = [...document.querySelectorAll('a')].filter(vis).slice(0, 80).map((a) => getComputedStyle(a).color);
  return { bodyBg: getComputedStyle(document.body).backgroundColor, htmlBg: getComputedStyle(document.documentElement).backgroundColor,
    heading: pick(first('h1') ?? first('h2')), body: pick(first('p') ?? first('li')), buttons, links };
};
const LOGO_SELECTORS = ['header a[href="/"] svg', 'header a[href="/"] img', 'a[href="/"] > svg', 'a[href="/"] > img', '[class*="logo" i] img', '[class*="logo" i] svg', 'img[alt*="logo" i]', 'header img', 'nav a:first-child svg'];

// -> { hero: base64 PNG of the first screen, page: Buffer PNG of up to ~6 screens, computed, logo: Buffer|null }, or null when no browser.
async function inspectSite(url) {
  let chromium;
  try { ({ chromium } = await import('playwright-core')); } catch { return null; }
  try {
    const browser = await launchBrowser(chromium);
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      await page.route('**/*', async (route) => {            // egress control: every sub-request re-checked
        try { const { assertSafeUrl } = await import('./safeurl.mjs'); await assertSafeUrl(route.request().url()); await route.continue(); } catch { await route.abort(); }
      });
      await page.goto(url, { timeout: 20_000, waitUntil: 'load' });
      await page.waitForTimeout(600);
      const hero = (await page.screenshot({ type: 'png' })).toString('base64');
      const computed = await page.evaluate(MEASURE).catch(() => null);
      let logoSel = null;
      for (const sel of LOGO_SELECTORS) {
        try {
          const loc = page.locator(sel).first();
          if (!(await loc.count())) continue;
          const box = await loc.boundingBox();
          if (box && box.width >= 10 && box.width <= 420 && box.height >= 10 && box.height <= 160 && box.y < 320) { logoSel = sel; break; }
        } catch { /* try the next selector */ }
      }
      const total = await page.evaluate(async () => { const H = Math.min(document.documentElement.scrollHeight, 5400); for (let y = 0; y < H; y += 800) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); } window.scrollTo(0, 0); return H; });
      await page.waitForTimeout(300);
      const designM = await page.evaluate(MEASURE_DESIGN).catch(() => null);
      const systemM = await page.evaluate(MEASURE_SYSTEM).catch(() => null);
      const graphicsM = await page.evaluate(MEASURE_GRAPHICS).catch(() => null);
      const full = await page.screenshot({ type: 'png', fullPage: true, clip: { x: 0, y: 0, width: 1440, height: Math.max(900, total) } });
      // Header logos are often tiny when rendered (14x44): re-capture on a 4x page so the file is usable on a slide.
      let logo = null;
      if (logoSel) {
        const big = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 4 });
        try {
          await big.route('**/*', async (route) => { try { const { assertSafeUrl } = await import('./safeurl.mjs'); await assertSafeUrl(route.request().url()); await route.continue(); } catch { await route.abort(); } });
          await big.goto(url, { timeout: 20_000, waitUntil: 'load' }); await big.waitForTimeout(500);
          logo = await big.locator(logoSel).first().screenshot({ type: 'png', omitBackground: true, timeout: 4000 });
        } catch { logo = null; } finally { await big.close(); }
      }
      return { hero, page: full, computed, logo, designM, systemM, graphicsM };
    } finally { await browser.close(); }
  } catch { return null; }
}

const GENERIC_FAMILY = new Set(['sans-serif', 'serif', 'monospace', 'cursive', 'system-ui', 'ui-sans-serif', '-apple-system', 'blinkmacsystemfont', 'emoji', 'inherit']);
const realFamily = (fams = []) => fams.find((f) => !GENERIC_FAMILY.has(f.toLowerCase()) && !/icon|emoji|symbol/i.test(f));

/** Merge what was measured in the live page into the CSS-derived spec/style. Pure; exported for tests. */
export function refineWithBrowser(spec, style, computed) {
  if (!computed) return { spec, style, notes: [] };
  const notes = [], out = { ...spec, colors: { ...spec.colors }, provenance: { ...spec.provenance } };
  const col = (c) => parseColor(c ?? '');
  // fonts the page really renders
  const hf = realFamily(computed.heading?.families), bf = realFamily(computed.body?.families);
  if (hf || bf) {
    const t = out.typography, src = { heading: hf ?? t.source_fonts?.heading ?? t.heading_font, body: bf ?? hf ?? t.source_fonts?.body ?? t.body_font };
    const generics = { heading: computed.heading?.families?.find((f) => ['serif', 'monospace', 'cursive'].includes(f.toLowerCase())), body: computed.body?.families?.find((f) => ['serif', 'monospace', 'cursive'].includes(f.toLowerCase())) };
    out.typography = applyFontPolicy({ heading_font: src.heading, body_font: src.body, scale: t.scale }, { names: src, generics });
    if (hf) out.provenance['typography.heading_font'] = 'computed'; if (bf) out.provenance['typography.body_font'] = 'computed';
  }
  // colours: text + page background are neutrals; button/link colour is the brand accent when the page is mostly neutral
  const neutrals = new Set(out.colors.neutrals);
  for (const c of [col(computed.body?.color), col(computed.bodyBg), col(computed.htmlBg)]) if (c && isNeutral(c)) neutrals.add(c);
  out.colors.neutrals = [...neutrals].slice(0, 6);
  const flood = slidePalette({ ...out, colors: { ...out.colors, primary: isNeutral(out.colors.primary) ? '#808080' : out.colors.primary } }).flood;
  const cand = new Map();
  for (const b of computed.buttons ?? []) { const c = col(b.bg); if (c && !isNeutral(c) && lightness(c) > 0.1 && lightness(c) < 0.9) cand.set(c, (cand.get(c) ?? 0) + 3); }
  for (const l of computed.links ?? []) { const c = col(l); if (c && !isNeutral(c) && lightness(c) > 0.1 && lightness(c) < 0.9) cand.set(c, (cand.get(c) ?? 0) + 1); }
  const top = [...cand.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const primaryIsNeutral = isNeutral(out.colors.primary);
  if ((!flood || primaryIsNeutral) && top && out.provenance['colors.primary'] !== 'explicit') {
    if (top !== out.colors.primary) { out.colors.accents = [out.colors.primary, ...out.colors.accents].filter((c) => c !== top).slice(0, 3); out.colors.primary = top; }
    out.provenance['colors.primary'] = 'computed';
    notes.push(primaryIsNeutral ? `${top} is the colour on their buttons and links, so it is used as their main colour.` : `Their page is mostly neutral colours; ${top} is the colour on their buttons and links, so it is used as the accent.`);
  }
  // heading text style
  const nstyle = style ? { ...style, text: { ...(style.text ?? {}) }, provenance: { ...(style.provenance ?? {}) } } : style;
  const h = computed.heading;
  if (nstyle && h) {
    const hs = { ...(nstyle.text.heading ?? {}) }, w = parseInt(h.weight, 10);
    if (hs.weight === undefined && Number.isFinite(w)) { hs.weight = w >= 600 ? 700 : 400; nstyle.provenance['text.heading.weight'] = 'computed'; }
    if (hs.case === undefined && h.transform) { hs.case = h.transform === 'uppercase' ? 'upper' : 'none'; nstyle.provenance['text.heading.case'] = 'computed'; }
    const ls = /px$/.test(h.letterSpacing ?? '') ? parseFloat(h.letterSpacing) * 0.75 : NaN;
    if (hs.letter_spacing === undefined && Number.isFinite(ls) && Math.abs(ls) >= 0.5 && Math.abs(ls) <= 10) { hs.letter_spacing = Math.round(ls * 10) / 10; nstyle.provenance['text.heading.letter_spacing'] = 'computed'; }
    if (Object.keys(hs).length) nstyle.text.heading = hs;
  }
  // tone follows what covers the page
  if (!flood && !out.tone_keywords.includes('minimal')) out.tone_keywords = ['minimal', ...out.tone_keywords.filter((k) => !['playful', 'bold'].includes(k))].slice(0, 3);
  return { spec: out, style: nstyle, notes };
}

export async function extractFromUrl(url) {
  const page = await safeFetch(url, { accept: 'text/html' });
  const html = page.body.toString('utf8');
  const css = await collectCss(html, page.url);
  const shots = await inspectSite(page.url);
  let surfaces, surfaceSource;
  if (shots) { try { surfaces = dominantColors(decodePng(shots.page), { step: 4 }); surfaceSource = 'screenshot'; } catch { /* unsupported PNG variant: fall back to CSS */ } }
  if (!surfaces?.length) { surfaces = cssSurfaces(css); surfaceSource = 'css'; }
  let spec = buildSpec({ source: page.url, text: css + '\n' + html, guideText: '', surfaces, surfaceSource });
  const logo = html.match(/<link[^>]+rel=["'](?:apple-touch-icon|icon)["'][^>]*href=["']([^"']+)["']/i)?.[1];
  if (logo) spec.logo_asset = new URL(logo, page.url).href;
  const shot = shots?.hero ?? null;
  const logoCand = shots?.logo ? [{ buf: knockOutBackground(shots.logo), source: `${page.url} (logo as shown in the page header)`, role: 'logo', name: 'logo' }] : [];
  const base = await styleFromHtml(html, css, page.url, logoCand, { renderedLogo: logoCand.length > 0 });
  const refined = refineWithBrowser(spec, base.style, shots?.computed);
  const design = inferDesign(shots?.designM);
  if (refined.style) { const sys = inferSystem(shots?.systemM); if (sys) { refined.style.system = sys; refined.style.provenance = { ...(refined.style.provenance ?? {}), system: 'measured' };
    // What the browser rendered for the H1 beats a stylesheet guess: the page's real heading weight wins.
    const w1 = parseInt(sys.type?.h1?.weight, 10);
    if (Number.isFinite(w1) && refined.style.text?.heading) { refined.style.text = { ...refined.style.text, heading: { ...refined.style.text.heading, weight: w1 >= 600 ? 700 : 400 } }; refined.style.provenance['text.heading.weight'] = 'computed'; } refined.notes.push('Their real page components (navigation, buttons, cards, footer) were measured for prototypes.'); } }
  if (refined.style) { const gx = inferGraphics(shots?.graphicsM); if (gx) { refined.style.graphics = gx; refined.style.provenance = { ...(refined.style.provenance ?? {}), graphics: 'measured' }; refined.notes.push('Their graphics (corners, gradients, patterns, graphic sections) were measured: ' + graphicsWords(gx).join('; ') + '.'); } }
  let rhythm = null; if (shots?.page) { try { rhythm = inferRhythm(pageRhythm(decodePng(shots.page))); } catch { /* unsupported PNG variant */ } }
  if (design && rhythm) design.rhythm = rhythm;
  if (design && refined.style) { refined.style.design = design; refined.style.provenance = { ...(refined.style.provenance ?? {}), design: 'measured' }; refined.notes.push(`Layout feel measured on their page: ${designWords(design).join(', ')}${rhythm ? `; ${rhythmWords(rhythm)}` : ''}.`); }
  else if (shots && refined.style) refined.notes.push('Their page gave too little to measure the layout feel (it may block automated visits), so a neutral layout is used. Ask for a brand guide or tell me what it feels like.');
  const style = refined.style, styleNotes = [...refined.notes, ...base.notes];
  const twins = await rasterizeSvgAssets(style); if (twins.length) styleNotes.push(`${twins.length} SVG image(s) were also rendered to PNG so PowerPoint can use them: ${twins.join(', ')}.`);
  spec = await applyLicensedFonts(refined.spec);
  return { brand_spec: spec, brand_style: style, hero_screenshot_png_base64: shot,
    notes: [...fontNotes(spec.typography), ...(shot ? ['Screenshot attached: route it through a vision model to refine tone_keywords.'] : ['No screenshot (Playwright/Chromium not installed); tone_keywords are CSS heuristics only.']), ...styleNotes, ...(style.assets.length ? [`${style.assets.length} brand image(s) collected: ${style.assets.map((a) => a.id).join(', ')} — confirm they are the customer's own before using them.`] : [])] };
}

/**
 * PowerPoint output only takes PNG/JPG, but many sites carry their imagery as SVG artwork. Render each (already sanitised) SVG asset to a
 * PNG twin `<id>-png` in the browser: the SVG is loaded as an <img> (no scripts run, no requests are made), at up to 2x, on a transparent
 * background. Best-effort: no browser, no twins.
 */
export async function rasterizeSvgAssets(style, { max = 4 } = {}) {
  const svgs = (style?.assets ?? []).filter((a) => a.mime === 'image/svg+xml' && !(style.assets ?? []).some((b) => b.id === `${a.id}-png`) && a.role !== 'logo').slice(0, max);
  if (!svgs.length) return [];
  let chromium; try { ({ chromium } = await import('playwright-core')); } catch { return []; }
  let browser; try { browser = await launchBrowser(chromium); } catch { return []; }
  const made = [];
  try {
    for (const a of svgs) {
      const k = Math.min(2, 1600 / Math.max(a.width, a.height)), w = Math.max(48, Math.round(a.width * k)), h = Math.max(48, Math.round(a.height * k));
      const page = await browser.newPage({ viewport: { width: w, height: h } });
      try {
        await page.route('**/*', (route) => (route.request().url().startsWith('data:') || route.request().url() === 'about:blank' ? route.continue() : route.abort()));
        await page.setContent(`<!doctype html><body style="margin:0;background:transparent"><img id="i" style="display:block" width="${w}" height="${h}" src="data:image/svg+xml;base64,${a.content_base64}"></body>`);
        await page.waitForFunction(() => document.getElementById('i').complete, null, { timeout: 4000 });
        const png = await page.screenshot({ type: 'png', omitBackground: true, timeout: 5000 });
        if (png.length <= 2_000_000) made.push({ id: `${a.id}-png`, role: a.role, mime: 'image/png', width: w, height: h, bytes: png.length, source: `${a.source} (rendered to PNG for PowerPoint)`, content_base64: png.toString('base64') });
      } catch { /* skip this one */ } finally { await page.close(); }
    }
  } finally { await browser.close(); }
  style.assets = [...style.assets, ...made];
  return made.map((m) => m.id);
}

export const TEXT_EXTS = ['html', 'htm', 'css', 'txt', 'md', 'svg', 'json'];
export const DECK_EXTS = ['pptx', 'potx'];
export const PDF_EXTS = ['pdf'];

// Style-bearing text of one file: pptx -> theme/master XML flattened to colour/font tokens; text formats as-is.
export async function textFromFile(filename, buf) {
  const ext = (filename.split('.').pop() || '').toLowerCase();
  if (DECK_EXTS.includes(ext)) {
    const zip = await JSZip.loadAsync(buf);
    const parts = Object.keys(zip.files).filter((n) => /^ppt\/(theme|slideMasters|slideLayouts)\/.*\.xml$/.test(n));
    const xml = (await Promise.all(parts.map((n) => zip.file(n).async('string')))).join('\n');
    return xml.replace(/<a:srgbClr val="([0-9a-fA-F]{6})"/g, '#$1 ').replace(/<a:latin typeface="([^"]+)"/g, 'font-family: $1;');
  }
  if (PDF_EXTS.includes(ext)) return (await import('./pdf.mjs')).textFromPdf(buf);
  if (TEXT_EXTS.includes(ext)) return buf.toString('utf8');
  throw httpError(415, `Unsupported file type .${ext}. Supported: ${[...DECK_EXTS, ...PDF_EXTS, ...TEXT_EXTS].join(', ')}. (Image files are not read yet.)`);
}

export async function extractFromFile({ filename, content_base64 }) {
  const buf = Buffer.from(content_base64 ?? '', 'base64');
  if (!buf.length) throw httpError(400, 'Empty file.');
  if (buf.length > 25_000_000) throw httpError(413, 'File too large (25 MB max).');
  const scan = await scanUpload(buf);
  const text = await textFromFile(filename, buf);
  const isMarkup = /\.(html?|css|svg|json)$/i.test(filename);
  const brand_spec = await applyLicensedFonts(buildSpec({ source: filename, text, guideText: isMarkup ? '' : text, surfaces: isMarkup ? cssSurfaces(text) : undefined }));
  return { brand_spec, notes: [...fontNotes(brand_spec.typography), ...(scan.scanned ? [] : ['Upload was not malware-scanned (BRAND_SCAN_COMMAND not set).'])] };
}

export async function extractBrandSpec(input) {
  if (input?.url) return extractFromUrl(input.url);
  if (input?.file) return extractFromFile(input.file);
  throw httpError(400, 'Provide "url" or "file".');
}
