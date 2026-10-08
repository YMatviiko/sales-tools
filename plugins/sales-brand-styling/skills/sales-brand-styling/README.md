# sales-brand-styling

DIAL plugin for sales managers: extract a customer's brand from a URL or style guide, then
re-style the manager's own HTML or PPTX template to match. A Node backend (three deterministic
endpoints) plus a thin skill (`SKILL.md`) that runs the conversation and approval checkpoints.
Design and rationale: `../sales-plugin.md`.

## For sales managers

You don't need to learn any commands. Open Claude Code in your project folder and say what you need, for example:

- "Make a PowerPoint for Acme. Here is their website: https://acme.com"
- "Restyle my deck (drag in the file) for Acme. Their brand guide is in this folder."
- "Add three slides about our services to the Acme template."
- "Show me what this can do." (builds a demo from a real website, apple.com unless you name another; nothing to prepare)

Claude shows you a **brand board** (a page with sample slides in the customer's look) and asks if it looks right.
You answer in plain words ("make the blue darker", "don't use that photo"). Always open the final PowerPoint file
yourself before sending it to a customer.

## Distributing to the sales team (maintainers)

This folder is the plugin's skill; the repo root is the marketplace. To release: edit, run `npm test`, bump `VERSION` and add a `CHANGELOG.md`
entry, run `npm run sync-plugin-version` and `node check-release.mjs`, then commit and push. Each sales manager runs once:

```bash
claude plugin marketplace add <owner>/<repo>
claude plugin install sales-brand-styling@sales-tools
```
then restarts Claude Code. Packages install themselves on first use (about a minute, needs internet). Updates: `claude plugin update sales-brand-styling@sales-tools`.
Computers need Claude Code, Node 18+ and Google Chrome.

## One-time setup (IT or a developer, ~5 minutes) — without the plugin

```bash
git clone <this-repo-url> .claude/skills/sales-brand-styling
cd .claude/skills/sales-brand-styling && npm run setup     # installs and checks; prints what's missing in plain English
```
Then restart Claude Code. Everything below is reference for developers and maintainers.

## Reference

The skill triggers on requests to brand, re-skin or build material for a customer. `npm run doctor` checks the setup; `npm run demo` builds a sample customer end to end.

## Use it on local files (no server needed)

```bash
node cli.mjs extract ~/Downloads/acme-brand --out brand-spec.json   # file, folder or URL
node cli.mjs map my-deck.pptx --spec brand-spec.json --out ir.json   # restyle your template
node cli.mjs set ir.json hardcoded:#ABCDEF=#1A73E8                   # answer an uncertain item
node cli.mjs render ir.json                                          # -> my-deck.branded.pptx + preview
node cli.mjs template --spec brand-spec.json [--logo logo.png] --out acme-template.pptx   # branded template
node cli.mjs add-slides acme-template.pptx --spec brand-spec.json --outline outline.json   # append slides later
node cli.mjs draft --spec brand-spec.json --outline outline.json --out proposal.pptx       # whole deck at once
```

Outline layouts: `title`, `section`, `content` (`bullets`), `two-column` (`left`/`right`), `quote`
(title = quote, `subtitle` = attribution), `closing`. `add-slides` works on decks made by `template`/`draft`.
PDF style guides need a text/vector PDF; scanned PDFs are reported as unreadable.

Brand imagery and text styles (backgrounds, logo, illustrations, heading style):

```bash
node cli.mjs extract ~/Downloads/acme-brand --out out/brand-spec.json     # also writes out/brand-style.json + out/brand-assets/
node cli.mjs style out/brand-style.json bg title=hero-1 closing=hero-1     # image backgrounds (with colour overlay)
node cli.mjs style out/brand-style.json place illustration-1 section corner-br
node cli.mjs style out/brand-style.json text case=upper letter_spacing=1.5
node cli.mjs template --spec out/brand-spec.json --style out/brand-style.json --out acme.pptx
node cli.mjs map deck.pptx --spec out/brand-spec.json --style out/brand-style.json   # restyle with the same style
node cli.mjs css --spec out/brand-spec.json --style out/brand-style.json --out brand.css   # for an HTML artifact
```

Positions: `right left corner-br corner-bl corner-tr band-bottom`. PowerPoint output uses png/jpg only
(SVG works in HTML). Only use images you have the right to use for that customer.

Confirm visually before building anything:

```bash
node cli.mjs board --spec out/brand-spec.json --style out/brand-style.json --open     # opens a brand board in the browser
node cli.mjs board --spec … --style … --artifact --out board.artifact.html             # fragment for the Artifact tool
```
`--open` also works on `template`, `add-slides`, `draft` and `render` (opens the preview).

The look of the layouts follows how the customer's site is built (image-led or text-led, airy or dense, centred or left,
headline size, corner shape). It is measured automatically when a browser is available; change it with
`node cli.mjs design brand-style.json imagery=balanced align=left`. Outline layouts: `title section content two-column quote
closing statement image` (`image` takes an optional `image: "<asset id>"`).

Slide catalog (42 slide types beyond the basics):

```bash
node cli.mjs slides                       # all types, grouped, with their fields and limits
node cli.mjs slides sla                   # one type: fields and a sample
node cli.mjs storyline it-service-description   # a ready-made slide sequence to propose to the user
node cli.mjs catalog --spec brand-spec.json --style brand-style.json --open   # a deck with every type in this brand, to pick from
```
Groups: opening and context, making the case, IT process and delivery, technical depth, plans and timelines, proof and people, commercial.
Slides are native shapes and tables, adapt to the brand, and follow the site's light/dark rhythm. API: `POST /slide_catalog`.

Charts and PowerPoint styles:

```bash
node cli.mjs chart sales.csv --type column --unit M --highlight Q4 --source "Source: CRM" --out chart.json   # CSV -> chart for an outline
```
A `chart` slide (or HTML block) takes `{type, labels, series, unit, highlight, source, sample}`. PowerPoint charts are native and editable. Decks carry
a full theme: "<Customer> Brand" colour scheme, font scheme and master text styles.

HTML in the customer's style:

```bash
node cli.mjs html-components --spec brand-spec.json --style brand-style.json --open        # their nav, buttons, cards, footer
node cli.mjs html --spec brand-spec.json --style brand-style.json --blocks blocks.json --mode prototype --open   # prototype: their real components
node cli.mjs html --spec brand-spec.json --style brand-style.json --blocks blocks.json --mode onepager --open    # one-pager: their design language
node cli.mjs html-check page.html --spec brand-spec.json --style brand-style.json         # hand-edited page still on-brand?
```
Block types: `nav hero statement feature cards text quote cta form footer`. Prototype mode needs a live-page measurement (a browser; see `doctor`).
Slide backgrounds in decks follow the site's rhythm (alternating / dark / light); set `tone: light|dark` on a slide to override.

Fonts — customer font only if it needs no licence, else the closest free Google Font:

```bash
node cli.mjs fonts brand-spec.json                       # what was decided, and why
node cli.mjs fonts brand-spec.json heading=Poppins       # pick one of the alternatives
node cli.mjs fonts brand-spec.json --keep "Gotham"       # ONLY if the customer's licence covers it
node cli.mjs font-suggest "Proxima Nova"                 # ask before extracting
node cli.mjs fonts-download brand-spec.json --out-dir fonts   # TTFs to install before opening the .pptx
node cli.mjs css --spec brand-spec.json --embed-fonts --out brand.css   # self-contained HTML
```

The customer's font is used when it is free (Google Fonts, or pre-installed with Windows/Office) or there is evidence it is licensed for you
(the customer's font files are in the brand folder, or it is installed on this computer). Anything else is replaced by the nearest free
Google Font, chosen from researched look-alikes (`data/font-analogues.json`). Nobody is asked to choose a font. Decks reference fonts by name — each viewer must have them installed (PowerPoint font
embedding isn't implemented). Refresh the catalogue: `node scripts/update-google-fonts.mjs`.

Local paths are CLI-only; the HTTP backend never reads paths chosen by a caller.

## Run the backend

```bash
npm start            # http://127.0.0.1:8787  (PORT to change)
npm test
```

Register `GET /openapi.json` with DIAL Core as the tool spec. Optional: `npm install` already
tries `playwright-core`; for hero screenshots also run `npx playwright-core install chromium`.

| Env var | Purpose |
|---|---|
| `BRAND_API_KEY` | Require `Authorization: Bearer <key>` on the POST endpoints |
| `BRAND_DOMAIN_ALLOWLIST` | Comma-separated domains the scraper may fetch (suffix match) |
| `BRAND_SCAN_COMMAND` | Scanner run on every upload, e.g. `clamscan --no-summary`; non-zero exit rejects |
| `BRAND_SCAN_REQUIRED=1` | Refuse uploads when no scanner is configured |

Before go-live: run behind an egress-restricted network (the in-process SSRF check is a
backstop, not a substitute), configure a scanner, and settle the retention policy — the backend
is stateless and stores nothing, but your host's logs and proxies may.

## Update

```bash
git -C .claude/skills/sales-brand-styling pull && npm --prefix .claude/skills/sales-brand-styling install
```

## Releasing (maintainers)

1. Change code / `SKILL.md` / `openapi.json`; run `npm test`.
2. Bump `VERSION` (patch = fix, minor = new capability, major = breaking) and add a
   `## x.y.z — date` entry to `CHANGELOG.md`. Keep `package.json` and `openapi.json` `info.version`
   equal to `VERSION`. A BrandSpec/IR contract change also bumps its own version.
3. `node check-release.mjs` — must print `OK`. It prints the commit/tag/push commands.
4. Tell the team to pull, `npm install`, and restart. To pin a release: `git checkout v0.1.0`.
