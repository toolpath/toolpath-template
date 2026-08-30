---
name: setup-testing
description: Add focused Vitest or Playwright coverage to the existing Toolpath template test setup, for either application. Use when asked to add tests or cover changed behavior.
---

# Add Tests

This repository already has Vitest, React Testing Library, Playwright, a
workspace test command, and CI. Do not replace the configuration or install a
second test framework.

## Where a test goes

`docs/TOOL-CATALOG-PLAN.md` § Testing is the source for the catalog, and
`apps/dfm/docs/README.md` § Testing for the DFM application; their reasons are
the same. These four rules are not preferences, and `review-code` /
`review-testing` will flag a test that breaks them:

- **Pure logic goes in `app/shared/*.test.ts`.** That is the bulk of the value
  and the cheapest place to add coverage. Prefer moving logic there over testing
  it through a component — the catalog's `shared/part-interaction.ts` is what
  that looks like when a route's `useState`s become a reducer.
- **Component tests work, including for components importing `@toolpath/ui`**,
  and for `@toolpath/viewer` with the package mocked:
  `apps/catalog/app/components/part-viewer.test.tsx` is the proof. They are the
  cheapest coverage for anything list-shaped, and for the props that reach a
  package you cannot render.
- **Anything that begins with a click on the part goes in
  `tests/on-the-part.spec.ts`**, against `tests/cube-fixture.ts` — the only
  fixture that mounts geometry. Every hand-built report sets `hasMeshGlb: false`,
  so none of that stack is reachable elsewhere. Putting a click-on-part test
  anywhere else does not test it.
- **Never capture a real part's report and check it in.** The single exception
  is the vendored viewer cube in each application's `tests/fixtures/` —
  geometry cannot be written out by hand, and `@toolpath/viewer` publishes
  `dist` only. Do not add a second exception without the same kind of reason.

A package owns its own tests: code moved from an application into `packages/`
takes its coverage with it (`packages/catalog-data/src/*.test.ts`).

Otherwise choose the smallest level that protects the behavior:

- client API behavior or interactive components — Vitest and Testing Library in
  the owning `app/` area;
- Hono validation, session, proxy, upload, SSE, or artifact behavior — a focused
  `packages/part-server/src/**/*.test.ts` with network boundaries mocked;
- a complete browser journey — a Playwright spec in the application's `tests/`,
  only when a unit or route test cannot prove it.

## A rule may want a sensor instead of a test

Some behavior is not reachable by rendering anything. `eslint.config.js` and
`scripts/check-style.mjs` read source rather than exercise it, and a new
repository-wide invariant usually belongs beside them. AGENTS.md § Code Styling
says which sensor owns which rule; a rule that is in neither is judgment, and
judgment drifts.

## Writing them

Keep tests behavior-focused: assert specific outputs, request/response
contracts, errors, and state transitions. Say in the test's comment which defect
it pins when there was one; the catalog's tests do, and that is what makes a
red one readable a month later. At Toolpath boundaries, never use a real API
key, a live API call, or a real presigned URL; use realistic redacted fixtures
and test that sensitive upstream fields cannot reach the browser.

Run the closest test first (`pnpm --filter <name> test` for Vitest or
`pnpm test:e2e:<app>` for Playwright), then `pnpm check` when the change affects
multiple layers — it runs `pnpm lint`, which proves the layering a new test file
must also respect. CI already runs the quality gate, E2E suites, and Docker
build; do not modify its workflow unless the user's request changes a gate.
