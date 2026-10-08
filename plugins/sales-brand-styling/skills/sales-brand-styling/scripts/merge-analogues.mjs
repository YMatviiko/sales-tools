#!/usr/bin/env node
// Maintainer: merge researched font analogues into data/font-analogues.json.   node scripts/merge-analogues.mjs batch.json [...]
// Each batch is a JSON array of {font, nearest, alternatives[], confidence, reason, sources[]}. Every family must exist in the
// Google Fonts catalogue; entries with invalid names are rejected, not silently kept.
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cat = new Set(JSON.parse(await readFile(join(root, 'data/google-fonts.json'), 'utf8')).fonts.map((f) => f.f));
const file = join(root, 'data/font-analogues.json');
const db = await readFile(file, 'utf8').then(JSON.parse, () => ({ updated: null, entries: {} }));
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
let added = 0, rejected = [];
for (const batchFile of process.argv.slice(2)) {
  for (const e of JSON.parse(await readFile(batchFile, 'utf8'))) {
    const names = [e.nearest, ...(e.alternatives ?? [])];
    if (!e.font || !cat.has(e.nearest) || names.some((n) => !cat.has(n)) || !['high', 'medium', 'low'].includes(e.confidence)) { rejected.push(`${e.font}: ${names.filter((n) => !cat.has(n)).join(', ') || 'bad shape'}`); continue; }
    db.entries[norm(e.font)] = { font: e.font, nearest: e.nearest, alternatives: [...new Set(e.alternatives ?? [])].filter((n) => n !== e.nearest), confidence: e.confidence, reason: String(e.reason ?? '').slice(0, 300), sources: (e.sources ?? []).slice(0, 3) };
    added++;
  }
}
db.updated = new Date().toISOString().slice(0, 10);
await writeFile(file, JSON.stringify(db, null, 1));
console.log(`merged ${added}; rejected ${rejected.length}${rejected.length ? ': ' + rejected.join(' | ') : ''}; total ${Object.keys(db.entries).length}`);
