# Replacing the scrape stopgap with `@toolpath/tool-scraper`

Status: **cutting tools landed 2026-09-01**; toolholding deferred by scope.
Scope: local development only.

## What landed

Drills, taps and end mills go through the published package, typed end to end.
`pnpm check` is green and one family was scraped, ingested and bundled for real:
259 Kennametal GOdrill 3×D drills.

| Step |                                                                 |                                                  |
| ---- | --------------------------------------------------------------- | ------------------------------------------------ |
| 0    | Dependency declared, `link:` override at the root               | **done**, see § Step 0                           |
| 1    | `TOOLPATH_SCRAPER` and eleven dynamic imports deleted           | **done**                                         |
| 2    | `src/scrape.ts`, `scripts/scrape.mjs` down to 140 lines of `fs` | **done**                                         |
| 3    | Handoff typed from `ToolRecord`                                 | **done**                                         |
| 4    | Dictionary pinned to the scraper's by `dictionary.test.ts`      | **done**, by test rather than import — see below |
| 5    | Family knowledge in `src/`, checked against the live table      | **done**                                         |
| 6    | Toolholding                                                     | **out of scope**, untouched and confined         |
| 7    | Resumable store under `scrape-out/`                             | **done**                                         |
| 8    | `NO_SCRAPER` lint rule                                          | **done**, and proved to fire                     |
| 9    | Delete list                                                     | **done**                                         |
| 10   | AGENTS.md, catalog-data README, `ingest.ts` header              | **done**                                         |
| 11   | Product line and family name, catalog version 6                 | **done 2026-09-01**, see below                   |

Two things the work changed about the plan:

- **Step 4 is a test, not an import.** Sourcing `code` and `iso` from the
  scraper's `GEOMETRY_FIELDS` would have put a runtime import of the scraper
  into `types.ts` — the root export `apps/catalog` loads in the browser — to
  save restating ten strings. `dictionary.test.ts` pins the two instead, which
  costs nothing at runtime and fails the build just the same.
- **The dictionary sensor found something on its first run.** `TP` is a scraper
  geometry code with no label here, because `ingest.ts` drops thread pitch until
  the inch convention is confirmed. `DROPPED` is now exported and the test reads
  it, so the two lists are checked against each other: un-dropping `TP` without
  giving it a label fails.

### Step 11 — the two names a family had none of

`@toolpath/tool-scraper` records `ToolRecord.productLine` — the vendor's own
name for the line a part belongs to — and, for Kennametal and WIDIA, the family
page's own title. Both reach the catalog, which lifts the family question from
an id to a name:

- **`CatalogTool.productLine`**, a fourth term facet keyed `productLine` and a
  field free text is matched on. A line spans families — the same `KenCut™ FF`
  is square and ball nose, metric and inch — so it asks the question
  `familyId` could not. `null` is the vendor's silence and counts under no
  value, the `materialGroups` rule; every Harvey tool is `null` by
  construction, because Harvey's line title _is_ its part description.
- **`ToolFamily.name` is the vendor's title** where the scrape carried one:
  `GOdrill™ • 3xD • Straight Shank • Metric`, not `godrill 3xd metric`. It
  costs one extra request per AEM family — `src/scrape.ts`'s `AEM_TITLE` — and
  thirteen families is the whole bill. The filter panel labels a `familyId`
  chip with it (`labelOf`), while the chip's **value** stays the id, so a
  shared URL is unaffected and a search still finds either.

Two things this uncovered:

- **`--refresh` on its own scraped nothing and said so cheerfully.**
  `scripts/scrape.mjs` read `argv[argv.indexOf('--only') + 1]`, and `indexOf`
  answers -1 when the flag is absent, so `--refresh` became `--only --refresh`
  and every family was skipped as "not the one named".
- **Catalog version 6.** A version-5 dataset states neither name and nothing in
  it can derive one — both are the vendor's words and come off a page. Re-ingest
  the store; `rebuild.mjs` would only write `null`.

### Still open, in order

1. ~~**`materialGroups` is still collapsed**~~ — **fixed, catalog version 5.**
   `CatalogTool.materialGroups` is `ReadonlyArray<string> | null`; `ingest.ts`
   carries silence through instead of reading `?? []`. `preferences.ts` already
   had the three-answer vocabulary (`stated` / `excluded` / `unstated`) and
   keeps its semantics deliberately — both silences stay `unstated`, because
   neither is evidence for or against a recommendation. The distinction is
   shown where a person reads a tool: `tool-sheet.tsx` now says _material not
   stated_ against _rated for no material_. The sample dataset carries one tap
   of each. **Re-ingest rather than rebuild** to migrate a store: the two states
   are already merged in a version-4 file, so `rebuild.mjs` would carry the
   merge forward.
2. ~~**Harvey** — 52 of 66 families, blocked on one upstream export line.~~
   ~~**Emuge** — unreachable from here, no adapter subpath this package can
   drive.~~ — **both fixed by `@toolpath/tool-scraper` 2.0.0**, which publishes
   `./families/harvey` and `./families/emuge`. `reachable()` now refuses
   nothing: all 70 declared families are scrapeable — Harvey 52, Kennametal 11,
   Emuge 4, WIDIA 2, Destiny Tool 1. What remains in `reachable()` is a guard
   against a family declared in one upstream table and not its sibling, which
   would be a fault upstream rather than a gap here.
3. **Toolholding** — § step 6, unchanged. Still the one thing with no record
   seam, still confined to `src/vendors/`.
4. **`emuge_taps.csv` states neither metric nor inch** in its family id
   (`taps`), and that is fine rather than pending: EMUGE is scraped through
   `scrapeCategory`, which never asks `threadSystemOf`. Only the AEM transport
   derives a thread system from an id, so the sensor in `scrape.test.ts` is
   scoped to AEM taps — narrowed to what it governs, not softened. A sixth
   vendor arriving on the AEM transport still fails there until its ids state
   a system.

## Why now

`docs/TOOL-CATALOG-PLAN.md` § Phase 2 is explicit about the constraint every
part of today's scrape pipeline was built around:

> **`@toolpath/tool-scraper` is not published to npm.** … Until it ships, this
> repository must not depend on it — a `file:` or `link:` dependency onto one
> machine's checkout is the `~/JustinGrayLabs` `sys.path` insert that made the
> prior repository unclonable.

That premise has expired. `@toolpath/tool-scraper@0.1.0` is on npm, published
2026-08-29. Everything below is the cost of a workaround whose reason is gone.

The seam itself was chosen correctly and does not move: ingestion takes the
handoff at `ToolRecord`, never at a vendor's CSV. This plan changes **how the
records get here**, not what they are.

## What the stopgap costs today

Seven findings, each checked against the code on this branch.

1. **No type crosses the boundary.** `packages/catalog-data/scripts/scrape.mjs`
   resolves the scraper from `process.env.TOOLPATH_SCRAPER` and dynamic-imports
   eleven modules out of a sibling checkout's `dist/`. Every one of them is
   `any`. A rename upstream is not a build failure — it is
   `undefined is not a function` partway through a 13,000-part scrape.

2. **The file is outside the lint sensor.** `LINTED` in `eslint.config.js` is
   `apps/catalog/**`, `packages/*/src/**` and `scripts/**/*.mjs` — the _root_
   `scripts/`. Verified: `eslint --print-config
packages/catalog-data/scripts/scrape.mjs` resolves **zero rules**. The
   269-line file holding more vendor knowledge than any other in the repository
   is the one file no rule applies to. (`check-style` does reach it —
   `SEARCHED_DIRECTORIES` includes `packages` — so the arrow-function rule
   holds and nothing else does.)

3. **The handoff types are declared twice.** `src/ingest.ts` re-declares
   `ScrapedTool`, `ScrapedFamily`, `ScrapedHolder` and `ScrapedCollet` as loose
   structural types — `geometry: Record<string, unknown>`, `kind: string` —
   because it could not import `ToolRecord`. `ingest.test.ts` then builds its
   fixtures from those re-declarations, so the suite proves the ingest agrees
   with _itself_. Nothing checks it against the scraper.

4. **A three-state field is collapsed into two, and it is wrong on 12,773
   parts.** The scraper is deliberate that `materialGroups` has three states:
   `null` (`unspecified` — nobody said), `[]` (the vendor's index rates this
   part for nothing), and a non-empty list. `scrape.mjs` passes the value
   through; `ingest.ts` then reads `scraped.materialGroups ?? []`. Every Harvey
   record is `unspecified` by construction — Harvey publishes no index a scrape
   can reach — so every Harvey tool enters the catalog claiming a vendor rated
   it for no workpiece material at all. That is the exact confusion the
   scraper's own contract exists to prevent.

5. **The dictionary is restated.** `types.GEOMETRY_FIELDS` carries its own
   `code` and `iso` for each field, and `MATERIAL_GROUPS` restates
   `ISO_MATERIAL_GROUPS`. Both are copies of the scraper's, and nothing fails
   when they drift.

6. **Vendor knowledge has leaked into the script.** `FORMS_BY_FAMILY`,
   `threadSystemOf`, `BT30_COLLET_SIZES`, and — the most fragile thing in the
   pipeline — `groupNameFor`, which recovers REGO-FIX's `product_group_name` by
   running a regex over the _prose_ of a family's `cite` string. An editorial
   reword upstream returns `null`, the family is skipped with a message, and
   the collets are quietly missing from the catalog.

7. **A failed family is lost.** Each family is wrapped in
   `catch { console.log('FAILED') }` and the single output file is written at
   the end. A MariTool 404 in the last minute costs the 52 Harvey product pages
   that already succeeded.

## Scope

- **Local development only.** No storage scheme, no service, no server route.
- **The scrape stays a one-time call a person runs**, and step 8 makes that a
  check rather than an intention.
- **`apps/dfm` is not touched.** It reads no tool data.
- The catalog document, `buildCatalog`, `fit.ts` and everything downstream of
  `Catalog` are unchanged. This is upstream of `buildCatalog` only.

## Step 0 — the blocker: a published scraper with all five vendors

`npm view @toolpath/tool-scraper exports` lists `.`, `./node`,
`./vendors/kennametal`, `./vendors/regofix`, `./vendors/destinytool`,
`./registry`, `./families`. **`./vendors/harvey` and `./vendors/maritool` are
not published** — Harvey is still an unreleased changeset in `ui-packages`
(`.changeset/harvey-tool-scraper.md`), and MariTool is in the local
`package.json` but not the registry's. `scrape.mjs` scrapes both today, so a
straight swap to the npm package loses two of five vendors.

Two ways forward:

- **(a) Release `0.2.0` from `ui-packages` first.** Recommended, and now with a
  second reason: see the Harvey note below.
- **(b) Interim `link:` override.** If the release has to wait: declare the real
  version in `packages/catalog-data/package.json` and put the link in the
  **root** `pnpm.overrides`, so exactly one line is machine-specific and no
  package manifest carries a path. This is the shape already used for
  `@toolpath/viewer` on `jsg/bug_reporter`. It is a bridge with a date on it,
  not a resting place — and § Phase 2 of the catalog plan explains at length
  why it must not become one.

**Taken: (b), for now.** `packages/catalog-data/package.json` declares
`@toolpath/tool-scraper` at `0.1.0` and the root `pnpm.overrides` carries the one
machine-specific line. Swapping to the registry is deleting that line.

**2026-09-01: (b) again, deliberately and temporarily.** The manifest declares
`2.0.0` — the published version — and the root `pnpm.overrides` points that
name at `link:../toolpath-ui-packages/packages/tool-scraper`, because the three
commits this work needs are on `ui-packages` `main` and in no release:
`4296fb3` (a drill record may carry no point angle), `b019b61`
(`ToolRecord.productLine` on every record, and the Kennametal family page),
`9dbe657` (an incomplete part is skipped rather than failing its family).

**That line breaks a clone.** `link:` resolves against the root, so anyone
without a `toolpath-ui-packages` checkout beside this one fails at
`pnpm install` — the exact failure § Phase 2 of the catalog plan describes.
Delete it the day the scraper releases; nothing else in the repository depends
on which of the two the name resolves to.

### And a second gap the swap uncovered: Harvey

`PRODUCT_PAGES` — the table naming each Harvey family's product page — lives in
the scraper's `families/harvey.ts`, and **no published subpath exports it**:
`./families` publishes the merged tables, not the per-vendor ones. The old
script only reached it by deep-importing a `dist/` path, which is the practice
this change exists to end.

So Harvey's 52 families are skipped **by name, with the reason**, and
`scrape.test.ts` asserts that reason so the skip cannot outlive it: the day the
scraper exports the table, that test fails and the skip comes out. It is one
export line upstream, and it should ride along with the `0.2.0` release.

Reachable today: Kennametal (4 drill, 4 end mill, 3 tap), WIDIA (2 end mill) and
Destiny Tool (1 end mill) — 14 families, and all three tool types.

## The target shape

```
@toolpath/tool-scraper            an ordinary dependency of @toolpath/catalog-data
        │   ToolRecord — typed, checked at build
        ▼
pnpm scrape        ──▶  scrape-out/records/<brand>/<family>.json    one file per family
                        scrape-out/toolholding/<vendor>/<family>.json
                        scrape-out/receipt.json                     what ran, when, from where
        │
        │   no network past this line
        ▼
pnpm ingest        ──▶  scrape-out/catalog.json
        ▼
vite alias 'catalog-dataset'  ──▶  apps/catalog
```

The second half already exists and does not change. The first half is the work.

## Step 1 — declare the dependency

`packages/catalog-data/package.json` gains `@toolpath/tool-scraper` at a pinned
version. `TOOLPATH_SCRAPER`, the `dist/` path resolution and the `~` expansion
are deleted with it.

**Proved by:** `pnpm install --frozen-lockfile` and `pnpm check` on a machine
with no sibling checkout.

## Step 2 — move the scrape into `src/`, where the sensors reach

The orchestration moves to `packages/catalog-data/src/scrape.ts`.
`scripts/scrape.mjs` becomes what `scripts/ingest.mjs` already is: argument
parsing, one call into `dist/`, and the console output. Thirty lines, not 269.

**`src/scrape.ts` is not exported from `src/index.ts`.** The root export is what
`apps/catalog/app/shared/catalog.ts` imports, and pulling the scraper in behind
it would put a vendor HTTP client in the browser bundle. It gets its own subpath
— `@toolpath/catalog-data/scrape` — which is the same split the scraper itself
draws with `./node`.

**Proved by:** `eslint --print-config` on the new module resolves the full rule
set; `apps/catalog`'s existing bundle-graph test stays green.

## Step 3 — take the handoff at the scraper's own type

`ScrapedTool` stops being a structural guess and is derived from `ToolRecord`:

```ts
import type { ToolRecord } from '@toolpath/tool-scraper'

export interface ScrapedTool
  extends Pick<
    ToolRecord,
    'guid' | 'catalogNumber' | 'materialNumber' | 'kind' | 'unit' | 'geometry' | 'materialGroups'
  > {
  readonly form?: string
  readonly productLink: string | null
  readonly provenance?: Readonly<Record<string, Provenance>>
}
```

Two consequences worth stating:

- `geometry` becomes `Partial<Record<GeometryName, number>>`, so a code the
  scraper does not define is a type error here rather than a note at ingest.
- `materialGroups` becomes `readonly string[] | null`, which is the fix for
  finding 4. The `?? []` goes; `null` survives into the catalog as
  _unspecified_, and the UI has to say "not rated" rather than "rated for
  nothing" — the same distinction `hasToolholding()` already draws for an empty
  dataset.

**The on-disk file is still a boundary and is still validated.** A record file
can be stale, hand-edited, or written by an older scraper, so the runtime
guards stay; what changes is that the _type_ now comes from the producer.

**Proved by:** `ingest.test.ts` rebuilt on fixtures typed as `ToolRecord`. A
scraper bump that moves the record shape then fails `pnpm check-types` instead
of passing a suite that only ever agreed with itself.

## Step 4 — stop restating the scraper's dictionary

`types.GEOMETRY_FIELDS` keeps what is genuinely this repository's — `label`,
`unit`, `description`, and the two derived entries `LBH` and `LD` that no vendor
states — and sources `code` and `iso` from the scraper's `GEOMETRY_FIELDS`.
`MATERIAL_GROUPS` becomes `ISO_MATERIAL_GROUPS`.

**Proved by:** a new test in the shape of `apps/dfm/app/shared/redaction.test.ts`
— every `GeometryName` the scraper declares has an entry here, and every `iso`
matches. A field added upstream is then a decision somebody makes, not a column
that arrives unlabelled.

## Step 5 — give the family-level knowledge a home and a test

Each of the four moves out of the script into `src/`, and each gets a check that
fails when the upstream table moves under it:

| Today, in `scrape.mjs`                             | Where it goes                | The check                                                                                                                                                                                                                                                      |
| -------------------------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FORMS_BY_FAMILY` — Harvey `keyseat-*` → slot mill | `src/forms.ts`               | Every Harvey family the scraper declares with `kind: 'endmill'` and a keyseat id matches. A 53rd keyseat family fails the test rather than entering the catalog as a flat end mill — which is Paul's 2026-09-01 bug, and nothing currently stops it recurring. |
| `threadSystemOf` — metric/inch from the family id  | `src/scrape.ts`              | Runs over every `kind: 'tap'` family in the scraper's table. Verified: the scraper's family table declares no thread system, so this rule has to live somewhere; the test means a tap family whose id states neither fails at `pnpm test`, not mid-scrape.     |
| `groupNameFor` — regex over a prose `cite` string  | `src/scrape.ts`              | Every REGO-FIX collet family resolves a `product_group_name`. This is finding 6, and the test is the whole mitigation until the scraper states the group as a fact of its own.                                                                                 |
| `BT30_COLLET_SIZES`                                | named const, with the reason | It is a shop assumption, not vendor data. Local-dev scope makes it acceptable; it should be stated as an assumption rather than read as a fact.                                                                                                                |

`FamilyFacts.profile` now exists upstream (it shipped with Harvey) but it states
the **end profile** — `Ball`, `Square`, `Corner Radius` — not the tool form, so
it does not replace `FORMS_BY_FAMILY`. The upstream fix is a keyseat `kind` or
form in the scraper's own table; until then this stays, with a test.

## Step 6 — toolholding: the one thing that cannot be replaced yet

The scraper's README is unambiguous:

> Holders and collets have no record type and no mapper … a scrape of either
> ends at rows and a receipt … That is a real gap rather than a design:
> `identity.recordGuid` already exists so that a holder and a tool can be minted
> into one guid space, and nothing mints a holder yet.

So `src/vendors/regofix.ts` and `src/vendors/maritool.ts` — 409 lines of vendor
column knowledge — **cannot be deleted by this refactor.** Both are already
labelled stopgaps by their own headers, and the catalog plan already carries the
open question ("When does `src/vendors/regofix.ts` move into the scraper?").

- **Now:** leave them, and confine them. An eslint rule that only
  `src/vendors/*` may read a vendor's raw `Row` makes the confinement a fact.
- **Next:** upstream both as toolholding record mappers in `@toolpath/tool-scraper`,
  which deletes both files and both test files here and closes the open
  question. That is work in `ui-packages`, not in this repository.

**Say this plainly when reporting the result:** "fully replace the local
scraping" is achieved for cutting tools and not for toolholding, and the
remainder is one upstream change away.

## Step 7 — the local store

```
scrape-out/                        already gitignored
  records/<brand>/<family>.json    ToolRecords, the family's source URL and unit
  toolholding/<vendor>/<family>.json
  receipt.json                     scraper version, date, per-family row counts, warnings
  catalog.json                     what the app bundles
```

Three properties this buys, all of them serving "a one-time call":

- **Resumable.** `pnpm scrape` skips a family whose record file exists;
  `--refresh` re-scrapes everything and `--only <family>` re-scrapes one. Today
  a single 404 in the last minute costs the whole run (finding 7).
- **Re-ingestible offline.** `pnpm ingest` and the existing `pnpm rebuild` read
  the store and touch no network, so a contract change costs a second rather
  than an afternoon on a vendor's website.
- **Dated.** `receipt.json` records the scraper's own version. The scraper
  already owns this concept — `node/receipts.ts` has `scraperVersion()`,
  `Receipt` and `checkRows` — so reuse it rather than invent a second one.

Expect tens of megabytes: Harvey alone is 12,773 parts across 52 families. That
is the other reason for one file per family rather than one blob.

Unchanged: scraped vendor data is never committed, `vite.config.ts` keeps
resolving `catalog-dataset` to `scrape-out/catalog.json` when it exists and the
committed sample otherwise, and `fixtures/sample-catalog.json` stays generated
and pinned by `sample-catalog.test.ts`.

## Step 8 — keep it one-time, with a sensor

An eslint `no-restricted-imports` entry forbidding `@toolpath/tool-scraper`
anywhere but `packages/catalog-data/src/scrape*.ts`. Nothing in `apps/*` and no
server route can then start fetching a vendor at request time.

This is what turns "the scrape is a command a person runs" from a sentence in a
document into a fact about the code — the same argument AGENTS.md § Code Styling
makes for every other rule that earned a check.

## Step 9 — the delete list

- `TOOLPATH_SCRAPER`, the `dist/` resolution, the `~` expansion, and all eleven
  dynamic imports.
- ~240 of the 269 lines of `scripts/scrape.mjs`.
- The `ScrapedTool` / `ScrapedFamily` structural re-declarations in
  `src/ingest.ts`.
- The `code`/`iso` half of `types.GEOMETRY_FIELDS`, and `MATERIAL_GROUPS`.
- The `?? []` that collapses the scraper's three material-group states into two.
- Kept, deliberately, and named as kept: `src/vendors/regofix.ts` and
  `src/vendors/maritool.ts` (step 6).

## Step 10 — the documents that state the old premise

- **`AGENTS.md` § Tool data** — "The scraper is not developed in this
  repository" stays and gets stronger: it is now a declared dependency and a
  lint rule. Remove the not-published language.
- **`docs/TOOL-CATALOG-PLAN.md` § Phase 2** — close the handoff-by-file era;
  answer the npm question in § Open questions; leave the toolholding question
  open and point it at step 6.
- **`packages/catalog-data/README.md`** — the "Until the scraper is published"
  paragraph in § Ingesting a scrape.

## Verification

`pnpm check` after each step — it is `check-style`, `lint`, `build`,
`check-types`, `test`, cheap gates first.

The end-to-end proof is **one small family**, not the five-vendor run:
`destinytool_end_mills_inch.csv` is a single paginated Firestore call. Scrape
it, ingest it, and load `apps/catalog` against the result. The full run is a
separate, deliberate afternoon.

## Open decisions

1. **Step 0: release `0.2.0` upstream, or take the interim link override?**
   Recommendation: release. The override is a second machine-specific line in a
   repository that has already written down why it does not want one.
2. **Is the derived `catalog.json` committed?** Already open in the catalog
   plan. Recommendation: no, while it is built from vendor data — the _sample_
   is the committed artifact and `sample-catalog.test.ts` is the standing check
   the pipeline still produces what it claims.
3. **Upstream the toolholding mappers now, or after this lands?** After. This
   refactor is already the whole cutting-tool path, and step 6 confines what is
   left.
4. **What does the UI say for `materialGroups: null`?** Step 3 makes the
   distinction reachable for the first time; somebody has to choose the words.

## What was checked, and how

- `npm view @toolpath/tool-scraper exports` / `time.modified` — 0.1.0,
  2026-08-29, seven subpaths, no Harvey and no MariTool.
- `eslint --print-config packages/catalog-data/scripts/scrape.mjs` — zero rules.
- `scripts/check-style.mjs` `SEARCHED_DIRECTORIES` — `['apps/catalog',
'packages', 'scripts']`, so check-style does reach the script.
- The scraper's `README.md` § The record, and `src/records.ts`
  `ToolRecord.materialGroups` — the three states, and that every Harvey record
  is `unspecified`.
- `packages/tool-scraper/src/families/*.ts` — no `threadSystem` fact anywhere;
  `FamilyFacts.profile` exists and is the end profile, not the form; Harvey
  keyseat families are `kind: 'endmill'` with ids `keyseat-001`…
