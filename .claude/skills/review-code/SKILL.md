---
name: review-code
description: Review the Toolpath DFM application for concrete architecture, security, performance, and maintainability defects without editing it.
---

# Review Code

This is a read-only review. Inspect the relevant diff and code first, then
report objective, actionable findings ordered by severity. Do not make fixes.

Use the repository's real gates where useful:

- `pnpm lint` for the style rules and the layering.
- `pnpm check-types` for workspace type-checking.
- `pnpm test` for unit tests.
- `pnpm audit` for dependency health.
- `pnpm test:e2e` when the review includes browser behavior or a user-facing
  flow. Do not run the Docker build unless the reviewed change affects it.

There is no configured coverage script. State that as unavailable rather than
substituting a different tool or treating its absence as a passing result.

## What is already proven, and what is left for you

`pnpm lint` fails on any of these, so do not spend the review restating them.
Run it, and if it is clean, say so and move on:

- browser code under `app/` importing `server/`, by alias or by relative path;
- a runtime (non-type) Toolpath SDK import outside `apps/dfm/server`;
- `app/shared/` importing any other layer;
- the style rules listed in the AGENTS.md table.

The review is for what no check can see:

- Browser code calls only app-owned `/api/*` endpoints, and the server validates
  client input and upstream responses at that boundary.
- API keys and raw presigned/artifact URLs are not logged, persisted, or handed
  to the browser. CAD uploads stay direct to the presigned URL.
- Part analysis and feature enrichment are asynchronous jobs; route behavior
  handles queued, running, succeeded, and failed correctly.
- Pure client-domain logic sits in `app/shared/` with focused tests, and React
  components and Hono handlers stay thin.

## Blast radius

For the change under review, ask what a plausible next requirement in the same
area would cost. If a single change of intent forces edits across several
modules, the finding is the coupling, not the edit — name the specific import or
shared shape that causes the ripple, and where the seam should be.

Some files already amplify that cost. Get the current set rather than trusting a
list — a typed table goes stale within a few commits:

```sh
find apps/dfm/app -name '*.ts' -o -name '*.tsx' | grep -v '\.test\.' \
  | xargs wc -l | sort -rn | sed -n '2,8p'
```

`part-inspector.tsx`, `map-features.tsx`, `metrics.ts`, `rules.ts`,
`best-reading.ts`, and `rule-editor.tsx` have held the top of that list; check
whether the diff moved any of them. Size alone is not a finding. Growth in one
of them, in a change that had a seam available, is.

## Guides and sensors

When a finding is a rule that a command could prove rather than a judgment about
this diff, say so and name the check that would prove it — a rule in
`eslint.config.js`, a case in `scripts/check-style.mjs`, or a test. A convention
repeated in review is a convention that will be violated again.

## Reporting

Also flag demonstrated duplication, missing error handling, unbounded work,
large response payloads, excessive rerenders, and unnecessary client-bundle
growth. Do not make speculative refactor suggestions. For every finding give the
exact path, evidence, impact, and a concrete remediation direction; note when a
safe refactor needs tests first. End with a prioritized plan only when findings
justify one.
