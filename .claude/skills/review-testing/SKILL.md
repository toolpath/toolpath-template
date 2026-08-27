---
name: review-testing
description: Audit the Toolpath DFM template's Vitest, Playwright, and CI coverage for meaningful behavioral gaps without changing tests.
---

# Review Testing

This is a read-only test review. Audit what the tests prove rather than merely
counting test files. Use this repository's actual test layout and commands:

- `apps/dfm/app/**/*.test.{ts,tsx}` covers client contracts, components, and
  pure shared-domain logic through Vitest.
- `apps/dfm/server/**/*.test.ts` covers Hono server behavior through Vitest.
- `apps/dfm/tests/*.spec.ts` covers browser flows through Playwright.
- `pnpm test` runs the setup-script test and all workspace unit tests.
- `pnpm test:e2e` runs Playwright against the production app build.
- `.github/workflows/ci.yml` runs `pnpm check`, installs Chromium, runs E2E,
  and builds the production Docker image on pull requests and `main` pushes.

Run the narrowest relevant command(s), plus `pnpm check-types` when type errors
could hide test failures, and `pnpm lint` — it is the structural test layer, and
it proves the layering that no unit test asserts. Coverage tooling is not
configured; report that fact plainly but do not install it or treat a numeric
target as the goal.

## Where a test belongs

`apps/dfm/docs/README.md` § Testing settles this, its reasons are in
`docs/directions-replay.md`, and the `setup-testing` skill restates it for
writing. Read one of those rather than working from instinct, and audit against
it: a click-on-part test outside `tests/on-the-part.spec.ts`, or any test built
on captured Engine JSON, is a finding on placement alone regardless of what it
asserts.

## Behavioral seams to prioritize

- session-cookie and API-key handling, including redaction;
- Zod validation and app-owned API response contracts;
- direct upload, asynchronous job/SSE transitions, errors, and expired
  artifact retry behavior;
- pure rule, scoring, selection, measurement, and report transformations;
- representative UI interactions and the end-to-end part-analysis flow.

## Sensor coverage

Separately from missing tests, report which behaviors and which AGENTS.md rules
have no automated proof at all — nothing in Vitest, Playwright, `eslint.config.js`,
or `scripts/check-style.mjs` that would fail if they were broken. Naming that set
is itself the finding, because those are the rules a long session drifts off
first. The AGENTS.md style table marks its own unproven rules as judgment; check
whether that list is still honest, in both directions — a rule marked judgment
that now has a sensor is as stale as one claiming a sensor it lacks.

Two tests are sensors rather than coverage, and are audited as rules:

- `app/styles.test.ts` — cascade-layer ordering and light/dark role parity.
- `app/kit-usage.test.ts` — a ratchet holding raw `<button>` at or below a
  budget. If the count has fallen well under it and the budget was not lowered,
  that is a finding: the ground is not being kept.

## Reporting

Flag weak assertions, implementation-mirroring tests, over-mocking inside a
single layer, missing error/edge-state cases, focused or skipped tests, and CI
steps that can hide a failure. Do not recommend tests for static presentation or
framework bootstrap that has no behavior. Give each finding a path, the missing
behavior, and the most suitable test level (unit, component, route, or E2E),
then provide a short priority-ordered plan if action is warranted.
