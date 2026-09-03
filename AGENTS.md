# Toolpath Template Agent Guide

This repository is a pnpm/Turborepo workspace holding **more than one
customer-facing application** built with React Router, React, Hono, TypeScript,
Vitest, Playwright, pnpm, and Turborepo — a design-for-manufacturability
application in `apps/dfm`, a static tool catalog in `apps/catalog`, and the
packages they share in `packages/`. It is a github template that user's can use to build their own products from with ease using Toolpath's API. The user may rework things significantly so be sure to check the current repo state rather than fully relying on this document, if the user makes signigicant changes be sure to update this document along with them so future AI Agents know how to work in their repo.

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
drift off those the longer a session runs — on 2026-08-28 one session wrote
eighty single-line `if`s against a rule stated two paragraphs above. So when a
judgment rule starts being violated, give it a check rather than restating it.

| Rule                                                                 | Proven by          |
| -------------------------------------------------------------------- | ------------------ |
| `const name = () => {}`, never `function name() {}`                  | `pnpm check-style` |
| `Array<Item>`, never `Item[]` — left to right is more explicit       | `pnpm lint`        |
| Braces and multiple lines on every `if`, never a single-line one     | `pnpm lint`        |
| Import React members individually (`ReactNode`), never `React.X`     | `pnpm lint`        |
| `components/*`, `client/*`, `routes/*`, `shared/*` aliases in `app/` | `pnpm lint`        |
| Only `@toolpath/part-server` uses the Toolpath SDK at runtime        | `pnpm lint`        |
| Nothing in `packages/` imports an application                        | `pnpm lint`        |
| A relative import inside a package carries its `.js` extension       | `pnpm lint`        |
| The layering under Project Map                                       | `pnpm lint`        |
| Tailwind classes for styling; `style={{}}` only for a computed value | judgment           |
| `@toolpath/ui` components over hand-authored HTML, while it is used  | judgment           |

What the checks cannot carry:

- `React.MouseEvent` and the other names a DOM global already takes are the
  documented exception. The check allows exactly those and nothing else.
- Route modules export the component separately (`const Route = () => {}` then
  `export default Route`) rather than as a default declaration.
- `style={{}}` is right for a value only known at runtime — a direction colour,
  a computed width. Everything static is a Tailwind class.
- `apps/*/server` deliberately keeps relative imports into `app/shared`:
  production runs `tsx server/prod.ts` with no bundler to resolve an alias.

**Both applications are inside the sensors.** `paul/directions-mapping` landed
on 2026-09-02, so `apps/dfm` is in `LINTED` in `eslint.config.js` and in
`SEARCHED_DIRECTORIES` in `scripts/check-style.mjs`, and the layer patterns are
`apps/*` rather than one application's.

The DFM application carries two sensors of its own that the catalog has no
equivalent for, and they are rules rather than preferences:

- **`apps/dfm/app/kit-usage.test.ts`** pins raw `<button>` at its current count,
  so it can fall but not rise. The kit exports `Button` and `IconButton` and
  both pass `aria-*` and `title` through. Reach for the kit in new code and
  lower the budget whenever a migration lands; a failure there is the rule being
  broken, not a flaky test.
- **`apps/dfm/app/styles.test.ts`** reads `app/styles.css` directly and holds
  two invariants nothing else can see: every colour role is defined under both
  `:root` and `.dark`, and font resets stay inside `@layer base` where a utility
  can still win. An unlayered `font: inherit` beat every Tailwind font utility
  silently, and a role defined in one theme keeps the other theme's value.

### Layering

`pnpm lint` fails on any of these, so they are facts about the code rather than
intentions about it:

- Nothing under `app/` may import `server/`. This is the API-key boundary, and
  it holds for an alias import as well as a relative one.
- `app/shared/` imports only `app/shared/` and packages, which is what keeps it
  pure and cheap to test.
- `app/components/` may reach `client/` and `shared/`, never `routes/`.
- `server/` may import `app/shared/` for the shared contracts, and nothing else
  from `app/`.
- A package imports other packages and nothing under `apps/`.
- `app/` may import Toolpath SDK **types**; a runtime import would ship the SDK
  to the browser.

The rules live in `eslint.config.js`. Adding a layer means adding it there too,
or the boundary is a comment rather than a check.

## Project Map

The workspace is `apps/*` and `packages/*`. Every application follows the same
internal layout, so what is true of `apps/dfm` below is true of the next
application unless that application says otherwise.

- `apps/dfm/` is the DFM application. `app/` is the browser React application,
  `server/` composes the shared part API, `app/shared/` is this application's
  own pure logic, `tests/` is Playwright coverage, and `app/**/*.test.*` is
  Vitest coverage.
- `apps/catalog/` is the tool catalog. Its **tool data is bundled at build
  time** and filtered in the browser — `app/shared/catalog.ts` is the only
  module that touches it — while its `server/` serves the shared part API,
  because uploading and analysing a part needs the user's API key.
  **It opens on the part** (Paul, 2026-09-01): `/` is the upload, drawn in the
  space the viewer fills. The former standalone catalog, tool-detail, family,
  and holder-browsing routes were removed because the part screen owns that
  workflow.
  See `docs/TOOL-CATALOG-PLAN.md`, including _Taken out on 2026-09-01_ for what
  is parked and where to restore it from, and _The filter panel_ for the one
  rule saying which values a picker offers — an empty answer stays and is
  greyed, another vendor's family or product line comes off the list.
  **The 2D tool drawing is not this application's** — it is
  `@toolpath/tool-drawing`, and `app/components/catalog-drawing.tsx` is the one
  file that wires it up. See `docs/TOOL-DRAWING-PLAN.md`.
  **A holder can be drawn from its own CAD model** rather than from the nine
  numbers a vendor publishes: `catalog-profiles` is a second Vite alias beside
  `catalog-dataset`, `shared/catalog.ts` `getProfile` is the only way to reach
  it, and `catalog-drawing.tsx` uses it in the active part workflow.
  `docs/HOLDER-PROFILES.md` is the guide, including the two things deliberately
  left undone — clearance still reasons from the published dimensions, and the
  record seam below.
  **The feature list is what drives the page** (Paul, 2026-09-02): a click on
  the part adds a row, a row is what the tool table is being asked about, and a
  tool reaches the bill only because a row put it there — there is no second
  place to add one. `shared/feature-list.ts` is the model and
  `components/feature-list-panel.tsx` the list on screen;
  `docs/FEATURE-LIST.md` is the spec, including _Where the rules live_ for
  which file owns which rule and _Not built_ for what is deliberately absent.
- `packages/domain/` (`@toolpath/domain`) is pure helpers more than one
  application needs — unit conversion and formatting, class composition,
  keyboard movement through a list.
- `packages/part-contracts/` (`@toolpath/part-contracts`) is the app-owned shape
  of a part report, the datasheet readers, and the feature-selection model. Its
  root export is server-safe; `/report`, `/picks` and `/selection` reach
  `@toolpath/viewer` and are browser-only, and `/datasheet` is the viewer-free
  half a server or a data package can read.
- `packages/part-server/` (`@toolpath/part-server`) is `createPartApi`: the BYOK
  connection cookie, part upload, analysis events, and the mesh relay. **This is
  the only place any application's API key is handled.**
- `packages/part-client/` (`@toolpath/part-client`) is the browser half of that
  API: typed fetches and the session and analysis-event hooks.
- **`@toolpath/tool-drawing` is not in this repository.** It is developed in
  `toolpath-ui-packages` and consumed here, like `@toolpath/ui`,
  `@toolpath/viewer` and `@toolpath/tool-scraper`. It draws a cutting tool and
  its holder in 2D from an input contract of its own: `/geometry` is pure and
  server-safe, `/clearance` is the optional overlay. Do not write a second
  drawing here — `app/components/catalog-drawing.tsx` is the whole seam, and
  `app/shared/tool-drawing-input.ts` the whole adapter.
- `packages/catalog-data/` (`@toolpath/catalog-data`) is the tool catalog's data
  contract, its pure record-to-catalog transform, the tool-fit calculation, and
  the committed sample dataset. `profiles.ts` is the measured-holder half —
  its own document, keyed by guid and read lazily, because a silhouette is
  ~110 vertices only an assembly drawing needs and every page loads the
  catalog. It also answers **whether an assembly clears a
  feature** — `clearance.ts` — which is a tool-selection question with a dozen
  callers that draw nothing, so it stays here while the picture of it lives in
  the drawing package.
- `docs/` holds planning documents that outlive a single change.
  `docs/FEATURE-DEFAULTS.md` is the guide to the catalog's feature datasheet,
  `apps/catalog/app/shared/feature-defaults.csv`, and `docs/RULES.md` the
  guide to its rules sheet, `rules.csv` and `knobs.csv` beside it — the files
  in the catalog meant to be edited by someone who does not write code. Keep
  them that way: a new field, condition, rule shape or knob is declared in
  `feature-defaults.ts` / `rules.ts` and documented in the guide, never
  hard-coded into the panel. The rules were seeded from Toolpath's engine
  (`docs/ENGINE-TOOL-MATCHING.md`); `docs/RULES-PLAN.md` is the plan they
  belong to, and any matching rule or tool-type order belongs in the sheet.

## Shared Code Between Applications

This repository has more than one application on purpose, and code that serves
both of them belongs in `packages/`, not in one application with the other
reaching across into it.

- **Never import from one application into another.** `apps/catalog` importing
  `apps/dfm/app/shared/...` is the failure this section exists to prevent. If
  two applications need the same thing, it moves to a package.
- **The second consumer is the trigger.** Do not build a package for code one
  application uses. Extract when the second application needs it — and extract
  it then rather than copying it, because a copy is a divergence with a delay
  on it.
- **Extract the pure part, not the coupling.** What moves is the logic that
  depends on nothing but its arguments. A helper that reaches for a router, a
  Toolpath client, or a storage key belongs in the application until the part
  that is pure can be separated from the part that is not — which usually means
  passing the coupled thing in as a parameter.
- **A package owns its own tests.** Moving code out of an application without
  moving its coverage turns a shared dependency into a place where a break is
  found by whichever application happens to run first.
- **Packages are private and built with `tsc`**, exposing subpath exports from
  `dist/`. Relative imports inside a package carry the `.js` extension so the
  emitted JavaScript runs under Node without a bundler. Applications depend on
  them with `workspace:*`; Turborepo's `^build` ordering handles the rest.
- **Nothing in `packages/` may import an application or a framework router.**
  The one package that handles an API key is `@toolpath/part-server`, which
  exists precisely so that handling happens in exactly one place; no other
  package may read `APP_SESSION_SECRET` or construct a Toolpath client.
- **A rendering package takes the verdict as data.** `@toolpath/tool-drawing`
  draws the clearance around a tool; `clearance()` in `@toolpath/catalog-data`
  decides it, for twelve callers that draw nothing at all. Nothing in
  `packages/` may import the drawing package's values — `NO_DRAWING` in
  `eslint.config.js`, the same shape as the SDK and scraper rules — because that
  is how a selection engine ends up behind a dependency on React.
- **Three helpers are duplicated on purpose, and say so.** `hasNeck`
  (`catalog-data/src/forms.ts`), `heightAt` (`catalog-data/src/clearance.ts`)
  and the gage-line crossing in `belowGageLine` (`catalog-data/src/profiles.ts`)
  each have a twin inside `@toolpath/tool-drawing`. The package may not depend
  on this catalog's data package — its input contract is its own so that it does
  not — and every copy still has non-drawing callers here. Each carries a
  comment naming its twin. Change one and change the other, or the picture and
  the verdict disagree about the same tool.
- **Watch what a barrel export drags in.** `@toolpath/part-contracts` is split
  into subpaths because its report readers import `@toolpath/viewer`, which
  installs camera controls against a DOM at import time — enough to break a Hono
  server that only wanted a type. A package used by both a server and a browser
  keeps its server-safe surface reachable without the browser half.
- **Say what changed on the way out.** When extraction changes a signature — as
  parameterising the unit-preference storage key did — record it in the plan
  document, because the next reader will otherwise assume the package is a
  verbatim move.

## Vendor Tool Data

- **The scraper is not developed in this repository.** `@toolpath/tool-scraper`
  lives in the `ui_packages` repository and is an ordinary dependency of
  `@toolpath/catalog-data`. Do not write a vendor adapter here, and do not copy
  an older scraper in from elsewhere: a vendor's transport, its column
  vocabulary and its dimension codes all belong upstream, beside the tests that
  check them.
- **One module runs it, and `pnpm lint` says so.**
  `packages/catalog-data/src/scrape.ts` drives the vendors' scrapers; everything
  else may name the scraper's **types**, which are erased, and never its values.
  A scrape is a command somebody runs, not something the product does — without
  the rule, a route handler importing `scrapeFamily` would quietly turn the
  catalog into a live proxy onto five vendors' websites, one request per page
  view. `NO_SCRAPER` in `eslint.config.js`, the same shape as the SDK rule.
- **A scrape is resumable, and a store is not a cache.**
  `pnpm --filter @toolpath/catalog-data scrape` writes one file per family under
  `scrape-out/records/` as each finishes, so a vendor failing costs that family
  and nothing else; `--refresh` re-scrapes everything and `--only <family.csv>`
  re-scrapes one. `scrape-out/receipt.json` records the scraper's version and
  everything the run left out. Re-ingesting the store touches no network.
- **Toolholding takes the record seam, like a cutting tool does.**
  `@toolpath/tool-scraper` 2.1.0 mints `HolderRecord` and `ColletRecord`, and
  `src/scrape.ts` drives them through `boundToolholding`/`toHolding` — the exit
  `docs/TOOL-SCRAPER-REFACTOR.md` § step 6 named, taken on 2026-09-02. It is a
  **separate command and a separate store**, `pnpm --filter @toolpath/catalog-data
scrape:holding` into `scrape-out/toolholding/`, because a shop re-scrapes
  13,000 cutting tools far less often than 550 holders; `scripts/store.mjs`
  merges both stores into one `scrape.json`, so running either alone never drops
  the other's work.
- **A holder record carries no silhouette.** It states a taper, a clamping mode,
  a gage length, a bore, a body diameter and a lock-nut diameter — and no nose
  diameter, nose length, projection or flange diameter. Those are what the
  `src/vendors/` stopgap pinned by hand off DIN 4000 sheets, and the honest
  source for a silhouette is the vendor's own CAD model, which the record points
  at. So the measured profile is load-bearing rather than a nicety; see
  `docs/HOLDER-PROFILES.md`.
- **`src/vendors/` is dead and kept on purpose.** Nothing calls it now that the
  seam is taken. It is the only written record of REGO-FIX's DIN 4000 code
  pinning, each mapping citing its evidence, so it stays until either that
  evidence moves upstream or somebody decides the measured profile has replaced
  it outright. Do not add a vendor to it.
- Ingestion consumes the scraper's **records** (`ToolRecord`), never its vendor
  CSVs. A scraped CSV keeps that vendor's own column labels, and those collide
  with ISO 13399 while meaning something else — Kennametal's `D1` is a cutting
  diameter, ISO's `D1` is a fixing hole. Only a vendor's own scraper adapter may
  read that vendor's CSV; this repository takes the handoff at the record seam,
  which is also what lets an updated scraper be plugged in without anything
  downstream of `buildCatalog` changing.
- **A tool carries the vendor's own `productLine`**, and an AEM family its own
  title. Both are the vendor's words, read off a page rather than derived, and
  `null` where a vendor names none — the silence, not an unnamed line. The
  product line is a filter axis of its own because a line spans families, which
  is the question `familyId` cannot ask. Catalog version 6; re-ingest a store
  rather than rebuild it, since neither name can be derived from a version-5
  document.
- **Geometry keeps the scraper's field names** (`DC`, `SFDM`, `OAL`, `LCF`,
  `RE`, `NOF`, `SIG`, …), with the ISO code recorded alongside. Renaming one
  here would put a translation table between the two vocabularies, which is
  where a `SFDM` silently becomes a `DC`.
- **Guids are minted by the scraper**, never here: a guid is `uuid5` under the
  brand's namespace, and a wrong seed is every one of that vendor's guids,
  permanently.
- **Never commit scraped vendor data.** It is the vendor's, it is a working
  file, and this repository is public. `scrape-out/` is gitignored.
- Every stated fact a vendor did not publish carries its provenance — vendor,
  derived, or assumed — and the UI shows anything that is not the vendor's.

## Safety and Secrets

- Never ask a user to paste an API key, session secret, password, token, or
  private URL into chat.
- Never read, print, summarize, stage, or commit `.env` files. Checking that a
  file exists is safe; reading its contents is not.
- During initial setup, agents may run `pnpm setup:local` to create each
  application's `.env` and install dependencies. It generates the session secret
  directly in the file without displaying it and leaves an existing file
  unchanged.
- `APP_SESSION_SECRET` and `TOOLPATH_API_BASE_URL` belong only in each
  application's own `.env` locally — `apps/dfm/.env` and `apps/catalog/.env` —
  and in the deployment platform's secret store. `pnpm setup:local` creates both
  with independent generated secrets; two applications must not share one.

## Testing

Where a test goes is a rule, not a preference; `docs/TOOL-CATALOG-PLAN.md`
§ Testing has the reasons, and the DFM application's `docs/README.md` the
original. For the catalog:

- **Pure logic goes in `app/shared/*.test.ts`.** That is the bulk of the value
  and the cheapest place to add coverage. Prefer moving logic there over
  testing it through a component — `shared/part-interaction.ts` exists because
  the arrow rules were untestable while they lived in the route.
- **Component tests work**, including for components importing `@toolpath/ui`
  and, with the viewer package mocked, `@toolpath/viewer` —
  `components/part-viewer.test.tsx` pins the props that reach it.
- **A test that reads the dataset says which dataset.** `vitest.config.ts` pins
  `catalog-dataset` to the committed sample so a suite gives the same answer on
  every machine; `shared/drawable-forms.test.ts` adds a second layer that reads
  the gitignored scrape where a machine has one, and skips out loud where it
  does not. That layer is the only place a newly scraped family with no drawing
  generator turns red.
- **A duplicate across a package boundary gets a lockstep test, not a comment.**
  `shared/drawing-frame.ts` recomputes the frame `<ToolDrawing>` settled on,
  because the package hands its children none;
  `components/catalog-drawing.test.tsx` renders the real component and requires
  the two `viewBox` strings to be identical. A copy nobody checks drifts.
- **Anything that begins with a click on the part goes in
  `tests/on-the-part.spec.ts`**, against `tests/cube-fixture.ts` — the only
  fixture that mounts geometry. Nothing else can reach that stack.
- **Never capture a real part's report and check it in.** The vendored viewer
  cube is the one exception, for the one reason `cube-fixture.ts` gives.
- **A rule may want a sensor instead of a test.** `eslint.config.js`,
  `scripts/check-style.mjs` and the CI `format:check` step read source rather
  than exercise it. A new repository-wide invariant usually belongs beside them.

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
  duplicate helper. Check `packages/` first, and check the other application second: finding the
  same logic there means the change is an extraction, not a second copy.
- Decide which contract, data model, environment, and deployment boundaries the change touches.

After editing:

- Run the narrowest relevant test/type/lint loop first, then broaden verification in proportion to
  cross-package risk.

## Commands

Run commands from the repository root unless noted otherwise.

| Purpose                          | Command                          |
| -------------------------------- | -------------------------------- |
| Install dependencies             | `pnpm install --frozen-lockfile` |
| Run the DFM app (port 5173)      | `pnpm dev`                       |
| Run the tool catalog (port 5174) | `pnpm dev:catalog`               |
| Check function-declaration style | `pnpm check-style`               |
| Check style rules and layering   | `pnpm lint`                      |
| Build, typecheck, and unit test  | `pnpm check`                     |
| Run every end-to-end test        | `pnpm test:e2e`                  |
| Run one application's e2e tests  | `pnpm test:e2e:dfm` / `:catalog` |
| Work in one workspace project    | `pnpm --filter <name> <script>`  |

`pnpm check` runs `check-style`, `lint`, `build`, `check-types` and `test`, in
that order, so the cheap checks fail first. It covers every application and
package in the workspace, so a change to a shared package is verified against
both of its consumers. `pnpm lint --fix` settles the formatting-shaped rules on
its own.

`pnpm check` builds every package, and the catalog dev server links those
packages' `dist/` folders — on 2026-08-29 a `pnpm check` under a running dev
server left Vite serving outdated optimised dependencies and every page black.
The catalog now pre-bundles its dependencies at start-up, has a root
`ErrorBoundary`, and a boot watchdog that replaces "Loading the catalog…" with
what to do if nothing hydrates. The dev-server adapter hands anything it does not exclude to React Router
as a document — `apps/catalog/dev-server-exclude.ts` is the list, with a test
— so a new kind of imported asset (a `?raw` sheet, a JSON) goes on that list
or its hot update blanks the tab. If a page ever shows that message for more
than ten seconds, restart the dev server with a clean cache:
`rm -rf apps/catalog/node_modules/.vite && pnpm dev:catalog`. Never diagnose a
blank page by guessing: load it headless (Playwright is installed) and read the
console.

`pnpm check` is the normal fast gate. Before pushing a significant change,
also run the dependency audit, end-to-end tests, and the production
Docker build when the affected area makes those checks relevant. Only run docker build if it is absolutely necessary, most of the time it is not needed.

## Formatting

`pnpm setup:local` installs the Husky pre-commit hook. The hook runs Prettier on
staged files automatically and stages the formatted results. Agents do not need
to run `pnpm format` or `pnpm format:check` as part of normal work. Run either
command only when the user explicitly asks for formatting or when the commit
hook cannot be used.

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
