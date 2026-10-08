#!/usr/bin/env node
// Maintainer check — run before every release:  node check-release.mjs
// Fails (exit 1) if VERSION is not semver, is out of step with package.json / openapi.json,
// CHANGELOG.md lacks an entry for it, SKILL.md doesn't read VERSION, or the schema version
// constant in code drifts from schema/brand-spec.schema.json.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const read = (f) => readFileSync(join(dir, f), 'utf8');
const problems = [];

const version = read('VERSION').trim();
if (!/^\d+\.\d+\.\d+$/.test(version)) problems.push(`VERSION "${version}" is not semver (x.y.z).`);
else {
  if (!new RegExp(`^## ${version.replace(/\./g, '\\.')} — `, 'm').test(read('CHANGELOG.md')))
    problems.push(`CHANGELOG.md has no "## ${version} — <date>" entry.`);
  const pkg = JSON.parse(read('package.json')).version;
  if (pkg !== version) problems.push(`package.json version ${pkg} != VERSION ${version}.`);
  const api = JSON.parse(read('openapi.json')).info.version;
  if (api !== version) problems.push(`openapi.json info.version ${api} != VERSION ${version}.`);
}
try { const pv = JSON.parse(read('../../.claude-plugin/plugin.json')).version; if (pv !== version) problems.push(`plugin.json version ${pv} != VERSION ${version} (run: npm run sync-plugin-version).`); } catch { problems.push('plugin.json not found at ../../.claude-plugin/plugin.json.'); }
if (!/`VERSION`/.test(read('SKILL.md'))) problems.push('SKILL.md does not tell the agent to read the VERSION file.');

const schemaConst = JSON.parse(read('schema/brand-spec.schema.json')).properties.schema_version.enum.at(-1);
const codeConst = read('lib/brandspec.mjs').match(/SCHEMA_VERSION = '([^']+)'/)?.[1];
if (schemaConst !== codeConst) problems.push(`schema_version: schema file "${schemaConst}" != lib/brandspec.mjs "${codeConst}".`);
const styleConst = JSON.parse(read('schema/brand-style.schema.json')).properties.style_version.enum.at(-1);
const styleCode = read('lib/style.mjs').match(/STYLE_VERSION = '([^']+)'/)?.[1];
if (styleConst !== styleCode) problems.push(`style_version: schema file "${styleConst}" != lib/style.mjs "${styleCode}".`);
if (!new RegExp(`BrandSpec schema ${schemaConst.replace('.', '\\.')}`).test(read('CHANGELOG.md').split(/^## /m).find((s) => s.startsWith(version)) ?? ''))
  problems.push(`CHANGELOG entry for ${version} must state "BrandSpec schema ${schemaConst}".`);

if (problems.length) { console.log('NOT READY TO RELEASE:\n  - ' + problems.join('\n  - ')); process.exit(1); }
console.log(`OK — version ${version}; package/openapi/changelog/schema in step.`);
console.log(`Next: git add -A && git commit -m "Release v${version}" && git tag v${version} && git push && git push origin v${version}`);
