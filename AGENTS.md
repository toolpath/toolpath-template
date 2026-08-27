# Toolpath Template Agent Guide

This repository is a customer-facing design-for-manufacturability application
built with React Router, React, Hono, TypeScript, Vitest, Playwright, pnpm, and
Turborepo. It is a github template that user's can use to build their own products from with ease using Toolpath's API. The user may rework things significantly so be sure to check the current repo state rather than fully relying on this document, if the user makes signigicant changes be sure to update this document along with them so future AI Agents know how to work in their repo.

## What is Toolpath

Think of Toolpath as a go no-go gauge for your shop. It's a quick way to see if a part is a good fit for your shop based on your tool library.
Toolpath should be able to help you answer these three questions.

- Can I make this part with my tools?
- How am I going to make this part?
- How much is it going to cost me?

## Toolpath API Documentation

- Use [developers.toolpath.com](https://developers.toolpath.com/) for Toolpath
  API guides, authentication guidance, SDK examples, and generated reference
  documentation. If it would help the user understand things link them directly to the documentation or reference it (only do this if necessary).
- Fetch the current full API contract from
  `https://api.toolpath.com/v1/openapi.json` before implementing or changing
  Toolpath API calls, request payloads, responses, or client generation. This endpoint does not need API key authentication so you can hit it using curl at any time to get the up to date API documentation.
- Treat the OpenAPI document as the source of truth for the current API shape;

## Toolpath API Data Model and Flow

- A **part** is an uploaded CAD source. Creating one returns a `partId` and a
  short-lived presigned URL for a direct upload.
- An asynchronous **job** processes a part or enriches selected features. Its
  states are `queued`, `running`, `succeeded`, and `failed`. Processing state can be obtained from an SSE events endpoint.
- A successful processing job produces an immutable **part result** containing
  regions, recognized features, candidate machining directions, mesh metadata,
  and short-lived artifact URLs.
- A **region** is one recognized CAD surface piece, such as a planar face or a
  cylindrical wall. It has a stable part-local index, geometric information,
  and a range of triangles in the generated mesh.
- A **feature** references its owning regions and has a type and machining
  direction. Several features can share a region because the same physical
  surface can be recognized differently from different machining directions.
  Feature-detail jobs add machining datasheets for selected feature IDs.
- All lengths and areas are in millimetres; all angles are in degrees.

The normal flow is: authenticate server-side, create the part, upload CAD
directly to the presigned URL, start processing, stream job events, then read
the completed part result. This template's Hono server keeps the API key and
raw artifact URLs out of the browser; the browser uploads CAD bytes directly to
object storage and receives only app-owned responses.

## Toolpath Integration Guidelines

These are API and security constraints, not a requirement to preserve this
template's Hono routes or UI structure when a user reworks the application.

- Fetch the current OpenAPI document before changing an API integration, and
  validate upstream inputs and responses at the application's boundary.
- Keep long-lived API keys out of browser code. If a product needs browser API
  requests, explicitly follow the API documentation for origin restrictions,
  key scope, and read-only access.
- Use presigned URLs for direct CAD uploads when the API provides them; do not
  relay large CAD bytes through an application server without a concrete need.
- Model part processing and feature enrichment as asynchronous jobs. Use job
  events or the documented status endpoint instead of assuming immediate
  results.
- Treat presigned upload and artifact URLs as short-lived credentials. Do not
  persist or log them; proxy or relay them when a browser should not receive the
  upstream URL.
- Update focused unit or end-to-end tests whenever an app-owned API contract or
  Toolpath integration behavior changes.

## Code Styling

Every rule below is either proven by a command or marked as judgment. A rule with
a sensor is not a matter of taste: the gate fails and the work stops. A rule
without one is a preference a reviewer has to carry in their head, and agents
drift off those the longer a session runs — so when a judgment rule starts being
violated, give it a check rather than restating it here.

| Rule                                                                 | Proven by          |
| -------------------------------------------------------------------- | ------------------ |
| `const name = () => {}`, never `function name() {}`                  | `pnpm check-style` |
| `Array<Item>`, never `Item[]` — left to right is more explicit       | `pnpm lint`        |
| Braces and multiple lines on every `if`, never a single-line one     | `pnpm lint`        |
| Import React members individually (`ReactNode`), never `React.X`     | `pnpm lint`        |
| `components/*`, `client/*`, `routes/*`, `shared/*` aliases in `app/` | `pnpm lint`        |
| Only `apps/dfm/server` uses the Toolpath SDK at runtime              | `pnpm lint`        |
| The layering under Project Map                                       | `pnpm lint`        |
| Every colour role defined under both `:root` and `.dark`             | `pnpm test`        |
| Font resets stay inside `@layer base`, where a utility can win       | `pnpm test`        |
| `@toolpath/ui` components over hand-authored HTML, while it is used  | `pnpm test`        |
| Tailwind classes for styling; `style={{}}` only for a computed value | judgment           |

What the checks cannot carry:

- `React.MouseEvent` and the other names a DOM global already takes are the
  documented exception. The check allows exactly those and nothing else.
- Route modules export the component separately (`const Route = () => {}` then
  `export default Route`) rather than as a default declaration.
- `style={{}}` is right for a value only known at runtime — a band or direction
  colour, a computed width. Everything static is a Tailwind class.
- `apps/dfm/server` deliberately keeps relative imports into `app/shared`:
  production runs `tsx server/prod.ts` with no bundler to resolve an alias.
- The kit rule is a **ratchet, not a ban**. `app/kit-usage.test.ts` pins raw
  `<button>` at its current count so it can fall but not rise; the kit exports
  `Button` and `IconButton`, and both take `aria-*` and `title` through. Reach
  for the kit in new code, and lower the budget in that file whenever a
  migration lands. A failure there is the rule being broken, not a flaky test.
- The two stylesheet rules live in `app/styles.test.ts`, which reads
  `app/styles.css` directly. Neither is visible in a component or catchable by
  rendering one: an unlayered `font: inherit` beat every Tailwind font utility
  silently, and a role defined in one theme keeps the other theme's value.

Three sensors carry the table: `eslint.config.js`, `scripts/check-style.mjs`,
and the two source-reading tests above. Adding a rule means adding it to one of
them, or it is a preference rather than a rule.

## Project Map

- `apps/dfm/app/` is the browser React application.
- `apps/dfm/server/` is the Hono server and the only place that uses the
  Toolpath SDK or handles the user's API key.
- `apps/dfm/app/shared/` contains pure contracts and domain logic. Keep new
  behavior that can be pure and tested here.
- `apps/dfm/docs/` is the written spec for the part viewer. Read
  `apps/dfm/docs/README.md` before changing selection, highlighting, directions,
  or the setup plan: its tables name the exact file that decides each behavior,
  and its testing section fixes where each kind of test belongs.
- `apps/dfm/tests/` contains Playwright end-to-end coverage.
- `apps/dfm/app/**/*.test.*` and `apps/dfm/server/**/*.test.ts` contain Vitest
  coverage.

### Layering

`pnpm lint` fails on any of these, so they are facts about the code rather than
intentions about it:

- Nothing under `app/` may import `server/`. This is the API-key boundary, and
  it holds for an alias import as well as a relative one.
- `app/shared/` imports only `app/shared/`, which is what keeps it pure and
  cheap to test.
- `app/components/` may reach `client/` and `shared/`, never `routes/`.
- `server/` may import `app/shared/` for the shared contracts, and nothing else
  from `app/`.
- `app/` may import Toolpath SDK **types**; a runtime import would ship the SDK
  to the browser.

The rules live in `eslint.config.js`. Adding a layer means adding it there too,
or the boundary is a comment rather than a check.

## Safety and Secrets

- Never ask a user to paste an API key, session secret, password, token, or
  private URL into chat.
- Never read, print, summarize, stage, or commit `.env` files. Checking that a
  file exists is safe; reading its contents is not.
- During initial setup, agents may run `pnpm setup:local` to create
  `apps/dfm/.env` and install dependencies. It generates the session secret
  directly in the file without displaying it and leaves an existing file
  unchanged.
- `APP_SESSION_SECRET` and `TOOLPATH_API_BASE_URL` belong only in
  `apps/dfm/.env` locally and in the deployment platform's secret store.

## Working Style

- Explain the intended change in plain language before a broad or risky edit.
- Make the smallest correct change. Do not refactor unrelated code or add
  dependencies without a concrete need and the user's approval.
- Preserve unrelated work already present in the working tree. Never reset,
  discard, or overwrite it.
- Treat tests as part of every feature or behavior change. Add or update the
  closest meaningful test in the same session.
- After meaningful changes, run the relevant checks and report what passed,
  failed, or was skipped.
- When building UI, if the user is still using `@toolpath/ui`, be sure to always prefer the toolpath UI components and css conventions over raw HTML or other hand authored components if possible.

Before editing:

- Search for an existing pattern or shared package before adding an abstraction, dependency, or
  duplicate helper.
- Decide which contract, data model, environment, and deployment boundaries the change touches.

After editing:

- Run the narrowest relevant test/type/lint loop first, then broaden verification in proportion to
  cross-package risk.

## Commands

Run commands from the repository root unless noted otherwise.

| Purpose                            | Command                          |
| ---------------------------------- | -------------------------------- |
| Install dependencies               | `pnpm install --frozen-lockfile` |
| Run the development app            | `pnpm dev`                       |
| Check function-declaration style   | `pnpm check-style`               |
| Check style rules and the layering | `pnpm lint`                      |
| Build, typecheck, and unit test    | `pnpm check`                     |
| Run end-to-end tests               | `pnpm test:e2e`                  |

`pnpm check` runs `check-style`, `lint`, `build`, `check-types`, and `test`, in
that order, so the cheap checks fail first. `pnpm lint --fix` settles the
formatting-shaped rules on its own.

`pnpm check` is the normal fast gate. Before pushing a significant change,
also run the dependency audit, end-to-end tests, and the production
Docker build when the affected area makes those checks relevant. Only run docker build if it is absolutely necessary, most of the time it is not needed.

## Formatting

The Husky pre-commit hook installed by `pnpm setup:local` runs Prettier on staged
files. Run `pnpm format` only when the user asks or the hook cannot be used.

## Git Workflow

- Inspect `git status` and the relevant diff before staging anything. Stage
  explicit paths only, never `git add .` or `git add -A`.
- Commit only when the user explicitly asks to commit. Do not add AI
  attribution to commit messages.
- Never push as a side effect of committing. Push only when the user explicitly
  asks to publish or push.
- Never force-push, bypass hooks, run `git reset --hard`, run `git clean`, or
  use `git checkout --` unless the user explicitly asks and understands the
  consequence.

## Review guidelines

IMPORTANT - these guidelines are ONLY relevant when reviewing code, otherwise ignore them.

- State objective facts only.
- No praise.
- No vague “might be” comments. Always give real evidence.
- Focus on blocking risks first: missing auth, authorization bypass, data leakage, severe performance regressions.
- Always check:
  - architecture correctness
  - performance impact
  - maintainability
- Flag N+1 queries, unpaginated queries, excessive bundle growth, unnecessary rerenders, and large response payloads.

### Already checked, and clean

A review on 2026-08-27 established each of these and found nothing to fix. They
are recorded so the next review spends its attention somewhere new. Re-derive
one only when the code under it moves.

- **Report redaction is complete.** `toPublicInspectionReport`
  (`app/shared/contracts.ts:28`) strips `meshGlbUrl`, `meshStlUrl`, and
  `thumbnailUrl`. In `@toolpath/api` 0.2.3, `PartResponse` (those three fields)
  and `CreatePartResponse` (`uploadUrl`, which is the presigned upload the
  browser is meant to receive) are the only models that declare a URL at all —
  `Region` and `PartFeature` declare none. So the redaction covers the whole
  type rather than the fields somebody remembered. Check it again when the SDK
  version moves.
- **The browser calls only app-owned endpoints.** The one external `fetch` under
  `app/` is the presigned `PUT` at `app/client/api.ts:45`, which is the
  documented direct upload. No Toolpath host appears anywhere else in the
  client.
- **The API key never leaves the server.** HttpOnly, Secure, SameSite=Lax
  `A256GCM` JWE cookie, HKDF domain-separated from `APP_SESSION_SECRET`. Engine
  failures log the status and the operation, never the key or an artifact URL.
- **`banana.glb` is not a bundle problem.** 746 KiB, but it is a `public/`
  asset, off by default, and deliberately not preloaded — `useGLTF.preload` at
  module scope would fetch it on every page load, for something almost nobody
  turns on (`app/components/banana.tsx:149`).
- **There is no coverage tooling.** Nothing in the repo configures coverage, so
  there is no coverage number to report. That is a gap in what can be measured,
  not a failing check — do not substitute a different tool and call it coverage.
