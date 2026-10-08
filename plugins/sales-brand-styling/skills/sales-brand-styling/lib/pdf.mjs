// PDF -> style-bearing text: visible text (so explicit "Primary: #1A73E8" rules still work),
// every fill/stroke colour used on the page, and the names of fonts the text actually uses.
// Vector/text PDFs only: pages that are a single scanned image yield nothing (reported, not guessed).
import { rgbToHex } from './color.mjs';
import { httpError } from './safeurl.mjs';

const MAX_PAGES = 30;
const STD = /^(Helvetica|Times|Courier|Symbol|ZapfDingbats|Arial|TimesNewRoman|ArialMT)/i;

export function cleanFontName(n) {
  let f = String(n ?? '').replace(/^[A-Z]{6}\+/, '').replace(/[-,](Bold|Italic|Regular|Medium|Light|Semibold|Black|Oblique|BoldItalic|Roman|Book|Thin).*$/i, '');
  f = f.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/MT$/, '').trim();
  return f;
}

// pdf.js prints warnings about optional canvas rendering we never use (text and colours are read without drawing); keep them out of the output.
export async function loadPdfJs() {
  const { log, warn } = console; console.log = console.warn = () => {};
  try { return await import('pdfjs-dist/legacy/build/pdf.mjs'); } finally { console.log = log; console.warn = warn; }
}

export async function textFromPdf(buf) {
  const { getDocument, OPS } = await loadPdfJs();
  let doc;
  try { doc = await getDocument({ data: new Uint8Array(buf), useSystemFonts: false, isEvalSupported: false, verbosity: 0 }).promise; }
  catch { throw httpError(422, 'Could not read the PDF (corrupt or password-protected).'); }
  const text = [], colors = [], fonts = new Map();
  const pages = Math.min(doc.numPages, MAX_PAGES);
  for (let p = 1; p <= pages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    text.push(tc.items.map((i) => i.str).join('\n'));
    const ol = await page.getOperatorList();
    for (let i = 0; i < ol.fnArray.length; i++)
      if (ol.fnArray[i] === OPS.setFillRGBColor || ol.fnArray[i] === OPS.setStrokeRGBColor) { const [r, g, b] = ol.argsArray[i]; colors.push(rgbToHex(r, g, b)); }
    for (const it of tc.items) {
      if (!it.str.trim()) continue;
      try {
        const name = (page.commonObjs.get(it.fontName)?.name ?? page.objs.get(it.fontName)?.name);
        const c = name && !STD.test(name) ? cleanFontName(name) : null;
        if (c) fonts.set(c, (fonts.get(c) ?? 0) + it.str.length);
      } catch { /* font not resolved */ }
    }
  }
  const out = text.join('\n') + '\n' + colors.join(' ') + '\n' +
    [...fonts.entries()].sort((a, b) => b[1] - a[1]).map(([f]) => `font-family: ${f};`).join('\n');
  if (!text.join('').trim() && !colors.length) throw httpError(422, 'PDF has no extractable text or vector colours (scanned/image-only). Provide the brand URL, a PPTX/CSS guide, or type the values.');
  return out;
}
