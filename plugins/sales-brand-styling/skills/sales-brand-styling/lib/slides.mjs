// One entry point for rendering a slide to HTML (deck preview, catalog contact sheet): core layouts via layouts.mjs, catalog types via the
// scene drawing language. Importing this module also registers the catalog types with the layout system.
import { slideHtml, layoutSpecs } from './layouts.mjs';
import { TYPES, isCatalog } from './catalog.mjs';
import { sceneCtx, drawHtml } from './scene.mjs';

export { isCatalog };
export function renderSlideHtml(layout, content, opts) {
  if (!isCatalog(layout)) return slideHtml(layout, content, opts);
  const tone = content.tone ?? 'light', ctx = sceneCtx(opts.spec, opts.style, tone, content.comp), scene = TYPES[layout].build(ctx, content);
  return slideHtml(layout, content, { ...opts, extraHtml: drawHtml(scene, ctx, opts.stacks) });
}
