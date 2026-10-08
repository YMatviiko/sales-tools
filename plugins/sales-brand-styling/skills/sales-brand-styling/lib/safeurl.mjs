// SSRF guard for arbitrary customer URLs. https/http only, optional domain allowlist,
// and every resolved address must be public (checked again on each redirect hop by the caller).
import { lookup } from 'node:dns/promises';
import net from 'node:net';

export function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  if (v.startsWith('::ffff:')) return isPrivateIp(v.slice(7));
  return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80');
}

export async function assertSafeUrl(raw, { allowlist = parseList(process.env.BRAND_DOMAIN_ALLOWLIST) } = {}) {
  let u;
  try { u = new URL(raw); } catch { throw httpError(400, `Invalid URL: ${raw}`); }
  if (!['http:', 'https:'].includes(u.protocol)) throw httpError(400, 'Only http(s) URLs are allowed.');
  if (u.username || u.password) throw httpError(400, 'URLs with credentials are not allowed.');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (allowlist.length && !allowlist.some((d) => host === d || host.endsWith('.' + d)))
    throw httpError(403, `Domain ${host} is not on the allowlist.`);
  const addrs = net.isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => {
    throw httpError(400, `Cannot resolve ${host}.`);
  });
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw httpError(403, `Refusing to fetch non-public address for ${host}.`);
  return u;
}

const parseList = (s) => (s ? s.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean) : []);
export function httpError(status, message) { return Object.assign(new Error(message), { status }); }

// Bounded fetch: manual redirects (each hop re-validated), timeout, byte cap.
export async function safeFetch(raw, { maxBytes = 3_000_000, timeoutMs = 10_000, hops = 4, accept } = {}) {
  let url = raw;
  for (let i = 0; i <= hops; i++) {
    const u = await assertSafeUrl(url);
    const res = await fetch(u, { redirect: 'manual', signal: AbortSignal.timeout(timeoutMs), headers: { 'user-agent': 'dial-sales-brand-styling/1', ...(accept && { accept }) } });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) { url = new URL(res.headers.get('location'), u).href; continue; }
    if (!res.ok) throw httpError(502, `Fetch of ${u.href} failed: HTTP ${res.status}`);
    const chunks = []; let n = 0;
    for await (const c of res.body) { n += c.length; if (n > maxBytes) throw httpError(413, 'Response too large.'); chunks.push(c); }
    return { url: u.href, contentType: res.headers.get('content-type') || '', body: Buffer.concat(chunks) };
  }
  throw httpError(502, 'Too many redirects.');
}
