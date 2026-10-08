#!/usr/bin/env node
// Maintainer: copy VERSION into the plugin manifest (plugin.json) so installed copies refresh.
//   node scripts/sync-plugin-version.mjs
// The skill folder IS the plugin's skill now; there is no separate build or copy step.
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = join(root, '..', '..', '.claude-plugin', 'plugin.json');
const version = (await readFile(join(root, 'VERSION'), 'utf8')).trim();
const json = JSON.parse(await readFile(manifest, 'utf8'));
json.version = version;
await writeFile(manifest, JSON.stringify(json, null, 2) + '\n');
console.log(`plugin.json -> ${version}`);
