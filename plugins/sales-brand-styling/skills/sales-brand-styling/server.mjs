#!/usr/bin/env node
// Plugin backend: three POST endpoints + /health + /openapi.json. Register openapi.json with DIAL Core.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { timingSafeEqual } from 'node:crypto';
import { extractBrandSpec } from './lib/extract.mjs';
import { mapTemplate } from './lib/map.mjs';
import { renderOutput } from './lib/render.mjs';
import { draftDeck, templateDeck, addSlides } from './lib/draft.mjs';
import { requireBrandSpec, SCHEMA_VERSION } from './lib/brandspec.mjs';
import { brandCss, requireStyle } from './lib/style.mjs';
import { embeddedFontFaces } from './lib/fontfiles.mjs';
import { boardHtml } from './lib/board.mjs';
import { catalogDoc, STORYLINES } from './lib/catalog.mjs';
import { pageHtml, componentsSheet } from './lib/htmlkit.mjs';
import { googleImportCss } from './lib/fonts.mjs';

const dir = dirname(fileURLToPath(import.meta.url));
const VERSION = readFileSync(join(dir, 'VERSION'), 'utf8').trim();
const openapi = JSON.parse(readFileSync(join(dir, 'openapi.json'), 'utf8'));
const MAX_BODY = 60_000_000;

const routes = {
  '/extract_brand_spec': extractBrandSpec,
  '/map_template': mapTemplate,
  '/render_output': renderOutput,
  '/draft_deck': draftDeck,
  '/template_deck': templateDeck,
  '/add_slides': addSlides,
  '/brand_board': async ({ brand_spec, brand_style, site_screenshot_base64, artifact }) => ({ html: await boardHtml({ brand_spec, brand_style, site_screenshot_base64, artifact: !!artifact }) }),
  '/html_page': async ({ brand_spec, brand_style, blocks, mode, title, fonts }) => ({ html: pageHtml({ brand_spec, brand_style, blocks, mode: mode ?? (brand_style?.system ? 'prototype' : 'onepager'), title, fontCss: fonts === 'embed' ? await embeddedFontFaces(brand_spec) : fonts === 'google-import' ? googleImportCss(brand_spec) : '' }) }),
  '/html_components': async ({ brand_spec, brand_style, mode }) => ({ html: componentsSheet({ brand_spec, brand_style, mode: mode ?? (brand_style?.system ? 'prototype' : 'onepager') }) }),
  '/slide_catalog': () => ({ catalog: catalogDoc(), storylines: Object.fromEntries(Object.entries(STORYLINES).map(([k, v]) => [k, v.slides])) }),
  '/brand_css': async ({ brand_spec, brand_style, fonts }) => {
    requireBrandSpec(brand_spec); requireStyle(brand_style);
    const fontCss = fonts === 'embed' ? await embeddedFontFaces(brand_spec) : fonts === 'google-import' ? googleImportCss(brand_spec) : '';
    return { css: brandCss({ brand_spec, style: brand_style, fontCss }) };
  },
};

function authorized(req) {
  const key = process.env.BRAND_API_KEY;
  if (!key) return true;
  const got = Buffer.from((req.headers.authorization ?? '').replace(/^Bearer /, ''));
  const want = Buffer.from(key);
  return got.length === want.length && timingSafeEqual(got, want);
}
const send = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };

export const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://x').pathname;
    if (req.method === 'GET' && path === '/health') return send(res, 200, { ok: true, version: VERSION, brand_spec_schema: SCHEMA_VERSION });
    if (req.method === 'GET' && path === '/openapi.json') return send(res, 200, openapi);
    const handler = routes[path];
    if (!handler || req.method !== 'POST') return send(res, 404, { error: 'Not found' });
    if (!authorized(req)) return send(res, 401, { error: 'Unauthorized' });
    let n = 0; const chunks = [];
    for await (const c of req) { n += c.length; if (n > MAX_BODY) return send(res, 413, { error: 'Body too large' }); chunks.push(c); }
    let body; try { body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { return send(res, 400, { error: 'Invalid JSON' }); }
    send(res, 200, { plugin_version: VERSION, ...(await handler(body)) });
  } catch (e) {
    send(res, e.status ?? 500, { error: e.status ? e.message : 'Internal error' });
    if (!e.status) console.error(e);
  }
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 8787);
  server.listen(port, '127.0.0.1', () => console.log(`sales-brand-styling v${VERSION} on http://127.0.0.1:${port}`));
}
