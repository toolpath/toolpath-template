---
name: setup-testing
description: Add focused Vitest or Playwright coverage to the existing Toolpath DFM template test setup. Use when asked to add tests or cover changed behavior.
---

# Add Tests

This repository already has Vitest, React Testing Library, Playwright, a
workspace test command, and CI. Do not replace the configuration or install a
second test framework.

## Where a test goes

`apps/dfm/docs/README.md` § Testing is the source for this, and its reasons are
in `docs/directions-replay.md`. These four rules are not preferences, and
`review-code`/`review-testing` will flag a test that breaks them:

- **Pure logic goes in `app/shared/*.test.ts`.** That is the bulk of the value
  and the cheapest place to add coverage. Prefer moving logic here over testing
  it through a component.
- **Component tests work, including for components importing `@toolpath/ui`.**
  `app/components/face-list.test.tsx` is the proof. They are the cheapest
  coverage for anything list-shaped.
- **Anything that begins with a click on the part goes in
  `tests/on-the-part.spec.ts`**, against `tests/cube-fixture.ts` — the only
  fixture that mounts geometry. Every hand-built report sets `hasMeshGlb: false`,
  so none of that stack is reachable elsewhere, and three logged bugs reached
  users because nothing could catch them. Putting a click-on-part test anywhere
  else does not test it.
- **Never capture a real part's report and check it in.** Build reports by hand
  with `tests/part-fixture.ts`; a foreign report tests another codebase's
  normalization too. The single exception is the vendored viewer cube that
  `tests/cube-fixture.ts` reads — geometry cannot be written out by hand, and
  `@toolpath/viewer` publishes `dist` only, so there is nothing to import. Do
  not add a second exception without the same kind of reason.

Otherwise choose the smallest level that protects the behavior:

- client API behavior or interactive components — Vitest and Testing Library in
  the owning `app/` area;
- Hono validation, session, proxy, upload, SSE, or artifact behavior — a focused
  `apps/dfm/server/**/*.test.ts` with network boundaries mocked;
- a complete browser journey — a Playwright spec in `apps/dfm/tests/`, only when
  a unit or route test cannot prove it.

## A rule may want a sensor instead of a test

Some behavior is not reachable by rendering anything. Four existing tests read
source files directly rather than exercising a component, and a new
repository-wide invariant usually belongs alongside them:

- `app/styles.test.ts` reads `app/styles.css` for cascade-layer ordering and
  light/dark role parity.
- `app/kit-usage.test.ts` ratchets raw `<button>` against the `@toolpath/ui`
  kit. When a migration lands, lower its `BUDGET` in the same change.
- `app/shared/reported-regions.test.ts` holds the allowlist of files that may
  read `regionIdxs` rather than asking the plan what a reading cuts. Adding a
  path to it is a claim; put the reason beside the use.
- `app/shared/redaction.test.ts` builds its fixture from the installed SDK's own
  `PartResponse` declaration, so a URL field added upstream cannot slip through
  `toPublicInspectionReport` unnoticed. A failure there is an SDK handing out a
  URL nobody has decided about yet.

If the behavior is really a convention rather than a case, the sensor may belong
in `eslint.config.js` or `scripts/check-style.mjs` instead. AGENTS.md § Code
Styling says which sensor owns which rule.

## Writing them

Keep tests behavior-focused: assert specific outputs, request/response
contracts, errors, and state transitions. At Toolpath boundaries, never use a
real API key, a live API call, or a real presigned URL; use realistic redacted
fixtures and test that sensitive upstream fields cannot reach the browser.

Run the closest test first (`pnpm --filter @toolpath/dfm test` for Vitest or
`pnpm test:e2e` for Playwright), then `pnpm check` when the change affects
multiple layers — it runs `pnpm lint`, which proves the layering a new test file
must also respect. CI already runs the quality gate, E2E suite, and Docker
build; do not modify its workflow unless the user's request changes a gate.
