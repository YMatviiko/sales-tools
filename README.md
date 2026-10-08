# Sales tools (Claude Code marketplace)

One plugin so far: **sales-brand-styling**, which turns a customer's website, brand guide or files into on-brand PowerPoint decks, HTML prototypes and one-pagers.

Install (once per computer; needs Claude Code, Node 18+, Google Chrome):

```
claude plugin marketplace add <owner>/<repo>
claude plugin install sales-brand-styling@sales-tools
```

Restart Claude Code, then say: "Make a PowerPoint for Acme. Their website is https://acme.com".

## What it can do

You never type commands: open Claude Code and describe the job in plain words. Claude reads the customer's look, shows you a **brand board**
(a page with sample slides) to confirm, and then builds.

**1. Learn a customer's brand** from any of: a website URL, a style-guide PDF, a folder of brand files, or an existing PPTX / HTML / CSS file.
It picks up colours, fonts, imagery, layout feel (airy or dense, rounded or sharp), the site's light/dark rhythm and its real components.
Fonts: the customer's own if free to use (or installed on your computer), otherwise the closest free Google Font. You are never asked to choose one.

**2. PowerPoint**
- *Branded template:* a blank, editable deck with the customer's theme colours, fonts, text styles, backgrounds and picture placeholders.
- *Whole deck at once:* "Make a sales proposal for Acme" builds a full draft in their style.
- *Add slides* to the template or to a deck you already edited. Your manual edits in PowerPoint are kept.
- *Restyle your own deck* (or a PDF you have) in the customer's look.
- *Slide catalog:* 50+ slide types to pick from, in groups: opening and context, making the case, IT process and delivery (process flow, swimlane, SLA, RACI, governance, incident and change), architecture and security, plans and timelines, proof and people, commercials.
- *Storylines:* ready running orders for a sales proposal, IT service description, technical deep-dive, project kick-off, status report. Ask "what slides should this deck have?"
- *Charts* are native and editable, in the customer's palette. Slides also have image placeholders.

**3. HTML**
- *Prototype* built from the customer's own patterns and components (navigation, buttons, cards), not a generic page.
- *One-pager* in the same style as the deck.
- *Any HTML artifact* (landing page, mock-up) styled in their brand.

**4. Try it first:** say "show me what this can do". It builds a demo from a real website (apple.com unless you name another).

Always open the final `.pptx` in PowerPoint and check it before it goes to a customer. Previews in the browser are approximate.

Maintainers: the skill lives in `plugins/sales-brand-styling/skills/sales-brand-styling/` (see its README and CHANGELOG).
