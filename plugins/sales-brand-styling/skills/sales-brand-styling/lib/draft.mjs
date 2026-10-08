// draft_deck / template_deck / add_slides: build editable PPTX in the customer's brand.
// Real slide masters/layouts with placeholders (so "New slide" in PowerPoint stays on-brand);
// the theme part is patched to the brand palette and fonts so PowerPoint's colour picker shows them.
import PptxGenJS from 'pptxgenjs';
import { lightness, contrast, bestInk } from './color.mjs';
import JSZip from 'jszip';
import { requireBrandSpec } from './brandspec.mjs';
import { httpError } from './safeurl.mjs';
import { sha } from './map.mjs';
import { requireStyle, isRaster, dataUri } from './style.mjs';
import { fontNotes, canBold, fontStackFor, googleImportCss } from './fonts.mjs';
import { applyPptxStyle } from './pptxstyle.mjs';
import { applyBrandTheme } from './pptxtheme.mjs';
import { applyGraphics } from './pptxgraphics.mjs';
import { isCatalog, validateCatalogSlide, TYPES as CATALOG_DEFS, CATALOG_TYPES } from './catalog.mjs';
import { sceneCtx, drawPptx } from './scene.mjs';
import { renderSlideHtml } from './slides.mjs';
import { checkChart, pptxChart, seriesColors } from './charts.mjs';
import { LAYOUTS, FLEX_LAYOUTS, W, H, masterName, masterFor, altKey, layoutSpecs, pickImage, imageFit, slideHtml, assignTones, assignBackgrounds, toneOfLayoutName, typeReport, assignComp, titlePicture } from './layouts.mjs';

export const OUTLINE_VERSION = '1.0';
export { LAYOUTS };
const LIMITS = { slides: 60, bullets: 10, text: 400 };
const hx = (c) => c.slice(1);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const MASTER = Object.fromEntries(LAYOUTS.map((l) => [l, masterName(l)]));
const TONES = ['light', 'dark'];

export function checkOutline(o) {
  if (!o || !Array.isArray(o.slides) || !o.slides.length) throw httpError(400, 'outline.slides must be a non-empty array.');
  if (o.slides.length > LIMITS.slides) throw httpError(400, `At most ${LIMITS.slides} slides.`);
  o.slides.forEach((s, i) => {
    const at = `slide ${i + 1}`;
    if (!LAYOUTS.includes(s.layout) && !isCatalog(s.layout)) throw httpError(400, `${at}: layout must be one of ${[...LAYOUTS.filter((l) => l !== 'catalog'), ...CATALOG_TYPES].join(' | ')}.`);
    if (isCatalog(s.layout)) { validateCatalogSlide(s, at); return; }
    if (typeof s.title !== 'string' || !s.title.trim()) throw httpError(400, `${at}: title is required.`);
    if (s.layout === 'chart') { if (!s.chart) throw httpError(400, `${at}: a chart slide needs a chart (type, labels, series).`); checkChart(s.chart, `${at} chart`); } else if (s.chart !== undefined) throw httpError(400, `${at}: chart is only for the chart layout.`);
    if (s.tone !== undefined && !TONES.includes(s.tone)) throw httpError(400, `${at}: tone must be light or dark.`);
    if (s.image !== undefined && (typeof s.image !== 'string' || !/^[a-z0-9-]{1,40}$/.test(s.image))) throw httpError(400, `${at}: image must be an asset id such as "photo-1".`);
    if (s.layout === 'highlight') {
      if (s.stats !== undefined && (!Array.isArray(s.stats) || s.stats.length > 4 || s.stats.some((x) => !x || typeof x.value !== 'string' || !x.value.trim() || x.value.length > 24 || (x.label !== undefined && (typeof x.label !== 'string' || x.label.length > 60))))) throw httpError(400, `${at}: stats must be at most 4 items, each with a short value (up to 24 characters) and an optional label.`);
    } else if (s.stats !== undefined || s.aside !== undefined || s.aside_title !== undefined) throw httpError(400, `${at}: stats and aside are only for the highlight layout.`);
    const lists = [s.bullets, s.left, s.right, s.aside];
    const strs = [s.title, s.subtitle, s.aside_title, ...lists.flatMap((l) => l ?? [])].filter((x) => x !== undefined);
    if (strs.some((x) => typeof x !== 'string' || x.length > LIMITS.text)) throw httpError(400, `${at}: text must be strings up to ${LIMITS.text} chars.`);
    if (lists.some((l) => (l?.length ?? 0) > LIMITS.bullets)) throw httpError(400, `${at}: at most ${LIMITS.bullets} bullets per list (split the slide).`);
  });
}

function logoOf(logo) {
  if (!logo) return null;
  const m = /\.(png|jpe?g|svg)$/i.exec(logo.filename ?? '');
  const buf = Buffer.from(logo.content_base64 ?? '', 'base64');
  if (!m || !buf.length || buf.length > 2_000_000) throw httpError(400, 'logo must be a png/jpg/svg up to 2 MB.');
  const mime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', svg: 'image/svg+xml' }[m[1].toLowerCase()];
  return `data:${mime};base64,${buf.toString('base64')}`;
}

async function build(spec, slides, { title, logo, style, bgOffset = 0, tones0 }) {
  requireStyle(style, { forPptx: true });
  const styleLogo = style?.assets?.find((a) => a.role === 'logo' && isRaster(a));
  if (!logo && styleLogo) logo = { filename: `${styleLogo.id}.${styleLogo.mime === 'image/png' ? 'png' : 'jpg'}`, content_base64: styleLogo.content_base64 };
  const head = spec.typography.heading_font, body = spec.typography.body_font;
  const { L, P, defaults } = layoutSpecs(spec, style);
  const toned = (() => { const comps = assignComp(slides), sl = slides.map((x, i) => ({ ...x, comp: comps[i] })), t = assignTones(sl, spec, style), b = assignBackgrounds(sl, spec, style, t, bgOffset); return sl.map((x, i) => ({ ...x, tone: t[i], bgc: b[i] })); })();
  const logoData = logoOf(logo), hb = canBold(head);
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'W169', width: W, height: H }); pptx.layout = 'W169';
  pptx.theme = { headFontFace: head, bodyFontFace: body };
  pptx.title = title ?? 'Draft deck';

  const hx = (c) => c.slice(1);
  const phDef = (p) => ({ placeholder: { options: { name: p.name, type: p.type, x: p.x, y: p.y, w: p.w, h: p.h, fontFace: p.font === 'head' ? head : body, fontSize: p.size, bold: p.bold && (p.font !== 'head' || hb), italic: p.italic, color: hx(p.color), align: p.align, valign: p.valign, ...(p.lh ? { lineSpacingMultiple: p.lh } : {}) }, text: '' } });
  const defs = [...LAYOUTS.map((l) => [l, masterName(l)]), ...FLEX_LAYOUTS.map((l) => [altKey(l), masterName(l) + '_ALT'])];
  for (const [key, mname] of defs) {
    const d = L[key], objs = d.objects.map((o) => ({ rect: { x: o.x, y: o.y, w: o.w, h: o.h, fill: { color: hx(o.fill) } } }));
    if (d.logoChip && logoData) objs.push({ rect: { x: d.logoChip.x, y: d.logoChip.y, w: d.logoChip.w, h: d.logoChip.h, fill: { color: hx(d.logoChip.fill) }, rectRadius: d.logoChip.r } });
    if (d.logo && logoData) objs.push({ image: { data: logoData, x: d.logo.x, y: d.logo.y, w: d.logo.w, h: d.logo.h, sizing: { type: 'contain', w: d.logo.w, h: d.logo.h } } });
    if (d.pic) objs.push({ placeholder: { options: { name: 'picture', type: 'image', x: d.pic.x, y: d.pic.y, w: d.pic.w, h: d.pic.h }, text: '' } });   // pptxgenjs maps 'image' to a real <p:ph type="pic"> ("click to add picture")
    pptx.defineSlideMaster({ title: mname, background: { color: hx(d.bg) }, objects: [...objs, ...d.ph.map(phDef)] });
  }

  const bullets = (a) => a.map((x) => ({ text: x, options: { bullet: { indent: 18 }, breakLine: true, paraSpaceAfter: 8 } }));
  for (const s of toned) {
    const slide = pptx.addSlide({ masterName: masterFor(s.layout, s.tone, defaults, s.comp) });
    if (s.bgc) slide.background = { color: hx(s.bgc) };
    slide.addText(s.title, { placeholder: 'title' });
    if (isCatalog(s.layout)) {
      const ctx = sceneCtx(spec, style, s.tone ?? 'light', s.comp);
      for (const [k, v] of Object.entries(s)) if (v && typeof v === 'object') for (const o of [].concat(v)) if (o && typeof o === 'object' && 'image' in o && o.image && !pickImage(style, o.image)) throw httpError(400, `${s.layout}: image "${o.image}" is not a PNG/JPG brand asset.`);
      if (s.image && !pickImage(style, s.image)) throw httpError(400, `${s.layout}: image "${s.image}" is not a PNG/JPG brand asset.`);
      drawPptx(pptx, slide, CATALOG_DEFS[s.layout].build(ctx, s), ctx, { head, body, boldHead: hb });
      continue;
    }
    if (s.layout === 'title' && L.title.pic && s.image !== 'none') {
      const a = titlePicture(style, s.image), pic = L.title.pic;   // automatic: the brand's best picture (photo first, else its artwork) when it is large enough
      if (s.image && !a) throw httpError(400, `Image "${s.image}" is not a PNG/JPG brand asset.`);
      if (a) slide.addImage({ data: `${a.mime};base64,${a.content_base64}`, x: pic.x, y: pic.y, w: a.width / 100, h: a.height / 100, sizing: { type: imageFit(a), w: pic.w, h: pic.h }, altText: a.id });
    }
    if (['title', 'quote', 'closing', 'statement', 'image', 'chart', 'highlight'].includes(s.layout) && s.subtitle) slide.addText(s.subtitle, { placeholder: 'subtitle' });
    if (s.layout === 'chart') {
      const lv = s.tone && defaults.chart && s.tone !== defaults.chart ? L[altKey('chart')] : L.chart, cb = lv.chartBox;
      const cbg = lv.chartBg ?? lv.bg, cink = lightness(cbg) > 0.55 ? (contrast(lv.ink, cbg) >= 4.5 ? lv.ink : bestInk(cbg)) : '#FFFFFF';
      const o = pptxChart(pptx, s.chart, { colors: seriesColors(spec, s.chart, cbg, cink), ink: cink, bg: cbg, fontBody: spec.typography.body_font, box: cb });
      slide.addChart(o.kind, o.data, o.opts);
      const src = `${s.chart.sample ? 'Sample data. ' : ''}${s.chart.source ?? ''}`.trim(); if (src) slide.addText(src, { placeholder: 'source' });
    }
    if (s.layout === 'highlight') {
      const hl = L.highlight, col = (n) => hx(hl.ph.find((p) => p.name === n).color), pt = hl.statPt;
      (s.stats ?? []).forEach((x, i) => slide.addText([{ text: x.value, options: { fontSize: pt, bold: true, color: col(`stat${i + 1}`), breakLine: true } }, { text: x.label ?? '', options: { fontSize: 14, bold: false, color: col('subtitle') } }], { placeholder: `stat${i + 1}` }));
      if (s.aside_title) slide.addText(s.aside_title, { placeholder: 'aside_title' });
      if (s.aside?.length) slide.addText(bullets(s.aside), { placeholder: 'aside' });
    }
    if (s.layout === 'content' && s.bullets?.length) slide.addText(bullets(s.bullets), { placeholder: 'body' });
    if (s.layout === 'two-column') {
      if (s.left?.length) slide.addText(bullets(s.left), { placeholder: 'left' });
      if (s.right?.length) slide.addText(bullets(s.right), { placeholder: 'right' });
    }
    if (s.layout === 'image') {
      // image: "none" leaves the picture slot empty on purpose (the user adds their own picture in PowerPoint).
      const a = s.image === 'none' ? null : pickImage(style, s.image);
      if (s.image && s.image !== 'none' && !a) throw httpError(400, `Image "${s.image}" is not a PNG/JPG brand asset.`);
      const pic = (s.tone && defaults.image && s.tone !== defaults.image ? L[altKey('image')] : L.image).pic;
      // pptxgenjs crops 'cover' from the w/h it is given, so pass the picture's natural proportions and the frame as the sizing box.
      if (a) slide.addImage({ data: `${a.mime};base64,${a.content_base64}`, x: pic.x, y: pic.y, w: a.width / 100, h: a.height / 100, sizing: { type: imageFit(a), w: pic.w, h: pic.h }, altText: a.id });
    }
  }
  const raw = await pptx.write({ outputType: 'nodebuffer' });
  const zip = await JSZip.loadAsync(raw);
  // pptxgenjs writes the picture slot as an untyped content placeholder; make it a real picture placeholder ("click to add picture"),
  // and drop the empty placeholder from slides that already carry a picture.
  const UNTYPED = /<p:ph\s+idx="(\d+)"\s+hasCustomPrompt="1"\s*\/>/;
  for (const n of Object.keys(zip.files).filter((x) => /^ppt\/(slideLayouts|slides)\/[^/]+\.xml$/.test(x))) {
    let x = await zip.file(n).async('string');
    if (!UNTYPED.test(x)) continue;
    if (n.startsWith('ppt/slides/') && /<p:pic>/.test(x)) x = x.replace(/<p:sp>(?:(?!<\/p:sp>)[\s\S])*?<p:ph\s+idx="\d+"\s+hasCustomPrompt="1"\s*\/>[\s\S]*?<\/p:sp>/g, '');
    else x = x.replace(new RegExp(UNTYPED.source, 'g'), '<p:ph type="pic" idx="$1" hasCustomPrompt="1"/>');
    zip.file(n, x);
  }
  const themed = await applyBrandTheme(zip, { spec, style });
  const graphic = await applyGraphics(zip, { spec, style, L });
  const styled = [typeReport(style), ...themed, ...graphic, ...(await applyPptxStyle(zip, { spec, style, generated: true }))];
  return { zip, styled };
}

// Package part path for a relationship target: absolute ("/ppt/charts/chart1.xml") or relative to a part under ppt/ ("../charts/chart1.xml").
const partPath = (target) => (target.startsWith('/') ? target.slice(1) : 'ppt/' + target.replace(/^\.\.\//, ''));
const asFile = (buf, name) => ({ filename: `${name.replace(/[^\w.-]+/g, '-').slice(0, 60)}.pptx`, sha256: sha(buf), content_base64: buf.toString('base64') });
const gen = (zip) => zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
const sandbox = 'Render only inside <iframe sandbox srcdoc> with no scripts / no same-origin.';

// Every whole deck carries one highlight slide (the customer's graphic section): added before the closing slide with [placeholder]
// figures when the outline has none, unless the outline says `no_highlight: true`. Never invents numbers.
export const HIGHLIGHT_PLACEHOLDER = { layout: 'highlight', title: '[The headline number or message]', subtitle: '[Where the figures come from]', stats: [{ value: '[00]', label: '[first figure]' }, { value: '[0.0%]', label: '[second figure]' }, { value: '[000]', label: '[third figure]' }], aside_title: '[A question or follow-up]', aside: ['[Supporting point]', '[Supporting point]'] };
function withHighlight(outline) {
  if (outline.no_highlight === true || outline.slides.some((x) => x.layout === 'highlight') || outline.slides.length >= LIMITS.slides) return { outline, added: false };
  const slides = [...outline.slides], last = slides.at(-1)?.layout === 'closing' ? slides.length - 1 : slides.length;
  slides.splice(last, 0, HIGHLIGHT_PLACEHOLDER);
  return { outline: { ...outline, slides }, added: true };
}

export async function draftDeck({ brand_spec, brand_style, outline: outlineIn, logo }) {
  const spec = requireBrandSpec(brand_spec);
  checkOutline(outlineIn);
  const { outline, added } = withHighlight(outlineIn);
  const { zip, styled } = await build(spec, outline.slides, { title: outline.title, logo, style: brand_style });
  return {
    file: asFile(await gen(zip), outline.title ?? 'deck'),
    preview: { kind: 'html', content: previewHtml(outline.slides, spec, brand_style), sandbox },
    changes: [...outline.slides.map((s, i) => `${i + 1}. [${s.layout}] ${s.title}`), ...(added ? ['added a highlight slide with [placeholder] figures: fill in the real numbers, or delete it (or set no_highlight)'] : []), ...styled],
    fonts: fontNotes(spec.typography),
  };
}

// Branded template: all layouts, one clearly-labelled sample slide per layout. Users delete the samples and add slides.
export const SAMPLE_OUTLINE = { title: 'Brand template', slides: [
  { layout: 'title', title: 'Presentation title', subtitle: 'Subtitle or customer name' },
  { layout: 'section', title: 'Section divider' },
  { layout: 'content', title: 'Content slide', bullets: ['First point', 'Second point', 'Third point'] },
  { layout: 'two-column', title: 'Two columns', left: ['Left point', 'Left point'], right: ['Right point', 'Right point'] },
  { layout: 'quote', title: '“A customer quote goes here.”', subtitle: '— Name, Role' },
  { layout: 'closing', title: 'Thank you', subtitle: 'Contact details' },
  { layout: 'statement', title: 'One clear message, said big.', subtitle: 'A short line that supports it' },
  { layout: 'image', title: 'Headline for a picture slide', subtitle: 'A short supporting line' },
  { layout: 'highlight', title: 'A highlight slide puts the key numbers in a panel', subtitle: 'One line on where the numbers come from', stats: [{ value: '[00]', label: '[first figure]' }, { value: '[0.0%]', label: '[second figure]' }, { value: '[000]', label: '[third figure]' }], aside_title: 'A side card for the follow-up question', aside: ['Supporting point', 'Supporting point'] },
  { layout: 'chart', title: 'A chart slide states its point in the headline', subtitle: 'One line on what to notice', chart: { type: 'column', labels: ['Q1', 'Q2', 'Q3', 'Q4'], series: [{ name: 'Sample', values: [12, 18, 24, 31] }], highlight: 'Q4', sample: true } },
] };
export const templateDeck = (a) => draftDeck({ ...a, outline: SAMPLE_OUTLINE });

// Append slides to an existing branded deck without touching its current slides.
export async function addSlides({ brand_spec, brand_style, deck, outline: outlineIn }) {
  let outline = outlineIn;
  const spec = requireBrandSpec(brand_spec);
  checkOutline(outline);
  const buf = Buffer.from(deck?.content_base64 ?? '', 'base64');
  if (!buf.length) throw httpError(400, 'Empty deck.');
  const dst = await JSZip.loadAsync(buf).catch(() => { throw httpError(422, 'Not a valid PPTX file.'); });
  const bgOffset = Object.keys(dst.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).length;
  const { zip: src } = await build(spec, outline.slides, { title: 'tmp', style: brand_style, bgOffset });

  // map layout name -> layout part in the destination
  const byName = {};
  for (const n of Object.keys(dst.files).filter((x) => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(x)))
    byName[(await dst.file(n).async('string')).match(/<p:cSld name="([^"]*)"/)?.[1]] = n.split('/').pop();
  const { defaults } = layoutSpecs(spec, brand_style);
  // Continue the rhythm from the deck's last slide, not from scratch.
  const lastN = Math.max(0, ...Object.keys(dst.files).map((n) => +n.match(/^ppt\/slides\/slide(\d+)\.xml$/)?.[1]).filter(Boolean));
  let prevTone = null, prevPanel = false;
  if (lastN) {
    const rel = await dst.file(`ppt/slides/_rels/slide${lastN}.xml.rels`)?.async('string'), lf = rel?.match(/slideLayouts\/(slideLayout\d+\.xml)/)?.[1];
    if (lf && dst.file(`ppt/slideLayouts/${lf}`)) { const nm = (await dst.file(`ppt/slideLayouts/${lf}`).async('string')).match(/<p:cSld name="([^"]*)"/)?.[1]; prevTone = toneOfLayoutName(nm, spec, brand_style); prevPanel = /^BRAND_CATALOG_PANEL/.test(nm ?? ''); }
  }
  const comps = assignComp(outline.slides, prevPanel), withComp = outline.slides.map((x, i) => ({ ...x, comp: comps[i] }));
  const newTones = assignTones(withComp, spec, brand_style, prevTone);
  outline = { ...outline, slides: withComp.map((x, i) => ({ ...x, tone: newTones[i] })) };
  const missing = [...new Set(outline.slides.map((s) => masterFor(s.layout, s.tone, defaults, s.comp)))].filter((m) => !byName[m]).map((m) => m.replace('BRAND_', '').toLowerCase());
  if (missing.length) throw httpError(422, `The deck has no branded layout for: ${missing.join(', ')}. It was made by an older version or another tool, so these layouts are not in it. Regenerate the template (it will have every layout), or use layouts the deck has.`);

  const slideNums = Object.keys(dst.files).map((n) => +n.match(/^ppt\/slides\/slide(\d+)\.xml$/)?.[1]).filter(Boolean);
  let next = Math.max(0, ...slideNums) + 1;
  let ct = await dst.file('[Content_Types].xml').async('string');
  let rels = await dst.file('ppt/_rels/presentation.xml.rels').async('string');
  let pres = await dst.file('ppt/presentation.xml').async('string');
  let rid = Math.max(0, ...[...rels.matchAll(/Id="rId(\d+)"/g)].map((m) => +m[1])) + 1;
  let sid = Math.max(255, ...[...pres.matchAll(/<p:sldId [^>]*id="(\d+)"/g)].map((m) => +m[1])) + 1;
  const ids = [];

  for (let i = 0; i < outline.slides.length; i++) {
    const srcName = `ppt/slides/slide${i + 1}.xml`;
    const xml = await src.file(srcName).async('string');
    const layoutFile = byName[masterFor(outline.slides[i].layout, outline.slides[i].tone, defaults, outline.slides[i].comp)];
    const n = next++;
    dst.file(`ppt/slides/slide${n}.xml`, xml);
    // Pictures: copy each referenced image into the destination package under a collision-proof name and rebuild the slide's rels.
    const srcRels = await src.file(`ppt/slides/_rels/slide${i + 1}.xml.rels`).async('string');
    let relXml = `<Relationship Id="rIdBrandLayout" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/${layoutFile}"/>`;
    for (const m of srcRels.matchAll(/<Relationship\b[^>]*>/g)) {
      const id = m[0].match(/Id="([^"]+)"/)?.[1], target = m[0].match(/Target="([^"]+)"/)?.[1], type = m[0].match(/Type="([^"]+)"/)?.[1] ?? '';
      if (!/\/image$/.test(type) || !id || !target) continue;
      const srcPath = partPath(target), file = src.file(srcPath);
      if (!file) throw httpError(500, `Internal error: missing image ${srcPath}.`);
      const ext = (srcPath.split('.').pop() || 'png').toLowerCase().replace('jpeg', 'jpg');
      const name = `brandadd-${n}-${id}.${ext}`;
      dst.file(`ppt/media/${name}`, await file.async('nodebuffer'));
      if (!new RegExp(`<Default[^>]+Extension="${ext}"`, 'i').test(ct)) ct = ct.replace(/(<Types[^>]*>)/, `$1<Default Extension="${ext}" ContentType="${ext === 'jpg' ? 'image/jpeg' : 'image/png'}"/>`);
      relXml += `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${name}"/>`;
    }
    for (const m of srcRels.matchAll(/<Relationship\b[^>]*>/g)) {                       // charts: chart part + its embedded workbook
      const id = m[0].match(/Id="([^"]+)"/)?.[1], target = m[0].match(/Target="([^"]+)"/)?.[1], type = m[0].match(/Type="([^"]+)"/)?.[1] ?? '';
      if (!/\/chart$/.test(type) || !id || !target) continue;
      const srcChart = partPath(target), cf = src.file(srcChart);
      if (!cf) throw httpError(500, `Internal error: missing chart ${srcChart}.`);
      const cn = Math.max(0, ...Object.keys(dst.files).map((q) => +q.match(/^ppt\/charts\/chart(\d+)\.xml$/)?.[1]).filter(Boolean)) + 1, cname = `chart${cn}.xml`;
      dst.file(`ppt/charts/${cname}`, await cf.async('nodebuffer'));
      const crel = src.file(srcChart.replace(/([^/]+)$/, '_rels/$1.rels'));
      let crelXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">';
      if (crel) for (const r of (await crel.async('string')).matchAll(/<Relationship\b[^>]*>/g)) {
        const rid = r[0].match(/Id="([^"]+)"/)?.[1], rt = r[0].match(/Target="([^"]+)"/)?.[1], rty = r[0].match(/Type="([^"]+)"/)?.[1];
        const ef = src.file(partPath(rt)); if (!ef) continue;
        const en = `brandadd-${n}-${rt.split('/').pop()}`; dst.file(`ppt/embeddings/${en}`, await ef.async('nodebuffer'));
        crelXml += `<Relationship Id="${rid}" Type="${rty}" Target="../embeddings/${en}"/>`;
      }
      dst.file(`ppt/charts/_rels/${cname}.rels`, crelXml + '</Relationships>');
      ct = ct.replace('</Types>', `<Override PartName="/ppt/charts/${cname}" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/></Types>`);
      if (!/<Default[^>]+Extension="xlsx"/i.test(ct)) ct = ct.replace(/(<Types[^>]*>)/, '$1<Default Extension="xlsx" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"/>');
      relXml += `<Relationship Id="${id}" Type="${type}" Target="../charts/${cname}"/>`;
    }
    dst.file(`ppt/slides/_rels/slide${n}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relXml}</Relationships>`);
    ct = ct.replace('</Types>', `<Override PartName="/ppt/slides/slide${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>`);
    rels = rels.replace('</Relationships>', `<Relationship Id="rId${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${n}.xml"/></Relationships>`);
    ids.push(`<p:sldId id="${sid++}" r:id="rId${rid++}"/>`);
  }
  pres = /<p:sldIdLst>/.test(pres) ? pres.replace('</p:sldIdLst>', ids.join('') + '</p:sldIdLst>')
    : pres.replace('</p:sldMasterIdLst>', `</p:sldMasterIdLst><p:sldIdLst>${ids.join('')}</p:sldIdLst>`);
  dst.file('[Content_Types].xml', ct); dst.file('ppt/_rels/presentation.xml.rels', rels); dst.file('ppt/presentation.xml', pres);

  const out = await gen(dst);
  return {
    file: asFile(out, (deck.filename ?? 'deck.pptx').replace(/\.pptx$/i, '') + (deck.filename?.includes('.extended') ? '' : '.extended')),
    preview: { kind: 'html', content: previewHtml(outline.slides, spec, brand_style), sandbox, note: 'Preview shows only the added slides.' },
    fonts: fontNotes(spec.typography),
    changes: [`kept ${slideNums.length} existing slide(s) untouched`, ...outline.slides.map((s, i) => `added ${slideNums.length + i + 1}. [${s.layout}] ${s.title}`)],
  };
}

// Approximate (not pixel-exact) slide thumbnails: same layout definitions as the masters (lib/layouts.mjs).
function previewHtml(slides, spec, style) {
  const stacks = { head: fontStackFor(spec, 'heading'), body: fontStackFor(spec, 'body') };
  const ST = style?.text?.heading ?? {};
  const headingStyle = `${ST.case === 'upper' ? 'text-transform:uppercase;' : ''}${ST.letter_spacing !== undefined ? `letter-spacing:${ST.letter_spacing}pt;` : ''}${ST.weight === 400 ? 'font-weight:400;' : ''}`;
  const comps = assignComp(slides), sl = slides.map((x, i) => ({ ...x, comp: comps[i] })), tones = assignTones(sl, spec, style), bgs = assignBackgrounds(sl, spec, style, tones);
  const html = sl.map((s, i) => renderSlideHtml(s.layout, { ...s, tone: tones[i], bgc: bgs[i] }, { spec, style, stacks, headingStyle })).join('');
  return `<!doctype html><meta charset="utf-8"><title>Deck preview</title><style>${googleImportCss(spec)}\nbody{margin:16px;background:#e9e9ee;font:13px system-ui}.s{position:relative;container-type:inline-size;aspect-ratio:16/9;max-width:720px;margin:0 auto 14px;box-shadow:0 1px 6px #0003;overflow:hidden}</style><p style="text-align:center"><em>Approximate preview — fonts must be installed; open the .pptx in PowerPoint to check.</em></p>${html}`;
}
