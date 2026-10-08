// The PowerPoint style system, built from the brand so PowerPoint itself knows the brand:
//   - named theme / colour scheme / font scheme ("<Customer> Brand") so the Design tab shows them
//   - every theme colour slot filled with a real brand colour (no leftover Office colours): dk1/lt1 = text/background,
//     dk2/lt2, accent1-6, hyperlink colours
//   - master text styles (title, body levels, text boxes) in the brand font, size, colour and alignment, so "Reset", new
//     text boxes and new slides all start on-brand
//   - layouts, slides and the master REFER to theme colours instead of fixed values, so changing the colour scheme in PowerPoint
//     recolours the deck
import { slidePalette } from './palette.mjs';
import { withDefaults } from './design.mjs';
import { contrast, lightness, bestInk } from './color.mjs';
import { mix, forBackground } from './charts.mjs';
import { canBold } from './fonts.mjs';
import { typeScale } from './layouts.mjs';

const hex = (c) => c.slice(1).toUpperCase();
const dist = (a, b) => { const v = (h, i) => parseInt(h.slice(i, i + 2), 16); return Math.hypot(v(a, 1) - v(b, 1), v(a, 3) - v(b, 3), v(a, 5) - v(b, 5)); };

export function brandName(spec) {
  const s = String(spec.source ?? '');
  let n; try { n = new URL(s).hostname.replace(/^www\./, '').split('.')[0]; } catch { n = (s.split(/[\\/]/).filter(Boolean).pop() || '').replace(/\.[a-z0-9]{1,5}$/i, ''); }
  n = n.replace(/([-_ ]*(brand|style|guide|assets|styleguide))+$/i, '').replace(/[-_]+/g, ' ').trim();
  return (n ? n.charAt(0).toUpperCase() + n.slice(1) : 'Customer').replace(/[<>&"']/g, '').slice(0, 40);
}

/** The 12 theme colours. Exported for tests and for the colour-picker preview. */
export function themePalette(spec) {
  const P = slidePalette(spec), c = spec.colors;
  const dk1 = lightness(P.ink) < 0.3 ? P.ink : '#1F1F1F', lt1 = lightness(P.contentBg) > 0.8 ? P.contentBg : '#FFFFFF';
  const dk2 = P.sectionBg, lt2 = lt1 === '#FFFFFF' ? mix('#FFFFFF', c.primary, 0.08) : '#FFFFFF';
  const used = [dk1, lt1, dk2, lt2], pick = [];
  const add = (x) => { if (x && pick.length < 6 && pick.every((p) => dist(p, x) >= 38) && used.every((u) => dist(u, x) >= 24)) pick.push(x.toUpperCase()); };
  [c.primary, c.secondary, ...(c.accents ?? []), ...(c.surfaces ?? []).filter((s) => (Math.max(...[1, 3, 5].map((i) => parseInt(s.hex.slice(i, i + 2), 16))) - Math.min(...[1, 3, 5].map((i) => parseInt(s.hex.slice(i, i + 2), 16)))) > 40).map((s) => s.hex)].forEach(add);
  for (const t of [0.4, -0.35, 0.65, -0.55]) for (const b of [c.primary, c.secondary].filter(Boolean)) add(t > 0 ? mix(b, '#FFFFFF', t) : mix(b, '#000000', -t));
  const grey = mix(dk1, lt1, 0.55); [grey, mix(grey, lt1, 0.4), mix(dk1, lt1, 0.3)].forEach(add);
  for (let i = 1; pick.length < 6; i++) pick.push(mix(c.primary, i % 2 ? '#FFFFFF' : '#000000', 0.15 * i).toUpperCase());
  const hlink = forBackground(c.primary, lt1, 4.5);
  return { dk1, lt1, dk2, lt2, accent1: pick[0], accent2: pick[1], accent3: pick[2], accent4: pick[3], accent5: pick[4], accent6: pick[5], hlink, folHlink: mix(hlink, dk1, 0.4) };
}

function masterStyles(spec, style, P, TP) {
  const D = withDefaults(style?.design), center = D.align === 'center', TS = typeScale(style), bodyPt = TS.bodyPt;
  const bold = canBold(spec.typography.heading_font) ? ' b="1"' : '', hc = P.headingOnContent === P.primary && P.flood ? 'accent1' : 'tx1';
  const lvl = (n, pt, extra = '') => `<a:lvl${n}pPr marL="${342900 * n - 342900 + (n > 1 ? 0 : 0)}" indent="-285750" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:lnSpc><a:spcPct val="105000"/></a:lnSpc><a:spcBef><a:spcPts val="${n === 1 ? 800 : 400}"/></a:spcBef><a:buFont typeface="Arial"/><a:buChar char="&#8226;"/><a:defRPr sz="${pt * 100}" kern="1200"${extra}><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl${n}pPr>`;
  const title = `<p:titleStyle><a:lvl1pPr algn="${center ? 'ctr' : 'l'}" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:lnSpc><a:spcPct val="95000"/></a:lnSpc><a:spcBef><a:spcPct val="0"/></a:spcBef><a:buNone/><a:defRPr sz="${TS.S.content * 100}"${TS.weight.h2 ? bold : ''} kern="1200"><a:solidFill><a:schemeClr val="${hc}"/></a:solidFill><a:latin typeface="+mj-lt"/><a:ea typeface="+mj-ea"/><a:cs typeface="+mj-cs"/></a:defRPr></a:lvl1pPr></p:titleStyle>`;
  const body = `<p:bodyStyle>${[1, 2, 3, 4, 5].map((n) => lvl(n, Math.max(12, bodyPt - (n - 1) * 2)).replace(/marL="\d+"/, `marL="${228600 + (n - 1) * 342900}"`)).join('')}</p:bodyStyle>`;
  const other = `<p:otherStyle><a:defPPr><a:defRPr lang="en-US"/></a:defPPr>${[1, 2, 3].map((n) => `<a:lvl${n}pPr marL="${(n - 1) * 457200}" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1800" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl${n}pPr>`).join('')}</p:otherStyle>`;
  return { title, body, other };
}

const SLOT_ORDER = ['dk1', 'lt1', 'dk2', 'lt2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6'];
export async function applyBrandTheme(zip, { spec, style }) {
  const P = slidePalette(spec), TP = themePalette(spec), name = `${brandName(spec)} Brand`, report = [];
  for (const n of Object.keys(zip.files).filter((x) => /^ppt\/theme\/theme\d+\.xml$/.test(x))) {
    let x = await zip.file(n).async('string');
    for (const k of Object.keys(TP)) x = x.replace(new RegExp(`(<a:${k}>)\\s*<a:(?:srgbClr|sysClr)\\b[^>]*?/>\\s*(</a:${k}>)`), `$1<a:srgbClr val="${hex(TP[k])}"/>$2`);
    x = x.replace(/(<a:theme\b[^>]*\bname=")[^"]*(")/, `$1${name}$2`).replace(/(<a:clrScheme name=")[^"]*(")/, `$1${name}$2`).replace(/(<a:fontScheme name=")[^"]*(")/, `$1${name}$2`);
    zip.file(n, x);
  }
  const st = masterStyles(spec, style, P, TP);
  for (const n of Object.keys(zip.files).filter((x) => /^ppt\/slideMasters\/slideMaster\d+\.xml$/.test(x))) {
    let x = await zip.file(n).async('string');
    x = x.replace(/<p:titleStyle>[\s\S]*?<\/p:titleStyle>/, st.title).replace(/<p:bodyStyle>[\s\S]*?<\/p:bodyStyle>/, st.body).replace(/<p:otherStyle>[\s\S]*?<\/p:otherStyle>/, st.other);
    zip.file(n, x);
  }
  // Theme-link every fixed colour that equals a theme colour (first matching slot wins).
  const slot = new Map(); for (const k of SLOT_ORDER) if (!slot.has(hex(TP[k]))) slot.set(hex(TP[k]), k);
  let linked = 0;
  for (const n of Object.keys(zip.files).filter((x) => /^ppt\/(slideLayouts|slides|slideMasters)\/[^/]+\.xml$/.test(x))) {
    let x = await zip.file(n).async('string');
    const y = x.replace(/<a:srgbClr val="([0-9A-Fa-f]{6})"(\s*\/>|>([\s\S]*?)<\/a:srgbClr>)/g, (m, v, tail, kids) => { const k = slot.get(v.toUpperCase()); if (!k) return m; linked++; return kids === undefined ? `<a:schemeClr val="${k}"/>` : `<a:schemeClr val="${k}">${kids}</a:schemeClr>`; });
    if (y !== x) zip.file(n, y);
  }
  report.push(`theme "${name}": ${Object.keys(TP).length} colours, brand fonts, master text styles; ${linked} colours linked to the theme`);
  return report;
}
