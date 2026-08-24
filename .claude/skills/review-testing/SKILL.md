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
could hide test failures. Coverage tooling is not configured; report that fact
plainly but do not install it or treat a numeric target as the goal.

Prioritize missing behavior at these seams:

- session-cookie and API-key handling, including redaction;
- Zod validation and app-owned API response contracts;
- direct upload, asynchronous job/SSE transitions, errors, and expired
  artifact retry behavior;
- pure rule, scoring, selection, measurement, and report transformations;
- representative UI interactions and the end-to-end part-analysis flow.

Flag weak assertions, implementation-mirroring tests, over-mocking inside a
single layer, missing error/edge-state cases, focused or skipped tests, and CI
steps that can hide a failure. Do not recommend tests for static presentation
or framework bootstrap that has no behavior. Give each finding a path, the
missing behavior, and the most suitable test level (unit, route, or E2E), then
provide a short priority-ordered plan if action is warranted.
