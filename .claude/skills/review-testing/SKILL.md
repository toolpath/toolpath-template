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

`apps/dfm/docs/README.md` § Testing already settles this, and its reasons are in
`docs/directions-replay.md`. Audit against it rather than against instinct:

- **Pure logic belongs in `app/shared/*.test.ts`.** That is where most of the
  value is and the cheapest place to add it.
- **Component tests work**, including for components importing `@toolpath/ui`
  (`face-list.test.tsx` is the proof). They are the cheapest coverage for
  anything list-shaped.
- **Anything that begins with a click on the part belongs in
  `tests/on-the-part.spec.ts`**, against `tests/cube-fixture.ts` — the only
  fixture that mounts geometry. Every other hand-built report sets
  `hasMeshGlb: false`, and three logged bugs reached users because nothing else
  could catch them. A test for click-on-part behavior placed anywhere else is a
  finding.
- **Never import captured Engine JSON.** Reports are built by hand with
  `tests/part-fixture.ts`; a foreign report tests another codebase's
  normalization too.

## Behavioral seams to prioritize

- session-cookie and API-key handling, including redaction;
- Zod validation and app-owned API response contracts;
- direct upload, asynchronous job/SSE transitions, errors, and expired
  artifact retry behavior;
- pure rule, scoring, selection, measurement, and report transformations;
- representative UI interactions and the end-to-end part-analysis flow.

## Sensor coverage

Separately from missing tests, report which behaviors and which AGENTS.md rules
have no automated proof at all — nothing in Vitest, Playwright, `pnpm lint`, or
`scripts/check-style.mjs` that would fail if they were broken. Naming that set
is itself the finding, because those are the rules a long session drifts off
first. The AGENTS.md style table marks its own unproven rules as judgment; check
whether that list is still honest.

## Reporting

Flag weak assertions, implementation-mirroring tests, over-mocking inside a
single layer, missing error/edge-state cases, focused or skipped tests, and CI
steps that can hide a failure. Do not recommend tests for static presentation or
framework bootstrap that has no behavior. Give each finding a path, the missing
behavior, and the most suitable test level (unit, component, route, or E2E),
then provide a short priority-ordered plan if action is warranted.
