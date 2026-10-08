// Sample brand with no inputs, so anyone can see the whole workflow work (and so the agent can self-test).
import zlib from 'node:zlib';
import { buildSpec } from './extract.mjs';
import { buildAssets, styleDoc } from './style.mjs';
import { extractFromUrl } from './extract.mjs';

function crc(buf) { let x = 0xffffffff; for (const v of buf) { let c = (x ^ v) & 255; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; x = c ^ (x >>> 8); } return (x ^ 0xffffffff) >>> 0; }
export function png(w, h, pixel) {
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
  const raw = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) { const o = y * (1 + w * 3); for (let x = 0; x < w; x++) { const [r, g, b] = pixel(x / (w - 1), y / (h - 1)); raw[o + 1 + x * 3] = r; raw[o + 2 + x * 3] = g; raw[o + 3 + x * 3] = b; } }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

export const DEMO_GUIDE = `Northwind Traders brand guide
Primary: #0B3C8C
Secondary: #F2A900
Accent: #00A39B
Heading font: Gotham
Body font: Calibri
h1 { text-transform: uppercase; letter-spacing: 2px; font-weight: 700 }
.surface { background: #F4F6FA } .ink { color: #1B2430 }`;

export function demoBrand() {
  const spec = buildSpec({ source: 'Northwind Traders', text: DEMO_GUIDE });
  const hero = png(1280, 720, (u, v) => [Math.round(11 + 40 * u), Math.round(60 + 70 * (1 - v)), Math.round(140 + 60 * u)]);
  const logo = png(360, 120, (u) => (u > 0.08 && u < 0.92 ? [255, 255, 255] : [11, 60, 140]));
  const art = png(300, 300, (u, v) => ((Math.floor(u * 6) + Math.floor(v * 6)) % 2 ? [242, 169, 0] : [0, 163, 155]));
  const notes = [];
  const assets = buildAssets([{ buf: logo, source: 'demo/logo.png', name: 'logo.png' }, { buf: hero, source: 'demo/hero-banner.png', name: 'hero-banner.png' }, { buf: art, source: 'demo/pattern-illustration.png', name: 'pattern-illustration.png' }], notes);
  const { style } = styleDoc({ assets, text: { heading: { case: 'upper', letter_spacing: 1.5, weight: 700 }, prov: { 'text.heading.case': 'css' } } });
  style.backgrounds = { title: 'hero-1', closing: 'hero-1', overlay_opacity: 0.6 };   // chosen, as a user would; PNGs are never picked automatically
  style.placements = [{ asset: 'illustration-1', layout: 'section', position: 'corner-br' }];
  return { spec, style };
}

export const DEMO_URL = 'https://www.apple.com';
const nameOf = (url) => { try { const h = new URL(url).hostname.replace(/^www\./, '').split('.')[0]; return h.charAt(0).toUpperCase() + h.slice(1); } catch { return 'Customer'; } };

/** Live demo brand: really extracts the website. Falls back to the made-up sample (flagged) when the site can't be read. */
export async function demoBrandLive(url = DEMO_URL, { extract = extractFromUrl } = {}) {
  try {
    const r = await extract(url);
    if (!r?.brand_spec) throw new Error('no brand');
    return { spec: r.brand_spec, style: r.brand_style ?? { style_version: '1.1', assets: [] }, live: true, name: nameOf(url), url, notes: r.notes ?? [], screenshot: r.hero_screenshot_png_base64 ?? null };
  } catch (e) {
    return { ...demoBrand(), live: false, name: 'Northwind Traders', url: null, notes: [`Could not read ${url} (${String(e.message).slice(0, 80)}), so the made-up sample customer is used instead.`], screenshot: null };
  }
}

/** Demo content that uses the brand's own best pictures; text is placeholder, never invented claims. */
export function demoContent(style, name) {
  const photos = (style?.assets ?? []).filter((a) => a.mime === 'image/jpeg' && a.role !== 'logo' && (a.bytes ?? a.content_base64.length * 0.75) > 25_000).sort((a, b) => b.width * b.height - a.width * a.height);
  const any = (style?.assets ?? []).filter((a) => /^image\/(png|jpeg)$/.test(a.mime) && a.role !== 'logo');
  const hero = photos[0] ?? any[0], second = photos[1] ?? photos[0] ?? any[1] ?? hero;
  const slides = [
    { layout: 'title', title: `[Proposal title] for ${name}`, subtitle: '[Prepared by your team]' },
    { layout: 'statement', title: '[One clear message, said big.]', subtitle: '[A short line that supports it]' },
    ...(hero ? [{ layout: 'image', title: '[A headline for a picture]', subtitle: '[One supporting line]', image: hero.id }] : []),
    { layout: 'statement', title: '[A second message.]' },
    { layout: 'chart', title: '[A chart states its point in the headline]', subtitle: '[One line on what to notice]', chart: { type: 'column', labels: ['Q1', 'Q2', 'Q3', 'Q4'], series: [{ name: 'Sample', values: [12, 18, 24, 31] }], highlight: 'Q4', sample: true } },
    { layout: 'content', title: '[Why this matters]', bullets: ['[Point one]', '[Point two]', '[Point three]'] },
    ...(second ? [{ layout: 'image', title: '[Another picture slide]', image: second.id }] : []),
    { layout: 'closing', title: '[Thank you]', subtitle: '[Contact details]' },
  ];
  const blocks = [
    { type: 'nav', brand: name, links: [{ text: 'Platform', href: '#platform' }, { text: 'Solutions', href: '#solutions' }, { text: 'Pricing', href: '#pricing' }, { text: 'Support', href: '#support' }], cta: { text: 'Contact us', href: '#contact' } },
    { type: 'hero', title: '[A headline in their style]', subtitle: '[One supporting line]', ctas: [{ text: 'Learn more', href: '#platform' }, { text: 'Get in touch', href: '#contact' }], ...(hero && { image: hero.id }) },
    { type: 'statement', title: '[One clear message, said big.]' },
    { type: 'feature', id: 'platform', title: '[A feature, in two lines]', text: '[Two sentences about the benefit.]', ...(second && { image: second.id }), ctas: [{ text: '[See how it works]', href: '#' }] },
    { type: 'cards', title: '[Why teams choose us]', items: [{ title: '[Benefit one]', text: '[Short text]' }, { title: '[Benefit two]', text: '[Short text]' }, { title: '[Benefit three]', text: '[Short text]' }] },
    { type: 'chart', title: '[A chart states its point in the headline]', subtitle: '[One line on what to notice]', chart: { type: 'column', labels: ['Q1', 'Q2', 'Q3', 'Q4'], series: [{ name: 'Sample', values: [12, 18, 24, 31] }], highlight: 'Q4', sample: true } },
    { type: 'cta', id: 'contact', title: '[Ready to talk?]', ctas: [{ text: 'Contact us', href: '#contact' }] },
    { type: 'footer', columns: [{ title: 'Company', links: [{ text: 'About', href: '#' }, { text: 'Careers', href: '#' }] }, { title: 'Support', links: [{ text: 'Help', href: '#' }, { text: 'Contact', href: '#' }] }], legal: `[Legal line]. Demo built from ${name}'s public website look.` },
  ];
  return { slides, blocks };
}
