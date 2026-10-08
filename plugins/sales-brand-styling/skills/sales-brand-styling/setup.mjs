#!/usr/bin/env node
// First-run setup: installs the npm packages the tools need. Safe to run any time; does nothing when everything is in place.
//   As a Claude Code plugin (CLAUDE_PLUGIN_DATA set): installs once into the plugin's persistent data folder and links it here, so a
//   plugin update does not download everything again. Otherwise: plain `npm install` in this folder.
// Never fails the Claude Code session: problems are printed and exit code stays 0 with --quiet.
import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, symlinkSync, rmSync, lstatSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const skillDir = dirname(fileURLToPath(import.meta.url)), quiet = process.argv.includes('--quiet');
const REQUIRED = ['jszip', 'pptxgenjs', 'pdfjs-dist', 'playwright-core'];
const have = (dir) => REQUIRED.every((p) => existsSync(join(dir, 'node_modules', p)));
const say = (m) => { if (!quiet) console.log(m); };
const fail = (m) => { console.error(`sales-brand-styling setup: ${m}`); process.exit(quiet ? 0 : 1); };
const npm = (cwd) => spawnSync('npm', ['install', '--omit=optional', '--omit=dev', '--no-audit', '--no-fund', '--loglevel=error'], { cwd, stdio: quiet ? 'ignore' : 'inherit', shell: process.platform === 'win32' });

if (Number(process.versions.node.split('.')[0]) < 18) fail(`Node ${process.versions.node} is too old; install Node 18 or newer from nodejs.org.`);
if (have(skillDir)) { say('sales-brand-styling: already set up.'); process.exit(0); }

const data = process.env.CLAUDE_PLUGIN_DATA;
try {
  if (data) {
    mkdirSync(data, { recursive: true });
    const pkgNow = readFileSync(join(skillDir, 'package.json'), 'utf8'), marker = join(data, '.package.json');
    const stale = !existsSync(marker) || readFileSync(marker, 'utf8') !== pkgNow;
    if (stale || !have(data)) {
      say('sales-brand-styling: installing packages (first run, about a minute)…');
      copyFileSync(join(skillDir, 'package.json'), join(data, 'package.json'));
      if (existsSync(join(skillDir, 'package-lock.json'))) copyFileSync(join(skillDir, 'package-lock.json'), join(data, 'package-lock.json'));
      const r = npm(data); if (r.status !== 0) fail('npm install failed. Check the internet connection and that npm works, then restart Claude Code.');
      writeFileSync(marker, pkgNow);
    }
    const link = join(skillDir, 'node_modules');
    try { if (lstatSync(link)) rmSync(link, { recursive: true, force: true }); } catch { /* not there */ }
    try { symlinkSync(join(data, 'node_modules'), link, 'junction'); }
    catch { say('Could not link shared packages; installing into the plugin folder instead.'); const r = npm(skillDir); if (r.status !== 0) fail('npm install failed.'); }
  } else {
    say('sales-brand-styling: installing packages…');
    const r = npm(skillDir); if (r.status !== 0) fail('npm install failed.');
  }
} catch (e) { fail(e.message); }
if (!have(skillDir)) fail('packages are still missing after setup.');
say('sales-brand-styling: ready.');
