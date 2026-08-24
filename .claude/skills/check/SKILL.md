---
name: check
description: Verify the Toolpath DFM template with its real pnpm quality gates. Use when asked to check, verify, or confirm the repository is passing.
---

# Check

Run checks from the repository root. This is a pnpm 10/Turborepo workspace;
do not substitute `npm`, `npx`, or a bare `tsc` command.

1. Inspect `git status --short` first and leave unrelated work untouched.
2. Run `pnpm check`. It is the normal fast gate and runs the workspace build,
   type generation/type-checking, and unit tests.
3. Run `pnpm audit` as a separate dependency-health check. Report an audit
   failure as a finding; do not change dependencies unless the user asks.
4. Run `pnpm test:e2e` when the user requests full verification, the change
   affects a user flow, routes, server behavior, or browser integration. It
   requires Playwright's Chromium dependency; report a missing browser or
   environment prerequisite as skipped, not passed.

Do not run the Docker build by default. The CI workflow does run it, but it is
a slower release gate; run `pnpm --filter @toolpath/dfm docker:build` only
when the user asks for CI-equivalent verification or the Docker image changed.

Report each command with `passed`, `failed`, or `skipped` and its reason. Never
read `apps/dfm/.env` or expose its contents while investigating failures.
