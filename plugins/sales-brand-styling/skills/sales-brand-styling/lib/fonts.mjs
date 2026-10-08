// Font policy: use the customer's font only when it carries no licence burden; otherwise the closest free Google Font.
//   google   exact family exists on Google Fonts (all are open-licensed: OFL/Apache) -> use as is
//   system   ships with Windows/Office (and mostly macOS) -> reference by name, nothing to license or embed; free metric twin as web fallback
//   user-licensed  the sales manager asserted the customer's licence covers it (`fonts set --keep`) -> use as is, their call
//   substituted    anything else is assumed licensed -> closest free Google Font (curated analogue, else category-level best guess)
//   default        no customer font found at all -> neutral default, flagged
// "Closest" is only as good as the evidence: a curated table of well-known commercial faces, then the generic hint from the
// CSS fallback stack / name (serif, mono, condensed…). Alternatives are always listed so a human can pick.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
let CAT, RESEARCHED;
// Researched analogues (data/font-analogues.json): {nearest, alternatives, confidence, reason}. Wins over the built-in table.
export function researched() {
  if (!RESEARCHED) { try { RESEARCHED = JSON.parse(readFileSync(join(here, '..', 'data', 'font-analogues.json'), 'utf8')).entries; } catch { RESEARCHED = {}; } }
  return RESEARCHED;
}
export function catalog() {
  if (!CAT) {
    const raw = JSON.parse(readFileSync(join(here, '..', 'data', 'google-fonts.json'), 'utf8'));
    CAT = { fetched: raw.fetched, list: raw.fonts, byNorm: new Map(raw.fonts.map((f) => [norm(f.f), f])), byName: new Map(raw.fonts.map((f) => [f.f, f])) };
  }
  return CAT;
}

const WEIGHTY = /^(regular|bold|italic|light|medium|semibold|extrabold|extralight|ultralight|black|thin|variable|wght|opsz|book|roman|\d)/;
/** Does this font FILE belong to this family? (Inter-Regular.ttf, InterVariable.ttf yes; Internet.ttf no.) */
export const fileMatchesFamily = (file, family) => {
  const stem = norm(String(file).replace(/^.*[\\/]/, '').replace(/\.[a-z0-9]+$/i, '')), fam = norm(family);
  return fam.length > 1 && stem.startsWith(fam) && (stem.length === fam.length || WEIGHTY.test(stem.slice(fam.length)));
};
export const norm = (s) => String(s).toLowerCase().replace(/\.(ttf|otf|woff2?)$/, '').replace(/[^a-z0-9]/g, '');
const WEIGHT_TAIL = /(regular|bold|italic|oblique|light|medium|semibold|demibold|extrabold|extralight|ultralight|black|thin|book|roman|heavy)$/;

// same font, different name
const ALIASES = { sourcesanspro: 'Source Sans 3', sourceserifpro: 'Source Serif 4', opensanscondensed: 'Open Sans', robotocondensedregular: 'Roboto Condensed' };

// [normalised name]: [web fallback (free metric/visual twin) or null]
const SYSTEM = {
  arial: ['Arial', 'Arimo'], timesnewroman: ['Times New Roman', 'Tinos'], couriernew: ['Courier New', 'Cousine'], calibri: ['Calibri', 'Carlito'], cambria: ['Cambria', 'Caladea'],
  georgia: ['Georgia', 'Gelasio'], verdana: ['Verdana', 'Open Sans'], tahoma: ['Tahoma', 'Open Sans'], trebuchetms: ['Trebuchet MS', 'Fira Sans'], segoeui: ['Segoe UI', 'Open Sans'],
  consolas: ['Consolas', 'Inconsolata'], impact: ['Impact', 'Anton'], comicsansms: ['Comic Sans MS', 'Comic Neue'], centurygothic: ['Century Gothic', 'Questrial'],
  palatinolinotype: ['Palatino Linotype', 'Crimson Pro'], bookantiqua: ['Book Antiqua', 'Crimson Pro'], lucidasans: ['Lucida Sans', 'Noto Sans'], candara: ['Candara', 'Mulish'],
  corbel: ['Corbel', 'Open Sans'], constantia: ['Constantia', 'Lora'], franklingothicmedium: ['Franklin Gothic Medium', 'Libre Franklin'], gillsansmt: ['Gill Sans MT', 'Cabin'],
};

// Commercial / non-free faces -> [best analogue, ...alternatives]
const CURATED = {
  helveticaneue: ['Inter', 'Arimo', 'Public Sans'], helvetica: ['Inter', 'Arimo', 'Public Sans'], neuehaasgrotesk: ['Inter', 'Arimo'], univers: ['Inter', 'Libre Franklin', 'Public Sans'],
  gotham: ['Montserrat', 'Figtree', 'Poppins'], gothamrounded: ['Nunito', 'Quicksand'], proximanova: ['Montserrat', 'Figtree', 'Mulish'],
  avenir: ['Nunito Sans', 'Figtree', 'Mulish'], avenirnext: ['Nunito Sans', 'Figtree', 'Mulish'], futura: ['Jost', 'Josefin Sans', 'Outfit'], futurapt: ['Jost', 'Outfit'],
  frutiger: ['Open Sans', 'Noto Sans', 'Hind'], myriad: ['Source Sans 3', 'Open Sans', 'Hind'], myriadpro: ['Source Sans 3', 'Open Sans', 'Hind'],
  din: ['Barlow', 'Archivo', 'Roboto'], dinpro: ['Barlow', 'Archivo', 'Roboto'], dinnext: ['Barlow', 'Archivo', 'Roboto'], dinalternate: ['Barlow', 'Archivo'],
  gillsans: ['Cabin', 'Lato', 'Mulish'], sfpro: ['Inter', 'Roboto'], sfprodisplay: ['Inter', 'Roboto'], sfprotext: ['Inter', 'Roboto'], sanfrancisco: ['Inter', 'Roboto'],
  circular: ['DM Sans', 'Figtree', 'Plus Jakarta Sans'], circularstd: ['DM Sans', 'Figtree', 'Plus Jakarta Sans'], graphik: ['Inter', 'Figtree', 'Public Sans'],
  franklingothic: ['Libre Franklin', 'Public Sans', 'Archivo'], tradegothic: ['Barlow', 'Archivo'], optima: ['Marcellus', 'Lato'], akzidenzgrotesk: ['Inter', 'Libre Franklin'],
  garamondpremierpro: ['EB Garamond', 'Cormorant Garamond', 'Crimson Pro'], adobegaramond: ['EB Garamond', 'Cormorant Garamond', 'Crimson Pro'],
  baskerville: ['Libre Baskerville', 'Baskervville', 'Libre Caslon Text'], didot: ['Bodoni Moda', 'Playfair Display'], bodoni: ['Bodoni Moda', 'Playfair Display'],
  caslon: ['Libre Caslon Text', 'EB Garamond'], minion: ['Crimson Pro', 'Source Serif 4', 'EB Garamond'], minionpro: ['Crimson Pro', 'Source Serif 4', 'EB Garamond'],
  sabon: ['EB Garamond', 'Crimson Pro'], palatino: ['Crimson Pro', 'EB Garamond', 'Lora'], times: ['Tinos', 'Source Serif 4'], timesroman: ['Tinos', 'Source Serif 4'],
  rockwell: ['Arvo', 'Roboto Slab', 'Zilla Slab'], clarendon: ['Zilla Slab', 'Arvo'], menlo: ['JetBrains Mono', 'Roboto Mono'], monaco: ['JetBrains Mono', 'Roboto Mono'], sfmono: ['JetBrains Mono', 'Roboto Mono'],
  courier: ['Cousine', 'Courier Prime'],
};
// category-level defaults when we know nothing else
const DEFAULTS = { sans: ['Inter', 'Open Sans', 'Roboto'], serif: ['Source Serif 4', 'Lora', 'Merriweather'], slab: ['Roboto Slab', 'Zilla Slab', 'Arvo'], mono: ['JetBrains Mono', 'Roboto Mono', 'Inconsolata'], script: ['Caveat', 'Pacifico'], condensed: ['Roboto Condensed', 'Barlow Condensed', 'Oswald'] };

// ---------- classification ----------
export function genericFromName(name, generic) {
  const n = String(name).toLowerCase();
  if (/mono|code|courier|consol/.test(n) || generic === 'monospace') return 'mono';
  if (/slab|rockwell|clarendon|egyptienne/.test(n)) return 'slab';
  if (/script|hand|brush|signature|cursive/.test(n) || generic === 'cursive') return 'script';
  if (/condensed|narrow|compressed|cond\b/.test(n)) return 'condensed';
  if ((/\bserif\b/.test(n) && !/sans/.test(n)) || /\b(roman|garamond|didot|bodoni|baskerville|caslon|times|georgia)\b/.test(n) || generic === 'serif') return 'serif';
  return 'sans';
}
export const genericOfGoogle = (f) => ({ 'Sans Serif': 'sans-serif', Serif: 'serif', Monospace: 'monospace', Handwriting: 'cursive', Display: 'sans-serif' })[f.c] ?? 'sans-serif';
export const cssGeneric = (name) => { const g = catalog().byName.get(name); return g ? genericOfGoogle(g) : 'sans-serif'; };

export function findGoogle(name) {
  const { byNorm } = catalog();
  let k = norm(name);
  if (ALIASES[k]) return catalog().byName.get(ALIASES[k]) ?? null;
  if (byNorm.has(k)) return byNorm.get(k);
  for (let i = 0; i < 3; i++) { const t = k.replace(WEIGHT_TAIL, ''); if (t === k || !t) break; k = t; if (ALIASES[k]) return catalog().byName.get(ALIASES[k]) ?? null; if (byNorm.has(k)) return byNorm.get(k); }
  return null;
}
const findSystem = (name) => { let k = norm(name); for (let i = 0; i < 3; i++) { if (k in SYSTEM) return SYSTEM[k]; if (k.replace(/mt$/, '') in SYSTEM) return SYSTEM[k.replace(/mt$/, '')]; const t = k.replace(WEIGHT_TAIL, ''); if (t === k || !t) break; k = t; } return null; };
const findResearched = (name) => { let k = norm(name); for (let i = 0; i < 4; i++) { const e = researched()[k]; if (e) return e; const t = k.replace(WEIGHT_TAIL, '').replace(/(pro|std|lt|com|\d+)+$/, ''); if (t === k || !t) break; k = t; } return null; };
const findCurated = (name) => { let k = norm(name); for (let i = 0; i < 4; i++) { if (CURATED[k]) return CURATED[k]; const t = k.replace(WEIGHT_TAIL, '').replace(/(pro|std|lt|com|\d+)+$/, ''); if (t === k || !t) break; k = t; } return null; };

function popularIn(kind, need, exclude = []) {
  const wanted = { sans: (f) => f.c === 'Sans Serif' && !f.d, serif: (f) => f.c === 'Serif' && f.s !== 'Slab Serif' && !f.d, slab: (f) => f.s === 'Slab Serif', mono: (f) => f.c === 'Monospace', script: (f) => f.c === 'Handwriting', condensed: (f) => f.c === 'Sans Serif' && /condensed/i.test(f.f) }[kind];
  return catalog().list.filter((f) => wanted(f) && need.every((w) => f.w.includes(w)) && !exclude.includes(f.f)).slice(0, 4).map((f) => f.f);
}

// ---------- resolution ----------
/** @returns {{requested:string, used:string, status:string, license:string, basis:string, alternatives:string[], web_fallback?:string, note:string}} */
export function resolveFont(name, { generic, need = [400, 700], keep = false } = {}) {
  const requested = String(name ?? '').trim();
  const { byName } = catalog();
  if (!requested || /^(system-ui|inherit|initial|-apple-system|blinkmacsystemfont|sans-serif|serif|monospace)$/i.test(requested)) {
    return { requested: requested || null, used: 'Inter', status: 'default', license: 'OFL (Google Fonts)', basis: 'default', alternatives: ['Open Sans', 'Roboto'], note: 'No customer font was found — neutral default used. Ask the customer or supply a style guide.' };
  }
  const analog = () => {
    const res = findResearched(requested), cur = (res ? [res.nearest, ...res.alternatives] : findCurated(requested))?.filter((f) => byName.has(f)), kind = genericFromName(requested, generic);
    const pool = cur?.length ? cur : DEFAULTS[kind].filter((f) => byName.has(f));
    const ok = (f) => need.every((w) => byName.get(f)?.w.includes(w));
    const used = pool.find(ok) ?? popularIn(kind, need)[0] ?? 'Inter';
    return { used, kind, cur, res, alternatives: [...pool, ...popularIn(kind, need, [used])].filter((f, i, arr) => f !== used && arr.indexOf(f) === i && byName.has(f)).slice(0, 3) };
  };
  if (keep) {
    const g = findGoogle(requested);
    if (g) return { requested, used: g.f, status: 'google', license: 'OFL/Apache (Google Fonts)', basis: 'exact', alternatives: [], note: `${g.f} is on Google Fonts (free licence) — safe to use.` };
    const { used: nearest, alternatives } = analog();
    return { requested, used: requested, status: 'user-licensed', license: 'confirmed by the user', basis: 'user', web_fallback: nearest, alternatives,
      note: `Using the customer's own font, ${requested}, because the user holds a licence for it. It must be installed on every computer that opens the deck (otherwise PowerPoint substitutes); ${nearest} is the nearest free font, used as the fallback for web pages.` };
  }
  const g = findGoogle(requested);
  if (g) return { requested, used: g.f, status: 'google', license: 'OFL/Apache (Google Fonts)', basis: g.f.toLowerCase() === requested.toLowerCase() ? 'exact' : 'alias', alternatives: [], note: `${g.f} is on Google Fonts (free licence) — safe to use.` };
  const sys = findSystem(requested);
  if (sys) {
    const fb = byName.has(sys[1]) ? sys[1] : undefined;
    return { requested, used: sys[0], status: 'system', license: 'pre-installed with Windows/Office', basis: 'system', alternatives: [], ...(fb && { web_fallback: fb }), note: `${sys[0]} ships with Windows/Office (nothing to license or embed)${fb ? `; ${fb} is the free metric-compatible stand-in for browsers/Linux` : ''}.` };
  }
  const { used, cur, res, kind, alternatives } = analog();
  const how = res?.confidence === 'low' ? 'the best available match; evidence for it is thin' : cur?.length ? 'a researched close match' : `a category-level guess (${kind}; no look-alike data for this face)`;
  return { requested, used, status: 'substituted', license: 'free substitute (Google Fonts, OFL/Apache)', basis: cur?.length ? 'curated' : 'heuristic', ...(res && { match_confidence: res.confidence, match_reason: res.reason }), alternatives,
    note: `${requested} is a licensed font, so the nearest free font, ${used} (${how}), is used. ${res?.reason ? res.reason + ' ' : ''}If the customer supplies ${requested}, or it is installed on this computer, it is used instead.` };
}

/** Resolve both roles; `names` = {heading, body}, `generics` = {heading, body} (CSS fallback keyword), `keep` = Set('heading'|'body'). */
export function applyFontPolicy(typography, { names, generics = {}, keep = new Set() } = {}) {
  const src = { heading: names?.heading ?? typography.source_fonts?.heading ?? typography.heading_font, body: names?.body ?? typography.source_fonts?.body ?? typography.body_font };
  const out = { ...typography, source_fonts: typography.source_fonts ?? src, font_resolution: {} };
  for (const role of ['heading', 'body']) {
    const r = resolveFont(src[role], { generic: generics[role], need: role === 'heading' ? [400, 700] : [400, 700], keep: keep.has(role) });
    out[`${role}_font`] = r.used; out.font_resolution[role] = r;
  }
  return out;
}

export const fontStackFor = (spec, role) => { const name = spec.typography[`${role}_font`], r = spec.typography.font_resolution?.[role]; const fb = r?.web_fallback; const g = findGoogle(name) ? genericOfGoogle(findGoogle(name)) : (genericFromName(name) === 'serif' ? 'serif' : genericFromName(name) === 'mono' ? 'monospace' : 'sans-serif');
  return `${[name, fb].filter((f) => typeof f === 'string' && /^[\w .\-]{1,60}$/.test(f)).map((f) => `'${f}'`).join(', ')}, ${g}`; };

export const fontNotes = (typography) => ['heading', 'body'].flatMap((role) => { const r = typography?.font_resolution?.[role]; return r ? [`${role} font: ${r.used} — ${r.note}`] : []; })
  .filter((n, i, a) => a.findIndex((m) => m.slice(m.indexOf(':')) === n.slice(n.indexOf(':'))) === i);

/** Re-resolve a BrandSpec's fonts. `keep`: customer font names the user says are licensed. `heading`/`body`: replace the source font (e.g. pick an alternative). */
export function resolveSpecFonts(spec, { keep = [], heading, body, generics } = {}) {
  const t = spec.typography, orig = t.source_fonts ?? { heading: t.heading_font, body: t.body_font }, prev = t.font_resolution ?? {};
  const pick = { heading, body }, keepN = new Set(keep.map(norm));
  const names = {}, keepRoles = new Set(), chosen = new Set();
  for (const r of ['heading', 'body']) {
    if (pick[r]) { names[r] = pick[r]; chosen.add(r); }                                            // explicit new choice
    else if (prev[r]?.basis === 'chosen') { names[r] = prev[r].used; chosen.add(r); }              // earlier choice persists
    else names[r] = orig[r];
    if (!chosen.has(r) && (keepN.has(norm(orig[r])) || prev[r]?.status === 'user-licensed')) keepRoles.add(r);
  }
  const out = applyFontPolicy({ ...t, source_fonts: orig }, { names, generics: generics ?? {}, keep: keepRoles });
  for (const r of chosen) { const x = out.font_resolution[r]; x.requested = orig[r]; x.basis = 'chosen'; x.note = `${x.used} chosen by the user instead of ${orig[r]}.`; }
  return { ...spec, schema_version: '1.1', typography: out };
}
export const googleImportCss = (spec) => { const fams = [...new Set(['heading', 'body'].map((r) => spec.typography[`${r}_font`]))].map((f) => findGoogle(f)).filter(Boolean); if (!fams.length) return ''; return `@import url('https://fonts.googleapis.com/css2?${fams.map((g) => `family=${encodeURIComponent(g.f).replace(/%20/g, '+')}:wght@${[400, 700].filter((w) => g.w.includes(w)).join(';')}`).join('&')}&display=swap');`; };

/** Does this family have a real bold? Avoids faux-bold on single-weight display faces. Non-Google fonts: assume yes. */
export const canBold = (name) => { const g = findGoogle(name); return !g || g.w.some((w) => w >= 600); };
