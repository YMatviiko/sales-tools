// Post-processor that applies BrandStyle (heading text style, image backgrounds, placed imagery) to a PPTX zip.
// Works on decks this plugin generated (layouts named BRAND_*) and on a user's own deck (layouts matched by
// OOXML layout type). Edits layout/master XML only, so slides inherit it and the file stays editable.
import { httpError } from './safeurl.mjs';
import { isRaster } from './style.mjs';
import { lightness } from './color.mjs';
import { slidePalette } from './palette.mjs';

const EMU = 914400, W_IN = 13.333, H_IN = 7.5;
const MEDIA_CT = { png: 'image/png', jpeg: 'image/jpeg' };
export const POSITIONS = {
  right: { x: 8.7, y: 0.9, w: 4.1, h: 5.7 }, left: { x: 0.5, y: 0.9, w: 4.1, h: 5.7 },
  'corner-br': { x: 10.7, y: 5.2, w: 2.3, h: 2.0 }, 'corner-bl': { x: 0.4, y: 5.2, w: 2.3, h: 2.0 },
  'corner-tr': { x: 10.9, y: 0.3, w: 2.1, h: 1.0 }, 'band-bottom': { x: 0, y: 6.4, w: W_IN, h: 1.1, cover: true },
};
export const PLACEMENT_LAYOUTS = ['title', 'section', 'content', 'two-column', 'quote', 'closing', 'statement', 'image', 'chart', 'highlight'];
const OOXML_TYPE = { title: ['title'], section: ['secHead'], content: ['obj', 'tx'], 'two-column': ['twoObj', 'twoTxTwoObj'], quote: [], closing: [], statement: [], highlight: [], image: ['picTx', 'objTx'], chart: ['chart', 'objAndTx'] };

const emu = (inch) => Math.round(inch * EMU);
const setAttr = (tag, name, val) => {
  const t = tag.replace(new RegExp(`\\s${name}="[^"]*"`), '');
  return val === null ? t : t.replace(/\s*(\/?)>$/, (_, s) => ` ${name}="${val}"${s}>`);
};

// ---------- text ----------
function headingAttrs(tag, h) {
  let t = tag;
  if (h.weight !== undefined) t = setAttr(t, 'b', h.weight >= 600 ? '1' : '0');
  if (h.case !== undefined) t = setAttr(t, 'cap', h.case === 'upper' ? 'all' : 'none');
  if (h.letter_spacing !== undefined) t = setAttr(t, 'spc', String(Math.round(h.letter_spacing * 100)));
  return t;
}
const isTitlePh = (sp) => /<p:ph\b[^>]*\btype="(title|ctrTitle)"/.test(sp);
function patchHeadingXml(xml, h, { titleStyle }) {
  let out = xml.replace(/<p:sp>[\s\S]*?<\/p:sp>/g, (sp) => (isTitlePh(sp) ? sp.replace(/<a:(defRPr|rPr)\b[^>]*>/g, (t) => headingAttrs(t, h)) : sp));
  if (titleStyle) out = out.replace(/<p:titleStyle>[\s\S]*?<\/p:titleStyle>/, (b) => b.replace(/<a:defRPr\b[^>]*>/g, (t) => headingAttrs(t, h)));
  return out;
}

// ---------- package helpers ----------
const relsPath = (part) => part.replace(/([^/]+)$/, '_rels/$1.rels');
async function addMedia(zip, asset, cache) {
  if (cache.has(asset.id)) return cache.get(asset.id);
  const ext = asset.mime === 'image/png' ? 'png' : 'jpeg';
  const name = `brand-${asset.id}.${ext}`;
  zip.file(`ppt/media/${name}`, Buffer.from(asset.content_base64, 'base64'));
  cache.set(asset.id, name);
  let ct = await zip.file('[Content_Types].xml').async('string');
  if (!new RegExp(`<Default[^>]+Extension="${ext}"`, 'i').test(ct)) { ct = ct.replace(/(<Types[^>]*>)/, `$1<Default Extension="${ext}" ContentType="${MEDIA_CT[ext]}"/>`); zip.file('[Content_Types].xml', ct); }
  return name;
}
async function addRel(zip, part, mediaName) {
  const p = relsPath(part);
  const rels = zip.file(p) ? await zip.file(p).async('string') : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
  const id = 'rId' + (Math.max(0, ...[...rels.matchAll(/Id="rId(\d+)"/g)].map((m) => +m[1])) + 1);
  zip.file(p, rels.replace('</Relationships>', `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${mediaName}"/></Relationships>`));
  return id;
}
const coverCrop = (a, boxW, boxH) => {
  const ar = a.width / a.height, br = boxW / boxH;
  if (Math.abs(ar - br) < 0.01) return '<a:srcRect/>';
  if (ar > br) { const c = Math.round(((1 - br / ar) / 2) * 100000); return `<a:srcRect l="${c}" r="${c}"/>`; }
  const c = Math.round(((1 - ar / br) / 2) * 100000); return `<a:srcRect t="${c}" b="${c}"/>`;
};
const nextId = (xml) => Math.max(1, ...[...xml.matchAll(/<p:cNvPr id="(\d+)"/g)].map((m) => +m[1])) + 1;
const afterGrp = (xml, shape) => (/<\/p:grpSpPr>/.test(xml) ? xml.replace(/<\/p:grpSpPr>/, `</p:grpSpPr>${shape}`) : xml.replace(/<p:grpSpPr\s*\/>/, `<p:grpSpPr/>${shape}`));
const dim = (xml) => { const m = xml.match(/<p:sldSz cx="(\d+)" cy="(\d+)"/); return m ? [+m[1] / EMU, +m[2] / EMU] : [W_IN, H_IN]; };

function overlayShape(id, wIn, hIn, hex, opacity) {
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Brand overlay"/><p:cNvSpPr/><p:nvPr userDrawn="1"/></p:nvSpPr><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${emu(wIn)}" cy="${emu(hIn)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="${hex.slice(1)}"><a:alpha val="${Math.round(opacity * 100000)}"/></a:srgbClr></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr></p:sp>`;
}
function picShape(id, rid, a, box, [sw, sh]) {
  const sx = sw / W_IN, sy = sh / H_IN;
  let { x, y, w, h } = box; x *= sx; w *= sx; y *= sy; h *= sy;
  let crop = '<a:srcRect/>';
  if (box.cover) crop = coverCrop(a, w, h);
  else { const ar = a.width / a.height; let nw = w, nh = w / ar; if (nh > h) { nh = h; nw = h * ar; } x += (w - nw) / 2; y += (h - nh) / 2; w = nw; h = nh; }
  return `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="Brand image ${a.id}" descr="${a.id}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr userDrawn="1"/></p:nvPicPr><p:blipFill><a:blip r:embed="${rid}"/>${crop}<a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="${emu(x)}" y="${emu(y)}"/><a:ext cx="${emu(w)}" cy="${emu(h)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;
}
const DARK_MAP = '<p:clrMapOvr><a:overrideClrMapping bg1="dk1" tx1="lt1" bg2="dk2" tx2="lt2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/></p:clrMapOvr>';

// ---------- main ----------
// opts.generated: layouts are BRAND_* (explicit text colours already match the overlay colour).
// opts.parts: which of 'text' | 'backgrounds' | 'placements' to apply.
export async function applyPptxStyle(zip, { spec, style, generated = false, parts = ['text', 'backgrounds', 'placements'] }) {
  const report = [];
  if (!style) return report;
  const assets = new Map((style.assets ?? []).map((a) => [a.id, a])), cache = new Map();
  const names = Object.keys(zip.files);
  const size = dim(await zip.file('ppt/presentation.xml').async('string'));
  const layouts = [];
  for (const n of names.filter((x) => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(x)))
    { const xml = await zip.file(n).async('string'); layouts.push({ part: n, xml, name: xml.match(/<p:cSld name="([^"]*)"/)?.[1] ?? '', type: xml.match(/<p:sldLayout\b[^>]*\btype="([^"]+)"/)?.[1] }); }
  const find = (key) => layouts.filter((l) => (generated ? l.name === 'BRAND_' + key.toUpperCase().replace('-', '_') : OOXML_TYPE[key]?.includes(l.type)));

  const SP = slidePalette(spec);
  const baseFor = (key) => (key === 'section' ? SP.sectionBg : SP.titleBg);

  if (parts.includes('text') && style.text?.heading) {
    const h = style.text.heading;
    for (const n of names.filter((x) => /^ppt\/(slides|slideLayouts|slideMasters)\/[^/]+\.xml$/.test(x))) {
      const xml = n.includes('/slideLayouts/') ? layouts.find((l) => l.part === n).xml : await zip.file(n).async('string');
      const out = patchHeadingXml(xml, h, { titleStyle: n.includes('/slideMasters/') });
      if (out !== xml) { zip.file(n, out); const l = layouts.find((x) => x.part === n); if (l) l.xml = out; }
    }
    report.push(`heading text style: ${Object.entries(h).map(([k, v]) => `${k}=${v}`).join(', ')}`);
  }

  if (parts.includes('backgrounds')) {
    for (const key of ['title', 'section', 'closing']) {
      const id = style.backgrounds?.[key]; if (!id) continue;
      const a = assets.get(id);
      if (!a || !isRaster(a)) throw httpError(400, `backgrounds.${key}: asset ${id} must be a png/jpg.`);
      const targets = find(key);
      if (!targets.length) { report.push(`background ${key}: no matching layout in this deck — skipped`); continue; }
      const op = style.backgrounds.overlay_opacity ?? 0.6, base = baseFor(key);
      for (const l of targets) {
        const rid = await addRel(zip, l.part, await addMedia(zip, a, cache));
        const bg = `<p:bg><p:bgPr><a:blipFill dpi="0" rotWithShape="1"><a:blip r:embed="${rid}"/>${coverCrop(a, size[0], size[1])}<a:stretch><a:fillRect/></a:stretch></a:blipFill><a:effectLst/></p:bgPr></p:bg>`;
        let x = l.xml;
        x = /<p:bg>[\s\S]*?<\/p:bg>/.test(x) ? x.replace(/<p:bg>[\s\S]*?<\/p:bg>/, bg) : x.replace(/(<p:cSld\b[^>]*>)/, `$1${bg}`);
        x = x.replace(/<p:sp><p:nvSpPr><p:cNvPr id="\d+" name="Brand overlay"\/>[\s\S]*?<\/p:sp>/, '');
        x = afterGrp(x, overlayShape(nextId(x), size[0], size[1], base, op));
        if (!generated && lightness(base) <= 0.55) x = x.replace(/<p:clrMapOvr>[\s\S]*?<\/p:clrMapOvr>/, DARK_MAP);
        zip.file(l.part, x); l.xml = x;
      }
      report.push(`background ${key}: ${id} with ${Math.round(op * 100)}% ${base} overlay on ${targets.length} layout(s)`);
    }
  }

  if (parts.includes('placements')) {
    for (const p of style.placements ?? []) {
      const a = assets.get(p.asset), box = POSITIONS[p.position];
      if (!a || !box || !PLACEMENT_LAYOUTS.includes(p.layout)) throw httpError(400, `placement ${JSON.stringify(p)} is invalid.`);
      if (!isRaster(a)) throw httpError(400, `placement: asset ${a.id} must be a png/jpg for PowerPoint.`);
      const targets = find(p.layout);
      if (!targets.length) { report.push(`placement ${p.asset} on ${p.layout}: no matching layout in this deck — skipped`); continue; }
      for (const l of targets) {
        const rid = await addRel(zip, l.part, await addMedia(zip, a, cache));
        const x = l.xml.replace('</p:spTree>', picShape(nextId(l.xml), rid, a, box, size) + '</p:spTree>');
        zip.file(l.part, x); l.xml = x;
      }
      report.push(`placed ${p.asset} (${p.position}) on ${p.layout} layout`);
    }
  }
  return report;
}
