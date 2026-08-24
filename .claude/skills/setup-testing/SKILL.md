---
name: setup-testing
description: Add focused Vitest or Playwright coverage to the existing Toolpath DFM template test setup. Use when asked to add tests or cover changed behavior.
---

# Add Tests

This repository already has Vitest, React Testing Library, Playwright, a
workspace test command, and CI. Do not replace the configuration or install a
second test framework.

Choose the smallest test level that protects the requested behavior:

- For deterministic contracts, transformations, rules, scoring, selection, or
  presentation helpers, add a colocated test in `apps/dfm/app/shared/`.
- For client API behavior or interactive components, use Vitest and Testing
  Library in the owning `app/` area.
- For Hono validation, session, proxy, upload, SSE, or artifact behavior, add
  a focused `apps/dfm/server/**/*.test.ts` test with network boundaries mocked.
- For a complete browser journey or integration between client and server, add
  a Playwright spec in `apps/dfm/tests/` only when a unit/route test cannot
  prove it.

Keep tests behavior-focused: assert specific outputs, request/response
contracts, errors, and state transitions. At Toolpath boundaries, never use a
real API key, a live API call, or a real presigned URL; use realistic redacted
fixtures and test that sensitive upstream fields cannot reach the browser.

Run the closest test first (`pnpm --filter @toolpath/dfm test` for Vitest or
`pnpm test:e2e` for Playwright), then run `pnpm check` when the change affects
multiple layers. CI already runs the quality gate, E2E suite, and Docker build;
do not modify its workflow unless the user's request changes a gate.
