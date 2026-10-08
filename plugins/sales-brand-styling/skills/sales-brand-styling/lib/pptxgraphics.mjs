// Applies the customer's graphics language (rounded corners, gradients, tiled patterns) to a generated PowerPoint package.
// pptxgenjs cannot draw rounded rectangles, gradient or pattern fills on master shapes, so the layout model marks each such shape
// by position, and this post-processor rewrites those shapes' geometry and fill in the layout XML.
// Pictures get rounded the same way: the picture placeholder on the layout (so a picture the user adds inherits it) and any
// picture already on a slide.

const hex = (c) => c.slice(1).toUpperCase();
const ok = (c) => /^#[0-9A-Fa-f]{6}$/.test(c ?? '');
const EMU = 914400;
const RECT = /<a:prstGeom prst="rect">\s*<a:avLst>\s*<\/a:avLst>\s*<\/a:prstGeom>|<a:prstGeom prst="rect">\s*<a:avLst\s*\/>\s*<\/a:prstGeom>|<a:prstGeom prst="rect"\s*\/>/;
const geom = (rIn, wEmu, hEmu) => {
  const adj = Math.max(0, Math.min(50000, Math.round((rIn * EMU * 100000) / Math.min(wEmu, hEmu))));
  return `<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val ${adj}"/></a:avLst></a:prstGeom>`;
};

/** Rewrite the geometry / fill of the decorative rectangles of one layout. `objects` is the layout model's list, in drawing order:
 *  pptxgenjs names the rectangles "Shape 0", "Shape 1", ... in that order. */
function patchLayout(xml, objects) {
  let n = 0;
  const out = xml.replace(/<p:sp>(?:(?!<\/p:sp>)[\s\S])*?<\/p:sp>/g, (sp) => {
    const i = /<p:cNvPr[^>]*\bname="Shape (\d+)"/.exec(sp)?.[1];
    const o = i === undefined ? null : objects[+i];
    if (!o || (!(o.r > 0) && !o.grad && !o.patt)) return sp;
    let y = sp;
    const ext = /<a:ext cx="(\d+)" cy="(\d+)"/.exec(sp);
    if (o.r > 0 && ext) y = y.replace(RECT, geom(o.r, +ext[1], +ext[2]));
    const fillRe = /(<\/a:prstGeom>)\s*<a:solidFill>[\s\S]*?<\/a:solidFill>/;
    if (o.grad && ok(o.grad.from) && ok(o.grad.to)) y = y.replace(fillRe, `$1<a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:srgbClr val="${hex(o.grad.from)}"/></a:gs><a:gs pos="100000"><a:srgbClr val="${hex(o.grad.to)}"/></a:gs></a:gsLst><a:lin ang="${(((o.grad.angle ?? 180) + 270) % 360) * 60000}" scaled="0"/></a:gradFill>`);
    else if (o.patt && ok(o.patt.fg) && ok(o.patt.bg)) y = y.replace(fillRe, `$1<a:pattFill prst="dotGrid"><a:fgClr><a:srgbClr val="${hex(o.patt.fg)}"/></a:fgClr><a:bgClr><a:srgbClr val="${hex(o.patt.bg)}"/></a:bgClr></a:pattFill>`);
    if (y !== sp) n++;
    return y;
  });
  return { xml: out, n };
}

export async function applyGraphics(zip, { style, L }) {
  const report = [], names = Object.keys(zip.files);
  let shapes = 0;
  for (const n of names.filter((x) => /^ppt\/slideLayouts\/[^/]+\.xml$/.test(x))) {
    const x = await zip.file(n).async('string'), name = /<p:cSld name="([^"]*)"/.exec(x)?.[1] ?? '';
    const m = /^BRAND_([A-Z_]+?)(_ALT)?$/.exec(name); if (!m) continue;
    const key = m[1].toLowerCase().replace('_', '-'), model = L[m[2] ? `${key}:alt` : key];
    if (!model?.objects?.length) continue;
    const r = patchLayout(x, model.objects);
    if (r.xml !== x) { zip.file(n, r.xml); shapes += r.n; }
  }
  const G = style?.graphics, mediaR = L?.image?.pic?.r ?? 0;
  if (mediaR > 0) {
    // Rounded pictures: the picture placeholder on the layout, and pictures already placed on slides (not logos / background art).
    let pics = 0;
    for (const n of names.filter((x) => /^ppt\/slideLayouts\/[^/]+\.xml$/.test(x))) {
      let x = await zip.file(n).async('string');
      const y = x.replace(/(<p:sp>(?:(?!<\/p:sp>)[\s\S])*?<p:ph\b[^>]*type="pic"[^>]*\/>(?:(?!<\/p:sp>)[\s\S])*?<a:xfrm>[\s\S]*?<\/a:xfrm>)(<a:prstGeom[\s\S]*?<\/a:prstGeom>)?/g, (m, head) => { const e = /<a:ext cx="(\d+)" cy="(\d+)"/.exec(head); return e ? head + geom(mediaR, +e[1], +e[2]) : m; });
      if (y !== x) { zip.file(n, y); pics++; }
    }
    for (const n of names.filter((x) => /^ppt\/slides\/slide\d+\.xml$/.test(x))) {
      let x = await zip.file(n).async('string');
      const y = x.replace(/<p:pic>[\s\S]*?<\/p:pic>/g, (pic) => { const e = /<a:ext cx="(\d+)" cy="(\d+)"/.exec(pic); if (!e || +e[1] < EMU * 2 || +e[2] < EMU * 2) return pic; return pic.replace(/<a:prstGeom prst="rect">\s*<a:avLst\s*\/>\s*<\/a:prstGeom>|<a:prstGeom prst="rect"\s*\/>/, geom(mediaR, +e[1], +e[2])); });
      if (y !== x) { zip.file(n, y); pics++; }
    }
    if (pics) report.push(`rounded pictures (${G?.corners?.media}px like their site) on ${pics} part(s)`);
  }
  if (shapes) report.push(`graphics: ${shapes} shape(s) with rounded corners / gradient / pattern, as on their site`);
  return report;
}
