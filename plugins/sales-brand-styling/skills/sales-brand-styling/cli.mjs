#!/usr/bin/env node
// Local CLI over the same library the HTTP plugin uses — for local files/folders, so the agent never
// has to base64 a file through the conversation. JSON in/out files; stdout is a short summary.
//   node cli.mjs extract <file|folder|url> [--out spec.json]
//   node cli.mjs map <template.html|pptx> --spec spec.json [--out ir.json]
//   node cli.mjs set ir.json <id>=<#hex|font> ...     answer an uncertain item
//   node cli.mjs css --spec spec.json [--style style.json] [--embed-fonts | --google-import] [--out brand.css]   CSS block for an HTML artifact
//   node cli.mjs doctor                                      plain-English setup check
//   node cli.mjs demo [--url https://www.apple.com] [--sample] [--out-dir dir] [--open]   real website end to end (default apple.com): board, deck, template, HTML prototype, one-pager; --sample = made-up brand, no internet
//   node cli.mjs html --spec spec.json --style style.json --blocks blocks.json --mode prototype|onepager [--out page.html] [--open]   build an HTML page from the customer's components
//   node cli.mjs html-components --spec spec.json --style style.json [--mode ...] [--open]      reference sheet of their nav/buttons/cards/footer
//   node cli.mjs html-check <page.html> --spec spec.json --style style.json                       is a hand-edited page still on-brand?
//   node cli.mjs chart <data.csv> [--type column|bar|stacked|line|area|pie|doughnut] [--unit %] [--highlight <label>] [--source "…"] [--out chart.json]   CSV -> chart for an outline
//   node cli.mjs slides [<layout>]                         the slide catalog (all types and their fields), or one type with a sample
//   node cli.mjs storyline [<name>]                        ready-made slide sequences (sales-proposal, it-service-description, …)
//   node cli.mjs catalog --spec spec.json --style style.json [--out slide-catalog.pptx] [--open]   a deck with every slide type to pick from
//   node cli.mjs board --spec spec.json [--style style.json] [--site-screenshot file.png] [--out board.html] [--artifact] [--open]   visual brand board to confirm
//   node cli.mjs design <style.json> [align=center] [density=airy] [imagery=image-led] [heading_scale=display] [corners=pill]   show / change the layout feel
//   node cli.mjs fonts <spec.json> [heading=<Font>] [body=<Font>] [--keep "<Customer Font>"]   show/change the font choice (customer font only if you assert it is licensed)
//   node cli.mjs font-suggest <Font> [--generic serif|sans-serif|monospace]
//   node cli.mjs fonts-install <spec.json> [--yes]            install the free fonts on this computer for PowerPoint (without --yes: only says what it would do)
//   node cli.mjs fonts-download <spec.json> --out-dir fonts/     TTFs of the Google Fonts in use (install for PowerPoint)
//   node cli.mjs style <style.json> bg <title|section|closing>=<asset-id> | place <asset-id> <layout> <position> | html-bg <asset-id> <selector> [dark] | text <case=upper|none> <weight=400|700> <letter_spacing=pt> | overlay <0.2-0.9>
//   node cli.mjs render ir.json [--out-dir dir]
//   node cli.mjs template --spec spec.json [--logo logo.png] [--out template.pptx]
//   node cli.mjs add-slides <deck.pptx> --spec spec.json --outline outline.json [--out new.pptx]
//   node cli.mjs draft --spec spec.json --outline outline.json [--out deck.pptx]
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { extractFromUrl } from './lib/extract.mjs';
import { extractFromPath } from './lib/local.mjs';
import { mapTemplate } from './lib/map.mjs';
import { renderOutput } from './lib/render.mjs';
import { boardHtml } from './lib/board.mjs';
import { pageHtml, componentsSheet, checkHtml } from './lib/htmlkit.mjs';
import { chartFromCsv, checkChart } from './lib/charts.mjs';
import { catalogDoc, STORYLINES, SAMPLE_OF, CATALOG_TYPES, TYPES as CATALOG_DEFS, GROUPS as CATALOG_GROUPS } from './lib/catalog.mjs';
import { demoBrand, demoBrandLive, demoContent, DEMO_URL } from './lib/demo.mjs';
import { doctor, doctorText } from './lib/doctor.mjs';
import { execFile } from 'node:child_process';
import { loadStyle, saveStyle } from './lib/style.mjs';
import { brandCss } from './lib/style.mjs';
import { validateDesign, designWords, withDefaults, DESIGN_KEYS } from './lib/design.mjs';
import { validateGraphics, graphicsWords } from './lib/graphics.mjs';
import { resolveFont, resolveSpecFonts, fontNotes, googleImportCss } from './lib/fonts.mjs';
import { fetchTtfs, embeddedFontFaces, googleFamilies } from './lib/fontfiles.mjs';
import { fontStatus, missingFonts, fontNotice, withFontNotice, installFonts } from './lib/fontinstall.mjs';
import { draftDeck, templateDeck, addSlides } from './lib/draft.mjs';

const [cmd, ...rest] = process.argv.slice(2);
const flags = {}, pos = [];
const BOOL = new Set(['embed-fonts', 'google-import', 'artifact', 'open', 'yes', 'no-fonts']);
for (let i = 0; i < rest.length; i++) rest[i].startsWith('--') ? (flags[rest[i].slice(2)] = BOOL.has(rest[i].slice(2)) ? '' : rest[++i]) : pos.push(rest[i]);
const styleOf = async () => (flags.style ? loadStyle(flags.style) : undefined);
const readJson = async (f) => JSON.parse(await readFile(f, 'utf8'));
const save = async (f, data) => { await mkdir(dirname(resolve(f)), { recursive: true }); await writeFile(f, typeof data === 'string' || Buffer.isBuffer(data) ? data : JSON.stringify(data, null, 2)); return resolve(f); };
const out = (o) => console.log(JSON.stringify(o, null, 2));
const missingFor = async (specFile) => { try { return missingFonts(await fontStatus(await readJson(specFile))); } catch { return []; } };
const fontExtra = (m) => (m.length ? { fonts_to_install: m, fonts_warning: fontNotice(m), fix: 'Ask the user, then run: fonts-install <spec.json> --yes' } : {});
const openFile = (f) => { if (flags.open === undefined || !f) return; const [bin, ...a] = process.platform === 'darwin' ? ['open'] : process.platform === 'win32' ? ['cmd', '/c', 'start', ''] : ['xdg-open']; execFile(bin, [...a, f], () => {}); };

try {
  if (cmd === 'extract') {
    if (!pos[0]) throw new Error('usage: extract <file|folder|url>');
    const r = /^https?:\/\//i.test(pos[0]) ? await extractFromUrl(pos[0]) : await extractFromPath(pos[0]);
    const { hero_screenshot_png_base64: shot, brand_style, ...rest } = r;
    rest.brand_style_summary = brand_style ? { assets: brand_style.assets.map(({ id, role, mime, width, height, source }) => ({ id, role, mime, size: `${width}x${height}`, source })), text: brand_style.text, backgrounds: brand_style.backgrounds } : null;
    const f = flags.out ?? 'brand-spec.json';
    const files = { brand_spec: await save(f, r.brand_spec) };
    if (r.brand_style) { files.brand_style = await saveStyle(f.replace(/brand-spec\.json$|\.json$/, (m) => (m === 'brand-spec.json' ? 'brand-style.json' : '.style.json')), r.brand_style); }
    if (shot) files.hero_screenshot = await save(f.replace(/\.json$/, '') + '.hero.png', Buffer.from(shot, 'base64'));
    out({ ...rest, files });
  } else if (cmd === 'map') {
    if (!pos[0] || !flags.spec) throw new Error('usage: map <template> --spec spec.json');
    const buf = await readFile(pos[0]);
    const r = await mapTemplate({ template: { filename: basename(pos[0]), content_base64: buf.toString('base64') }, brand_spec: await readJson(flags.spec), brand_style: await styleOf() });
    const f = flags.out ?? 'ir.json';
    await save(f, r.ir);
    out({ ir_file: resolve(f), format: r.ir.format, suggestions: r.suggestions, applied: r.ir.roles.map((x) => ({ id: x.id, from: x.current, to: x.target ?? x.props })), uncertain: r.ir.uncertain.map(({ id, current, reason }) => ({ id, current, reason })), notes: r.notes });
  } else if (cmd === 'set') {
    const [f, ...pairs] = pos; const ir = await readJson(f);
    for (const p of pairs) { const [id, ...v] = p.split('='); const item = ir.uncertain.find((u) => u.id === id); if (!item) throw new Error(`No uncertain item "${id}".`); item.target = v.join('='); }
    await save(f, ir); out({ updated: pairs.length, still_unanswered: ir.uncertain.filter((u) => !u.target).map((u) => u.id) });
  } else if (cmd === 'render') {
    if (!pos[0]) throw new Error('usage: render ir.json');
    const ir = await readJson(pos[0]);
    const r = await renderOutput({ ir, format: ir.format });
    const dir = flags['out-dir'] ?? '.';
    const pv = await save(join(dir, r.file.filename + '.preview.html'), r.preview.content); openFile(pv);
    out({ file: await save(join(dir, r.file.filename), Buffer.from(r.file.content_base64, 'base64')), preview: pv, changes: r.changes, fonts: r.fonts });
  } else if (cmd === 'css') {
    if (!flags.spec) throw new Error('usage: css --spec spec.json [--style style.json]');
    const spec = await readJson(flags.spec);
    const fontCss = flags['embed-fonts'] !== undefined ? await embeddedFontFaces(spec) : flags['google-import'] !== undefined ? googleImportCss(spec) : '';
    const css = brandCss({ brand_spec: spec, style: await styleOf(), fontCss });
    const f = flags.out ?? 'brand.css';
    out({ file: await save(f, css), bytes: css.length, classes: [...new Set(css.match(/\.brand-[\w-]+/g))], note: 'Link/inline this in the HTML artifact; use the classes above and the --brand-* variables.' });
  } else if (cmd === 'doctor') {
    const d = await doctor(); console.log(doctorText(d)); if (!d.ready) process.exitCode = 1;
  } else if (cmd === 'demo') {
    const dir = flags['out-dir'] ?? 'sales-brand-demo';
    const B = flags.sample !== undefined ? { ...demoBrand(), live: false, name: 'Northwind Traders', url: null, notes: ['Made-up sample customer (no website was read).'], screenshot: null } : await demoBrandLive(flags.url ?? DEMO_URL);
    const { spec, style, name } = B, f = (n) => join(dir, n), made = {};
    await save(f('brand-spec.json'), spec); await saveStyle(f('brand-style.json'), style);
    const miss = (() => { try { return []; } catch { return []; } })(); void miss;
    const shotBuf = B.screenshot ? Buffer.from(B.screenshot, 'base64') : null;
    made['1 what we learned about the brand (board)'] = await save(f('1-brand-board.html'), await boardHtml({ brand_spec: spec, brand_style: style, site_screenshot_base64: shotBuf && shotBuf.length < 3_000_000 ? B.screenshot : undefined }));
    const { slides, blocks } = demoContent(style, name);
    const d = await draftDeck({ brand_spec: spec, brand_style: style, outline: { title: `${name} demo deck`, slides } });
    made['2 a deck that follows their look and rhythm'] = await save(f('2-deck.pptx'), Buffer.from(d.file.content_base64, 'base64')); await save(f('2-deck.pptx.preview.html'), d.preview.content);
    const t = await templateDeck({ brand_spec: spec, brand_style: style });
    made['3 branded template to build on'] = await save(f('3-brand-template.pptx'), Buffer.from(t.file.content_base64, 'base64')); await save(f('3-brand-template.pptx.preview.html'), t.preview.content);
    const a = await addSlides({ brand_spec: spec, brand_style: style, deck: { filename: '3-brand-template.pptx', content_base64: t.file.content_base64 }, outline: { slides: [{ layout: 'statement', title: '[A new slide, added later]' }, { layout: 'content', title: '[Another one]', bullets: ['[Point]'] }] } });
    made['4 the template with two new slides added'] = await save(f('4-template-plus-new-slides.pptx'), Buffer.from(a.file.content_base64, 'base64'));
    const fontCss = await embeddedFontFaces(spec).catch(() => googleImportCss(spec));
    if (style.system) {
      made["5 their real components (nav, buttons, cards)"] = await save(f('5-their-components.html'), componentsSheet({ brand_spec: spec, brand_style: style, mode: 'prototype', fontCss }));
      made['6 HTML prototype built from their components'] = await save(f('6-html-prototype.html'), pageHtml({ brand_spec: spec, brand_style: style, blocks, mode: 'prototype', title: `${name} prototype`, fontCss }));
    }
    made['7 HTML one-pager in their style'] = await save(f('7-html-one-pager.html'), pageHtml({ brand_spec: spec, brand_style: style, blocks, mode: 'onepager', title: `${name} one-pager`, fontCss }));
    const missingF = await missingFor(f('brand-spec.json'));
    for (const p of [made['1 what we learned about the brand (board)'], f('2-deck.pptx.preview.html'), made['7 HTML one-pager in their style'], made['6 HTML prototype built from their components']].filter(Boolean)) openFile(p);
    out({ folder: resolve(dir), used: B.live ? `the real website ${B.url}` : 'a made-up sample customer', files: made, what_was_read: B.notes, fonts: d.fonts, ...fontExtra(missingF), note: B.live ? `Built from ${name}'s public website look as a demo. Placeholder text is in [brackets]. Open the .pptx files in PowerPoint to check them.` : 'Open the .pptx files in PowerPoint to check them.' });
  } else if (cmd === 'html' || cmd === 'html-components') {
    if (!flags.spec) throw new Error(`usage: ${cmd} --spec spec.json --style style.json ${cmd === 'html' ? '--blocks blocks.json ' : ''}[--mode prototype|onepager] [--open]`);
    const spec = await readJson(flags.spec), style = await styleOf(), mode = flags.mode ?? (style?.system ? 'prototype' : 'onepager');
    const fontCss = flags['no-fonts'] !== undefined ? '' : await embeddedFontFaces(spec).catch(() => googleImportCss(spec));
    const html = cmd === 'html' ? pageHtml({ brand_spec: spec, brand_style: style, blocks: await readJson(flags.blocks ?? (() => { throw new Error('--blocks blocks.json is required'); })()), mode, title: flags.title, fontCss }) : componentsSheet({ brand_spec: spec, brand_style: style, mode, fontCss });
    const f = flags.out ?? (cmd === 'html' ? 'page.html' : 'brand-components.html'), saved = await save(f, html); openFile(saved);
    out({ file: saved, mode, bytes: html.length, note: mode === 'prototype' ? "Built from the customer's measured components." : "Built from the customer's design language (colours, fonts, rhythm, imagery, scale, corners)." });
  } else if (cmd === 'slides') {
    if (pos[0]) { const t = CATALOG_DEFS[pos[0]]; if (!t) throw new Error(`Unknown slide type "${pos[0]}". Run: slides`); out({ layout: t.name, group: CATALOG_GROUPS[t.group], summary: t.summary, fields: catalogDoc().flatMap((g) => g.types).find((x) => x.layout === t.name).fields, sample: SAMPLE_OF(t.name) }); }
    else out({ core: ['title', 'section', 'content', 'two-column', 'quote', 'closing', 'statement', 'image', 'chart', 'highlight'], catalog: catalogDoc(), count: CATALOG_TYPES.length + 10 });
  } else if (cmd === 'storyline') {
    if (!pos[0]) out(Object.fromEntries(Object.entries(STORYLINES).map(([k, v]) => [k, { name: v.name, slides: v.slides }])));
    else { const st = STORYLINES[pos[0]]; if (!st) throw new Error(`Unknown storyline "${pos[0]}". Available: ${Object.keys(STORYLINES).join(', ')}`); out({ storyline: pos[0], name: st.name, slides: st.slides, note: 'A plan, not content. Propose this list to the user, let them drop or add slides, then write the outline from what they tell you.' }); }
  } else if (cmd === 'catalog') {
    if (!flags.spec) throw new Error('usage: catalog --spec spec.json [--style style.json] [--out slide-catalog.pptx] [--open]');
    const spec = await readJson(flags.spec), style = await styleOf(), core = ['content', 'two-column', 'quote', 'statement', 'image', 'chart', 'highlight'];
    const samples = { content: { layout: 'content', title: 'Content slide', bullets: ['First point', 'Second point', 'Third point'] }, 'two-column': { layout: 'two-column', title: 'Two columns', left: ['Left point'], right: ['Right point'] }, quote: { layout: 'quote', title: '“A quote goes here.”', subtitle: '— Name, Role' }, statement: { layout: 'statement', title: 'One clear message, said big.' }, image: { layout: 'image', title: 'A picture slide', image: 'none' }, chart: { layout: 'chart', title: 'A chart states its point', chart: { type: 'column', labels: ['Q1', 'Q2', 'Q3', 'Q4'], series: [{ name: 'Sample', values: [12, 18, 24, 31] }], highlight: 'Q4', sample: true } }, highlight: { layout: 'highlight', title: 'A highlight section', subtitle: 'Key figures', stats: [{ value: '[00]', label: '[label]' }, { value: '[00]', label: '[label]' }], aside_title: 'Aside', aside: ['[point]'] } };
    const slides = [{ layout: 'title', title: 'Slide catalog', subtitle: 'Every slide type, in this brand. Sample content only: replace it.' }, { layout: 'section', title: 'Basics' }, ...core.map((k) => samples[k])];
    for (const [key, title] of Object.entries(CATALOG_GROUPS)) { slides.push({ layout: 'section', title }); for (const t of CATALOG_TYPES.filter((n) => CATALOG_DEFS[n].group === key)) slides.push(SAMPLE_OF(t)); }
    const r = await draftDeck({ brand_spec: spec, brand_style: style, outline: { title: 'Slide catalog', slides, no_highlight: true } });
    const f = flags.out ?? 'slide-catalog.pptx', miss = await missingFor(flags.spec), pv = await save(f + '.preview.html', withFontNotice(r.preview.content, miss)); openFile(pv);
    out({ file: await save(f, Buffer.from(r.file.content_base64, 'base64')), preview: pv, slides: slides.length, ...fontExtra(miss), note: 'Sample content only (figures and names are examples, never customer facts). Pick the types you want, then ask for them by name.' });
  } else if (cmd === 'chart') {
    if (!pos[0]) throw new Error('usage: chart <data.csv> [--type column|bar|stacked|line|area|pie|doughnut] [--unit %] [--highlight <label>] [--source "…"]');
    const c = chartFromCsv(await readFile(pos[0], 'utf8'), flags.type ?? 'column', flags.unit);
    if (flags.highlight) c.highlight = flags.highlight; if (flags.source) c.source = flags.source; checkChart(c);
    const f = flags.out ?? 'chart.json'; out({ chart_file: await save(f, c), labels: c.labels.length, series: c.series.map((x) => x.name), use_in_outline: { layout: 'chart', title: '<the point of the chart, as a sentence>', chart: '<contents of chart.json>' } });
  } else if (cmd === 'html-check') {
    if (!pos[0] || !flags.spec) throw new Error('usage: html-check <page.html> --spec spec.json [--style style.json]');
    const r = checkHtml(await readFile(pos[0], 'utf8'), await readJson(flags.spec), await styleOf()); out(r); if (!r.ok) process.exitCode = 1;
  } else if (cmd === 'board') {
    if (!flags.spec) throw new Error('usage: board --spec spec.json [--style style.json] [--site-screenshot site.png] [--artifact] [--open]');
    const guess = flags.spec.replace(/\.json$/, '') + '.hero.png';
    const shotFile = flags['site-screenshot'] ?? (await readFile(guess).then(() => guess, () => null));
    const shotBuf = shotFile ? await readFile(shotFile) : null;
    const html = await boardHtml({ brand_spec: await readJson(flags.spec), brand_style: await styleOf(), site_screenshot_base64: shotBuf && shotBuf.length < 3_000_000 ? shotBuf.toString('base64') : undefined, artifact: flags.artifact !== undefined });
    const f = flags.out ?? (flags.artifact !== undefined ? 'brand-board.artifact.html' : 'brand-board.html');
    const miss = await missingFor(flags.spec);
    const saved = await save(f, withFontNotice(html, miss)); openFile(saved);
    out({ board: saved, ...fontExtra(miss), bytes: html.length, kind: flags.artifact !== undefined ? 'artifact fragment (publish with the Artifact tool; no doctype/html/head/body)' : 'standalone page', opened: flags.open !== undefined });
  } else if (cmd === 'design') {
    const [f, ...a] = pos; if (!f) throw new Error('usage: design <style.json> [align=center|left] [density=airy|balanced|dense] [imagery=image-led|balanced|text-led] [heading_scale=display|standard|compact] [corners=square|soft|pill]');
    const st = await loadStyle(f);
    if (a.length) {
      const d = { ...(st.design ?? {}) };
      for (const x of a) { const [k, v] = x.split('='); if (!DESIGN_KEYS.includes(k)) throw new Error(`Unknown design key "${k}". Keys: ${DESIGN_KEYS.join(', ')}`); d[k] = v; st.provenance = { ...(st.provenance ?? {}), [`design.${k}`]: 'explicit' }; }
      const errs = validateDesign(d); if (errs.length) throw new Error(errs.join(' '));
      st.design = d; await saveStyle(f, st);
    }
    const d = withDefaults(st.design);
    out({ design: d, in_plain_words: st.design ? designWords(d) : ['not measured: neutral layout'], measured: st.design?.measured ?? null });
  } else if (cmd === 'graphics') {
    const [f, ...a] = pos; if (!f) throw new Error('usage: graphics <style.json> [button=<px|pill>] [card=<px>] [media=<px>] [input=<px>] [gradient=off|<#from>,<#to>] [pattern=on|off] [shadow=none|soft]');
    const st = await loadStyle(f);
    if (a.length) {
      const g = JSON.parse(JSON.stringify(st.graphics ?? { graphics_version: '1.0', corners: {}, gradient: { used: false }, pattern: { used: false }, shadow: 'none', section: null, provenance: {} }));
      for (const x of a) {
        const [k, v] = x.split('=');
        if (['button', 'card', 'media', 'input', 'chip'].includes(k)) g.corners[k] = v === 'pill' ? 9999 : Number(v);
        else if (k === 'gradient') g.gradient = v === 'off' ? { used: false } : { used: true, kind: 'linear', angle: 135, stops: v.toUpperCase().split(','), count: 1, area_share: 0.1 };
        else if (k === 'pattern') g.pattern = v === 'on' ? { used: true, kind: 'tile' } : { used: false };
        else if (k === 'shadow') g.shadow = v;
        else throw new Error(`Unknown graphics key "${k}".`);
        g.provenance = { ...(g.provenance ?? {}), [k]: 'explicit' };
      }
      const errs = validateGraphics(g); if (errs.length) throw new Error(errs.join(' '));
      st.graphics = g; await saveStyle(f, st);
    }
    out({ graphics: st.graphics ?? null, in_plain_words: st.graphics ? graphicsWords(st.graphics) : ['not measured: default shapes'] });
  } else if (cmd === 'fonts') {
    const [f, ...a] = pos; if (!f) throw new Error('usage: fonts <spec.json> [heading=<Font>] [body=<Font>] [--keep "<Customer Font>"]');
    let spec = await readJson(f);
    const set = Object.fromEntries(a.map((x) => x.split(/=(.*)/s).slice(0, 2)));
    if (set.heading || set.body || flags.keep) {
      spec = resolveSpecFonts(spec, { heading: set.heading, body: set.body, keep: flags.keep ? [flags.keep] : [] });
      const bad = ['heading', 'body'].filter((r) => set[r] && spec.typography.font_resolution[r].status === 'substituted');
      if (bad.length) throw new Error(`${bad.map((r) => set[r]).join(', ')} is not a Google Font and would be substituted. Pick a Google Font, or add --keep "<name>" only if the customer's licence covers it.`);
      await save(f, spec);
    }
    out({ heading: spec.typography.font_resolution?.heading, body: spec.typography.font_resolution?.body, notes: fontNotes(spec.typography) });
  } else if (cmd === 'font-suggest') {
    if (!pos[0]) throw new Error('usage: font-suggest <Font> [--generic serif]');
    out(resolveFont(pos[0], { generic: flags.generic }));
  } else if (cmd === 'fonts-install') {
    const [f] = pos; if (!f) throw new Error('usage: fonts-install <spec.json> [--yes]');
    const r = await installFonts(await readJson(f), { dryRun: flags.yes === undefined });
    out(flags.yes === undefined && r.would_install?.length ? { ...r, note: 'Nothing was changed. Ask the user, then re-run with --yes.' } : r);
  } else if (cmd === 'fonts-download') {
    const [f] = pos; if (!f || !flags['out-dir']) throw new Error('usage: fonts-download <spec.json> --out-dir fonts/');
    const spec = await readJson(f), fams = googleFamilies(spec), saved = [];
    if (!fams.length) throw new Error('No Google Fonts in use (system or user-licensed fonts are not downloaded).');
    for (const fam of fams) for (const t of await fetchTtfs(fam)) saved.push(await save(join(flags['out-dir'], t.filename), t.buf));
    out({ saved, note: 'Google Fonts are open-licensed (see each family page on fonts.google.com). Install these before opening the .pptx.' });
  } else if (cmd === 'style') {
    const [f, op, ...a] = pos; if (!f || !op) throw new Error('usage: style <style.json> bg|place|html-bg|text|overlay …');
    const st = await loadStyle(f); const ids = new Set((st.assets ?? []).map((x) => x.id));
    const need = (id) => { if (!ids.has(id)) throw new Error(`Unknown asset "${id}". Have: ${[...ids].join(', ')}`); return id; };
    if (op === 'bg') for (const p of a) { const [k, id] = p.split('='); if (!['title', 'section', 'closing'].includes(k)) throw new Error('bg key must be title|section|closing'); (st.backgrounds ??= {})[k] = need(id); }
    else if (op === 'place') (st.placements ??= []).push({ asset: need(a[0]), layout: a[1], position: a[2] });
    else if (op === 'html-bg') (st.html_backgrounds ??= []).push({ asset: need(a[0]), selector: a[1], ...(a[2] === 'dark' && { tone: 'dark' }) });
    else if (op === 'text') { const h = ((st.text ??= {}).heading ??= {}); for (const p of a) { const [k, v] = p.split('='); h[k] = k === 'case' ? v : Number(v); } }
    else if (op === 'overlay') (st.backgrounds ??= {}).overlay_opacity = Number(a[0]);
    else throw new Error('style ops: bg | place | html-bg | text | overlay');
    const { validateStyle } = await import('./lib/style.mjs'); const errs = validateStyle(st);
    if (errs.length) throw new Error(errs.join(' '));
    await saveStyle(f, st); out({ updated: f, style: { text: st.text, backgrounds: st.backgrounds, placements: st.placements, html_backgrounds: st.html_backgrounds } });
  } else if (cmd === 'template') {
    if (!flags.spec) throw new Error('usage: template --spec spec.json [--logo logo.png]');
    const logo = flags.logo ? { filename: basename(flags.logo), content_base64: (await readFile(flags.logo)).toString('base64') } : undefined;
    const r = await templateDeck({ brand_spec: await readJson(flags.spec), brand_style: await styleOf(), logo });
    const f = flags.out ?? 'brand-template.pptx';
    const miss = await missingFor(flags.spec);
    const pv = await save(f + '.preview.html', withFontNotice(r.preview.content, miss)); openFile(pv);
    out({ file: await save(f, Buffer.from(r.file.content_base64, 'base64')), preview: pv, layouts: r.changes, fonts: r.fonts, ...fontExtra(miss) });
  } else if (cmd === 'add-slides') {
    if (!pos[0] || !flags.spec || !flags.outline) throw new Error('usage: add-slides <deck.pptx> --spec spec.json --outline outline.json');
    const r = await addSlides({ brand_spec: await readJson(flags.spec), brand_style: await styleOf(), outline: await readJson(flags.outline), deck: { filename: basename(pos[0]), content_base64: (await readFile(pos[0])).toString('base64') } });
    const f = flags.out ?? join(dirname(resolve(pos[0])), r.file.filename);
    const miss = await missingFor(flags.spec);
    const pv = await save(f + '.preview.html', withFontNotice(r.preview.content, miss)); openFile(pv);
    out({ file: await save(f, Buffer.from(r.file.content_base64, 'base64')), preview: pv, changes: r.changes, fonts: r.fonts, ...fontExtra(miss) });
  } else if (cmd === 'draft') {
    if (!flags.spec || !flags.outline) throw new Error('usage: draft --spec spec.json --outline outline.json');
    const r = await draftDeck({ brand_spec: await readJson(flags.spec), brand_style: await styleOf(), outline: await readJson(flags.outline) });
    const f = flags.out ?? r.file.filename;
    const miss = await missingFor(flags.spec);
    const pv = await save(f + '.preview.html', withFontNotice(r.preview.content, miss)); openFile(pv);
    out({ file: await save(f, Buffer.from(r.file.content_base64, 'base64')), preview: pv, slides: r.changes, fonts: r.fonts, ...fontExtra(miss) });
  } else throw new Error('commands: extract | map | set | render | draft | template | add-slides | css | style | design | board | slides | storyline | catalog | chart | html | html-components | html-check | doctor | demo | fonts-install | fonts | font-suggest | fonts-download');
} catch (e) { console.error('ERROR: ' + e.message); process.exit(1); }
