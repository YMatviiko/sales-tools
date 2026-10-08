import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { buildSpec } from '../lib/extract.mjs';
import { mapTemplate } from '../lib/map.mjs';
import { renderOutput } from '../lib/render.mjs';
import { validateBrandSpec } from '../lib/brandspec.mjs';
import { isPrivateIp, assertSafeUrl } from '../lib/safeurl.mjs';

const b64 = (s) => Buffer.from(s).toString('base64');
const SPEC = { schema_version: '1.0', colors: { primary: '#1A73E8', secondary: '#34A853', accents: ['#FBBC05', '#EA4335'], neutrals: ['#202124', '#F8F9FA'] }, typography: { heading_font: 'Inter', body_font: 'Roboto' } };

test('explicit style-guide values win over inference', () => {
  const s = buildSpec({ source: 'g.txt', text: 'Primary Blue: #1A73E8\nHeading font: Poppins\n.x{color:#ff0000}.y{color:#ff0000}' });
  assert.equal(s.colors.primary, '#1A73E8');
  assert.equal(s.provenance['colors.primary'], 'explicit');
  assert.equal(s.typography.heading_font, 'Poppins');
  assert.deepEqual(validateBrandSpec(s), []);
});

test('css custom properties beat the colour histogram', () => {
  const s = buildSpec({ source: 'u', text: ':root{--brand-primary:#0055AA}.a{color:#cc0000}.b{color:#cc0000}.c{color:#cc0000}' });
  assert.equal(s.colors.primary, '#0055AA');
});

test('HTML: swaps tokens, leaves DOM untouched', async () => {
  const html = '<!doctype html><html><head><style>:root{--primary:#ff0000;--bg:#ffffff;--font-heading:Georgia}</style></head><body><h1 class="t">Hi</h1><a class="btn">Go</a></body></html>';
  const { ir } = await mapTemplate({ template: { filename: 't.html', content_base64: b64(html) }, brand_spec: SPEC });
  const out = await renderOutput({ ir, format: 'html' });
  const res = Buffer.from(out.file.content_base64, 'base64').toString();
  assert.match(res, /--primary:#1A73E8/);
  assert.match(res, /--bg:#F8F9FA/);
  assert.match(res, /<h1 class="t">Hi<\/h1><a class="btn">Go<\/a>/);
});

test('HTML: ambiguous roles are not applied silently', async () => {
  const html = '<style>:root{--weird:#123456}</style><p>x</p>';
  const { ir } = await mapTemplate({ template: { filename: 't.html', content_base64: b64(html) }, brand_spec: SPEC });
  assert.equal(ir.uncertain[0].target, null);
  const out = await renderOutput({ ir, format: 'html' });
  assert.match(Buffer.from(out.file.content_base64, 'base64').toString(), /--weird:#123456/);
});

async function tinyPptx() {
  const z = new JSZip();
  z.file('[Content_Types].xml', '<Types/>');
  z.file('ppt/theme/theme1.xml', '<a:theme><a:clrScheme><a:accent1><a:srgbClr val="FF0000"/></a:accent1><a:accent2><a:srgbClr val="00FF00"/></a:accent2></a:clrScheme><a:fontScheme><a:majorFont><a:latin typeface="Calibri"/></a:majorFont><a:minorFont><a:latin typeface="Arial"/></a:minorFont></a:fontScheme></a:theme>');
  z.file('ppt/slideMasters/slideMaster1.xml', '<p:sldMaster/>');
  z.file('ppt/slides/slide1.xml', '<p:sld><a:t>Title</a:t><a:srgbClr val="ABCDEF"/><a:latin typeface="Calibri"/><a:srgbClr val="FF0000"/></p:sld>');
  return z.generateAsync({ type: 'nodebuffer' });
}

test('PPTX: theme swapped, package structure preserved, hard-coded colour surfaced', async () => {
  const buf = await tinyPptx();
  const { ir } = await mapTemplate({ template: { filename: 'd.pptx', content_base64: buf.toString('base64') }, brand_spec: SPEC });
  assert.ok(ir.uncertain.some((u) => u.current === '#ABCDEF'));
  const out = await renderOutput({ ir, format: 'pptx' });
  const z = await JSZip.loadAsync(Buffer.from(out.file.content_base64, 'base64'));
  const theme = await z.file('ppt/theme/theme1.xml').async('string');
  assert.match(theme, /accent1><a:srgbClr val="1A73E8"/);
  assert.match(theme, /majorFont><a:latin typeface="Inter"/);
  assert.ok(z.file('ppt/slideMasters/slideMaster1.xml'), 'master preserved');
  assert.match(await z.file('ppt/slides/slide1.xml').async('string'), /val="1A73E8"/, 'per-shape theme-equal colour remapped');
  assert.match(out.preview.content, /Structural preview/);
});

test('render rejects a tampered IR', async () => {
  const { ir } = await mapTemplate({ template: { filename: 't.html', content_base64: b64('<p>a</p>') }, brand_spec: SPEC });
  ir.template.content_base64 = b64('<script>evil</script>');
  await assert.rejects(renderOutput({ ir, format: 'html' }), /sha256/);
});

test('render rejects unsafe CSS values', async () => {
  const { ir } = await mapTemplate({ template: { filename: 't.html', content_base64: b64('<style>:root{--primary:#fff}</style>') }, brand_spec: SPEC });
  ir.roles[0].target = '#fff;}</style><script>';
  await assert.rejects(renderOutput({ ir, format: 'html' }), /Unsafe/);
});

test('SSRF guard', async () => {
  assert.ok(isPrivateIp('127.0.0.1') && isPrivateIp('10.1.2.3') && isPrivateIp('169.254.169.254') && isPrivateIp('::1'));
  assert.ok(!isPrivateIp('8.8.8.8'));
  await assert.rejects(assertSafeUrl('http://169.254.169.254/latest/meta-data'), /non-public/);
  await assert.rejects(assertSafeUrl('file:///etc/passwd'), /http/);
  await assert.rejects(assertSafeUrl('https://evil.com', { allowlist: ['acme.com'] }), /allowlist/);
});

import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractFromPath } from '../lib/local.mjs';
import { draftDeck } from '../lib/draft.mjs';

test('CSS font names are kept intact and css vars are not "explicit"', () => {
  const s = buildSpec({ source: 'u', text: ':root{--brand-primary:#0055AA}h1{font-family:"Poppins", sans-serif !important}p{font-family:Lato}' });
  assert.equal(s.typography.heading_font, 'Poppins');
  assert.equal(s.typography.body_font, 'Lato');
  assert.equal(s.provenance['colors.primary'], 'css');
});

test('local folder: reads nested style files, ignores node_modules/PDF, reports what it skipped', async () => {
  const d = await mkdtemp(join(tmpdir(), 'brand-'));
  await mkdir(join(d, 'css')); await mkdir(join(d, 'node_modules'));
  await writeFile(join(d, 'css', 'a.css'), ':root{--primary:#0055AA}h1{font-family:Poppins}');
  await writeFile(join(d, 'node_modules', 'b.css'), ':root{--primary:#FF0000}');
  await writeFile(join(d, 'guide.pdf'), 'x');
  const r = await extractFromPath(d);
  assert.equal(r.brand_spec.colors.primary, '#0055AA');
  assert.equal(r.sources_used.length, 1);
  assert.ok(r.notes.some((n) => /guide\.pdf/.test(n)));
  await assert.rejects(extractFromPath(join(d, 'nope')), /Not found/);
});

test('local pptx file', async () => {
  const d = await mkdtemp(join(tmpdir(), 'brand-'));
  await writeFile(join(d, 'ref.pptx'), await tinyPptx());
  const r = await extractFromPath(join(d, 'ref.pptx'));
  assert.equal(r.brand_spec.colors.primary, '#FF0000');
  assert.equal(r.brand_spec.typography.heading_font, 'Calibri');
});

const OUTLINE = { title: 'T', slides: [{ layout: 'title', title: 'Hello <b>', subtitle: 's' }, { layout: 'content', title: 'Why', bullets: ['a', 'b'] }, { layout: 'section', title: 'Next' }] };

test('draft deck: valid package, brand theme, real masters/layouts, editable text', async () => {
  const out = await draftDeck({ brand_spec: SPEC, outline: OUTLINE });
  const z = await JSZip.loadAsync(Buffer.from(out.file.content_base64, 'base64'));
  const theme = await z.file('ppt/theme/theme1.xml').async('string');
  assert.match(theme, /accent1><a:srgbClr val="1A73E8"/);
  assert.match(theme, /majorFont><a:latin typeface="Inter"/);
  assert.match(theme, /minorFont><a:latin typeface="Roboto"/);
  assert.ok(Object.keys(z.files).filter((n) => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(n)).length >= 3);
  assert.equal(Object.keys(z.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).length, 4, 'three requested slides plus the automatic highlight slide');
  assert.match(await z.file('ppt/slides/slide1.xml').async('string'), /<a:t>Hello &lt;b&gt;<\/a:t>/);
  assert.equal(out.preview.content.includes('<b>'), false, 'preview escapes text');
});

test('draft deck: outline limits', async () => {
  await assert.rejects(draftDeck({ brand_spec: SPEC, outline: { slides: [] } }), /non-empty/);
  await assert.rejects(draftDeck({ brand_spec: SPEC, outline: { slides: [{ layout: 'x', title: 'a' }] } }), /layout/);
  await assert.rejects(draftDeck({ brand_spec: SPEC, outline: { slides: [{ layout: 'content', title: 'a', bullets: Array(11).fill('x') }] } }), /bullets/);
});

import { extractFromFile } from '../lib/extract.mjs';
import { templateDeck, addSlides, LAYOUTS } from '../lib/draft.mjs';

function tinyPdf() {
  const content = '0.102 0.451 0.91 rg 0 0 600 100 re f\nBT /F1 24 Tf 50 700 Td 0 0 0 rg (Primary Blue: #1A73E8) Tj ET\nBT /F2 12 Tf 50 650 Td (Heading font: Poppins) Tj ET\n0.984 0.737 0.02 rg 0 120 600 40 re f';
  const objs = ['<</Type/Catalog/Pages 2 0 R>>', '<</Type/Pages/Kids[3 0 R]/Count 1>>', '<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R/F2 6 0 R>>>>>>',
    `<</Length ${content.length}>>\nstream\n${content}\nendstream`, '<</Type/Font/Subtype/Type1/BaseFont/Helvetica-Bold>>', '<</Type/Font/Subtype/Type1/BaseFont/Times-Roman>>'];
  let out = '%PDF-1.4\n'; const offs = [];
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const x = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('') + `trailer<</Size ${objs.length + 1}/Root 1 0 R>>\nstartxref\n${x}\n%%EOF`;
  return Buffer.from(out);
}

test('PDF style guide: explicit text values, vector colours, fonts', async () => {
  const r = await extractFromFile({ filename: 'guide.pdf', content_base64: tinyPdf().toString('base64') });
  assert.equal(r.brand_spec.colors.primary, '#1A73E8');
  assert.equal(r.brand_spec.provenance['colors.primary'], 'explicit');
  assert.equal(r.brand_spec.colors.secondary, '#FBBC05');
  assert.equal(r.brand_spec.typography.heading_font, 'Poppins');
});

test('PDF: corrupt file gives a clear error', async () => {
  await assert.rejects(extractFromFile({ filename: 'x.pdf', content_base64: b64('not a pdf') }), /Could not read the PDF/);
});

test('template deck contains every layout and can be extended without touching existing slides', async () => {
  const t = await templateDeck({ brand_spec: SPEC });
  const tz = await JSZip.loadAsync(Buffer.from(t.file.content_base64, 'base64'));
  const names = await Promise.all(Object.keys(tz.files).filter((n) => /slideLayout\d+\.xml$/.test(n)).map(async (n) => (await tz.file(n).async('string')).match(/cSld name="([^"]*)"/)[1]));
  for (const l of LAYOUTS) assert.ok(names.includes('BRAND_' + l.toUpperCase().replace('-', '_')), l);
  const before = await tz.file('ppt/slides/slide3.xml').async('string');

  const a = await addSlides({ brand_spec: SPEC, deck: { filename: 't.pptx', content_base64: t.file.content_base64 }, outline: { slides: [{ layout: 'two-column', title: 'New', left: ['l'], right: ['r'] }, { layout: 'content', title: 'More', bullets: ['x'] }] } });
  const z = await JSZip.loadAsync(Buffer.from(a.file.content_base64, 'base64'));
  assert.equal(Object.keys(z.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).length, 12);
  assert.equal(await z.file('ppt/slides/slide3.xml').async('string'), before, 'existing slide untouched');
  assert.match(await z.file('ppt/slides/slide11.xml').async('string'), /<a:t>New<\/a:t>/);
  assert.match(await z.file('ppt/_rels/presentation.xml.rels').async('string'), /slides\/slide12\.xml/);
  assert.match(await z.file('[Content_Types].xml').async('string'), /slides\/slide12\.xml/);
  assert.match(await z.file('ppt/presentation.xml').async('string'), /<p:sldId id="267"/);
  // add again: numbering continues
  const a2 = await addSlides({ brand_spec: SPEC, deck: { filename: 't.extended.pptx', content_base64: a.file.content_base64 }, outline: { slides: [{ layout: 'closing', title: 'Bye' }] } });
  assert.equal(Object.keys((await JSZip.loadAsync(Buffer.from(a2.file.content_base64, 'base64'))).files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).length, 13);
});

test('add-slides refuses decks that lack the branded layouts', async () => {
  await assert.rejects(addSlides({ brand_spec: SPEC, deck: { filename: 'd.pptx', content_base64: (await tinyPptx()).toString('base64') }, outline: { slides: [{ layout: 'content', title: 'x' }] } }), /no branded layout/);
});

test('template accepts a logo and rejects bad ones', async () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64').toString('base64');
  const t = await templateDeck({ brand_spec: SPEC, logo: { filename: 'l.png', content_base64: png } });
  assert.ok(Object.keys((await JSZip.loadAsync(Buffer.from(t.file.content_base64, 'base64'))).files).some((n) => n.startsWith('ppt/media/')));
  await assert.rejects(templateDeck({ brand_spec: SPEC, logo: { filename: 'l.exe', content_base64: png } }), /logo/);
});

import zlib from 'node:zlib';
import { imageInfo, validateStyle, brandCss, buildAssets, styleFromHtml, textStyleFromCss, guardCss } from '../lib/style.mjs';

function png(w, h, [r, g, b]) {
  const crc = (buf) => { let c, t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } let x = 0xffffffff; for (const v of buf) x = t[(x ^ v) & 255] ^ (x >>> 8); return (x ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, () => [r, g, b]).flat())]);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.concat(Array(h).fill(row)))), chunk('IEND', Buffer.alloc(0))]);
}
const asset = (id, role, buf) => ({ id, role, ...imageInfo(buf), content_base64: buf.toString('base64') });
const HERO = asset('hero-1', 'hero', png(320, 180, [20, 90, 200]));
const LOGO = asset('logo-1', 'logo', png(200, 80, [255, 255, 255]));
const ILLU = asset('illustration-1', 'illustration', png(120, 120, [250, 180, 5]));
const STYLE = { style_version: '1.1', assets: [HERO, LOGO, ILLU], text: { heading: { case: 'upper', weight: 700, letter_spacing: 1.5 } },
  backgrounds: { title: 'hero-1', closing: 'hero-1', overlay_opacity: 0.6 }, placements: [{ asset: 'illustration-1', layout: 'section', position: 'corner-br' }], html_backgrounds: [{ asset: 'hero-1', selector: '.hero' }] };

test('image sniffing uses bytes, not names', () => {
  assert.deepEqual(imageInfo(png(10, 20, [0, 0, 0])), { mime: 'image/png', width: 10, height: 20 });
  assert.equal(imageInfo(Buffer.from('MZ not an image')), null);
  assert.equal(imageInfo(Buffer.from('<svg viewBox="0 0 40 20" xmlns="http://www.w3.org/2000/svg"></svg>')).width, 40);
});

test('style validation: scripts in SVG, mismatched mime, unknown asset ids are rejected', () => {
  const svg = Buffer.from('<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  assert.ok(validateStyle({ style_version: '1.1', assets: [{ id: 's-1', role: 'illustration', mime: 'image/svg+xml', width: 100, height: 100, content_base64: svg.toString('base64') }] }).some((e) => /scripts/.test(e)));
  assert.ok(validateStyle({ ...STYLE, assets: [{ ...HERO, mime: 'image/jpeg' }, LOGO, ILLU] }).some((e) => /not a image\/jpeg/.test(e)));
  assert.ok(validateStyle({ ...STYLE, backgrounds: { title: 'nope' } }).some((e) => /unknown asset/.test(e)));
  assert.ok(validateStyle({ ...STYLE, html_backgrounds: [{ asset: 'hero-1', selector: '}body{x' }] }).some((e) => /unsafe selector/.test(e)));
  assert.deepEqual(validateStyle(STYLE), []);
});

test('asset building filters tiny images, assigns roles/ids, caps per role', () => {
  const notes = [];
  const out = buildAssets([{ buf: png(10, 10, [0, 0, 0]), source: 'pixel.png' }, { buf: png(300, 120, [1, 2, 3]), source: 'logo.png' }, { buf: Buffer.from('junk'), source: 'x.png' }], notes);
  assert.deepEqual(out.map((a) => a.id), ['logo-1']);
  assert.ok(notes.some((n) => /unrecognised/.test(n)));
});

test('text style is read from CSS', () => {
  const t = textStyleFromCss('h1{font-weight:300;text-transform:uppercase;letter-spacing:2px}');
  assert.deepEqual(t.heading, { case: 'upper', letter_spacing: 1.5, weight: 400 });
});

test('URL page: collects logo/hero images (stubbed fetch) and text style', async () => {
  const real = globalThis.fetch;
  const bodies = { '/logo.png': png(300, 100, [9, 9, 9]), '/hero.png': png(1600, 800, [5, 50, 150]) };
  globalThis.fetch = async (u) => { const b = bodies[new URL(u).pathname]; return b ? new Response(b, { status: 200 }) : new Response('', { status: 404 }); };
  try {
    const { lookup } = await import('node:dns/promises'); void lookup;
    const html = '<img class="site-logo" src="/logo.png"><div style="background:url(/hero.png)"></div>';
    const { style } = await styleFromHtml(html, 'h1{text-transform:uppercase}.x{background:url(/hero.png)}', 'https://8.8.8.8/');
    assert.deepEqual(style.assets.map((a) => [a.id, a.role]), [['logo-1', 'logo'], ['hero-1', 'hero']]);
    assert.equal(style.text.heading.case, 'upper');
    assert.equal(style.backgrounds, undefined, 'a PNG hero is offered but never applied automatically');
  } finally { globalThis.fetch = real; }
});

test('PPTX template: image background with overlay, heading style, placement, logo — all in the package', async () => {
  const t = await templateDeck({ brand_spec: SPEC, brand_style: STYLE });
  const z = await JSZip.loadAsync(Buffer.from(t.file.content_base64, 'base64'));
  const layout = async (name) => { for (const n of Object.keys(z.files).filter((x) => /slideLayout\d+\.xml$/.test(x))) { const x = await z.file(n).async('string'); if (x.includes(`name="${name}"`)) return { n, x }; } };
  const title = await layout('BRAND_TITLE');
  assert.match(title.x, /<p:bg><p:bgPr><a:blipFill/);
  assert.match(title.x, /name="Brand overlay"[\s\S]*alpha val="60000"/);
  assert.match(title.x, /cap="all"/);
  assert.match(title.x, /spc="150"/);
  const rels = await z.file(title.n.replace('slideLayouts/', 'slideLayouts/_rels/') + '.rels').async('string');
  assert.match(rels, /media\/brand-hero-1\.png/);
  assert.ok(z.file('ppt/media/brand-hero-1.png'));
  assert.match((await layout('BRAND_SECTION')).x, /<p:pic>[\s\S]*illustration-1/);
  assert.match(await z.file('ppt/slides/slide1.xml').async('string'), /cap="all"/, 'slide-level title runs follow too');
  assert.match(await z.file('[Content_Types].xml').async('string'), /Extension="png"/);
  assert.ok(t.changes.some((c) => /background title/.test(c)));
});

test('PPTX: SVG assets are refused for PowerPoint output', async () => {
  const svg = Buffer.from('<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100"/></svg>');
  const bad = { ...STYLE, assets: [...STYLE.assets, { id: 'svg-1', role: 'illustration', ...imageInfo(svg), content_base64: svg.toString('base64') }], placements: [{ asset: 'svg-1', layout: 'section', position: 'right' }] };
  await assert.rejects(templateDeck({ brand_spec: SPEC, brand_style: bad }), /needs png\/jpg/);
});

test('add-slides applies heading style to the new slides and keeps old ones byte-identical', async () => {
  const t = await templateDeck({ brand_spec: SPEC, brand_style: STYLE });
  const before = await (await JSZip.loadAsync(Buffer.from(t.file.content_base64, 'base64'))).file('ppt/slides/slide3.xml').async('string');
  const a = await addSlides({ brand_spec: SPEC, brand_style: STYLE, deck: { filename: 't.pptx', content_base64: t.file.content_base64 }, outline: { slides: [{ layout: 'content', title: 'Late', bullets: ['x'] }] } });
  const z = await JSZip.loadAsync(Buffer.from(a.file.content_base64, 'base64'));
  assert.equal(await z.file('ppt/slides/slide3.xml').async('string'), before);
  assert.match(await z.file('ppt/slides/slide10.xml').async('string'), /cap="all"/);
});

test('restyle a user PPTX: matched layouts get image bg + dark colour-map override; hard-coded fonts and charts are flagged', async () => {
  const z = new JSZip();
  z.file('[Content_Types].xml', '<Types xmlns="x"><Default Extension="xml" ContentType="application/xml"/></Types>');
  z.file('ppt/presentation.xml', '<p:presentation><p:sldSz cx="12192000" cy="6858000"/></p:presentation>');
  z.file('ppt/theme/theme1.xml', '<a:theme><a:clrScheme><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:accent1><a:srgbClr val="FF0000"/></a:accent1></a:clrScheme><a:fontScheme><a:majorFont><a:latin typeface="Calibri"/></a:majorFont><a:minorFont><a:latin typeface="Arial"/></a:minorFont></a:fontScheme></a:theme>');
  z.file('ppt/slideLayouts/slideLayout1.xml', '<p:sldLayout xmlns:p="p" xmlns:a="a" type="title"><p:cSld name="Title Slide"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="2" name="T"/><p:nvPr><p:ph type="ctrTitle"/></p:nvPr></p:nvSpPr><p:txBody><a:lstStyle><a:lvl1pPr><a:defRPr sz="4400"/></a:lvl1pPr></a:lstStyle></p:txBody></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>');
  z.file('ppt/slides/slide1.xml', '<p:sld><a:latin typeface="Comic Sans MS"/></p:sld>');
  z.file('ppt/charts/chart1.xml', '<c/>');
  const buf = await z.generateAsync({ type: 'nodebuffer' });
  const { ir, notes } = await mapTemplate({ template: { filename: 'u.pptx', content_base64: buf.toString('base64') }, brand_spec: SPEC, brand_style: STYLE });
  assert.ok(ir.uncertain.some((u) => u.id === 'hardcoded-font:Comic Sans MS'));
  assert.ok(ir.uncertain.some((u) => u.id === 'note:charts'));
  assert.ok(!ir.roles.some((r) => r.slot === 'dk1' && r.target === '#202124' && false));
  ir.uncertain.find((u) => u.id === 'hardcoded-font:Comic Sans MS').target = 'Roboto';
  const out = await renderOutput({ ir, format: 'pptx' });
  const o = await JSZip.loadAsync(Buffer.from(out.file.content_base64, 'base64'));
  const lay = await o.file('ppt/slideLayouts/slideLayout1.xml').async('string');
  assert.match(lay, /<p:bg><p:bgPr><a:blipFill/);
  assert.match(lay, /overrideClrMapping bg1="dk1" tx1="lt1"/);
  assert.match(lay, /cap="all"/);
  assert.match(await o.file('ppt/slides/slide1.xml').async('string'), /typeface="Roboto"/);
  assert.match(await o.file('ppt/theme/theme1.xml').async('string'), /<a:lt1><a:srgbClr val="F8F9FA"\/>/);
});

test('HTML: brand_css gives classes; restyle adds a style block and leaves the DOM alone', async () => {
  const css = brandCss({ brand_spec: SPEC, style: STYLE });
  for (const c of ['--brand-primary:#1A73E8', '.brand-hero', '.brand-closing', '.brand-logo', '.brand-img-illustration-1', 'text-transform:uppercase']) assert.ok(css.includes(c), c);
  const html = '<!doctype html><html><head><title>t</title></head><body><section class="hero"><h1>Hi</h1></section></body></html>';
  const { ir } = await mapTemplate({ template: { filename: 'p.html', content_base64: b64(html) }, brand_spec: SPEC, brand_style: STYLE });
  const out = Buffer.from((await renderOutput({ ir, format: 'html' })).file.content_base64, 'base64').toString();
  assert.match(out, /<style data-brand-style>[\s\S]*\.hero\{background:linear-gradient/);
  assert.match(out, /<body><section class="hero"><h1>Hi<\/h1><\/section><\/body>/);
});

import { resolveFont, resolveSpecFonts, canBold, findGoogle, fontStackFor } from '../lib/fonts.mjs';
import { embeddedFontFaces, fetchTtfs } from '../lib/fontfiles.mjs';

test('font policy: free (Google) fonts are kept, renamed ones aliased', () => {
  assert.deepEqual([resolveFont('Poppins').status, resolveFont('Poppins').used], ['google', 'Poppins']);
  assert.equal(resolveFont('Source Sans Pro').used, 'Source Sans 3');
  assert.equal(resolveFont('Montserrat-Bold').used, 'Montserrat');
  assert.equal(resolveFont('"Roboto"').status, 'google'.replace('google', resolveFont('"Roboto"').status));
});

test('font policy: Windows/Office fonts are used as-is with a free web stand-in', () => {
  const r = resolveFont('ArialMT');
  assert.equal(r.status, 'system'); assert.equal(r.used, 'Arial'); assert.equal(r.web_fallback, 'Arimo');
});

test('font policy: commercial faces become the closest free Google Font, with alternatives and a reason', () => {
  const g = resolveFont('Gotham Medium');
  assert.deepEqual([g.status, g.used, g.basis], ['substituted', 'Montserrat', 'curated']);
  assert.ok(g.alternatives.length >= 2 && /licen/.test(g.note));
  assert.equal(resolveFont('Helvetica Neue').used, 'Inter');
  assert.ok(findGoogle(resolveFont('Futura PT').used));
});

test('font policy: unknown face falls back by category hint, flagged heuristic; nothing found => neutral default', () => {
  const s = resolveFont('Acme Brand Serif', { generic: 'serif' });
  assert.equal(s.basis, 'heuristic'); assert.equal(findGoogle(s.used).c, 'Serif');
  assert.equal(findGoogle(resolveFont('Fabrikat Mono').used).c, 'Monospace');
  assert.deepEqual([resolveFont('system-ui').status, resolveFont(undefined).used], ['default', 'Inter']);
});

test('font policy: every font we can ever pick exists on Google Fonts (catalogue drift guard)', () => {
  for (const n of ['Gotham', 'Helvetica', 'Futura', 'Myriad Pro', 'Garamond Premier Pro', 'Rockwell', 'DIN Pro', 'Avenir Next', 'Minion Pro', 'Menlo', 'Optima', 'Circular', 'Gill Sans', 'Palatino', 'Univers'])
    { const r = resolveFont(n); assert.ok(findGoogle(r.used), `${n} -> ${r.used}`); for (const a of r.alternatives) assert.ok(findGoogle(a), `${n} alt ${a}`); }
});

test('font policy: user may keep a licensed customer font; bold is only used where a bold exists', () => {
  assert.deepEqual([resolveFont('Gotham', { keep: true }).status, resolveFont('Gotham', { keep: true }).used], ['user-licensed', 'Gotham']);
  assert.equal(canBold('Bebas Neue'), false); assert.equal(canBold('Inter'), true); assert.equal(canBold('Some Unknown Font'), true);
});

test('extraction applies the policy and records both names', () => {
  const s = buildSpec({ source: 'u', text: 'h1{font-family:"Gotham", Arial, sans-serif}p{font-family:Calibri}:root{--brand-primary:#0055AA}' });
  assert.equal(s.typography.heading_font, 'Montserrat');
  assert.equal(s.typography.source_fonts.heading, 'Gotham');
  assert.equal(s.typography.font_resolution.heading.status, 'substituted');
  assert.equal(s.typography.body_font, 'Calibri');
  assert.equal(s.schema_version, '1.1');
  assert.deepEqual(validateBrandSpec(s), []);
});

test('resolveSpecFonts: change a font, or keep the customer font on the user\'s word', () => {
  const s = buildSpec({ source: 'u', text: 'h1{font-family:Gotham}p{font-family:Gotham}:root{--brand-primary:#0055AA}' });
  const alt = resolveSpecFonts(s, { heading: 'Poppins' });
  assert.equal(alt.typography.heading_font, 'Poppins'); assert.equal(alt.typography.body_font, 'Montserrat');
  const kept = resolveSpecFonts(s, { keep: ['Gotham'] });
  assert.deepEqual([kept.typography.heading_font, kept.typography.body_font, kept.typography.font_resolution.body.status], ['Gotham', 'Gotham', 'user-licensed']);
  assert.match(fontStackFor(kept, 'heading'), /^'Gotham', 'Montserrat', sans-serif$/, 'customer font first, nearest free font as the fallback');
  assert.match(fontStackFor(s, 'heading'), /^'Montserrat', sans-serif$/);
});

test('generated deck uses the resolved font in the theme; stack for HTML includes the metric twin for system fonts', async () => {
  const s = buildSpec({ source: 'u', text: 'h1{font-family:Gotham}p{font-family:Calibri}:root{--brand-primary:#0055AA}' });
  const t = await templateDeck({ brand_spec: s });
  const theme = await (await JSZip.loadAsync(Buffer.from(t.file.content_base64, 'base64'))).file('ppt/theme/theme1.xml').async('string');
  assert.match(theme, /majorFont><a:latin typeface="Montserrat"/); assert.match(theme, /minorFont><a:latin typeface="Calibri"/);
  assert.match(fontStackFor(s, 'body'), /^'Calibri', 'Carlito', sans-serif$/);
  assert.ok(t.fonts.some((n) => /Gotham/.test(n)));
});

test('font files: only Google hosts, TTFs and embedded woff2 (stubbed network)', async () => {
  const real = globalThis.fetch, seen = [];
  globalThis.fetch = async (u, o) => {
    const url = String(u); seen.push(url);
    if (url.startsWith('https://fonts.googleapis.com/css2')) {
      const ua = o?.headers?.['user-agent'];
      return new Response(ua ? '/* cyrillic */\n@font-face{font-weight:400;src:url(https://fonts.gstatic.com/s/x/cyr.woff2) format("woff2");}\n/* latin */\n@font-face{font-family:Inter;font-weight:400;src:url(https://fonts.gstatic.com/s/x/lat.woff2) format("woff2");unicode-range:U+0000}'
        : '@font-face{font-weight:400;src:url(https://fonts.gstatic.com/s/x/a.ttf) format("truetype");}@font-face{font-weight:700;src:url(https://fonts.gstatic.com/s/x/b.ttf) format("truetype");}');
    }
    return new Response(Buffer.from('FONTDATA'));
  };
  try {
    const ttfs = await fetchTtfs('Inter');
    assert.deepEqual(ttfs.map((t) => t.filename), ['Inter-400.ttf', 'Inter-700.ttf']);
    const spec = { typography: { heading_font: 'Inter', body_font: 'Inter' } };
    const css = await embeddedFontFaces(spec);
    assert.match(css, /data:font\/woff2;base64,/); assert.ok(!/cyr\.woff2/.test(css));
    await assert.rejects(fetchTtfs('Gotham'), /not a Google Fonts family/);
    assert.ok(seen.every((u) => /^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(u)));
  } finally { globalThis.fetch = real; }
});

test('hand-edited specs cannot smuggle markup through font names', () => {
  const bad = { schema_version: '1.1', colors: { primary: '#112233' }, typography: { heading_font: "x'};</style><script>", body_font: 'Inter' } };
  assert.ok(validateBrandSpec(bad).some((e) => /font/.test(e)));
});

test('font choices persist: picking an alternative keeps the customer name, and later edits do not lose it', () => {
  const s = buildSpec({ source: 'u', text: 'h1{font-family:Gotham}p{font-family:Gotham}:root{--brand-primary:#0055AA}' });
  const a = resolveSpecFonts(s, { heading: 'Poppins' });
  assert.equal(a.typography.source_fonts.heading, 'Gotham');
  assert.equal(a.typography.font_resolution.heading.basis, 'chosen');
  const b = resolveSpecFonts(a, { keep: ['Gotham'] });                       // keep applies to body only; heading choice survives
  assert.deepEqual([b.typography.heading_font, b.typography.body_font], ['Poppins', 'Gotham']);
  const c = resolveSpecFonts(b, {});                                          // idempotent
  assert.deepEqual([c.typography.heading_font, c.typography.body_font], ['Poppins', 'Gotham']);
});

import { boardHtml } from '../lib/board.mjs';
import { layoutSpecs, pickImage } from '../lib/layouts.mjs';

test('brand board: shows slides, colours, fonts, images with references; no scripts; both themes', async () => {
  const spec = buildSpec({ source: 'https://www.acme.com/', text: 'h1{font-family:Gotham}p{font-family:Calibri}:root{--brand-primary:#0055AA}.a{color:#F5A623}' });
  const html = await boardHtml({ brand_spec: spec, brand_style: STYLE, fonts: 'none' });
  assert.match(html, /<title>acme\.com brand board<\/title>/);
  for (const id of ['id="C1"', 'id="F1"', 'id="F2"', 'id="I1"', 'id="I2"', 'id="I3"']) assert.ok(html.includes(id), id);
  assert.match(html, /They use Gotham/); assert.match(html, /We use Montserrat/); assert.match(html, /Their font is licensed, so we use the closest free one/);
  assert.ok(!/id="F1"[\s\S]*Other options/.test(html) && !/Use .* for headings/.test(html), 'no font choices are put to the user');
  assert.ok(!/Their heading font \(Gotham\)/.test(html), 'fonts are not a to-do item');
  assert.match(html, /Text on it is easy to read/);
  assert.match(html, /Background of title slides/); assert.match(html, /Placed on section divider slides/);
  assert.match(html, /Check that every image really belongs/); assert.match(html, /UPPERCASE, bold/);
  assert.ok(!/<script/i.test(html));
  assert.ok(/:root\{--bg:/.test(html) && /prefers-color-scheme:dark/.test(html) && /:root\[data-theme="dark"\]/.test(html));
});

test('brand board: artifact mode is a fragment (no document tags) and escapes hostile strings', async () => {
  const evil = { ...STYLE, assets: STYLE.assets.map((a, i) => (i === 0 ? { ...a, source: 'https://x.test/"><img src=x onerror=alert(1)>' } : a)) };
  const spec = { ...SPEC, source: '<script>alert(1)</script>', tone_keywords: ['<b>x</b>'] };
  const html = await boardHtml({ brand_spec: spec, brand_style: evil, artifact: true, fonts: 'none' });
  assert.ok(!/<(!doctype|html|head|body)\b/i.test(html));
  assert.ok(!/<script/i.test(html) && !html.includes('<img src=x') && !html.includes('<b>x</b>'));
  assert.match(html, /^<title>/);
});

test('brand board: flags guessed colour, unreadable text, default font, missing images', async () => {
  const spec = { ...SPEC, colors: { primary: '#808080', secondary: '#777777' }, typography: { heading_font: 'Inter', body_font: 'Inter', font_resolution: { heading: { used: 'Inter', status: 'default', alternatives: [] }, body: { used: 'Inter', status: 'default', alternatives: [] } } }, provenance: { 'colors.primary': 'histogram' } };
  const html = await boardHtml({ brand_spec: spec, fonts: 'none' });
  assert.match(html, /worked out from how often/); assert.match(html, /No logo or images were found/);
  assert.ok(!/placeholder/.test(html.split('How to reply')[0].split('Things to check')[1] ?? ''), 'a missing font is not something for the user to act on');
  assert.match(html, /\d+ things? to check/);
});

test('brand board: embeds fonts when the network answers, falls back to a Google link when it does not', async () => {
  const real = globalThis.fetch;
  try {
    globalThis.fetch = async () => { throw new Error('offline'); };
    const off = await boardHtml({ brand_spec: SPEC });
    assert.match(off, /@import url\('https:\/\/fonts\.googleapis\.com/);
  } finally { globalThis.fetch = real; }
});

import { demoBrand } from '../lib/demo.mjs';
import { doctor } from '../lib/doctor.mjs';

test('demo brand is a valid, complete brand: renders a board, template and extension with no inputs', async () => {
  const { spec, style } = demoBrand();
  assert.deepEqual(validateBrandSpec(spec), []); assert.deepEqual(validateStyle(style, { forPptx: true }), []);
  assert.equal(spec.colors.primary, '#0B3C8C'); assert.equal(spec.typography.heading_font, 'Montserrat');
  assert.ok(style.assets.length === 3 && style.backgrounds.title);
  const board = await boardHtml({ brand_spec: spec, brand_style: style, fonts: 'none' });
  assert.match(board, /Northwind Traders brand board/);
  assert.deepEqual(spec.colors.neutrals.sort(), ['#1B2430', '#F4F6FA'], 'near-white and dark ink are neutrals, not accents');
  assert.deepEqual(spec.colors.accents, ['#00A39B']);
  const t = await templateDeck({ brand_spec: spec, brand_style: style });
  const a = await addSlides({ brand_spec: spec, brand_style: style, deck: { filename: 't.pptx', content_base64: t.file.content_base64 }, outline: { slides: [{ layout: 'closing', title: 'Thanks' }] } });
  assert.ok(Buffer.from(a.file.content_base64, 'base64').length > 1000);
});

test('doctor reports in plain language and flags nothing broken on a good install', async () => {
  const d = await doctor();
  assert.equal(d.ready, true);
  assert.ok(d.checks.every((c) => ['ok', 'warn', 'fail'].includes(c.level) && c.what && c.detail));
});

import { decodePng, dominantColors } from '../lib/png.mjs';
import { slidePalette } from '../lib/palette.mjs';
import { cssSurfaces } from '../lib/extract.mjs';

test('scraped CSS/HTML is never read as a "style guide": pseudo-classes are not font names', () => {
  const css = 'body:lang(ar){margin:0}.title:hover{color:red}h1{font-family:"SF Pro Display",Helvetica,sans-serif}p{font-family:"SF Pro Text",Arial}:root{--brand-primary:#0071E3}';
  const s = buildSpec({ source: 'https://x.test', text: css, guideText: '' });
  assert.deepEqual([s.typography.source_fonts.heading, s.typography.source_fonts.body], ['SF Pro Display', 'SF Pro Text']);
  assert.equal(s.typography.heading_font, 'Inter');
  // even if someone passed raw CSS as guide text, lowercase pseudo-class names are rejected
  const s2 = buildSpec({ source: 'x', text: css });
  assert.ok(!['lang', 'hover'].includes(s2.typography.source_fonts.heading));
});

test('PNG decode + dominant colours by area', () => {
  const img = decodePng(png(100, 60, [0, 0, 0]));
  assert.deepEqual([img.width, img.height], [100, 60]);
  const dom = dominantColors(decodePng(png(100, 100, [255, 255, 255])), { step: 2 });
  assert.equal(dom[0].hex, '#FFFFFF'); assert.ok(dom[0].share > 0.99);
});

test('neutral-first brand (Apple-like): title slide is NOT flooded with the brand colour', () => {
  const spec = { colors: { primary: '#0071E3', secondary: '#333336', neutrals: ['#000000', '#F5F5F7'], surfaces: [{ hex: '#F5F5F7', share: 0.45 }, { hex: '#000000', share: 0.4 }, { hex: '#FFFFFF', share: 0.1 }, { hex: '#0071E3', share: 0.02 }] } };
  const P = slidePalette(spec);
  assert.equal(P.flood, false); assert.equal(P.titleBg, '#000000'); assert.equal(P.accent, '#0071E3'); assert.equal(P.contentBg, '#F5F5F7');
  assert.notEqual(P.headingOnContent, '#0071E3', 'neutral-first brands use ink for headings, the colour is an accent');
  assert.equal(slidePalette({ colors: { primary: '#0B3C8C', neutrals: [] } }).headingOnContent, '#0B3C8C', 'colour-led brands keep coloured headings');
});

test('brand-flooded or unknown-surface brands keep the colour as title background', () => {
  assert.equal(slidePalette({ colors: { primary: '#0B3C8C', neutrals: [] } }).titleBg, '#0B3C8C');
  assert.equal(slidePalette({ colors: { primary: '#0B3C8C', neutrals: [], surfaces: [{ hex: '#0B3C8C', share: 0.6 }, { hex: '#FFFFFF', share: 0.3 }] } }).flood, true);
});

test('CSS background usage gives surfaces when there is no screenshot; deck follows them', async () => {
  const surfaces = cssSurfaces('.a{background:#000}.b{background-color:#000}.c{background:#f5f5f7}.d{background:#0071e3}');
  assert.equal(surfaces[0].hex, '#000000');
  const spec = buildSpec({ source: 'https://x.test', text: '.a{background:#000}.b{background:#000}.c{background:#f5f5f7}.d{background:#fff}.e{background:#fff}:root{--brand-primary:#0071E3}', guideText: '', surfaces: cssSurfaces('.a{background:#000}.b{background:#000}.c{background:#f5f5f7}.d{background:#fff}.e{background:#fff}') });
  const t = await templateDeck({ brand_spec: spec });
  const z = await JSZip.loadAsync(Buffer.from(t.file.content_base64, 'base64'));
  const layout = async (n) => { for (const f of Object.keys(z.files).filter((x) => /slideLayout\d+\.xml$/.test(x))) { const x = await z.file(f).async('string'); if (x.includes(`name="${n}"`)) return x; } };
  assert.equal(await bgColor(z, await layout('BRAND_TITLE')), '000000', 'title background resolves (through the theme) to the brand black');
  assert.deepEqual(spec.tone_keywords.includes('playful'), false);
});

import { refineWithBrowser } from '../lib/extract.mjs';
import { logoShaped, heroShaped, styleDoc as styleDoc__ } from '../lib/style.mjs';
const styleDoc_ = (x) => styleDoc__(x).style;

test('browser measurements win: real rendered fonts, button colour as accent on a neutral page, heading style', () => {
  const spec = buildSpec({ source: 'https://x.test', text: 'p{font-family:"SF Pro HK"}.a{background:#fff}.b{background:#f5f5f7}.c{background:#000}', guideText: '', surfaces: [{ hex: '#F5F5F7', share: 0.5 }, { hex: '#000000', share: 0.4 }, { hex: '#0071E3', share: 0.01 }] });
  const style = { style_version: '1.1', assets: [], provenance: {} };
  const r = refineWithBrowser(spec, style, { bodyBg: 'rgb(255, 255, 255)', heading: { families: ['SF Pro Display', 'Helvetica', 'sans-serif'], weight: '600', letterSpacing: '-1.2px', transform: 'none', color: 'rgb(29, 29, 31)' }, body: { families: ['SF Pro Text', 'sans-serif'], color: 'rgb(29, 29, 31)' }, buttons: [{ bg: 'rgb(0, 113, 227)', color: 'rgb(255, 255, 255)' }], links: ['rgb(0, 102, 204)'] });
  assert.deepEqual([r.spec.typography.source_fonts.heading, r.spec.typography.source_fonts.body], ['SF Pro Display', 'SF Pro Text']);
  assert.equal(r.spec.colors.primary, '#0071E3'); assert.equal(r.spec.provenance['colors.primary'], 'computed');
  assert.ok(r.spec.tone_keywords.includes('minimal')); assert.ok(r.spec.colors.neutrals.includes('#1D1D1F'));
  assert.deepEqual([r.style.text.heading.weight, r.style.text.heading.letter_spacing, r.style.text.heading.case], [700, -0.9, 'none']);
  assert.equal(slidePalette(r.spec).flood, false);
});

test('browser measurements never override an explicit style-guide colour, and are a no-op without a browser', () => {
  const spec = buildSpec({ source: 'g', text: 'Primary: #123456', surfaces: [{ hex: '#FFFFFF', share: 0.9 }] });
  assert.equal(refineWithBrowser(spec, null, { buttons: [{ bg: 'rgb(0, 113, 227)' }], links: [] }).spec.colors.primary, '#123456');
  assert.equal(refineWithBrowser(spec, null, null).spec, spec);
});

test('logo/hero shape rules: a 3000px product banner is not a logo, and not a slide-background hero', () => {
  assert.equal(logoShaped({ mime: 'image/jpeg', width: 3008, height: 580 }, 65000), false);
  assert.equal(logoShaped({ mime: 'image/png', width: 415, height: 66 }, 3800), true);
  assert.equal(logoShaped({ mime: 'image/png', width: 800, height: 30 }, 3800), false);
  assert.equal(heroShaped({ width: 3008, height: 580 }), false); assert.equal(heroShaped({ width: 1600, height: 900 }), true);
});

test('no automatic background from a PNG logo card; a real photo is used', () => {
  const mk = (id, mime, w, h, bytes) => ({ id, role: 'hero', mime, width: w, height: h, bytes, content_base64: Buffer.alloc(bytes).toString('base64') });
  const noBg = styleDoc_({ assets: [mk('hero-1', 'image/png', 1200, 630, 11000)] });
  assert.equal(noBg.backgrounds, undefined);
  assert.equal(styleDoc_({ assets: [mk('hero-1', 'image/png', 1200, 630, 11000), mk('hero-2', 'image/jpeg', 1600, 900, 90000)] }).backgrounds.title, 'hero-2');
});

import { knockOutBackground, encodeRgba } from '../lib/png.mjs';
test('logo captured on a coloured header: the flat background becomes transparent, the mark is kept', () => {
  const w = 20, h = 10, px = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) { const mark = (i % w) > 6 && (i % w) < 13; px.set(mark ? [255, 255, 255, 255] : [22, 22, 23, 255], i * 4); }
  const out = decodePng(knockOutBackground(encodeRgba(w, h, px)));
  assert.equal(out.channels, 4); assert.equal(out.data[3], 0); assert.equal(out.data[(10 * 4) + 3], 255);
  const photo = png(20, 10, [200, 40, 40]);                       // flat corners but no contrast: a solid image stays as is (alpha 0 only where it equals bg)
  assert.ok(Buffer.isBuffer(knockOutBackground(photo)));
  const varied = encodeRgba(4, 4, Buffer.from(Array.from({ length: 64 }, (_, i) => (i * 37) % 256)));
  assert.equal(knockOutBackground(varied).equals(varied), true, 'non-uniform corners are left alone');
});

test('picture slides: image is cropped to fill its frame, and add-slides carries the picture into the existing deck', async () => {
  const style = { ...STYLE, design: { align: 'center', density: 'airy', imagery: 'image-led', heading_scale: 'display', corners: 'soft' } };
  const t = await templateDeck({ brand_spec: SPEC, brand_style: style });
  const tz = await JSZip.loadAsync(Buffer.from(t.file.content_base64, 'base64'));
  const pic = (await tz.file('ppt/slides/slide8.xml').async('string')).match(/<p:pic>[\s\S]*?<\/p:pic>/)?.[0] ?? '';
  assert.match(pic, /<a:srcRect/); assert.ok(Object.keys(tz.files).some((n) => /^ppt\/media\//.test(n) && /hero|image/i.test(n) || /^ppt\/media\/image/.test(n)));
  const a = await addSlides({ brand_spec: SPEC, brand_style: style, deck: { filename: 't.pptx', content_base64: t.file.content_base64 }, outline: { slides: [{ layout: 'image', title: 'Big picture', image: 'hero-1' }, { layout: 'statement', title: 'Say it big' }] } });
  const z = await JSZip.loadAsync(Buffer.from(a.file.content_base64, 'base64'));
  const rels = await z.file('ppt/slides/_rels/slide11.xml.rels').async('string');
  const target = rels.match(/Target="\.\.\/media\/([^"]+)"/)?.[1];
  assert.ok(target && z.file(`ppt/media/${target}`), 'copied image exists in the package');
  assert.match(await z.file('ppt/slides/slide11.xml').async('string'), /r:embed="rId\d+"/);
  assert.match(rels, /slideLayout\d+\.xml/);
  assert.match(await z.file('[Content_Types].xml').async('string'), /Extension="png"/);
  await assert.rejects(addSlides({ brand_spec: SPEC, brand_style: style, deck: { filename: 't.pptx', content_base64: t.file.content_base64 }, outline: { slides: [{ layout: 'image', title: 'x', image: 'nope-1' }] } }), /not a PNG\/JPG brand asset/);
});

test('layouts follow the brand design language: centred+airy+display vs left+dense+compact', () => {
  const mk = (design) => layoutSpecs(SPEC, { design });
  const apple = mk({ align: 'center', density: 'airy', imagery: 'image-led', heading_scale: 'display', corners: 'soft' });
  const corp = mk({ align: 'left', density: 'dense', imagery: 'text-led', heading_scale: 'compact', corners: 'square' });
  assert.equal(apple.L.title.ph[0].align, 'center'); assert.equal(corp.L.title.ph[0].align, 'left');
  assert.ok(apple.L.title.ph[0].size > corp.L.title.ph[0].size);
  assert.ok(apple.L.content.objects.length > 0 && corp.L.content.objects.length > 0, 'content slides carry a headline rule');
  assert.ok(!apple.L.content.objects.some((o) => o.w >= 13 && o.y === 0), 'no heavy full-width header band: the headline is typographic');
  assert.ok(apple.L['catalog-panel'].panel && apple.L['catalog-panel'].panel.w > 3, 'a panel composition exists for catalog slides');
  assert.ok(apple.margin > corp.margin);
  assert.ok(apple.L.image.pic.w > corp.L.image.pic.w, 'centred brands use a full-width picture band');
  assert.equal(mk(undefined).D.align, 'left', 'no measurement => neutral defaults');
});

import { fileMatchesFamily, fontStatus, missingFonts, installFonts, withFontNotice, fontNotice } from '../lib/fontinstall.mjs';
import { mkdtemp as mkd, writeFile as wf, readdir as rd } from 'node:fs/promises';
import { tmpdir as td } from 'node:os';
import { join as pj } from 'node:path';

test('installed-font detection matches real file names and not look-alikes', () => {
  for (const f of ['Inter-Regular.ttf', 'Inter-400.ttf', 'InterVariable.ttf', 'Inter[opsz,wght].ttf', 'Inter.ttc']) assert.ok(fileMatchesFamily(f, 'Inter'), f);
  for (const f of ['Internet.ttf', 'InterstateBlack.otf', 'Intermezzo-Regular.ttf']) assert.ok(!fileMatchesFamily(f, 'Inter'), f);
  assert.ok(fileMatchesFamily('Montserrat-Bold.ttf', 'Montserrat')); assert.ok(fileMatchesFamily('OpenSans-Regular.ttf', 'Open Sans'));
});

test('fonts: missing ones are reported, warned about in the preview, and installed only with consent (stubbed network)', async () => {
  const dir = await mkd(pj(td(), 'fonts-')); const spec = { typography: { heading_font: 'Inter', body_font: 'Inter' } };
  assert.deepEqual(missingFonts(await fontStatus(spec, { dirs: [dir] })), ['Inter']);
  assert.match(fontNotice(['Inter']), /not installed .* PowerPoint will show a different font/);
  assert.match(withFontNotice('<!doctype html><body><p>x</p></body>', ['Inter']), /⚠ Inter is not installed/);
  assert.equal(withFontNotice('<body>x</body>', []), '<body>x</body>');
  const real = globalThis.fetch;
  globalThis.fetch = async (u) => (String(u).includes('css2') ? new Response('@font-face{font-weight:400;src:url(https://fonts.gstatic.com/s/x/a.ttf)}@font-face{font-weight:700;src:url(https://fonts.gstatic.com/s/x/b.ttf)}') : new Response(Buffer.from('TTF')));
  try {
    const dry = await installFonts(spec, { dryRun: true, dir, dirs: [dir] });
    assert.deepEqual(dry.would_install, ['Inter']); assert.deepEqual(await rd(dir), [], 'dry run writes nothing');
    const done = await installFonts(spec, { dryRun: false, dir, dirs: [dir] });
    assert.deepEqual(done.installed, ['Inter']); assert.equal(done.restart_needed, true);
    assert.deepEqual((await rd(dir)).sort(), ['Inter-400.ttf', 'Inter-700.ttf']);
    assert.deepEqual(missingFonts(await fontStatus(spec, { dirs: [dir] })), [], 'now detected as installed');
    assert.deepEqual((await installFonts(spec, { dryRun: false, dir, dirs: [dir] })).installed, [], 'idempotent');
  } finally { globalThis.fetch = real; }
});

import { applyLicensedFonts } from '../lib/fontinstall.mjs';
test('proprietary customer font is used automatically when there is evidence of a licence — supplied files or installed — never by asking', async () => {
  const gotham = () => buildSpec({ source: 'u', text: 'h1{font-family:Gotham}p{font-family:Gotham}:root{--brand-primary:#0055AA}' });
  const none = await applyLicensedFonts(gotham(), { dirs: [] });
  assert.equal(none.typography.heading_font, 'Montserrat'); assert.equal(none.typography.font_resolution.heading.status, 'substituted');
  const supplied = await applyLicensedFonts(gotham(), { suppliedFiles: ['/brand/fonts/Gotham-Bold.otf', '/brand/fonts/Gotham-Book.otf'], dirs: [] });
  assert.deepEqual([supplied.typography.heading_font, supplied.typography.font_resolution.heading.status, supplied.typography.font_resolution.heading.evidence], ['Gotham', 'user-licensed', 'supplied by the customer']);
  assert.equal(supplied.typography.font_resolution.heading.web_fallback, 'Montserrat');
  const dir = await mkd(pj(td(), 'inst-')); await wf(pj(dir, 'Gotham-Medium.otf'), 'x');
  const inst = await applyLicensedFonts(gotham(), { dirs: [dir] });
  assert.equal(inst.typography.heading_font, 'Gotham'); assert.equal(inst.typography.font_resolution.body.evidence, 'installed on this computer');
  const look = await applyLicensedFonts(gotham(), { suppliedFiles: ['/x/Gothamist-Regular.otf'], dirs: [] });
  assert.equal(look.typography.heading_font, 'Montserrat', 'a look-alike file name is not evidence');
});

test('brand folder with the customer\'s font files: their font is used', async () => {
  const d = await mkd(pj(td(), 'brandfolder-'));
  await wf(pj(d, 'site.css'), 'h1{font-family:"Gotham Bold"}p{font-family:Gotham}:root{--brand-primary:#0055AA}');
  await wf(pj(d, 'Gotham-Bold.otf'), 'x'); await wf(pj(d, 'Gotham-Book.ttf'), 'x');
  const r = await extractFromPath(d);
  assert.equal(r.brand_spec.typography.body_font, 'Gotham'); assert.equal(r.brand_spec.typography.font_resolution.body.evidence, 'supplied by the customer');
  assert.ok(r.notes.some((n) => /2 font file\(s\)/.test(n)));
});

test('customer-supplied font files are installed for the user (real font files only), and the preview says when a licensed font is missing', async () => {
  const src = await mkd(pj(td(), 'supplied-')), dest = await mkd(pj(td(), 'dest-'));
  const ttf = Buffer.concat([Buffer.from([0, 1, 0, 0]), Buffer.alloc(64)]);
  await wf(pj(src, 'Gotham-Bold.otf'), Buffer.concat([Buffer.from('OTTO'), Buffer.alloc(64)])); await wf(pj(src, 'Gotham-Book.ttf'), ttf); await wf(pj(src, 'Gotham-Fake.ttf'), 'not a font at all, just text padding..');
  const spec = await applyLicensedFonts(buildSpec({ source: 'u', text: 'h1{font-family:Gotham}p{font-family:Gotham}:root{--brand-primary:#0055AA}' }), { suppliedFiles: ['Gotham-Bold.otf', 'Gotham-Book.ttf', 'Gotham-Fake.ttf'].map((n) => pj(src, n)), dirs: [] });
  assert.equal(spec.typography.heading_font, 'Gotham');
  assert.deepEqual(missingFonts(await fontStatus(spec, { dirs: [dest] })), ['Gotham']);
  const dry = await installFonts(spec, { dryRun: true, dir: dest, dirs: [dest] }); assert.deepEqual(dry.would_install, ['Gotham']); assert.deepEqual(await rd(dest), []);
  const done = await installFonts(spec, { dryRun: false, dir: dest, dirs: [dest] });
  assert.deepEqual((await rd(dest)).sort(), ['Gotham-Bold.otf', 'Gotham-Book.ttf'], 'the non-font file is not copied');
  assert.deepEqual(done.installed, ['Gotham']);
  assert.deepEqual(missingFonts(await fontStatus(spec, { dirs: [dest] })), []);
});

test('researched analogues are used, and every name in the data file exists on Google Fonts', async () => {
  const { researched } = await import('../lib/fonts.mjs');
  const r = resolveFont('SF Pro Display'); assert.deepEqual([r.used, r.status, r.match_confidence], ['Inter', 'substituted', 'high']);
  assert.match(r.note, /licensed font, so the nearest free font, Inter/); assert.ok(!/ask|confirm/i.test(r.note.replace(/nobody has confirmed/, '')), 'no question is put to the user');
  assert.ok(Object.keys(researched()).length >= 30);
  for (const e of Object.values(researched())) for (const n of [e.nearest, ...e.alternatives]) assert.ok(findGoogle(n), `${e.font}: ${n}`);
  assert.equal(resolveFont('Didot').used, 'Bodoni Moda');
});

import { assignTones, masterFor } from '../lib/layouts.mjs';
// a layout's background colour, resolved through the theme when it is a theme colour
async function bgColor(z, xml) { const m = xml.match(/<p:bg><p:bgPr><a:solidFill><a:(srgbClr|schemeClr) val="(\w+)"/); if (!m) return null; if (m[1] === 'srgbClr') return m[2]; const t = await z.file('ppt/theme/theme1.xml').async('string'); return t.match(new RegExp(`<a:${m[2]}>\\s*<a:srgbClr val="(\\w+)"`))?.[1] ?? null; }
test('slide tones follow the site rhythm: alternating sites alternate, dark/light sites stay, unmeasured keep defaults, explicit tone wins', () => {
  const slides = [{ layout: 'title', title: 'a' }, { layout: 'content', title: 'b' }, { layout: 'statement', title: 'c' }, { layout: 'image', title: 'd' }, { layout: 'content', title: 'e', tone: 'dark' }, { layout: 'closing', title: 'f' }];
  const mk = (pattern) => ({ design: { align: 'center', density: 'airy', imagery: 'image-led', heading_scale: 'display', corners: 'soft', ...(pattern && { rhythm: { pattern, flip_rate: 0.6, tones: ['dark', 'light', 'dark'] } }) } });
  const APPLE = { ...SPEC, colors: { primary: '#0071E3', neutrals: ['#000000', '#F5F5F7'], surfaces: [{ hex: '#F5F5F7', share: 0.45 }, { hex: '#000000', share: 0.4 }, { hex: '#0071E3', share: 0.01 }] } };
  const alt = assignTones(slides, APPLE, mk('alternating'));
  assert.deepEqual(alt, ['dark', 'light', 'dark', 'light', 'dark', 'dark'], 'title dark -> alternate; explicit tone kept; closing keeps its own tone');
  assert.deepEqual(assignTones(slides, APPLE, mk('light')).slice(1, 4), ['light', 'light', 'light']);
  assert.deepEqual(assignTones(slides, APPLE, mk('dark')).slice(1, 4), ['dark', 'dark', 'dark']);
  assert.deepEqual(assignTones(slides, APPLE, mk(null)).slice(1, 4), ['light', 'light', 'dark'], 'not measured -> each layout keeps its default tone');
  assert.equal(masterFor('content', 'dark', { content: 'light' }), 'BRAND_CONTENT_ALT'); assert.equal(masterFor('content', 'light', { content: 'light' }), 'BRAND_CONTENT');
  assert.equal(masterFor('title', 'dark', { content: 'light' }), 'BRAND_TITLE');
});

test('alternating deck: dark and light layouts both exist and slides use them; add-slides carries the tone', async () => {
  const APPLE = { ...SPEC, colors: { primary: '#0071E3', neutrals: ['#000000', '#F5F5F7'], surfaces: [{ hex: '#F5F5F7', share: 0.45 }, { hex: '#000000', share: 0.4 }, { hex: '#0071E3', share: 0.01 }] } };
  const style = { ...STYLE, backgrounds: undefined, design: { align: 'center', density: 'airy', imagery: 'image-led', heading_scale: 'display', corners: 'soft', rhythm: { pattern: 'alternating', flip_rate: 0.6, tones: ['dark', 'light', 'dark', 'light'] } } };
  const t = await draftDeck({ brand_spec: APPLE, brand_style: style, outline: { slides: [{ layout: 'title', title: 'T' }, { layout: 'content', title: 'A', bullets: ['x'] }, { layout: 'content', title: 'B', bullets: ['y'] }] } });
  const z = await JSZip.loadAsync(Buffer.from(t.file.content_base64, 'base64'));
  const layoutOf = async (n) => { const rel = await z.file(`ppt/slides/_rels/slide${n}.xml.rels`).async('string'); const f = rel.match(/slideLayouts\/(slideLayout\d+\.xml)/)[1]; return (await z.file(`ppt/slideLayouts/${f}`).async('string')).match(/cSld name="([^"]*)"/)[1]; };
  assert.deepEqual([await layoutOf(1), await layoutOf(2), await layoutOf(3)], ['BRAND_TITLE', 'BRAND_CONTENT', 'BRAND_CONTENT_ALT']);
  const bgs = Object.fromEntries(await Promise.all(['BRAND_CONTENT', 'BRAND_CONTENT_ALT'].map(async (nm) => { for (const f of Object.keys(z.files).filter((x) => /slideLayout\d+\.xml$/.test(x))) { const x = await z.file(f).async('string'); if (x.includes(`name="${nm}"`)) return [nm, await bgColor(z, x)]; } })));
  assert.notEqual(bgs.BRAND_CONTENT, bgs.BRAND_CONTENT_ALT);
  const a = await addSlides({ brand_spec: APPLE, brand_style: style, deck: { filename: 't.pptx', content_base64: t.file.content_base64 }, outline: { slides: [{ layout: 'content', title: 'N1', bullets: ['z'] }, { layout: 'content', title: 'N2', bullets: ['z'] }] } });
  const z2 = await JSZip.loadAsync(Buffer.from(a.file.content_base64, 'base64'));
  const l4 = (await z2.file('ppt/slides/_rels/slide4.xml.rels').async('string')).match(/slideLayout\d+\.xml/)[0], l5 = (await z2.file('ppt/slides/_rels/slide5.xml.rels').async('string')).match(/slideLayout\d+\.xml/)[0];
  assert.notEqual(l4, l5, 'consecutive new slides alternate');
  assert.notEqual(l4, (await z2.file('ppt/slides/_rels/slide3.xml.rels').async('string')).match(/slideLayout\d+\.xml/)[0], 'the first new slide continues from the last existing slide, it does not restart');
});

import { inferSystem, validateSystem } from '../lib/system.mjs';
import { pageHtml, componentsSheet, checkHtml, kitCss, checkBlocks } from '../lib/htmlkit.mjs';
import { inferRhythm } from '../lib/design.mjs';
import { pageRhythm } from '../lib/png.mjs';

const RAW = { vw: 1440, container: 1200, sectionPad: 80, h1: { size: 56, weight: '600', lh: 1.07, ls: -0.3, transform: 'none', color: 'rgb(29, 29, 31)' }, h2: { size: 40, weight: '600', lh: 1.1, ls: 0, transform: 'none', color: 'rgb(29, 29, 31)' }, body: { size: 17, weight: '400', lh: 1.47, ls: 0, transform: 'none', color: 'rgb(110, 110, 115)' },
  nav: { h: 44, bg: 'rgba(29, 29, 31, 0.8)', color: 'rgb(255, 255, 255)', linkSize: 12, linkWeight: '400', position: 'sticky', blur: true, borderB: 0, centered: true, translucent: true },
  primary: { w: 120, h: 40, bg: 'rgb(0, 113, 227)', color: 'rgb(255, 255, 255)', radius: 980, bw: 0, bc: 'rgb(0,0,0)', padT: 11, padL: 21, fs: 17, fw: '400', tt: 'none' },
  secondary: { w: 120, h: 40, bg: 'rgba(0, 0, 0, 0)', color: 'rgb(0, 102, 204)', radius: 980, bw: 1, bc: 'rgb(0, 102, 204)', padT: 11, padL: 21, fs: 17, fw: '400', tt: 'none' },
  card: { w: 320, h: 400, bg: 'rgb(255, 255, 255)', radius: 18, shadow: 'rgba(0, 0, 0, 0.08) 0px 4px 12px 0px', bw: 0, bc: 'rgb(0,0,0)', padT: 24, n: 3 }, footer: { bg: 'rgb(245, 245, 247)', color: 'rgb(110, 110, 115)', linkSize: 12, linkColor: 'rgb(66, 66, 69)', w: 1440, h: 400, padT: 0 }, hero: { h: 700, center: true, ctaGap: 14 } };
const SYS_STYLE = { ...STYLE, system: inferSystem(RAW) };

test('system: measurements become validated, whitelisted tokens (hostile page values never reach CSS)', () => {
  const sys = inferSystem(RAW);
  assert.deepEqual(validateSystem(sys), []);
  assert.equal(sys.button.primary.pill, true); assert.equal(sys.nav.sticky, true); assert.equal(sys.nav.centered, true); assert.equal(sys.type.h1.size, 56);
  const evil = inferSystem({ ...RAW, card: { ...RAW.card, shadow: '0 0 0 #000; } body{background:url(//evil)} /*', bg: 'url(javascript:alert(1))' }, nav: { ...RAW.nav, bg: 'red; } x{' } });
  assert.equal(evil.card.shadow, null); assert.equal(evil.card.bg, null); assert.equal(evil.nav.bg, '#FFFFFF');
  assert.ok(validateSystem({ ...sys, nav: { ...sys.nav, bg: 'red; }' } }).length > 0);
  assert.equal(inferSystem({}), null);
});

test('HTML prototype uses the customer\'s measured components; one-pager uses the design language only', () => {
  const blocks = [{ type: 'nav', brand: 'Acme', links: [{ text: 'Platform', href: '#p' }], cta: { text: 'Contact', href: '#c' } }, { type: 'hero', title: 'Big <b>title</b>', subtitle: 's', ctas: [{ text: 'Go', href: 'javascript:alert(1)' }, { text: 'More', href: 'https://example.com/x' }], image: 'hero-1' },
    { type: 'cards', title: 'C', items: [{ title: 'a', text: 'b' }] }, { type: 'footer', columns: [{ title: 'Co', links: [{ text: 'About', href: '#' }] }], legal: '© x' }];
  const proto = pageHtml({ brand_spec: SPEC, brand_style: SYS_STYLE, blocks, mode: 'prototype', title: 'T' });
  assert.match(proto, /position:sticky/); assert.match(proto, /backdrop-filter/); assert.match(proto, /border-radius:999px/); assert.match(proto, /class="bx-nav"/);
  assert.ok(!/<b>title<\/b>/.test(proto) && /Big &lt;b&gt;title&lt;\/b&gt;/.test(proto), 'content is escaped');
  assert.ok(!/javascript:/.test(proto) && /href="https:\/\/example\.com\/x"/.test(proto), 'only #anchors and https links survive');
  assert.ok(!/<script/i.test(proto));
  const one = pageHtml({ brand_spec: SPEC, brand_style: SYS_STYLE, blocks, mode: 'onepager' });
  assert.ok(one.length > 1000 && !/backdrop-filter/.test(one), 'one-pager ignores the measured nav');
  assert.throws(() => pageHtml({ brand_spec: SPEC, brand_style: STYLE, blocks, mode: 'prototype' }), /No measured components/);
  assert.match(componentsSheet({ brand_spec: SPEC, brand_style: SYS_STYLE }), /bx-footer/);
  assert.throws(() => checkBlocks([{ type: 'iframe' }]), /type must be one of/);
});

test('html-check: on-brand pages pass; stray colours and fonts are reported', () => {
  const ok = pageHtml({ brand_spec: SPEC, brand_style: SYS_STYLE, blocks: [{ type: 'hero', title: 'x' }], mode: 'prototype' });
  assert.equal(checkHtml(ok, SPEC, SYS_STYLE).ok, true);
  const bad = ok.replace('</style>', '.x{color:#ff00aa;font-family:"Comic Sans MS"}</style>');
  const r = checkHtml(bad, SPEC, SYS_STYLE); assert.equal(r.ok, false); assert.ok(r.errors.some((e) => /#FF00AA/.test(e)) && r.errors.some((e) => /comic sans/i.test(e)));
});

test('rhythm: alternating, dark and light screens are told apart, and pixels are classified', () => {
  assert.equal(inferRhythm([{ tone: 'dark' }, { tone: 'light' }, { tone: 'dark' }, { tone: 'light' }]).pattern, 'alternating');
  assert.equal(inferRhythm([{ tone: 'light' }, { tone: 'light' }, { tone: 'light' }, { tone: 'dark' }]).pattern, 'light');
  assert.equal(inferRhythm([{ tone: 'dark' }, { tone: 'dark' }, { tone: 'dark' }]).pattern, 'dark');
  assert.equal(inferRhythm([{ tone: 'dark' }]), null);
  const img = decodePng(png(100, 2400, [255, 255, 255])); const r = pageRhythm(img, { slice: 800 });
  assert.deepEqual(r.map((x) => x.tone), ['light', 'light', 'light']); assert.equal(r[0].imagery, 'flat');
});

test('security: hostile page measurements, system values, blocks, assets and specs cannot break out of the generated page', async () => {
  const base = inferSystem(RAW), X = '1}</style><script>alert(1)</script>';
  const style = (sys, assets = []) => ({ style_version: '1.1', assets, system: sys });
  const page = (st, spec = SPEC, blocks = [{ type: 'hero', title: 'x' }, { type: 'cards', title: 'c', items: [{ title: 'a' }] }], mode = 'prototype') => pageHtml({ brand_spec: spec, brand_style: st, blocks, mode });
  const clone = () => structuredClone(base);
  // every field that reaches CSS is validated, so a hostile value is rejected before any CSS is written
  for (const mut of [(s) => (s.card.shadow = 'rgba(0;}</style><script src=//e/x.js></script>) 1px 1px '), (s) => (s.type.h1.weight = X), (s) => (s.type.body.line_height = X), (s) => (s.type.h2.letter_spacing_em = X), (s) => (s.container.max_width = X), (s) => (s.container.gutter = X), (s) => (s.section.padding_y = X), (s) => (s.nav.link_weight = X), (s) => (s.button.primary.weight = X), (s) => (s.hero = { height: X, centered: true, cta_gap: 10 }), (s) => (s.footer = { bg: '#F5F5F7', color: '#000000', link_color: X, link_size: 12 }), (s) => { delete s.container; }, (s) => { delete s.type; }])
    { const s = clone(); mut(s); assert.throws(() => page(style(s)), /Invalid BrandStyle/); }
  const OK = page(style(base)); assert.ok(!/<script/i.test(OK));
  // blocks
  assert.throws(() => page(style(base), SPEC, [{ type: 'cards', title: 't', tone: 'a b" onmouseover="alert(1)', items: [] }]), /tone must be light or dark/);
  assert.throws(() => page(style(base), SPEC, [{ type: 'cards', title: 't', items: [null] }]), /must be an object/);
  assert.throws(() => page(style(base), SPEC, [{ type: 'text', title: 't', paragraphs: Array(60000).fill('x') }]), /at most 12/);
  assert.throws(() => page(style(base), SPEC, [{ type: 'hero', title: 't', ctas: 'x' }]), /ctas must be a list/);
  assert.throws(() => page(style(base), SPEC, [{ type: 'hero', title: 't', id: 'a" onclick="x' }]), /id may only/);
  // assets and spec
  const P = png(4, 4, [1, 2, 3]).toString('base64');
  assert.throws(() => page(style(base, [{ id: 'hero-1', role: 'hero', mime: 'image/png', width: '1/1"><script>alert(1)</script>', height: 5, content_base64: P }]), SPEC, [{ type: 'feature', title: 't', image: 'hero-1' }]), /whole numbers/);
  assert.ok(validateStyle({ style_version: '1.1', assets: [null] }).length && validateStyle({ style_version: '1.1', placements: [null] }).length);
  const evilSpec = (mut) => { const x = structuredClone(SPEC); mut(x); return x; };
  assert.throws(() => page(style(base), evilSpec((x) => (x.colors.surfaces = [{ hex: '#000000;}</style><script>alert(1)</script>', share: 0.9 }])), undefined, 'onepager'), /Invalid BrandSpec/);
  assert.throws(() => page(style(base), evilSpec((x) => (x.typography.font_resolution = { heading: { used: 'Inter', web_fallback: "x'),url(https://evil/" } })), undefined), /web_fallback/);
  // inference from hostile page values never throws and never yields invalid tokens
  assert.doesNotThrow(() => inferSystem({ h1: { size: 40 }, nav: { bg: { toString: 1 }, color: 5 }, primary: { bg: 'rgb(., ., .)', color: [] } }));
  assert.deepEqual(validateSystem(inferSystem({ h1: { size: 40, weight: 'x', color: 'rgb(., ., .)' }, nav: { bg: 'rgb(., ., .)' }, card: { w: 1, h: 1, bg: 'url(x)', shadow: '0 0 0 #000; } body{}', radius: 'x', n: { a: 1 } } })), []);
  // last line of defence: generated CSS can never carry markup or an external url()
  assert.throws(() => guardCss('a{b:c}</style><script>'), /Refusing/); assert.throws(() => guardCss('a{background:url(https://evil/x)}'), /Refusing/); assert.throws(() => guardCss('@import url(https://evil/x.css);'), /Refusing/);
  assert.doesNotThrow(() => guardCss('a{background:url("data:image/png;base64,AAAA")}'));
});

import { demoContent, demoBrandLive } from '../lib/demo.mjs';
test('picture choice prefers real photographs over PNG logo cards; live demo falls back to the sample when the site cannot be read', async () => {
  const mk = (id, mime, role, w, h, bytes) => ({ id, role, mime, width: w, height: h, bytes, content_base64: Buffer.alloc(8).toString('base64') });
  const style = { assets: [mk('hero-1', 'image/png', 'hero', 1200, 630, 11000), mk('hero-2', 'image/jpeg', 'hero', 3008, 580, 75000), mk('photo-1', 'image/jpeg', 'photo', 1200, 800, 90000), mk('logo-1', 'image/png', 'logo', 100, 40, 3000)] };
  assert.equal(pickImage(style).id, 'photo-1' === pickImage(style).id ? 'photo-1' : 'hero-2'); assert.notEqual(pickImage(style).id, 'hero-1');
  const c = demoContent(style, 'Apple'); const picIds = c.slides.filter((s) => s.layout === 'image').map((s) => s.image);
  assert.ok(picIds.length === 2 && !picIds.includes('hero-1') && !picIds.includes('logo-1'));
  assert.equal(c.blocks[0].brand, 'Apple'); assert.ok(c.slides.every((s) => !s.title || /^\[|for Apple/.test(s.title)), 'all demo copy is a placeholder, never an invented claim');
  const down = await demoBrandLive('https://example.invalid', { extract: async () => { throw new Error('offline'); } });
  assert.equal(down.live, false); assert.match(down.notes[0], /made-up sample customer/); assert.equal(down.spec.colors.primary, '#0B3C8C');
  const up = await demoBrandLive('https://www.apple.com', { extract: async () => ({ brand_spec: SPEC, brand_style: STYLE, notes: ['n'] }) });
  assert.deepEqual([up.live, up.name], [true, 'Apple']);
});

test('picture slots: the layout carries a real PowerPoint picture placeholder, and image:"none" leaves it empty on purpose', async () => {
  const style = { ...STYLE, design: { align: 'center', density: 'airy', imagery: 'image-led', heading_scale: 'display', corners: 'soft' } };
  const d = await draftDeck({ brand_spec: SPEC, brand_style: style, outline: { slides: [{ layout: 'image', title: 'Own picture goes here', image: 'none' }, { layout: 'image', title: 'Brand picture', image: 'hero-1' }] } });
  const z = await JSZip.loadAsync(Buffer.from(d.file.content_base64, 'base64'));
  const layout = async () => { for (const f of Object.keys(z.files).filter((n) => /slideLayout\d+\.xml$/.test(n))) { const x = await z.file(f).async('string'); if (x.includes('name="BRAND_IMAGE"')) return x; } };
  assert.match(await layout(), /<p:ph[^>]*type="pic"/, 'real picture placeholder (click-to-add-picture) in the layout');
  const s1 = await z.file('ppt/slides/slide1.xml').async('string'), s2 = await z.file('ppt/slides/slide2.xml').async('string');
  assert.ok(!/<p:pic>/.test(s1), 'image:none adds no picture, the slot stays empty'); assert.match(s1, /<p:ph[^>]*type="pic"/);
  assert.match(s2, /<p:pic>/, 'a named brand picture is placed');
  assert.match(d.preview.content, /Click to add picture/);
});

import { checkChart, chartFromCsv, chartPalette, seriesColors, chartSvg, fmt, axisScale } from '../lib/charts.mjs';
import { contrast as ctr } from '../lib/color.mjs';
import { themePalette, brandName } from '../lib/pptxtheme.mjs';

const CH = { type: 'column', labels: ['Q1', 'Q2', 'Q3', 'Q4'], series: [{ name: 'Revenue', values: [12, 18, 24, 31] }], unit: 'M', highlight: 'Q4', sample: true };
const APPLE_SPEC = { schema_version: '1.1', source: 'https://www.apple.com/', colors: { primary: '#0071E3', secondary: '#333336', accents: ['#2997FF', '#0066CC'], neutrals: ['#1D1D1F', '#F5F5F7'], surfaces: [{ hex: '#F5F5F7', share: 0.45 }, { hex: '#000000', share: 0.4 }, { hex: '#0071E3', share: 0.01 }] }, typography: { heading_font: 'Inter', body_font: 'Inter' } };

test('charts: only real numbers in, bad shapes are refused with a clear message', () => {
  assert.doesNotThrow(() => checkChart(CH));
  for (const [bad, re] of [[{ ...CH, type: 'radar' }, /type must be/], [{ ...CH, labels: [] }, /labels must be/], [{ ...CH, series: [{ name: 'x', values: [1, 2] }] }, /one finite number per label/], [{ ...CH, series: [{ name: 'x', values: [1, 2, 3, NaN] }] }, /finite number/],
    [{ ...CH, type: 'pie', series: [{ name: 'x', values: [1, 2, 3, -4] }] }, /zero or more/], [{ ...CH, type: 'pie', labels: Array(9).fill('a').map((x, i) => x + i), series: [{ name: 'x', values: Array(9).fill(1) }] }, /2-8 slices/], [{ ...CH, type: 'stacked' }, /at least 2 series/], [{ ...CH, unit: '<script>' }, /unit must be/], [{ ...CH, highlight: 'Q9' }, /highlight must be/], [{ ...CH, source: 'x'.repeat(200) }, /source must be/]])
    assert.throws(() => checkChart(bad), re);
  const csv = chartFromCsv('Region;2023;2024\nEMEA;"1,200";150\nAPAC;90;(14)\n', 'column', '$'); assert.deepEqual(csv.series.map((s) => s.values), [[1200, 90], [150, -14]]);
  assert.throws(() => chartFromCsv('a,b\nx,y'), /No numeric columns/);
});

test('chart colours come from the brand, stay legible on light and dark backgrounds, and are distinguishable', () => {
  for (const bg of ['#FFFFFF', '#000000', '#F5F5F7', '#0B1B3A']) {
    const pal = chartPalette(APPLE_SPEC, 6, bg);
    assert.equal(new Set(pal).size, 6); for (const c of pal) assert.ok(ctr(c, bg) >= 2.9, `${c} on ${bg}`);
  }
  assert.equal(chartPalette(APPLE_SPEC, 1, '#FFFFFF')[0], '#0071E3', 'first series is the brand colour');
  const single = seriesColors(APPLE_SPEC, CH, '#F5F5F7', '#1D1D1F');
  assert.equal(single[3], '#0071E3'); assert.ok(single.slice(0, 3).every((c) => c !== '#0071E3'), 'one highlighted point, the rest muted');
  assert.equal(fmt(31, 'M'), '31 M'); assert.equal(fmt(1200, '$'), '$1,200'); assert.equal(fmt(38, '%'), '38%');
  assert.deepEqual(axisScale(0, 31).ticks, [0, 10, 20, 30, 40]);
});

test('charts: SVG is self-contained, escaped and never contains scripts; every chart type renders', () => {
  const evil = { ...CH, labels: ['<script>alert(1)</script>', 'b', 'c', 'd'], series: [{ name: '"><img src=x onerror=alert(1)>', values: [1, 2, 3, 4] }] };
  for (const type of ['column', 'bar', 'stacked', 'line', 'area']) {
    const c = { ...evil, type, series: type === 'stacked' ? [evil.series[0], { name: 'b', values: [4, 3, 2, 1] }] : evil.series };
    const svg = chartSvg({ chart: c, colors: ['#0071E3', '#333336'], ink: '#1D1D1F', bg: '#F5F5F7', w: 900, h: 400, font: "'Inter', sans-serif" });
    assert.ok(svg.startsWith('<svg') && !/<script|<img/i.test(svg), type);
    assert.ok(![...svg.matchAll(/<([a-z]+)\b/gi)].some((m) => !['svg', 'text', 'line', 'rect', 'path', 'circle', 'polyline', 'polygon'].includes(m[1].toLowerCase())), `${type}: only plain drawing elements`);
  }
  for (const type of ['pie', 'doughnut']) assert.ok(chartSvg({ chart: { ...CH, type }, colors: ['#0071E3', '#333336', '#2997FF', '#004994'], ink: '#fff', bg: '#000000', w: 900, h: 400, font: 'sans-serif' }).includes('<path'));
});

test('PowerPoint charts are native: data is in the file, series use brand colours, and add-slides carries them over', async () => {
  const outline = { slides: [{ layout: 'chart', title: 'Revenue grew every quarter', subtitle: 'sub', chart: CH }, { layout: 'chart', title: 'Regions', chart: { type: 'line', labels: ['a', 'b', 'c'], series: [{ name: 'EMEA', values: [1, 2, 3] }, { name: 'APAC', values: [3, 2, 1] }] } }] };
  const d = await draftDeck({ brand_spec: APPLE_SPEC, brand_style: { style_version: '1.1', assets: [] }, outline });
  const z = await JSZip.loadAsync(Buffer.from(d.file.content_base64, 'base64'));
  const chartOf = async (n) => z.file('ppt/charts/' + (await z.file(`ppt/slides/_rels/slide${n}.xml.rels`).async('string')).match(/charts\/(chart\d+\.xml)/)[1]).async('string');
  const c1 = await chartOf(1), c2 = await chartOf(2);
  assert.match(c1, /<c:barChart>/); assert.match(c1, /<c:v>Q4<\/c:v>/); assert.match(c1, /<c:v>31<\/c:v>/); assert.match(c1, /0071E3/); assert.match(c2, /<c:lineChart>/); assert.match(c2, /EMEA/);
  assert.ok(Object.keys(z.files).some((n) => /^ppt\/embeddings\/.*\.xlsx$/.test(n)), 'embedded workbook so "Edit Data" works');
  const t = await templateDeck({ brand_spec: APPLE_SPEC });
  const a = await addSlides({ brand_spec: APPLE_SPEC, deck: { filename: 't.pptx', content_base64: t.file.content_base64 }, outline: { slides: [{ layout: 'chart', title: 'New chart', chart: { ...CH, sample: false, source: 'Source: CRM' } }] } });
  const z2 = await JSZip.loadAsync(Buffer.from(a.file.content_base64, 'base64'));
  const newSlide = Object.keys(z2.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((x, y) => parseInt(x.match(/\d+/)) - parseInt(y.match(/\d+/))).at(-1);
  const rel = await z2.file(newSlide.replace('slides/', 'slides/_rels/') + '.rels').async('string');
  const chartTarget = rel.match(/charts\/(chart\d+\.xml)/)?.[1]; assert.ok(chartTarget && z2.file(`ppt/charts/${chartTarget}`), 'chart part copied');
  const crel = await z2.file(`ppt/charts/_rels/${chartTarget}.rels`).async('string'); assert.ok(z2.file(`ppt/embeddings/${crel.match(/embeddings\/([^"]+)/)[1]}`), 'workbook copied');
  assert.match(await z2.file('[Content_Types].xml').async('string'), new RegExp(chartTarget)); assert.match(await z2.file(newSlide).async('string'), /Source: CRM/);
  await assert.rejects(draftDeck({ brand_spec: APPLE_SPEC, outline: { slides: [{ layout: 'chart', title: 'x' }] } }), /needs a chart/);
  await assert.rejects(draftDeck({ brand_spec: APPLE_SPEC, outline: { slides: [{ layout: 'content', title: 'x', chart: CH }] } }), /only for the chart layout/);
});

test('HTML pages can carry charts in the brand palette, labelled as sample when they are', () => {
  const html = pageHtml({ brand_spec: APPLE_SPEC, brand_style: { style_version: '1.1', assets: [] }, mode: 'onepager', blocks: [{ type: 'chart', title: 'Revenue grew', chart: CH }] });
  assert.match(html, /<svg[^>]*role="img"/); assert.match(html, /Sample data\./); assert.ok(!/<script/i.test(html));
  assert.throws(() => pageHtml({ brand_spec: APPLE_SPEC, brand_style: { style_version: '1.1', assets: [] }, mode: 'onepager', blocks: [{ type: 'chart', title: 'x', chart: { ...CH, labels: ['a'] } }] }), /one finite number per label/);
});

test('PowerPoint style system: named theme, no leftover Office colours, brand fonts, master text styles, colours linked to the theme', async () => {
  const t = await templateDeck({ brand_spec: APPLE_SPEC, brand_style: { style_version: '1.1', assets: [] } });
  const z = await JSZip.loadAsync(Buffer.from(t.file.content_base64, 'base64'));
  const theme = await z.file('ppt/theme/theme1.xml').async('string'), master = await z.file('ppt/slideMasters/slideMaster1.xml').async('string');
  assert.match(theme, /<a:theme [^>]*name="Apple Brand"/); assert.match(theme, /<a:clrScheme name="Apple Brand">/); assert.match(theme, /<a:fontScheme name="Apple Brand">/);
  for (const k of ['dk1', 'lt1', 'dk2', 'lt2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink']) assert.match(theme, new RegExp(`<a:${k}><a:srgbClr val="[0-9A-F]{6}"/>`), `${k} is a brand colour, not a system colour`);
  for (const office of ['4472C4', 'ED7D31', 'A5A5A5', 'FFC000', '5B9BD5', '70AD47', '954F72']) assert.ok(!theme.includes(office), `leftover Office colour ${office}`);
  assert.match(theme, /accent1><a:srgbClr val="0071E3"/); assert.match(theme, /majorFont><a:latin typeface="Inter"/);
  const tp = themePalette(APPLE_SPEC); assert.equal(new Set(Object.values(tp)).size >= 10, true, 'theme colours are distinct'); assert.ok(ctr(tp.dk1, tp.lt1) >= 7, 'text vs background is readable');
  assert.match(master, /<p:titleStyle>[\s\S]*sz="3000" b="1"[\s\S]*<a:latin typeface="\+mj-lt"\/>/); assert.match(master, /<p:bodyStyle>[\s\S]*<a:lvl5pPr/); assert.match(master, /<a:schemeClr val="tx1"\/>/);
  const slides = await Promise.all(Object.keys(z.files).filter((n) => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(n)).map((n) => z.file(n).async('string')));
  assert.ok(slides.join('').includes('<a:schemeClr val="accent1"/>'), 'layouts refer to theme colours, so changing the colour scheme in PowerPoint recolours the deck');
  assert.equal(brandName({ source: 'https://www.apple.com/' }), 'Apple'); assert.equal(brandName({ source: '/x/Acme-brand-guide.pdf' }), 'Acme');
});

import { inferGraphics, validateGraphics, graphicsWords, cornerOf } from '../lib/graphics.mjs';

const GM = { pageBg: 'rgb(245, 253, 230)', radii: { button: [12, 12, 12, 9999], card: [16], media: [24, 24, 24], input: [], chip: [] }, grads: [], patterns: { tile: 0, svg: 0 }, shadow: { n: 0 },
  panels: [{ bg: 'rgb(0, 85, 85)', grad: false, image: false, radius: 16, inset: true, w: 710, h: 463, top: 3588, color: 'rgb(255, 255, 255)', stats: 4, imgs: 0, btn: 1, heading: 'investor relations', key: true }, { bg: 'rgb(255, 255, 255)', grad: false, image: false, radius: 0, inset: false, w: 1400, h: 300, top: 10, color: 'rgb(0,0,0)', stats: 0, imgs: 3, btn: 0, heading: 'x', key: false }] };

test('graphics: corners per element, no gradient, graphic section found', () => {
  const g = inferGraphics(GM);
  assert.equal(g.corners.button, 12); assert.equal(g.corners.card, 16); assert.equal(g.corners.media, 24); assert.equal(g.corners.input, null);
  assert.equal(g.gradient.used, false); assert.equal(g.shadow, 'none');
  assert.equal(g.section.bg, '#005555'); assert.equal(g.section.inset, true); assert.equal(g.section.radius, 16); assert.ok(g.section.with_numbers);
  assert.deepEqual(validateGraphics(g), []); assert.ok(graphicsWords(g).some((w) => /Graphic section: an inset coloured panel/.test(w)));
  assert.equal(inferGraphics(null), null);
  assert.equal(cornerOf(g, 'card', 2), 16); assert.equal(cornerOf(g, 'input', 10), 10, 'unmeasured element falls back to the coarse corner style');
});

test('graphics: a gradient is only reported when stops are real colours; bad values are rejected', () => {
  const g = inferGraphics({ ...GM, grads: [{ kind: 'linear', angle: '135deg', cols: ['rgb(0, 85, 85)', 'rgb(0, 40, 60)'], area: 500000 }] });
  assert.equal(g.gradient.used, true); assert.equal(g.gradient.angle, 135); assert.deepEqual(validateGraphics(g), []);
  assert.ok(validateGraphics({ ...g, section: { ...g.section, bg: 'url(x)' } }).length); assert.ok(validateGraphics({ ...g, corners: { button: -5 } }).length);
});

test('graphics reach the PowerPoint template: rounded cards, rounded pictures, gradient fields', async () => {
  const spec = { schema_version: '1.1', source: 'https://acme.example/', colors: { primary: '#005555', secondary: '#00C81F', accents: ['#C8F000'], neutrals: ['#0C0C05', '#FFFFFF'], surfaces: [{ hex: '#EBFAEE', share: 0.7 }, { hex: '#005555', share: 0.1 }] }, typography: { heading_font: 'Inter', body_font: 'Inter' } };
  const flat = await templateDeck({ brand_spec: spec, brand_style: { style_version: '1.1', assets: [] } });
  const g = { ...inferGraphics(GM), gradient: { used: true, kind: 'linear', angle: 135, stops: ['#005555', '#002A3C'], count: 1, area_share: 0.2 } };
  const t = await templateDeck({ brand_spec: spec, brand_style: { style_version: '1.1', assets: [], graphics: g } });
  const xml = async (r) => { const z = await JSZip.loadAsync(Buffer.from(r.file.content_base64, 'base64')); return (await Promise.all(Object.keys(z.files).filter((n) => /slideLayouts\/slideLayout\d+\.xml$/.test(n)).map((n) => z.file(n).async('string')))).join(''); };
  const [a, b] = [await xml(flat), await xml(t)];
  assert.ok(!a.includes('<a:gradFill'), 'no gradient measured => no gradient fills'); assert.ok((b.match(/prst="roundRect"/g) ?? []).length > (a.match(/prst="roundRect"/g) ?? []).length, 'measured rounded corners add rounded shapes beyond the highlight panel');
  assert.ok(b.includes('prst="roundRect"'), 'rounded shapes'); assert.ok(b.includes('<a:gradFill'), 'gradient fill');
  assert.ok(t.changes.some((c) => /graphics:/.test(c)));
});

test('graphics reach HTML: measured corners, flat cards, graphic-section block (one-pager; prototype shares the same tokens)', () => {
  const g = inferGraphics(GM), st = { style_version: '1.1', assets: [], graphics: g };
  const spec = { schema_version: '1.1', source: 'https://acme.example/', colors: { primary: '#005555', secondary: '#00C81F', accents: [], neutrals: ['#0C0C05', '#FFFFFF'] }, typography: { heading_font: 'Inter', body_font: 'Inter' } };
  for (const mode of ['onepager']) {
    const css = kitCss(spec, st, mode);
    assert.match(css, /\.bx-media\{border-radius:24px/); assert.match(css, /\.bx-panel\{[^}]*border-radius:16px/);
    const html = pageHtml({ brand_spec: spec, brand_style: st, mode, blocks: [{ type: 'panel', title: 'Investor relations', items: [{ title: '[1]', text: 'a' }, { title: '[2]', text: 'b' }], ctas: [{ text: 'More' }] }] });
    assert.match(html, /class="bx-panel/); assert.match(html, /bx-stat/); assert.ok(!/<script/i.test(html));
  }
  assert.throws(() => kitCss(spec, { ...st, graphics: { ...g, shadow: 'x' } }), /graphics/i);
});

test('highlight slide: always in the template, panel + key numbers + side card, editable, validated', async () => {
  for (const style of [undefined, { style_version: '1.1', assets: [], graphics: inferGraphics(GM) }]) {
    const t = await templateDeck({ brand_spec: SPEC, brand_style: style });
    assert.ok(t.changes.some((c) => /\[highlight\]/.test(c)), 'sample highlight slide is always generated');
    const z = await JSZip.loadAsync(Buffer.from(t.file.content_base64, 'base64'));
    const slide = (await Promise.all(Object.keys(z.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).map((n) => z.file(n).async('string')))).find((x) => /\[first figure\]/.test(x));
    assert.ok(slide && /\[0\.0%\]/.test(slide) && /Supporting point/.test(slide), 'stats and side card are real, editable text');
    const lay = (await Promise.all(Object.keys(z.files).filter((n) => /slideLayouts\/slideLayout\d+\.xml$/.test(n)).map((n) => z.file(n).async('string')))).find((x) => /name="BRAND_HIGHLIGHT"/.test(x));
    assert.ok(lay && lay.includes('prst="roundRect"'), 'rounded panel on the layout');
    assert.match(t.preview.content, /first figure/);
  }
  const bad = (x) => draftDeck({ brand_spec: SPEC, outline: { slides: [{ layout: 'highlight', title: 'x', ...x }] } });
  await assert.rejects(bad({ stats: Array(5).fill({ value: '1' }) }), /at most 4/); await assert.rejects(bad({ stats: [{ label: 'no value' }] }), /stats/);
  await assert.rejects(draftDeck({ brand_spec: SPEC, outline: { slides: [{ layout: 'content', title: 'x', stats: [{ value: '1' }] }] } }), /only for the highlight/);
  const ok = await bad({ stats: [{ value: '€ 32.14', label: 'share price' }], aside_title: 'Looking for a solid investment?', aside: ['Point'] });
  assert.ok(ok.file.content_base64);
});

test('whole decks always get a highlight slide (before the closing slide) unless one exists or it is switched off', async () => {
  const base = [{ layout: 'title', title: 'A' }, { layout: 'content', title: 'B', bullets: ['x'] }, { layout: 'closing', title: 'Bye' }];
  const r = await draftDeck({ brand_spec: SPEC, outline: { slides: base } });
  assert.deepEqual(r.changes.slice(0, 4).map((c) => /\[(\w+)\]/.exec(c)?.[1]), ['title', 'content', 'highlight', 'closing'], 'inserted before the closing slide');
  assert.ok(r.changes.some((c) => /placeholder/.test(c)) && /\[00\]/.test(r.preview.content), 'placeholder figures, never invented numbers');
  const own = await draftDeck({ brand_spec: SPEC, outline: { slides: [...base.slice(0, 2), { layout: 'highlight', title: 'Results', stats: [{ value: '€ 1', label: 'a' }] }, base[2]] } });
  assert.equal(own.changes.filter((c) => /\[highlight\]/.test(c)).length, 1, 'no second one when the outline has its own');
  const off = await draftDeck({ brand_spec: SPEC, outline: { slides: base, no_highlight: true } });
  assert.ok(!off.changes.some((c) => /\[highlight\]/.test(c)), 'opt-out');
  const added = await addSlides({ brand_spec: SPEC, deck: { filename: 't.pptx', content_base64: (await templateDeck({ brand_spec: SPEC })).file.content_base64 }, outline: { slides: [{ layout: 'highlight', title: 'Q3', stats: [{ value: '[1]' }] }] } });
  assert.ok(added.changes.some((c) => /\[highlight\]/.test(c)), 'add-slides can add highlight slides to an existing deck');
});

import { TYPES as CAT, CATALOG_TYPES, SAMPLE_OF, STORYLINES, catalogDoc, validateCatalogSlide, isCatalog } from '../lib/catalog.mjs';
import { sceneCtx, fitSize, connect } from '../lib/scene.mjs';

const BRANDS = {
  centredAiry: { spec: APPLE_SPEC, style: { style_version: '1.1', assets: [], design: { align: 'center', density: 'airy', imagery: 'image-led', heading_scale: 'display', corners: 'soft', rhythm: { pattern: 'alternating', flip_rate: 0.6, tones: ['dark', 'light', 'dark'] } } } },
  leftDense: { spec: { ...SPEC, colors: { primary: '#0B3C8C', secondary: '#F2A900', accents: ['#00A39B'], neutrals: ['#1B2430', '#F4F6FA'] } }, style: { style_version: '1.1', assets: [], design: { align: 'left', density: 'dense', imagery: 'text-led', heading_scale: 'compact', corners: 'square' } } },
  roundedCards: { spec: { ...SPEC, colors: { primary: '#117A65', secondary: '#E67E22', neutrals: ['#17202A', '#F8F9F9'] } }, style: { style_version: '1.1', assets: [], design: { align: 'left', density: 'balanced', imagery: 'balanced', heading_scale: 'standard', corners: 'pill' } } },
};

test('slide catalog: 42 types in 7 groups, every sample validates, storylines only use known slide types', () => {
  assert.equal(CATALOG_TYPES.length, 42);
  assert.equal(catalogDoc().length, 7);
  const CORE = ['title', 'section', 'content', 'two-column', 'quote', 'closing', 'statement', 'image', 'chart', 'highlight'];
  for (const n of CATALOG_TYPES) { assert.doesNotThrow(() => validateCatalogSlide(SAMPLE_OF(n), n), n); assert.ok(CAT[n].summary.length > 10, n); }
  for (const [k, st] of Object.entries(STORYLINES)) for (const l of st.slides) assert.ok(CORE.includes(l) || isCatalog(l), `${k}: ${l}`);
  assert.equal(new Set(CATALOG_TYPES).size, 42);
});

test('catalog slides: unknown fields, oversize text, wrong list sizes and bad references are refused with a clear message', () => {
  const bad = [[{ ...SAMPLE_OF('agenda'), items: ['a'] }, /3-7 items/], [{ ...SAMPLE_OF('agenda'), bogus: 1 }, /unknown field "bogus"/], [{ ...SAMPLE_OF('big-number'), value: 'x'.repeat(40) }, /up to 14/],
    [{ ...SAMPLE_OF('sla'), rows: [{ priority: 'P1', response: '1h' }, { priority: 'P2', response: '1h', resolution: '2h' }] }, /resolution: is required/], [{ ...SAMPLE_OF('options'), items: [null, null] }, /must be an object/],
    [{ ...SAMPLE_OF('risks'), rows: [{ risk: 'a', likelihood: 'Huge', mitigation: 'm' }, { risk: 'b', mitigation: 'm' }] }, /must be one of Low, Medium, High/], [{ ...SAMPLE_OF('agenda'), current: 99 }, /whole number 1-7/], [{ ...SAMPLE_OF('agenda'), tone: 'purple' }, /light, dark/]];
  for (const [s, re] of bad) assert.throws(() => validateCatalogSlide(s, 'slide'), re);
  assert.throws(() => CAT['process-flow'].build(sceneCtx(APPLE_SPEC, BRANDS.centredAiry.style), { ...SAMPLE_OF('process-flow'), links: [{ from: 'a', to: 'zzz' }] }), /unknown node id/);
  assert.throws(() => CAT.swimlane.build(sceneCtx(APPLE_SPEC, BRANDS.centredAiry.style), { ...SAMPLE_OF('swimlane'), steps: [{ lane: 'Nope', text: 'x' }, { lane: 'Customer', text: 'y' }] }), /not in lanes/);
});

test('catalog slides: every type, in three different brand styles and both tones, stays on the slide, clear of the header band, with readable text', () => {
  for (const [bn, B] of Object.entries(BRANDS)) for (const tone of ['light', 'dark']) {
    const X = sceneCtx(B.spec, B.style, tone);
    for (const n of CATALOG_TYPES) {
      const scene = CAT[n].build(X, { ...SAMPLE_OF(n), tone });
      assert.ok(scene.length > 0, `${bn}/${tone}/${n}: empty slide`);
      for (const e of scene) {
        const box = e.k === 'line' ? { x: Math.min(e.x1, e.x2), y: Math.min(e.y1, e.y2), w: Math.abs(e.x2 - e.x1), h: Math.abs(e.y2 - e.y1) } : e.k === 'table' ? { x: e.x, y: e.y, w: e.w, h: (e.rowH ?? 0.46) * e.rows.length } : e;
        const where = `${bn}/${tone}/${n} ${e.k} ${JSON.stringify(e.text ?? '').slice(0, 30)}`;
        assert.ok(box.x >= -0.01 && box.y >= X.top - 0.45 && box.x + box.w <= 13.35 && box.y + box.h <= 7.5 + 0.01, `${where} outside the slide / under the header: ${JSON.stringify([box.x, box.y, box.w, box.h].map((v) => Math.round(v * 100) / 100))}`);
        if (e.k === 'box' && e.text && e.fill && e.size) assert.ok(ctr(e.color ?? X.ink, e.fill) >= 3, `${where}: text ${e.color} on ${e.fill} is hard to read`);
        if (e.k === 'text' && !Array.isArray(e.text)) assert.ok(e.size >= 10, `${where}: text below 10pt`);
      }
    }
  }
});

test('text fitting shrinks long text instead of overflowing; connectors have one arrow at the end', () => {
  assert.ok(fitSize('x'.repeat(200), 2, 0.6, 24, { min: 8 }) < 24); assert.equal(fitSize('Short', 4, 1, 24), 24); assert.equal(fitSize('x'.repeat(5000), 1, 0.3, 24, { min: 9 }), 9);
  const segs = connect({ x: 1, y: 1, w: 2, h: 1 }, { x: 6, y: 4, w: 2, h: 1 });
  assert.equal(segs.length, 3); assert.equal(segs.filter((s) => s.arrow).length, 1); assert.ok(segs.at(-1).arrow);
});

test('catalog slides in a real deck: native shapes and tables, the brand theme, the catalog layout, all editable', async () => {
  const slides = ['agenda', 'process-flow', 'swimlane', 'sla', 'raci', 'pricing', 'architecture', 'timeline', 'team', 'testimonial'].map(SAMPLE_OF);
  const d = await draftDeck({ brand_spec: APPLE_SPEC, brand_style: BRANDS.centredAiry.style, outline: { slides, no_highlight: true } });
  const z = await JSZip.loadAsync(Buffer.from(d.file.content_base64, 'base64'));
  const all = (await Promise.all(Object.keys(z.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).map((n) => z.file(n).async('string')))).join('');
  assert.match(all, /<a:tbl>/, 'real PowerPoint tables'); assert.match(all, /prst="diamond"/); assert.match(all, /prst="line"/); assert.match(all, /tailEnd/, 'connector arrows'); assert.match(all, /prst="roundRect"/);
  assert.match(all, /<a:t>Incident raised<\/a:t>/); assert.match(all, /<a:t>P1 Critical<\/a:t>/, 'text is real text, not an image');
  const layouts = (await Promise.all(Object.keys(z.files).filter((n) => /slideLayout\d+\.xml$/.test(n)).map((n) => z.file(n).async('string')))).join('');
  assert.match(layouts, /name="BRAND_CATALOG"/); assert.match(layouts, /name="BRAND_CATALOG_ALT"/);
  assert.match(d.preview.content, /Incident raised/); assert.ok(!/<script/i.test(d.preview.content));
  await assert.rejects(draftDeck({ brand_spec: APPLE_SPEC, outline: { slides: [{ layout: 'sla', title: 'x', rows: [] }] } }), /2-6 items/);
  await assert.rejects(draftDeck({ brand_spec: APPLE_SPEC, outline: { slides: [{ layout: 'team', title: 'x', people: [{ name: 'a', image: 'nope-1' }, { name: 'b' }] }] } }), /not a PNG\/JPG brand asset/);
});

test('add-slides accepts catalog slide types and keeps the rhythm', async () => {
  const t = await templateDeck({ brand_spec: APPLE_SPEC, brand_style: BRANDS.centredAiry.style });
  const a = await addSlides({ brand_spec: APPLE_SPEC, brand_style: BRANDS.centredAiry.style, deck: { filename: 't.pptx', content_base64: t.file.content_base64 }, outline: { slides: [SAMPLE_OF('sla'), SAMPLE_OF('raci')] } });
  const z = await JSZip.loadAsync(Buffer.from(a.file.content_base64, 'base64'));
  const n = Object.keys(z.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f)).length;
  assert.ok((await z.file(`ppt/slides/slide${n}.xml`).async('string')).includes('<a:tbl>'));
  const l1 = (await z.file(`ppt/slides/_rels/slide${n - 1}.xml.rels`).async('string')).match(/slideLayout\d+\.xml/)[0], l2 = (await z.file(`ppt/slides/_rels/slide${n}.xml.rels`).async('string')).match(/slideLayout\d+\.xml/)[0];
  assert.notEqual(l1, l2, 'consecutive new slides alternate on an alternating site');
});
