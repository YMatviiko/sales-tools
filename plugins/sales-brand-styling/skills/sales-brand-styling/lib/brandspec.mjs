import { normalizeHex } from './color.mjs';
import { httpError } from './safeurl.mjs';

export const SCHEMA_VERSION = '1.1';
export const ACCEPTED_SCHEMA_VERSIONS = ['1.0', '1.1'];

// Hand-rolled check mirroring schema/brand-spec.schema.json (no validator dependency).
export function validateBrandSpec(spec) {
  const errs = [];
  if (!spec || typeof spec !== 'object') return ['BrandSpec must be an object.'];
  if (!ACCEPTED_SCHEMA_VERSIONS.includes(spec.schema_version)) errs.push(`schema_version must be one of ${ACCEPTED_SCHEMA_VERSIONS.join(', ')} (got ${JSON.stringify(spec.schema_version)}).`);
  const c = spec.colors;
  if (!c || !normalizeHex(c.primary) || c.primary !== normalizeHex(c.primary)) errs.push('colors.primary must be #RRGGBB.');
  for (const k of ['secondary']) if (c?.[k] !== undefined && !/^#[0-9A-Fa-f]{6}$/.test(c[k])) errs.push(`colors.${k} must be #RRGGBB.`);
  for (const k of ['accents', 'neutrals']) if (c?.[k] !== undefined && !(Array.isArray(c[k]) && c[k].every((x) => /^#[0-9A-Fa-f]{6}$/.test(x)))) errs.push(`colors.${k} must be an array of #RRGGBB.`);
  const t = spec.typography;
  if (!t || typeof t.heading_font !== 'string' || typeof t.body_font !== 'string') errs.push('typography.heading_font and body_font are required strings.');
  if (c?.surfaces !== undefined && (!Array.isArray(c.surfaces) || c.surfaces.length > 16 || c.surfaces.some((x) => !x || !/^#[0-9A-Fa-f]{6}$/.test(x.hex) || !(typeof x.share === 'number' && x.share >= 0 && x.share <= 1)))) errs.push('colors.surfaces must be a list of {hex: #RRGGBB, share: 0-1} (max 16).');
  for (const r of ['heading', 'body']) { const w = t?.font_resolution?.[r]?.web_fallback; if (w !== undefined && !(typeof w === 'string' && /^[\w .\-]{1,60}$/.test(w))) errs.push(`typography.font_resolution.${r}.web_fallback is not a plain font name.`); }
  for (const k of ['heading_font', 'body_font']) if (typeof t?.[k] === 'string' && !/^[\w .\-]{1,60}$/.test(t[k])) errs.push(`typography.${k} may only contain letters, digits, space, dot, dash, underscore (max 60).`);
  return errs;
}
export function requireBrandSpec(spec) {
  const errs = validateBrandSpec(spec);
  if (errs.length) throw httpError(400, 'Invalid BrandSpec: ' + errs.join(' '));
  return spec;
}
