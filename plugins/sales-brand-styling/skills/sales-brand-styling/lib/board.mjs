// Brand board: one self-contained page a non-designer can read in a minute — real-looking sample slides first,
// then colours / fonts / images / text style as things to look at, each with a reference (C1, F1, I1, …) they can
// answer in chat. All customer-derived strings are escaped; images are validated data: URIs; the page runs no script.
import { requireBrandSpec } from './brandspec.mjs';
import { requireStyle, isRaster, dataUri } from './style.mjs';
import { fontStackFor, googleImportCss } from './fonts.mjs';
import { embeddedFontFaces } from './fontfiles.mjs';
import { contrast, bestInk, lightness } from './color.mjs';
import { slidePalette } from './palette.mjs';
import { slideHtml, pickImage } from './layouts.mjs';
import { withDefaults, designWords, rhythmWords } from './design.mjs';
import { graphicsWords } from './graphics.mjs';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const AA = 4.5;
const SOURCE_LABEL = { explicit: 'Read from their style guide', css: 'Read from their website styles', computed: 'Measured on their live page', screenshot: 'Covers a large part of their page', histogram: 'Most-used colour in their files', heuristic: 'A guess' };
const FONT_STATUS = {
  google: ['ok', 'Free font, OK to use'], system: ['ok', 'Comes with Windows/Office, OK to use'], 'user-licensed': ['ok', 'Their own font, available to you'],
  substituted: ['info', 'Their font is licensed, so we use the closest free one'], default: ['info', 'No font found, neutral font used'],
};
const ROLE_LABEL = { logo: 'Logo', hero: 'Large banner image', illustration: 'Illustration or graphic', photo: 'Photo' };
const LAYOUT_LABEL = { title: 'title', section: 'section divider', content: 'content', 'two-column': 'two-column', quote: 'quote', closing: 'closing' };

function niceSource(spec) {
  const s = String(spec.source ?? '');
  let n; try { n = new URL(s).hostname.replace(/^www\./, ''); } catch { n = (s.split(/[\\/]/).filter(Boolean).pop() || '').replace(/\.[a-z0-9]{1,5}$/i, ''); }
  n = n.replace(/([-_ ]*(brand|style|guide|assets|styleguide))+$/i, '').replace(/[-_]+/g, ' ').trim();
  return n || 'Customer';
}
const shortSource = (s) => { try { const u = new URL(s); return u.hostname + u.pathname.replace(/(.{28}).+/, '$1…'); } catch { return String(s ?? '').split(/[\\/]/).filter(Boolean).slice(-2).join('/'); } };

const palette = slidePalette;
const rgba = (hex, a) => `rgba(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(',')},${a})`;

// ---------- sample slides (same layout definitions as the PowerPoint masters: lib/layouts.mjs) ----------
function slides(spec, style) {
  const stacks = { head: fontStackFor(spec, 'heading'), body: fontStackFor(spec, 'body') }, h = style?.text?.heading ?? {}, D = withDefaults(style?.design);
  const headingStyle = `${h.case === 'upper' ? 'text-transform:uppercase;' : ''}${h.letter_spacing !== undefined ? `letter-spacing:${h.letter_spacing}pt;` : ''}${h.weight === 400 ? 'font-weight:400;' : ''}`;
  const show = (layout, cap, c) => `<figure>${slideHtml(layout, c, { spec, style, stacks, headingStyle })}<figcaption>${cap}</figcaption></figure>`;
  const name = niceSource(spec), out = [
    show('title', 'Title slide', { title: 'Presentation title', subtitle: `Prepared for ${name}` }),
    show('content', 'Content slide', { title: 'Slide heading', bullets: ['First point goes here', 'Second point, a little longer than the first', 'Third point'] }),
  ];
  if (pickImage(style) && (D.imagery !== 'text-led')) out.push(show('image', 'Picture slide', { title: 'A headline for a picture', subtitle: 'One short supporting line' }));
  if (D.density === 'airy' || D.heading_scale === 'display') out.push(show('statement', 'Statement slide', { title: 'One clear message, said big.', subtitle: 'A short line that supports it' }));
  else out.push(show('section', 'Section slide', { title: 'Section divider' }));
  return out.join('');
}

// ---------- findings ----------
function attention(spec, style, shot) {
  const L = [], prov = spec.provenance ?? {}, fr = spec.typography.font_resolution ?? {};
  if (!['explicit', 'css', 'computed', 'screenshot'].includes(prov['colors.primary'])) L.push(['C1', 'The main colour was worked out from how often colours appear, so it may be wrong.']);
  const P = palette(spec);
  for (const [i, [name, c]] of [['main', spec.colors.primary], ['second', spec.colors.secondary]].entries()) if (c && contrast(c, bestInk(c)) < AA) L.push([`C${i + 1}`, `Text on the ${name} colour will be hard to read.`]);
  void P;
  if ((style?.assets ?? []).length) L.push(['I1', 'Check that every image really belongs to this customer.']);
  else L.push(['I1', 'No logo or images were found. Slides will use colours and fonts only.']);
  void shot;
  return L;
}

// ---------- page ----------
const CSS = `
:root{--bg:#F2F4F7;--surface:#FFFFFF;--fg:#1B1F27;--muted:#5A6472;--line:#D9DEE6;--accent:#2F5D8A;--ok:#1F7A4D;--ok-bg:#E3F3EA;--warn:#8A5200;--warn-bg:#FCEFD6;--bad:#B3261E;--bad-bg:#FBE4E2;--chip:#E8ECF2;--checker:#E9EDF3}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#0F1319;--surface:#171C24;--fg:#E6E9EF;--muted:#9AA5B4;--line:#2A323E;--accent:#7FB0E0;--ok:#5CC58D;--ok-bg:#12301F;--warn:#F0B45A;--warn-bg:#3A2A0B;--bad:#FF8A80;--bad-bg:#3D1714;--chip:#222A35;--checker:#202733;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#0F1319;--surface:#171C24;--fg:#E6E9EF;--muted:#9AA5B4;--line:#2A323E;--accent:#7FB0E0;--ok:#5CC58D;--ok-bg:#12301F;--warn:#F0B45A;--warn-bg:#3A2A0B;--bad:#FF8A80;--bad-bg:#3D1714;--chip:#222A35;--checker:#202733;color-scheme:dark}
body{background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
.board{max-width:68rem;margin-inline:auto;padding-inline:1rem;padding-block:1.5rem 3rem;display:grid;gap:2rem}
.board *{box-sizing:border-box}
.board h1{font-size:1.6rem;line-height:1.2;margin:0;text-wrap:balance}
.board h2{font-size:1.05rem;margin:0 0 .25rem;text-wrap:balance}
.board p{margin:0}.muted{color:var(--muted)}
.lede{max-width:62ch;margin-top:.5rem}
.sec{display:grid;gap:.9rem}.sec>header p{max-width:62ch}
.check{background:var(--surface);border:1px solid var(--line);border-radius:6px;padding:1rem 1.1rem;display:grid;gap:.6rem}
.check ol{margin:0;padding:0;list-style:none;display:grid;gap:.4rem}
.check li{display:flex;gap:.6rem;align-items:baseline}
.check a{color:var(--accent);font-weight:600;text-decoration:none;min-width:2.2rem}
.check a:focus-visible,.board a:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.ref{font:600 .75rem/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.04em;color:var(--muted);background:var(--chip);padding:.25rem .4rem;border-radius:3px}
.slides{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,20rem),1fr));gap:1rem}
figure{margin:0;min-width:0}figcaption{margin-top:.4rem;font-size:.8rem;color:var(--muted)}
.s{position:relative;container-type:inline-size;aspect-ratio:16/9;overflow:hidden;border-radius:4px;box-shadow:0 1px 3px rgba(0,0,0,.25)}
.swatches{display:grid;grid-template-columns:repeat(auto-fill,minmax(10.5rem,1fr));gap:.8rem}
.card{background:var(--surface);border:1px solid var(--line);border-radius:6px;overflow:hidden;min-width:0;display:grid;align-content:start}
.sw{height:5.5rem;display:grid;place-items:center;font:700 1.6rem/1 system-ui,sans-serif}
.cbody{padding:.7rem .8rem;display:grid;gap:.35rem;min-width:0}
.cbody strong{font-size:.95rem}.cbody code{font:.8rem ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--muted)}
.row{display:flex;gap:.5rem;align-items:center;flex-wrap:wrap}.cbody>.row:first-child{flex-wrap:nowrap}
.pill{display:inline-block;font-size:.75rem;font-weight:600;padding:.2rem .5rem;border-radius:99px}
.pill.ok{background:var(--ok-bg);color:var(--ok)}.pill.warn{background:var(--warn-bg);color:var(--warn)}.pill.bad{background:var(--bad-bg);color:var(--bad)}.pill.info{background:var(--chip);color:var(--muted)}
.fonts{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,22rem),1fr));gap:1rem}
.spec{padding:1rem 1.1rem;display:grid;gap:.4rem;min-width:0}
.spec .big{font-size:2rem;line-height:1.15;overflow-wrap:anywhere}.spec .small{font-size:1rem;overflow-wrap:anywhere}
.arrow{display:flex;gap:.5rem;align-items:baseline;flex-wrap:wrap;font-weight:600}
.imgs{display:grid;grid-template-columns:repeat(auto-fill,minmax(12rem,1fr));gap:.8rem}
.thumb{height:8rem;overflow:hidden;background:var(--checker);display:grid;place-items:center}
.thumb img{max-width:100%;max-height:8rem;object-fit:contain}
.site{display:grid;gap:.5rem}.site img{width:100%;border:1px solid var(--line);border-radius:4px;display:block}
.how{background:var(--surface);border:1px solid var(--line);border-radius:6px;padding:1rem 1.1rem;display:grid;gap:.5rem}
.how ul{margin:0;padding:0;list-style:none;display:grid;gap:.35rem}
.how li{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.85rem;background:var(--chip);padding:.4rem .6rem;border-radius:4px;overflow-wrap:anywhere}
.foot{font-size:.8rem;color:var(--muted);max-width:62ch}
@media (max-width:30rem){.board{gap:1.5rem}.sw{height:4.5rem}}
`;

export async function boardHtml({ brand_spec: spec, brand_style: style, site_screenshot_base64: shot, artifact = false, fonts = 'embed' }) {
  requireBrandSpec(spec); requireStyle(style);
  let fontCss = '';
  if (fonts === 'embed') { try { fontCss = await embeddedFontFaces(spec); } catch { fontCss = googleImportCss(spec); } }
  else if (fonts === 'google-import') fontCss = googleImportCss(spec);

  const prov = spec.provenance ?? {}, fr = spec.typography.font_resolution ?? {}, assets = style?.assets ?? [];
  const todo = attention(spec, style, shot), design = style?.design ? withDefaults(style.design) : null;

  // colours
  const cols = [['Main colour', spec.colors.primary, prov['colors.primary']], ...(spec.colors.secondary ? [['Second colour', spec.colors.secondary, prov['colors.secondary'] ?? 'histogram']] : []),
    ...(spec.colors.accents ?? []).map((c) => ['Accent', c, 'histogram']), ...(spec.colors.neutrals ?? []).map((c) => ['Neutral', c, 'histogram'])];
  const colCards = cols.map(([role, hex, src], i) => {
    const ink = bestInk(hex), ratio = contrast(hex, ink), ok = ratio >= AA;
    return `<div class="card" id="C${i + 1}"><div class="sw" style="background:${hex};color:${ink}">Aa</div><div class="cbody"><div class="row"><span class="ref">C${i + 1}</span><strong>${esc(role)}</strong></div><code>${hex}</code>
      <span class="muted">${esc(SOURCE_LABEL[src] ?? SOURCE_LABEL.heuristic)}</span><span class="pill ${ok ? 'ok' : 'bad'}">${ok ? 'Text on it is easy to read' : 'Text on it is hard to read'}</span></div></div>`;
  }).join('');

  // fonts
  const fontCards = ['heading', 'body'].map((role, i) => {
    const r = fr[role] ?? { used: spec.typography[`${role}_font`], status: 'google', alternatives: [] }, [kind, label] = FONT_STATUS[r.status] ?? FONT_STATUS.google;
    const stack = esc(fontStackFor(spec, role));
    const src = spec.typography.source_fonts?.[role] ?? r.requested;
    return `<div class="card spec" id="F${i + 1}"><div class="row"><span class="ref">F${i + 1}</span><strong>${role === 'heading' ? 'Headings' : 'Body text'}</strong></div>
      <div class="${role === 'heading' ? 'big' : 'small'}" style="font-family:${stack}">${role === 'heading' ? 'The quick brown fox jumps' : 'The quick brown fox jumps over the lazy dog. 0123456789'}</div>
      <div class="arrow">${src && src !== r.used ? `<span class="muted">They use ${esc(src)}</span><span aria-hidden="true">→</span>` : ''}<span>We use ${esc(r.used)}</span></div>
      <div class="row"><span class="pill ${kind}">${esc(label)}</span></div>
      ${r.evidence ? `<span class="muted">Because it is ${esc(r.evidence)}.</span>` : ''}</div>`;
  }).join('');

  // images
  const usedAs = (a) => {
    const u = [];
    if (a.role === 'logo' && isRaster(a)) u.push('Logo on title and closing slides');
    for (const k of ['title', 'section', 'closing']) if (style?.backgrounds?.[k] === a.id) u.push(`Background of ${LAYOUT_LABEL[k]} slides`);
    for (const p of style?.placements ?? []) if (p.asset === a.id) u.push(`Placed on ${LAYOUT_LABEL[p.layout]} slides (${p.position.replace('-', ' ')})`);
    for (const t of style?.html_backgrounds ?? []) if (t.asset === a.id) u.push(`Background of ${t.selector} on the web page`);
    return u.length ? u : ['Not used yet'];
  };
  const imgCards = assets.map((a, i) => `<div class="card" id="I${i + 1}"><div class="thumb"><img alt="${esc(a.id)}" src="${dataUri(a)}"></div><div class="cbody">
      <div class="row"><span class="ref">I${i + 1}</span><strong>${esc(ROLE_LABEL[a.role])}</strong></div>
      ${usedAs(a).map((u) => `<span class="pill ${u === 'Not used yet' ? 'info' : 'ok'}">${esc(u)}</span>`).join('')}
      <span class="muted">${a.width}×${a.height}${a.mime === 'image/svg+xml' ? ' · web only, not usable in PowerPoint' : ''}</span><span class="muted" title="${esc(a.source)}">From ${esc(shortSource(a.source))}</span></div></div>`).join('');

  const h = style?.text?.heading;
  const textLine = h ? `${h.case === 'upper' ? 'UPPERCASE' : 'Normal case'}, ${h.weight === 400 ? 'light' : 'bold'}${h.letter_spacing ? `, letters spaced out` : ''}` : null;
  const ex = [`Looks right, continue`, `Change C1 to ${/^#/.test(spec.colors.primary) ? '#0A50AA' : '#RRGGBB'}`, ...(assets.length ? [`Skip I${assets.length}`, 'Make the title slide text easier to read'] : []), 'Use uppercase headings'];

  const body = `
<main class="board">
  <header><h1>${esc(niceSource(spec))} brand board</h1>
    <p class="lede muted">This is what we found about their look, and how your slides would use it. Nothing is built yet. Look it over, then tell the assistant what to change.</p></header>
  <section class="check" aria-label="Things to check"><h2>${todo.length} thing${todo.length === 1 ? '' : 's'} to check</h2><ol>${todo.map(([id, t]) => `<li><a href="#${id}">${id}</a><span>${esc(t)}</span></li>`).join('')}</ol></section>
  <section class="sec"><header><h2>How your slides would look</h2><p class="muted">Sample text on their colours, fonts and images. Real slides will have your content.</p></header>
    <div class="slides">${slides(spec, style)}</div></section>
  ${shot ? `<section class="sec site"><header><h2>Their website, for comparison</h2><p class="muted">Do the sample slides feel like the same company?</p></header><img alt="Screenshot of the customer's website" src="data:image/png;base64,${esc(shot)}"></section>` : ''}
  ${design ? `<section class="sec"><header><h2>Feel of their website</h2><p class="muted">Measured on their page. The slides follow it: ${esc(designWords(design).join(', '))}${style?.design?.rhythm ? `; ${esc(rhythmWords(style.design.rhythm))}` : ''}.${style?.system ? ' Their real navigation, buttons and cards were measured, so HTML prototypes can use them.' : ''}</p></header></section>${style?.graphics ? `<section class="sec"><header><h2>Their graphics</h2><p class="muted">How their site draws shapes. Slides, templates and HTML pages follow it.</p><ul>${graphicsWords(style.graphics).map((w) => `<li>${esc(w)}</li>`).join('')}</ul></header></section>` : ''}` : `<section class="sec"><header><h2>Feel of their website</h2><p class="muted">Not measured (no browser, or their site blocked the visit). Slides use a neutral layout. Tell the assistant if their site is, for example, image-heavy and minimal.</p></header></section>`}
  <section class="sec"><header><h2>Colours</h2><p class="muted">Each colour with where it came from, and whether text on top of it can be read.</p></header><div class="swatches">${colCards}</div></section>
  <section class="sec"><header><h2>Fonts</h2><p class="muted">We use their font when it is free, supplied by them, or already installed here. Otherwise we use the closest free font. Nothing for you to decide.</p></header><div class="fonts">${fontCards}</div></section>
  <section class="sec"><header><h2>Images</h2><p class="muted">${assets.length ? 'Only keep images that belong to this customer.' : 'No logo or images were found.'}</p></header>${assets.length ? `<div class="imgs">${imgCards}</div>` : ''}</section>
  <section class="sec"><header><h2>Heading style</h2></header><p>${textLine ? `${esc(textLine)}. ${prov['text.heading.case'] || prov['text.heading.weight'] ? 'Read from their website styles.' : ''}` : 'No special heading style found, so normal headings are used.'}</p>
    ${spec.tone_keywords?.length ? `<div class="row"><span class="muted">Overall feel (a guess):</span>${spec.tone_keywords.map((t) => `<span class="pill info">${esc(t)}</span>`).join('')}</div>` : ''}</section>
  <section class="how"><h2>How to reply</h2><p class="muted">Use the references (C1, F1, I1…) or plain words. For example:</p><ul>${ex.map((e) => `<li>${esc(e)}</li>`).join('')}</ul></section>
  <p class="foot">This is an approximate preview made in a web page. Fonts and layout in PowerPoint can differ slightly. Open the generated deck in PowerPoint before sending it to the customer.</p>
</main>`;

  const title = `${esc(niceSource(spec))} brand board`;
  const style_ = `<style>\n${fontCss}\n${CSS}</style>`;
  return artifact ? `<title>${title}</title>\n${style_}\n${body}` : `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>\n${style_}</head>\n<body>${body}</body></html>`;
}
