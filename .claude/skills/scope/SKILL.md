---
name: scope
description: Define a focused product change for a Toolpath-powered DFM application before substantial implementation work. Use when asked to scope a feature, rework the template, or clarify a stalled product direction.
---

# Scope

Use this skill to clarify a substantial rework or feature, not to re-scope the
entire existing template by default. Ask one decision-relevant question at a
time, skipping information already available in the repository or user request.

Establish:

1. the user and the concrete manufacturing decision the product should help
   them make;
2. the smallest end-to-end outcome and explicit non-goals;
3. applicable CAD, privacy, deployment, and Toolpath API constraints;
4. the affected layers: React client, Hono server, shared contracts/domain
   logic, and integration tests;
5. an observable first milestone and its acceptance criteria.

For API-related work, preserve the required boundary: API credentials remain
server-side, upload/artifact URLs are short-lived, and processing is modeled as
an asynchronous job. Before changing an API contract, fetch the current
Toolpath OpenAPI document at `https://api.toolpath.com/v1/openapi.json`.

Summarize the decisions and proposed milestone before writing. Only create or
update a scoped design note when the user confirms; prefer an existing project
documentation location such as `apps/dfm/docs/` and do not overwrite unrelated
documentation. The result should name affected contracts, tests, and any
open decisions without inventing product requirements.
