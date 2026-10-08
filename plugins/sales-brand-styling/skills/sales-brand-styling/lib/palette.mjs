// How a brand USES its colours on slides, decided once and shared by decks, boards and CSS.
// If we know which colours actually cover the page (spec.colors.surfaces, from a screenshot or CSS backgrounds),
// a neutral-first brand (e.g. black/white/grey with a blue button colour) gets a neutral title slide and its colour
// as an accent. A brand whose colour floods the page (or when we have no data) gets the colour as the title background.
import { lightness, bestInk, contrast, isNeutral } from './color.mjs';
import { surfaceRole } from './png.mjs';

const mixHex = (a, b, t) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t).toString(16).padStart(2, '0')).join('').toUpperCase();
const near = (a, b) => { const v = (h, i) => parseInt(h.slice(i, i + 2), 16); return Math.hypot(v(a, 1) - v(b, 1), v(a, 3) - v(b, 3), v(a, 5) - v(b, 5)) < 48; };

export function slidePalette(spec) {
  const c = spec.colors, surfaces = (c.surfaces ?? []).filter((x) => x && /^#[0-9A-Fa-f]{6}$/.test(x.hex) && Number.isFinite(x.share)), neutrals = [...(c.neutrals ?? [])].sort((a, b) => lightness(a) - lightness(b));
  const accents = c.accents ?? [], primary = c.primary, secondary = c.secondary ?? accents[0] ?? primary;
  const surf = (role) => surfaces.find((s) => surfaceRole(s.hex) === role)?.hex;
  const light = surf('light') ?? (neutrals.at(-1) && lightness(neutrals.at(-1)) > 0.8 ? neutrals.at(-1) : '#FFFFFF');
  const dark = surf('dark') ?? neutrals[0] ?? '#1F1F1F';
  const primaryShare = surfaces.filter((s) => near(s.hex, primary)).reduce((t, s) => t + s.share, 0);
  const neutralShare = surfaces.filter((s) => surfaceRole(s.hex) !== 'colour').reduce((t, s) => t + s.share, 0);
  const known = surfaces.length > 0;
  const flood = known ? primaryShare >= 0.12 || neutralShare < 0.5 : true;
  let titleBg = primary, accent = secondary;
  if (!flood) {
    const darkShare = surfaces.filter((s) => surfaceRole(s.hex) === 'dark').reduce((t, s) => t + s.share, 0), lightShare = surfaces.filter((s) => surfaceRole(s.hex) === 'light').reduce((t, s) => t + s.share, 0);
    titleBg = darkShare >= lightShare * 0.6 ? dark : light;   // dark heroes are common for neutral-first brands (Apple, Nike…)
    accent = primary;
  }
  // Text colour of a neutral-first brand: its own near-black (e.g. #1D1D1F), not pure black and not the accent.
  const ink = neutrals.find((n) => lightness(n) >= 0.05 && lightness(n) <= 0.25) ?? dark;
  // A brand whose colour is dark enough for white text and really shows up on the site (not just on a button) gets that colour
  // as its "dark" background, instead of a near-black the customer never uses.
  const brandDark = !isNeutral(primary) && contrast(primary, '#FFFFFF') >= 4.5 && (flood ? titleBg !== primary : primaryShare >= 0.03);
  const sectionBg = brandDark ? primary : dark;
  const closingBg = brandDark && lightness(titleBg) > 0.5 ? primary : titleBg;
  const headingOnContent = flood && contrast(primary, light) >= 3 ? primary : (contrast(ink, light) >= 4.5 ? ink : bestInk(light));
  // Background families. Every colour in a family takes the same ink, so a slide can switch colour without its text breaking:
  // light family -> dark ink, dark family -> white ink.
  const tint = mixHex(light, isNeutral(primary) ? dark : primary, 0.08);
  const soft = [...accents, secondary, primary].find((x) => x && lightness(x) > 0.75 && contrast(x, ink) >= 7) ?? mixHex(light, isNeutral(primary) ? dark : primary, 0.2);
  const deep = brandDark ? mixHex(primary, '#000000', 0.35) : mixHex(dark, isNeutral(primary) ? '#808080' : primary, 0.3);
  const uniq = (a) => a.filter((x, i) => a.findIndex((y) => near(x, y) && lightness(x) - lightness(y) < 0.04 && lightness(y) - lightness(x) < 0.04) === i);
  const bgs = { light: uniq([light, tint, soft]), dark: uniq([sectionBg, deep]) };
  // Fills for the header band / panels drawn inside a slide: a brand-colour band on light slides (when the brand has one), a lifted panel on dark ones.
  const bandFill = brandDark ? primary : null;
  const lift = mixHex(sectionBg, '#FFFFFF', 0.12);
  return { primary, secondary, accents, light, dark, ink, titleBg, sectionBg, closingBg, contentBg: light, accent, flood, known, brandDark, tint, soft, deep, bgs, bandFill, lift,
    headingOnContent };
}
