# Changelog

Versioning (semver) applies to the whole plugin: skill + backend + `openapi.json`.
**patch** = wording or bug fix · **minor** = new endpoint, input type, check or rule ·
**major** = a change that breaks existing callers (stricter validation, changed response shape).
The BrandSpec/IR contracts carry their own version (`schema_version`, `ir_version`); changing either
is a deliberate event: bump it here and bump this plugin's **major** if old data stops validating.
Each entry notes the BrandSpec schema version it ships.

## 0.16.0 — 2026-10-08 (BrandSpec schema 1.1)
- **PowerPoint redesign: editorial look instead of a template look.** The heavy header band is gone. Content slides now have a large headline with a short accent rule;
  slides alternate between a top-headline layout and a full-height brand panel (kicker, headline, ring motif) with content beside it.
- Statement slides are an inset rounded brand panel; tables have a brand-coloured header and thin rules; cards are white with a soft shadow; text is sized to fill the space.
- Title slides use the brand's own picture or artwork when one exists (SVG artwork is rendered to a PNG twin); a dark logo on a dark slide gets a light chip.
- **Repository layout:** one repo is now the marketplace; this skill lives inside the plugin (`plugins/sales-brand-styling/skills/sales-brand-styling`). The separate build step is gone; `npm run sync-plugin-version` copies VERSION into `plugin.json`.
- `customer-context` and `options` fit their text in panel mode. Existing decks keep working; regenerate the template to get the new layouts.

## 0.15.0 — 2026-10-08
- **Slide catalog: 42 more slide types for PowerPoint** (51 with the core ones), in 7 groups, each defined once (fields, limits, sample, builder) and drawn as
  native, editable shapes, tables and pictures. Opening and context: `agenda`, `at-a-glance`, `big-number`, `customer-context`, `objectives`. Making the case:
  `problem-solution`, `benefits`, `before-after`, `comparison`, `options`, `value-case`. IT process and delivery: `process-steps`, `process-flow`
  (boxes, decisions, connectors), `swimlane`, `service-description`, `sla`, `raci`, `governance`, `incident-and-change`, `onboarding-transition`, `roles-team`,
  `tools-and-platforms`, `kpi-reporting`. Technical depth: `architecture`, `integration-map`, `environments`, `tech-stack`, `security-compliance`,
  `migration-plan`. Plans: `timeline`, `roadmap`, `risks`, `next-steps`, `scope`, `status-summary`. Proof and people: `case-study`, `testimonial`, `logo-wall`,
  `team`. Commercial: `pricing`, `investment`, `qa-contact`.
- **They adapt to the brand like every other slide:** header band, corners (including the site's measured card radius), colours, fonts, light/dark tone by the
  site's rhythm, centred or left layout. Text is fitted to its box (shrinks, never overflows); colours are checked for contrast on both tones.
- **Storylines** (`cli.mjs storyline`): sales proposal, IT service description, technical deep-dive, project kick-off, status report: a proposed slide list the agent
  shows the user to drop or add slides from. `cli.mjs slides [<type>]` lists the catalog or shows one type's fields and sample; `cli.mjs catalog` builds a
  deck with every type as a visual menu to pick from. API: `POST /slide_catalog`.
- Strict validation for catalog slides (unknown fields, text length, list sizes, enums, references); a geometry test checks every type in three brand styles and both
  tones stays on the slide, below the header band, with readable text. Numbers and names in samples are `[placeholders]` or obvious examples, never customer facts.
- One shared `catalog` layout (headline in the header band) carries all catalog types, so a deck needs only one extra layout pair; `add-slides` works with them.
- Not done: icons (numbers and shapes instead), logo files in the logo wall unless the user supplies them, free-form diagram editing, animation, restyling the
  tables or shapes of a user's own deck.
- BrandSpec schema 1.1 · BrandStyle 1.1 · IR 1.0 · outline 1.0 (adds the catalog layouts)

## 0.14.0 — 2026-10-08
- **New `highlight` slide layout** (PowerPoint): the customer's graphic section as a slide. A large brand-colour panel (rounded and gradient / pattern as on
  their site) with a headline, a supporting line and up to four key-number tiles, next to a lighter side card with its own heading and bullets. Everything is
  real, editable text; numbers are never invented (`[placeholders]` unless the user supplies them). Outline fields: `stats[{value,label}]` (max 4, value up to
  24 chars), `aside_title`, `aside`; rejected on other layouts.
- **Always generated:** every template carries a highlight sample slide (with or without measured graphics), and every whole deck (`draft`) gets one
  automatically before the closing slide when the outline has none (with `[placeholder]` figures; `no_highlight: true` opts out). `add-slides` adds them on request.
- Template is now ten sample slides; layouts list, placement and API enums include `highlight`.
- BrandSpec schema 1.1 · BrandStyle 1.1 · IR 1.0 · outline 1.0 (adds `highlight` layout, `stats`, `aside_title`, `aside`, `no_highlight`)

## 0.13.0 — 2026-10-08
- **Their graphics are measured and used** (`lib/graphics.mjs`, `lib/pptxgraphics.mjs`). The live-page measurement now records corner radius per element
  (buttons, cards, pictures, form fields, tags; a pill counts as fully round, a tab rounded on one side does not count), gradients, tiled patterns,
  shadows and the **graphic section** (the coloured, often inset panel that carries a headline, key numbers or a button, e.g. the investor-relations
  block on aholddelhaize.com). Saved as `graphics` in `brand-style.json`, validated and whitelisted, shown on the brand board ("Their graphics") and
  editable with `cli.mjs graphics`.
- **PowerPoint follows it:** header bands, columns, chart cards and the title block become inset rounded cards when the site's panels are rounded; pictures
  (the layout's picture slot and pictures already placed) take the site's picture radius; gradient and dot-pattern fills appear only for brands that use them.
- **HTML follows it, prototype and one-pager alike:** buttons, cards, pictures and inputs use the measured radii (flat cards stay flat), dark sections carry
  the site's gradient / pattern when it has one, and a new `panel` block draws the customer's graphic section (title, subtitle, key-number tiles, button).
- **Slides now carry the site's text styles and colour families** (earlier in this release): H1/H2/H3/body sizes, weights, line spacing and heading colour from
  the measured type scale (the rendered H1 weight overrides a stylesheet guess); dark slides use the brand's own dark colour instead of a near-black the
  site barely uses; layouts have their own backgrounds, header bands and panels so a slide has sections; content slides cycle through the brand's light tints.
- Not done: a PowerPoint "highlight" layout that mirrors the graphic section, rounded section dividers, measuring icon style, restyling shapes of a user's own deck.
- BrandSpec schema 1.1 · BrandStyle 1.1 (adds optional `graphics`) · IR 1.0 · outline 1.0

## 0.12.0 — 2026-10-08
- **Data visualisations in the customer's palette.** New `chart` slide layout (headline that states the point, optional takeaway line, source line)
  and `chart` block for HTML pages. Types: column, bar, stacked, line, area, pie, doughnut. PowerPoint gets **native, editable charts** (data is in
  the file; right-click > Edit Data); HTML gets matching inline SVG. Colours: first series = brand colour, then secondary/accents, then tints; every
  colour is nudged to stay legible (>= 3:1) on its light or dark background; one-series charts can `highlight` a single bar/point (rest muted).
  Numbers are never invented: they come from the user or a CSV (`cli.mjs chart data.csv`); `sample: true` labels a chart "Sample data." on the slide.
  Strict input checks (finite numbers, sizes, 2-8 pie slices, units, no markup); SVG output uses only plain drawing elements. `add-slides`
  carries a chart and its workbook into an existing deck.
- **A real PowerPoint style system** (`lib/pptxtheme.mjs`): the theme is named "<Customer> Brand" (shows in the Design tab), all 12 theme colours
  are brand colours (no leftover Office colours; dk1/lt1 are text/background), the font scheme is the brand fonts, master text styles (title,
  five body levels, text boxes) carry the brand size, weight, colour and alignment, and layout/slide colours **refer to theme colours** so
  changing the colour scheme in PowerPoint recolours the deck. Charts added in PowerPoint pick up the brand accents.
- Fix found by test: `add-slides` mishandled absolute part paths in relationships.
- Not done: restyling the charts of a user's own deck, tables, combo/scatter/waterfall charts, chart animation, data from Excel files (CSV only).
- BrandSpec schema 1.1 · BrandStyle 1.1 · IR 1.0 · outline 1.0 (adds `chart` layout).

## 0.11.4 — 2026-10-08
- **Fix: picture slots were not real PowerPoint picture placeholders.** The `image` layout's slot was written as an untyped box (the library
  needs type `image`, not `pic`), so PowerPoint showed no "click to add picture" icon, only the browser preview drew one. The layout now has a
  true `<p:ph type="pic">`. New `image: "none"` on an image slide leaves the slot empty on purpose for the user's own picture; slides that
  carry a picture drop the empty slot.
- BrandSpec schema 1.1 · BrandStyle 1.1 · IR 1.0 · outline 1.0.

## 0.11.3 — 2026-10-08
- **Fix (plugin install): live-website measurement was silently off.** `playwright-core` (drives Chrome) was an optional dependency and the
  plugin's slim install omits optional packages, so installed copies never measured fonts, layout, rhythm or components and the demo
  reported "no Chrome". It is now a regular dependency (+8 MB, about 52 MB total); `setup.mjs` requires it; `doctor` now tells apart
  "browser package missing" (a failure) from "Chrome not found" (a warning). Found by running the demo through a real Claude session
  with the plugin installed, not by the tests.
- BrandSpec schema 1.1 · BrandStyle 1.1 · IR 1.0 · outline 1.0.

## 0.11.2 — 2026-10-08
- **The demo reads a real website** (apple.com by default; `demo --url <site>`; `--sample` for the made-up customer; automatic fallback to
  the sample, said out loud, when the site can't be read). It builds the full set a real job would: brand board with site screenshot,
  deck following the site's look and rhythm, branded template, template with slides added later, their real components, HTML prototype
  and one-pager. All copy is `[placeholder]`; pictures are the brand's own photographs.
- Picture choice prefers real photographs (JPEG with weight) over PNG logo/share cards, in decks and in the demo.
- BrandSpec schema 1.1 · BrandStyle 1.1 · IR 1.0 · outline 1.0.

## 0.11.1 — 2026-10-08
- **Packaged as a Claude Code plugin** with a company marketplace (`npm run build-plugin` -> `../sales-brand-marketplace`): one install
  command per computer (`claude plugin marketplace add …` then `claude plugin install sales-brand-styling@sales-tools`). Passes
  `claude plugin validate --strict`; installed and run end to end in an isolated Claude config (a fresh session picked the skill and ran the demo).
- `setup.mjs`: first-run package install (once, into the plugin's persistent data folder and linked in, so updates don't re-download;
  a SessionStart hook runs it quietly; the skill runs it itself if packages are missing). Slim install: 44 MB (optional rendering
  packages are skipped); PDF warnings silenced.
- SKILL.md: paths are folder-neutral (`<this folder>` = the skill's directory), no git-based update check, a description that also
  triggers on "show me what it can do / try it / demo".
- BrandSpec schema 1.1 · BrandStyle 1.1 · IR 1.0 · outline 1.0.

## 0.11.0 — 2026-10-08
Visual rhythm for decks, and HTML output in the customer's style.
- **Rhythm (PowerPoint):** the full-page screenshot is read one screen at a time (tone: light/dark/colour, how photographic) to get the
  site's rhythm (`design.rhythm`: alternating / dark / light / mixed). Content, two-column, statement and image slides now follow it:
  an alternating site (e.g. Apple: dark, light, dark, light) gets alternating slides. Dark and light variants of those four layouts
  exist as real masters (`BRAND_*_ALT`), so slides stay editable; `tone` per slide overrides; `add-slides` continues the rhythm from the
  deck's last slide; a deck made by an older version asks to regenerate the template.
- **BrandSystem (BrandStyle `system`, measured in the live page):** container width, section spacing, type scale, navigation (height,
  sticky, translucent/blur, centred), primary/secondary buttons (colour, radius, padding, pill), cards (radius, shadow, border), inputs,
  footer, hero. Values are validated and whitelisted (numbers, hex colours, keywords); hostile page values never reach generated CSS.
- **HTML prototype** (`cli.mjs html --mode prototype`, `html_page`): built from the customer's measured components, the same patterns
  (sticky translucent nav, pill buttons, card style, footer) in the same order as their site. **HTML one-pager** (`--mode onepager`):
  the design language only (colours, fonts, rhythm, imagery, alignment, scale, corners), like the deck. Blocks: nav, hero, statement,
  feature, cards, text, quote, cta, form, footer; text is escaped, links are #anchors or https only, images are brand assets; no scripts.
- `html-components` (reference sheet of their components), `html-check` (flags colours/fonts outside the brand in a hand-edited page).
- **Security review of the HTML kit (independent agent, then each finding reproduced before fixing):** hostile values from a scraped site,
  an API `style`, `blocks` or a spec could break out of the generated `<style>` or an attribute. Fixed: `validateSystem` is now a strict schema
  (finite numbers in range, `#RRGGBB`, booleans, whitelisted keywords) over every field that reaches CSS; shadows are numeric-only; `blocks`
  validate `tone`, `id`, array sizes (12 items/links/paragraphs, 4 ctas, 8 fields, 6 columns) and object shapes (400 instead of 500);
  asset `width`/`height` must be whole numbers; `colors.surfaces` and `font_resolution.web_fallback` are validated; `parseColor` no longer
  yields `#NANNANNAN` or throws on objects. A last-line `guardCss` refuses any generated CSS containing markup, backslashes, `@import`
  or a non-`data:` `url()`. One regression test reproduces all 14 attacks. SVG assets stay HTML-image-only (never inlined), so the SVG
  denylist remains defence-in-depth rather than a gate.
- Not done: multi-page prototypes, mega-menus/carousels/animations, matching photography, using their real icons, responsive breakpoints beyond
  stacking at phone width.
- BrandSpec schema 1.1 · BrandStyle 1.1 (adds `design.rhythm`, `system`) · IR 1.0 · outline 1.0 (adds `tone`).

## 0.10.0 — 2026-10-08
Font policy rewritten: **use the customer's font whenever it is licensed for us, else the nearest free font — and never ask the user.**
- **Licensed customer fonts are used automatically** when there is evidence of a licence: the customer's **font files are in the brand
  folder** (`.ttf/.otf/.woff/.woff2`, matched by family name, not look-alikes), or the font is **installed on this computer** as a normal
  font (hidden OS fonts such as macOS's `.SF NS` don't count). Such fonts are `status: user-licensed` with an `evidence` field, keep the nearest
  free font as the web fallback, and `fonts-install --yes` installs the *supplied* files for the user (real font files only).
- **Everything else proprietary → the nearest free Google Font**, with no question put to the user: the skill and board state it in one
  plain sentence; no alternatives list, no `--keep` offer, and a font is no longer a "thing to check" on the board.
- **Researched look-alikes** (`data/font-analogues.json`, 50 fonts, each with confidence, reason and sources; three research agents,
  names validated against Google Fonts; refresh with `scripts/merge-analogues.mjs`): Gotham/Proxima Nova → Montserrat, SF Pro → Inter,
  Futura → Jost, Circular → Figtree, Garamond → EB Garamond, Didot → Bodoni Moda, and so on. Low-confidence matches are reported as such.
- BrandSpec schema 1.1 (adds `font_resolution.evidence`, `match_confidence`, `match_reason`) · BrandStyle 1.1 · IR 1.0 · outline 1.0.

## 0.9.1 — 2026-10-08
- **Fix: fonts "don't match" in PowerPoint.** Decks reference fonts by name; when the font (e.g. Inter) isn't installed on the computer,
  PowerPoint silently substitutes another one, while the browser preview loaded the font from the web and looked right.
  The CLI now checks whether the brand's Google Fonts are installed (`template`, `add-slides`, `draft`, `board` report `fonts_to_install`
  and put a visible warning at the top of the preview/board) and `cli.mjs fonts-install <spec.json> --yes` installs them for the current
  user (macOS `~/Library/Fonts`, Linux `~/.local/share/fonts`; Windows: files are saved and need one manual "Install"). Without `--yes` it
  only reports what it would do. Skill: asks first, then installs, then tells the user to restart PowerPoint.
- BrandSpec schema 1.1 · BrandStyle 1.1 · IR 1.0 · outline 1.0.

## 0.9.0 — 2026-10-08
Slides now follow the customer's *design language*, not just their colours and fonts (feedback: "not even close to the website style").
- **Design language, measured on the live page** (BrandStyle 1.1, `design`): image-led vs text-led (share of the page covered by images,
  full-bleed images), airy vs dense (text per area), centred vs left-aligned headlines, display / standard / compact headline size,
  square / soft / pill corners. Sites that block automated visits are reported as "not measured" and get the neutral layout.
- **Layouts adapt** (`lib/layouts.mjs`, one definition shared by PowerPoint masters, deck preview and brand board): centred brands get
  centred titles and a full-width picture band; airy brands get wide margins, no decorative bars and a calmer body size; display brands get
  60pt titles; pill/soft brands get matching rule shapes. Neutral defaults reproduce the old look.
- **New layouts:** `statement` (one big message) and `image` (large cropped brand picture + short headline; `image` field picks the asset,
  else the best photo/hero). Template now has 8 layouts. Pictures are centre-cropped to fill their frame.
- **add-slides** now carries pictures into the existing deck (image parts + relationships, collision-proof names).
- **Logo:** a logo captured from a coloured site header has its flat background made transparent.
- The brand board shows the measured "feel of their website" in plain words; `cli.mjs design <style.json> key=value` shows or overrides it.
  `brand_css` follows it too (headline size, section spacing, corner radius, centring).
- Not done: matching a site's photography style, grids/motion, per-slide image cropping control, restyling the layouts of a user's own deck.
- BrandSpec schema 1.1 · BrandStyle 1.1 · IR 1.0 · outline 1.0 (additive: `image`, two layouts).

## 0.8.0 — 2026-10-08
Fidelity fixes found by running it on apple.com (the result was "not even close"):
- **Bug:** CSS pseudo-classes (`body:lang(ar)`, `.title:hover`) were read as "style guide" fonts, so Apple's fonts came out as
  "lang" and "hover". Style-guide parsing now runs only on human-written guide text (txt/md/pdf/pptx), never on scraped
  CSS/HTML, and is case-sensitive on the value.
- **Real browser:** screenshots now use the installed Chrome/Edge (`channel`), or `BRAND_CHROME_PATH`; no bundled browser needed.
  In the live page the plugin measures the computed fonts (what is actually rendered), the colour of buttons/links, and the
  heading style (weight, case, letter-spacing); the header logo is captured at 4x. Measured values win over CSS guesses
  (provenance `computed`).
- **How the brand uses colour, not just which colours:** `colors.surfaces` = colours by *page area* (from a full-page screenshot,
  else CSS backgrounds). A neutral-first brand (black/white/grey with a blue button, e.g. Apple) now gets a black or
  white title slide, ink-coloured headings and its colour as the accent; a colour-led brand keeps its colour as the title
  background. Shared by decks, boards, previews and CSS (`lib/palette.mjs`). Tone "minimal" for neutral-first brands.
- **Images:** a header logo is no longer confused with product banners (shape rules for logos/heroes); the og:image or any PNG
  is never applied automatically as a slide background (only real photographs are; anything else is offered, not applied).
- `doctor` now tests that a browser can really be launched. Deck previews use the same colours/fonts as the board and show the logo.
- BrandSpec schema 1.1 (adds `colors.surfaces`, provenance `computed`/`screenshot`) · BrandStyle 1.0 · IR 1.0 · outline 1.0.

## 0.7.0 — 2026-10-08
- **For non-technical users:** the skill now has a "Who you're talking to" section — the agent runs every command itself and
  speaks in plain business language (no commands, JSON or error traces shown); one question at a time; failures
  translated into next steps.
- `cli.mjs demo`: a made-up sample customer run end to end with no inputs (brand board, branded template, template +
  new slides) so anyone can see the workflow work; the agent runs it for "try it / show me".
- `cli.mjs doctor`: plain-English setup check (Node, packages, font list, internet, optional screenshots / virus scan).
- `npm run setup` (install + doctor), `npm run demo`, `npm run doctor`.
- BrandSpec schema 1.1 · BrandStyle 1.0 · IR 1.0 · outline 1.0.

## 0.6.0 — 2026-10-08
- **Brand board** (`cli.mjs board` / `brand_board`): a single page a non-designer can judge by eye — sample title /
  content / section slides in the proposed colours, fonts, images and heading style, then colours (with source and
  a readable-text check), fonts (their font → ours, licence verdict, alternatives, rendered in the real typeface),
  image thumbnails (what each is used for), a "things to check" list, and example replies using references
  (C1, F1, I1). Optional site screenshot for side-by-side comparison. Light and dark theme, phone-width layout, no scripts,
  every customer-derived string escaped.
- `--artifact` emits a fragment for publishing as an Artifact; `--open` opens the page in the browser. `--open` also works
  on `template`, `add-slides`, `draft` and `render` so the preview is seen, not just written to disk.
- Skill: the board is the confirmation step (instead of hex codes in the terminal); the generated template is the
  second, final visual check.
- BrandSpec schema 1.1 · BrandStyle 1.0 · IR 1.0 · outline 1.0.

## 0.5.0 — 2026-10-08
- **Font policy:** the customer's font is used only when it carries no licence burden; otherwise the closest free
  Google Font. Per role (heading/body): `google` (exact/renamed Google family, e.g. "Source Sans Pro" → Source Sans 3) ·
  `system` (Windows/Office fonts such as Calibri/Arial, referenced by name, with a free metric twin as web fallback) ·
  `user-licensed` (only when the sales manager asserts the customer's licence covers it) · `substituted`
  (everything else; curated analogues for well-known commercial faces e.g. Gotham → Montserrat, Futura → Jost;
  otherwise a category-level guess from the CSS fallback stack/name — flagged `heuristic`) · `default`
  (no customer font found → Inter; previously `system-ui`, which is not a valid PowerPoint font).
  Alternatives are always listed. Catalogue: `data/google-fonts.json` (refresh with `scripts/update-google-fonts.mjs`).
- **BrandSpec 1.1 (additive):** `typography.source_fonts` (what the customer uses) and `typography.font_resolution`
  (what was decided and why). `heading_font`/`body_font` are now the font actually used. 1.0 specs still validate.
- `cli.mjs fonts` (show / `heading=` `body=` pick an alternative / `--keep` licensed font), `font-suggest`,
  `fonts-download` (TTFs of Google fonts in use, to install for PowerPoint), `css --embed-fonts` (self-contained
  HTML: latin woff2 inlined) or `--google-import`. Only fonts.googleapis.com / fonts.gstatic.com are contacted.
- Output decks/pages use font stacks with the right generic (serif/mono) + metric twins; bold is not forced on
  single-weight display faces. Font names in specs are validated (no markup).
- Not done: PowerPoint font **embedding** (the viewer must install the fonts, or PowerPoint substitutes);
  visual similarity matching beyond the curated table.
- BrandSpec schema 1.1 · BrandStyle 1.0 · IR 1.0 · outline 1.0.

## 0.4.0 — 2026-10-08
- **Brand style (new optional `BrandStyle`, `style_version` 1.0):** heading text style (case, weight,
  letter-spacing), image backgrounds with a brand-colour overlay so text stays legible, and placed brand
  imagery (logo, illustrations, photos). Stored in `brand-style.json` + `brand-assets/`.
- **Collected from:** a customer URL (og:image, logos, `<img>`, CSS backgrounds, heading CSS), a local
  folder (png/jpg/svg files by name/size), and images embedded in a customer PPTX. Assets are sniffed by
  magic bytes, size-capped (2 MB each, 12 total), SVGs with scripts/external references are rejected;
  the agent confirms they are the customer's own before use.
- **PPTX:** applied at layout level (slides inherit; stays editable): image backgrounds on title /
  section / closing, placed pictures (`style placements`), heading style. Works on plugin templates
  (`BRAND_*` layouts) and on a user's own deck (layouts matched by PowerPoint layout type; dark overlays set a
  light-on-dark colour map). PowerPoint output needs png/jpg (SVG is HTML-only).
- **HTML:** new `brand_css` endpoint / `cli.mjs css` for HTML artifacts the agent builds (variables,
  `.brand-hero`, `.brand-logo`, `.brand-img-*`, buttons/panels); restyling an existing page adds a
  `<style data-brand-style>` block (heading style + user-approved `html_backgrounds`) and never edits the DOM.
- **Restyle improvements:** theme dark1/light1 (text/background) are now mapped, with a contrast guard;
  hard-coded fonts are surfaced as uncertain items; charts and embedded pictures are reported as not restyled.
- `cli.mjs style` edits the style file (bg / place / html-bg / text / overlay) with validation.
- BrandSpec schema 1.0 · BrandStyle 1.0 · IR 1.0 (adds `brand`, `style`) · outline 1.0.

## 0.3.0 — 2026-10-08
- **PDF style guides:** text (so "Primary: #1A73E8" / "Heading font: …" are read as explicit), every
  vector fill/stroke colour, and the fonts the text uses. Scanned/image-only PDFs are reported as
  unreadable, never guessed. First 30 pages.
- **Branded template:** `template_deck` / `cli.mjs template` — all layouts plus a labelled sample slide each;
  optional logo (png/jpg/svg ≤ 2 MB) on title and closing layouts.
- **Add slides later:** `add_slides` / `cli.mjs add-slides` appends on-brand slides to a deck made by the
  plugin without touching existing slides (so user edits survive); refuses decks lacking the branded layouts.
- Layouts grew from 3 to 6: added `two-column` (`left`/`right`), `quote` (title + attribution subtitle), `closing`.
- Skill: wider trigger, template-first workflow.
- BrandSpec schema 1.0 · IR 1.0 · outline 1.0 (additive).

## 0.2.0 — 2026-10-08
- **Local files and folders:** `node cli.mjs extract <file|folder|url>` reads pptx/html/css/svg/
  md/txt/json from disk (folder walk: depth 4, 200 files, no symlinks, skips `node_modules` and
  dot-folders) and reports which files were used and which (PDF/images) were ignored. Local paths are
  deliberately CLI-only; the HTTP backend never reads caller-chosen paths.
- **Draft a deck:** new `draft_deck` endpoint / `cli.mjs draft` builds an editable PPTX from an outline
  (title / section / content layouts) with real masters + layouts and the brand palette and fonts in
  the theme; returns an approximate preview.
- `cli.mjs` also drives map / set / render with JSON files, so agents don't pass base64 around.
- Fix: font names were mangled by the CSS parser; CSS custom properties were mislabelled `explicit`.
- BrandSpec schema 1.0 · IR 1.0 · outline 1.0.

## 0.1.0 — 2026-10-08
- First release (pre-1.0: contract may still change on minor bumps until validated against real
  customer sites — Phase 4 of `sales-plugin.md`).
- Endpoints: `extract_brand_spec` (URL, and pptx/html/css/svg/txt/md/json uploads),
  `map_template` (HTML, PPTX), `render_output` (HTML token swap, PPTX theme + per-shape).
- Security: SSRF guard (public addresses only, per-hop redirect check, optional
  `BRAND_DOMAIN_ALLOWLIST`), size/time limits, upload scan hook (`BRAND_SCAN_COMMAND`,
  `BRAND_SCAN_REQUIRED=1` to fail closed), bearer auth (`BRAND_API_KEY`), IR tamper check (sha256).
- Not implemented: PDF and image style-guide extraction, vision call (screenshot is returned for the
  skill to inspect), rendered PPTX slide preview.
- BrandSpec schema 1.0 · IR 1.0.
