#!/usr/bin/env node
// Maintainer: refresh data/google-fonts.json from Google's public catalogue.   node scripts/update-google-fonts.mjs
// Keeps only what font matching needs (category, stroke, popularity, weights, 400-weight metrics).
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const res = await fetch('https://fonts.google.com/metadata/fonts', { signal: AbortSignal.timeout(60_000) });
if (!res.ok) throw new Error(`HTTP ${res.status}`);
const text = await res.text();
const list = JSON.parse(text.slice(text.indexOf('{'))).familyMetadataList;
if (!Array.isArray(list) || list.length < 1000) throw new Error('Unexpected catalogue shape.');

const fonts = list.filter((f) => (!f.isNoto || /^Noto (Sans|Serif)( Mono)?$/.test(f.family)) && f.isOpenSource !== false).map((f) => {
  const w = Object.keys(f.fonts).filter((k) => !k.endsWith('i')).map(Number);
  const wght = f.axes?.find((a) => a.tag === 'wght');
  const weights = wght ? [...new Set([...w, ...[100, 200, 300, 400, 500, 600, 700, 800, 900].filter((x) => x >= wght.min && x <= wght.max)])].sort((a, b) => a - b) : w.sort((a, b) => a - b);
  const m = f.fonts['400'] ?? Object.values(f.fonts)[0] ?? {};
  return { f: f.family, c: f.category, s: f.stroke ?? null, p: f.popularity, w: weights, i: Object.keys(f.fonts).some((k) => k.endsWith('i')) ? 1 : 0,
    t: m.thickness ?? null, x: m.width ?? null, l: m.lineHeight ?? null, d: (f.classifications ?? []).includes('Display') ? 1 : 0 };
}).sort((a, b) => a.p - b.p);

const out = { source: 'https://fonts.google.com/metadata/fonts', fetched: new Date().toISOString().slice(0, 10), count: fonts.length, fonts };
await writeFile(join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'google-fonts.json'), JSON.stringify(out));
console.log(`wrote ${fonts.length} families`);
