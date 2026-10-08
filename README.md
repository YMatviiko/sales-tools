# Sales tools (Claude Code marketplace)

One plugin so far: **sales-brand-styling**, which turns a customer's website, brand guide or files into on-brand PowerPoint decks, HTML prototypes and one-pagers.

Install (once per computer; needs Claude Code, Node 18+, Google Chrome):

```
claude plugin marketplace add <owner>/<repo>
claude plugin install sales-brand-styling@sales-tools
```

Restart Claude Code, then say: "Make a PowerPoint for Acme. Their website is https://acme.com".

Maintainers: the skill lives in `plugins/sales-brand-styling/skills/sales-brand-styling/` (see its README and CHANGELOG).
