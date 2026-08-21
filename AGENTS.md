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
  Toolpath API calls, request payloads, responses, or client generation. This endpoint does not need API key authentication so you can hit it using curl at any time to get the up to date API documentatoin.
- Treat the OpenAPI document as the source of truth for the current API shape;

## Toolpath API DatamModel and Flow

- A **part** is an uploaded CAD source. Creating one returns a `partId` and a
  short-lived presigned URL for a direct upload.
- An asynchronous **job** processes a part or enriches selected features. Its
  states are `queued`, `running`, `succeeded`, and `failed`. Processing state can be obtained from an SSE events endpoint.
- A successful processing job produces an immutable **report** containing
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
artifact URLs out of the browser; the browser uploads CAD bytes directly to
object storage and receives only app-owned responses.

## Code Styling

- When using typescript to type an array of items, never use `Items[]`, always use `Array<Items>`, reading from left to right this is more explicit.
- Never write if statements on a single line. Always write brackets and multiline if statements.
- Never use `function functionName() {}` syntax for function definitions. Always use `const functionName = () => {}` syntax instead.
- Always import parts of React individually, e.g. `ReactNode`, `FC`, etc. instead of writing `React.ReactNode`, `React.FC`. The only exception is in cases like `MouseEvent` where there is already a `MouseEvent` on the global namespace, so `React.MouseEvent` is more explicit.
- When possible, do not use style props. Always use Tailwind CSS classes.
- Avoid importing components with relative paths like `../../component` or `./component` - instead import from full path `components/page/form/component`.

## Project Map

- `apps/dfm/app/` is the browser React application.
- `apps/dfm/server/` is the Hono server and the only place that uses the
  Toolpath SDK or handles the user's API key.
- `apps/dfm/app/shared/` contains pure contracts and domain logic. Keep new
  behavior that can be pure and tested here.
- `apps/dfm/tests/` contains Playwright end-to-end coverage.
- `apps/dfm/app/**/*.test.*` and `apps/dfm/server/**/*.test.ts` contain Vitest
  coverage.

## Safety and Secrets

- Never ask a user to paste an API key, session secret, password, token, or
  private URL into chat.
- Never read, print, summarize, stage, or commit `.env` files. Checking that a
  file exists is safe; reading its contents is not.
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

| Purpose                         | Command                                                                           |
| ------------------------------- | --------------------------------------------------------------------------------- |
| Install dependencies            | `pnpm install --frozen-lockfile`                                                  |
| Run the development app         | `pnpm dev`                                                                        |
| Build, typecheck, and unit test | `pnpm check`                                                                      |
| Run end-to-end tests            | `pnpm test:e2e`                                                                   |
| Check formatting                | `pnpm format:check`                                                               |
| Format files                    | `pnpm format`                                                                     |
| Build the production image      | `docker build --file apps/dfm/Dockerfile --target prod --tag part-viewer:local .` |

`pnpm check` is the normal fast gate. Before publishing a significant change,
also run formatting, the dependency audit, end-to-end tests, and the production
Docker build when the affected area makes those checks relevant. Only run docker build if it is absolutely necessary, most of the time it is not needed.

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
