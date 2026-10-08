// Upload scanning hook. Set BRAND_SCAN_COMMAND (e.g. "clamscan --no-summary") to scan every upload.
// With BRAND_SCAN_REQUIRED=1 and no command configured, uploads are refused (fail closed).
import { execFile } from 'node:child_process';
import { writeFile, rm, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { httpError } from './safeurl.mjs';

export async function scanUpload(buf) {
  const cmd = process.env.BRAND_SCAN_COMMAND;
  if (!cmd) {
    if (process.env.BRAND_SCAN_REQUIRED === '1') throw httpError(503, 'Upload scanning is required but BRAND_SCAN_COMMAND is not configured.');
    return { scanned: false };
  }
  const dir = await mkdtemp(join(tmpdir(), 'scan-'));
  const f = join(dir, 'upload.bin');
  try {
    await writeFile(f, buf);
    const [bin, ...args] = cmd.split(/\s+/);
    await new Promise((res, rej) => execFile(bin, [...args, f], { timeout: 30_000 }, (err) =>
      err ? rej(httpError(422, 'Upload rejected by malware scan.')) : res()));
    return { scanned: true };
  } finally { await rm(dir, { recursive: true, force: true }); }
}
