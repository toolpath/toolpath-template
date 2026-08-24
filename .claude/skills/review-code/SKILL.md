---
name: review-code
description: Review the Toolpath DFM application for concrete architecture, security, performance, and maintainability defects without editing it.
---

# Review Code

This is a read-only review. Inspect the relevant diff and code first, then
report objective, actionable findings ordered by severity. Do not make fixes.

Use the repository's real gates where useful:

- `pnpm check-types` for workspace type-checking.
- `pnpm test` for unit tests.
- `pnpm audit` for dependency health.
- `pnpm test:e2e` when the review includes browser behavior or a user-facing
  flow. Do not run the Docker build unless the reviewed change affects it.

There is no configured lint or coverage script. State either as unavailable
rather than substituting a different tool or treating its absence as a passing
result.

Review against this architecture:

- Browser code in `apps/dfm/app/` calls only app-owned `/api/*` endpoints.
- `apps/dfm/server/` is the only layer that handles the Toolpath SDK or API
  key. Validate client input and upstream responses at this boundary.
- API keys and raw presigned/artifact URLs must not be logged, persisted, or
  exposed to the browser. CAD uploads should stay direct to the presigned URL.
- Part analysis and feature enrichment are asynchronous jobs; route behavior
  must correctly handle queued, running, succeeded, and failed states.
- Put pure client-domain logic in `app/shared/` and cover it with focused
  tests. Keep React components and Hono handlers as thin integration layers.

Also flag demonstrated duplication, missing error handling, unbounded work,
large response payloads, excessive rerenders, and unnecessary client-bundle
growth. Do not make speculative refactor suggestions. For every finding give
the exact path, evidence, impact, and a concrete remediation direction; note
when a safe refactor needs tests first. End with a prioritized plan only when
findings justify one.
