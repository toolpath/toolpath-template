# Tool catalog — plan

_Started 2026-08-27 on `paul/tool_catalog`. Update this document as decisions
change; it is the record of why the code looks the way it does._

## What this is

A second application in this repository, alongside the DFM app. Where the DFM
app answers _can I make this part_, the catalog answers the two questions
underneath it: **what do I have to cut it with**, and **which of my tools cuts
this feature**.

The two applications share a repository because they share code. What they
share now lives in `packages/`; see [Shared code](#shared-code).

## Where the prior art is, and how to treat it

**`/Users/paulclauss/dev/justins_tool_catalog` — a guide, not a reference.**
It has a working catalog app and a full Python scraping pipeline, and it is
where the domain thinking was done: browse by family, filter on the axes that
matter when picking a tool, spell out the vendor's `DC`/`LCF`/`RE` codes,
selection held in the URL, a cart of assemblies saved to `localStorage`. Read it
for _what the product is_ and for the decisions its `docs/SCOPE.md` records.

Assume its code and its user experience are of poor quality. Nothing is copied
from it.

**The scraper is not edited here, and not reused from there.** The current
version is `@toolpath/tool-scraper` in `/Users/paulclauss/dev/ui_packages` — one
vendor-neutral core plus one adapter per manufacturer, a `Fetcher` passed as a
parameter rather than a module global, provenance the types enforce, and five
vendors working (Kennametal/WIDIA, REGO-FIX, Destiny Tool, and — as of the
2026-08-30 build — Harvey Tool and MariTool). It also carries the
expensive knowledge: `docs/KENNAMETAL_CAD_API.md`, `KENNAMETAL_SPEEDFEED_API.md`
and `REGOFIX_PRODUCTFINDER_API.md` record endpoints nobody could guess and the
dead ends tried first.

**This repository consumes the scraper; it never modifies it.** Ingestion is
designed as a swappable input precisely so an updated scraper can be plugged in
later without the catalog changing shape — see
[Phase 2](#phase-2--real-ingestion-).

## What the product has to do

Captured 2026-08-27. Expected to evolve; nothing below is committed to a phase
until it appears in [Phases](#phases).

### With tools

- Scrape vendor data and build tool lists automatically
- Build tool assemblies
- View tool lists
- Filter tool lists
- Visualise tool assemblies
- Import tools from Fusion and match them to features
- Export tools to Fusion
- Set tooling preferences by part material
- Basic tool recommendation preferences — preferred roughers, preferred
  finishers, and more to come

### With parts

- Upload parts
- Define materials
- Select a feature, or several features at once
- Identify tools, holders and full assemblies for that selection — a selection,
  not the whole part, at least at first
- Map a tool to a feature, for roughing and/or finishing
- See what percentage of the part is mapped
- Show feature datasheet information

### Cross-cutting requirements

- **The same part interactions as the DFM app** — by machining direction, and by
  feature selection.
- **Multi-feature selection returns the tools compatible with all of them.**
  This is the requirement the data model is built around: a selection is a set,
  and a tool has to clear every member of it.

## Decisions taken

| Decision                                                                                                                            | Taken      |
| ----------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Tool data bundled at build time, filtered in the browser                                                                            | 2026-08-27 |
| Ingestion lives in this repository, as a package                                                                                    | 2026-08-27 |
| Parts require a server, so the catalog serves the same part API the DFM app does                                                    | 2026-08-27 |
| Shared code is extracted to `packages/`, never imported across applications                                                         | 2026-08-27 |
| What the pipeline works out (`LD`, `form`) is derived in `buildCatalog`, once                                                       | 2026-08-28 |
| A contract bump is a `rebuild`, not a re-scrape                                                                                     | 2026-08-28 |
| Every styling and layering rule has a sensor, or is marked judgment                                                                 | 2026-08-28 |
| The part page's interaction is a pure reducer the route only dispatches to                                                          | 2026-08-28 |
| Holder collision is swept from the Engine's `reachCurve` against the catalog's silhouette                                           | 2026-08-29 |
| `reachCurve` is read raw in `part-server` until the SDK declares it; a test retires the shim                                        | 2026-08-29 |
| Stickout is a decision: it defaults to length below holder, capped by the grip where known                                          | 2026-08-29 |
| An assembly is drawn from stated dimensions, dashed where derived; vendor CAD is not needed for that                                | 2026-08-29 |
| REGO-FIX's `A2`, `B1`, `B2`, `B3_WOA` are pinned by cross-series variation and read as the holder body                              | 2026-08-29 |
| Assemblies are built the way the DFM catalog builds them: holder, then collet, selection in the URL or on the feature's setup sheet | 2026-08-29 |

**The application is static about tools and served about parts, and the split is
deliberate.** Tool data is public, small and the same for every viewer, so it is
bundled: no request, no server, no cache to invalidate. A part is the opposite —
it is the customer's geometry, and analysing one needs their Toolpath API key,
which must never reach a browser. So the catalog runs a server for exactly one
thing: the part API, from `@toolpath/part-server`, the same one the DFM app
serves.

Two consequences are load-bearing:

- **Deep links need an `index.html` fallback.** The application uses clean paths
  like `/tools/<guid>`, and no file exists at that path. The host must serve
  `index.html` for unknown paths and let the router take over — one rule on
  Netlify, Vercel, Cloudflare or S3, and already implemented in `server/prod.ts`.
  Without it, browsing works and refreshing a shared link 404s.
  `tests/catalog.spec.ts` covers it so a deploy that forgets fails in CI.
- **A dataset older than the contract fails at import.** `CATALOG_VERSION` has
  moved twice already, and each time the ingested dataset had to be rebuilt. It
  is a loud failure rather than a field-by-field wrongness, which is the point,
  but it does mean a scrape is only as current as the last ingest.
- **The whole tool dataset is in the bundle.** Fine for hundreds of tools, not
  for hundreds of thousands. `app/shared/catalog.ts` is deliberately the only
  module that touches the data, so raising that ceiling is a one-file change.

## What exists now

```
packages/domain           @toolpath/domain          units, class names, list keys — pure, shared
packages/part-contracts   @toolpath/part-contracts  the part report shape, datasheet readers, feature selection
packages/part-server      @toolpath/part-server     the Hono part API: BYOK session, upload, events, mesh
packages/part-client      @toolpath/part-client     the browser half: typed fetches, session and event hooks
packages/catalog-data     @toolpath/catalog-data    the catalog contract, the pure build, tool fit, the sample dataset
apps/dfm                  @toolpath/dfm             unchanged in behaviour; now composed from the packages
apps/catalog              @toolpath/catalog         browse tools, and match them to a part's features
```

- **`@toolpath/catalog-data`** owns the document the application reads —
  `CatalogTool`, `ToolFamily`, `Facets`, and the ISO 13399 dictionary
  (`GEOMETRY_FIELDS`) that makes `DC`/`OAL`/`LCF`/`RE`/`NOF`/`SIG`/`DMM`
  readable — under the scraper's own field names, so `SFDM` is not renamed to
  ISO's `DMM` on the way in and no translation table sits between the two.
  `buildCatalog` is pure and refuses a duplicate guid rather than
  resolving it: the guid is the join key a URL, a mapped operation and a saved
  order all hold. Lengths are millimetres and angles degrees throughout, the
  same basis the Toolpath API states.
- **`ingest.ts` takes the scrape.** Records in, `Catalog` out, with inch
  families converted to millimetres so everything past that point is one basis.
  `scripts/ingest.mjs` is the command; the catalog document is at version 2.
- **`fit.ts` in the same package is the heart of the product.** `demandOf` reads
  what a feature asks of a tool straight off its datasheet — the widest cutter
  that reaches the tightest corner, a hole's drill and endmill limits kept
  apart, depth, floor fillet. `fitTools` answers for a set of features at once,
  and keeps the near misses with the feature that ruled each one out, because
  "nothing fits" is only actionable when it names the feature doing the
  excluding. **A measurement the kernel does not state is never checked** — an
  absent number must not become a demand of zero.
- **The sample dataset** (`fixtures/sample-catalog.json`) is generated by
  `scripts/build-sample-catalog.mjs` through the same `buildCatalog` real
  ingestion will use, and a test fails if the committed file and the generator
  disagree. Nine plausible tools, two unit systems, three tool types, a missing
  dimension, an undefined vendor code, and an assumed value. **They are not a
  vendor's numbers.**
- **`apps/catalog`** opens on the part: connect, upload, follow the analysis,
  click a feature, and the catalog narrows to the tools that cut it, with the
  selection held in the URL. The catalog browser and the family list are still
  there and still tested at `/catalog` and `/families`, and nothing links to
  them — see _Taken out on 2026-09-01_.

## Phases

### Phase 1 — bootstrap ✅ 2026-08-27

The workspace opened to `apps/*` and `packages/*`; the packages above; the
catalog application with catalog, families, tool-detail, upload and part routes;
the multi-feature fit; CI running both applications' e2e suites.

### Phase 2 — real ingestion 🟡 in progress

`packages/catalog-data` now ingests a scrape. What is left is a real scrape to
point it at.

**`@toolpath/tool-scraper` is not published to npm.** It is `version 0.0.0` in
`ui_packages` with `publishConfig.access: public`, and `npm view` 404s. Until it
ships, this repository must not depend on it — a `file:` or `link:` dependency
onto one machine's checkout is the `~/JustinGrayLabs` `sys.path` insert that
made the prior repository unclonable, and it is not worth repeating for a week's
convenience.

**The handoff is records, not CSVs — corrected 2026-08-27 after reading the
scraper.** The first draft of this plan said the CLI would read the scraper's
vendor CSVs. That would have been wrong in the specific way the scraper's own
`conventions.ts` warns about: a scraped CSV deliberately keeps **that vendor's
own column labels**, and the vendor vocabularies collide with ISO 13399 while
meaning something else — Kennametal's `D1` is the cutting diameter, ISO's `D1`
is a fixing hole. Anything reading a vendor CSV without going through that
vendor's adapter is "confidently wrong rather than obviously broken".

The scraper draws its seam at `ToolRecord`: _an adapter owns CSV → record; a
record is where this package hands off._ So this package takes the handoff at
exactly that seam:

1. Run the scraper where it lives, writing records for each family.
2. `node scripts/ingest.mjs <scrape.json> <dataset.json>` — validates, converts
   inch families to millimetres, and emits a `Catalog` through `buildCatalog`.
   Everything left out is printed rather than dropped silently.
3. `apps/catalog` changes one import in `app/shared/catalog.ts`.

Until the scraper is published the records arrive as a JSON document (`Scrape`
in `src/ingest.ts`); after it is published, the producer imports the scraper and
calls `ingest` directly. **The types on either side of the seam are the same
either way**, which is what makes plugging in an updated scraper a version bump
rather than a migration.

Three decisions inside the ingest are worth knowing:

- **Guids are not minted here.** A guid is `uuid5` under the brand's namespace,
  and a wrong seed is not a wrong string — it is every one of that vendor's
  guids, permanently. The scraper owns that rule; ingest validates the shape and
  refuses anything that is not a UUID.
- **`TP` is dropped, loudly.** Thread pitch is "in the tool's own unit system",
  and an inch tap's pitch is conventionally threads-per-inch — a reciprocal, not
  a length. Converting it would produce a plausible wrong number. It comes back
  when the inch convention is confirmed against a real tap table.
- **Material groups are reordered onto ISO 513's sequence** (`P M K N S H C`).
  A facet rendered from one order and a tool's own list from another cannot
  notice when they disagree. Empty stays empty: Kennametal indexes no tap by
  workpiece material, and showing every tap under every material is a claim
  nobody made.

**Scraped output is not committed** — it is the vendor's data and a working
file, and this repository is a public template. `scrape-out/` is gitignored.
Whether the _derived_ catalog is committed is open; committing it makes
`pnpm build && git diff --exit-code` a standing check on the pipeline, which is
the one thing the prior repository got unambiguously right.

### Phase 3 — assemblies 🟢 usable, 2026-08-29

A tool is ordered and held as a stack, and most of the requirements above are
really about the stack rather than the cutter.

- ✅ Holders and collets in the catalog contract, and which of them stack:
  `toolholding.ts`. A collet matches a holder by series exactly; a bore or
  shrink holder takes **one** nominal shank, not a range, because treating the
  bore as an upper bound puts a tool in a holder that drops it.
- ✅ Reach: `assembly-fit.ts` runs every cutter check and then asks whether the
  stickout clears the distance from the part top down to the feature. This is
  the check that turns a plausible tool into a real one — a 3 mm end mill with
  20 mm of flute clears a 15 mm pocket on its own and fails the moment the only
  collet gripping a 3 mm shank leaves 12 mm standing out.
- ✅ `unholdableTools` names a tool that cuts the feature but nothing in the
  crib holds. That is a gap in the crib, not a wrong cutter, and it is fixed by
  buying a collet rather than by choosing another tool.
- 🟡 Ingesting real toolholding. **The scraper has no record seam for it** —
  its registry binds record mappers for cutting tools only, and no toolholding
  family carries a column map. There is no `ToolRecord` equivalent to take a
  handoff at, so something has to read the vendor's own labels.

  **Done as a stopgap in `src/vendors/regofix.ts`**, decided 2026-08-28: one
  vendor, one file, every mapping citing the evidence that pins it. REGO-FIX
  publishes exactly three DIN 4000 codes with corroboration — `B4` gage length,
  `A1` diameter at the collet end, `B3` projection — and `A2`/`B1`/`B2`/`B3_WOA`
  arrive prefixed precisely because nothing says what they measure, so nothing
  reads them. **The right home is still the scraper**, beside the vendor
  knowledge and its tests; this file should move there and be deleted here.

  Real numbers as of 2026-08-28: 21 BT30 powRgrip holders and 321 collets across
  all 12 groups, and **2,838 of the 4,697 tools can be held** by a BT30
  powRgrip stack.

  **A form the vendor states beats one this package derives** (2026-09-01).
  `ScrapedTool.form` is optional and carried through `ingest` with
  `vendor-stated` provenance, which `withDerived` then leaves alone. It exists
  for Harvey's **2,261 keyseat cutters**: the scraper files them under
  `kind: 'endmill'` — it has no finer kind — and their own `profile` fact cites
  the page title that does, _"Keyseat Cutters - Square - Reduced Shank"_. On
  the kind alone they ingest as flat end mills with a corner radius of zero,
  and a 22 mm cutter with 1.6 mm of flute and twelve teeth was being offered to
  finish a pocket floor (Paul, 2026-09-01: "are you sure this is a flat
  endmill?"). `scripts/scrape.mjs` states `slot mill` for them, which is what a
  CAM library calls a keyseat or woodruff cutter and what the rules sheet
  already writes T-slot rows against.

  **The right home is a kind of its own in the scraper's family table** — one
  change there states it for every consumer, and this table of one entry goes
  away. Worth raising with Justin along with the naming questions.

  **MariTool followed on 2026-08-31, in `src/vendors/maritool.ts`**, under the
  same stopgap rule and for the same reason: still no record seam for
  toolholding. It is the first vendor here with holders that are **not** collet
  chucks — a shrink-fit holder and a hydraulic chuck each grip a plain shank
  directly, which is the catalog's `bore` clamping, and `Shank Size` is read
  only on those (a collet chuck states it too and would otherwise claim a
  capacity it does not have). MariTool mixes inch and millimetre parts inside
  one family, so every cell is converted in the mapper against the vendor's own
  convention — a metric cell is marked `mm`, an imperial one is bare — and a
  cell that cannot be read that way is refused rather than guessed. `hydraulic`
  maps to `bore`: the catalog's clamping says what the holder grips, not how it
  closes.

  Real numbers as of 2026-08-31: **511 MariTool holders** across CAT40, CAT50,
  BT30, BT40 and HSK, of which 255 are collet chucks, 200 shrink-fit and 77
  bore. 17 rows were left out and named — a bore holder with no readable
  `Shank Size`, and `BT40-ER32-60`, which publishes no `Taper` row at all: a
  holder whose spindle interface is unknown fits no machine, so the catalog
  refuses it where the scrape's receipt keeps the hole.

  **The ER collet chucks hold nothing yet.** No ER collet source is scraped —
  the 321 collets in the catalog are REGO-FIX PG — so those 255 holders are
  ingested and then never offered. The shrink-fit and hydraulic holders are
  usable today, and they are the first direct-bore holding this catalog has
  had.

  **Kennametal toolholding cannot be re-scraped at all**: no toolholding family
  records a `familyCode` — they were scraped by hand from codes read off the
  page — so the 8 Kennametal holder families and 2 collet families are blocked
  upstream until somebody records them. That is 74 holder rows and 120 collet
  rows currently unreachable.

- ✅ Build an assembly, and save it. The tool page lists every way the catalog
  can hold that tool, shortest stickout first, and keeps the ones somebody
  chooses in `localStorage`. **A saved assembly holds three guids and a
  stickout** — identity and one decision, never geometry — and resolves through
  the catalog on every render, so nothing in the browser becomes a second source
  of truth for a diameter.
- ✅ The document carries toolholding (`Catalog.holders` / `.collets`, version
  3), and ingest takes it in the same declared shape. An empty toolholding list
  reads as "this dataset carries none" and never as "nothing holds this tool":
  the two look identical on screen and mean opposite things.
- Visualise one — the first thing here that needs geometry the catalog does not
  currently carry. Whether that is a drawing from stated dimensions or the CAD
  the vendor publishes is an open question with very different costs.
- ✅ An assembly whose collet publishes no grip length is **still offered**,
  with no stickout rather than a guessed one — REGO-FIX's powRgrip line
  publishes none, and hiding those assemblies would have said no such assembly
  exists. Changed 2026-08-28, on meeting the real data.
- ⬜ What the assembly check still does not model, stated in `NOT_MODELLED`
  rather than left to be discovered: **holder collision** (a nose wider than the
  feature's opening fouls the part before reach runs out), **deflection**
  (reach is geometry; whether a stack can take a cut is rigidity, and there is
  no force model here), and **a bore holder's grip length**, which is why those
  assemblies use the whole tool as their stickout and are an upper bound rather
  than a fact.

### Phase 4 — mapping a part 🟡 in progress

- ✅ Map a tool to a feature for roughing, for finishing, or both —
  `mapping.ts`, and from the part page against everything currently selected. A
  tool that clears all five selected features is chosen once, not five times.
  Remapping replaces rather than accumulates: a second tool for the same pass is
  a correction, and keeping both would leave a plan that says two things.
- ✅ **Progress is counted in features, per pass** — decided 2026-08-27. Two
  bars rather than one number, because a part whose every feature has a rougher
  and no finisher is half-planned in a specific way that one number would hide.
  `rough` and `finish` are the DFM application's own two passes, so the word
  means the same thing in both.
- ✅ **100% is not the goal**, and nothing presents it as a score. A part is
  allowed to ship with features nobody maps — a fillet left as cast, a face the
  fixture covers.
- ✅ Preferred roughers and finishers — `preferences.ts`. A shop nominates
  tools per pass and they sort to the top; **preferences order, they never
  hide**. `recommended` answers `null` rather than naming an arbitrary first
  row, because a recommendation nobody stands behind is how a shop stops
  trusting the recommendations.
- ✅ Materials: the part carries an ISO 513 group, chosen on the part page and
  **never defaulted** — a default of steel would be a claim about the part that
  every tool list downstream inherits. Material has three standings, not two:
  `stated`, `unstated`, and `excluded`. Only `excluded` removes a tool, and that
  is the vendor's own claim rather than an inference — "the vendor indexes this
  under nothing" says nothing about suitability.
- ✅ Feature datasheet display, read through `@toolpath/part-contracts/report`
  — the same reader the DFM application uses, so a number checked here reads
  identically there. Shown only when exactly one feature is selected, with the
  kernel's raw record behind a disclosure.
- ⬜ A preferences screen. Nominating happens inline on the part page today,
  which means a shop cannot see or reorder its own list anywhere.

### Phase 5 — the viewer, and Fusion ⬜

- **The DFM app's part interactions**, properly: the 3D viewer, picking a face,
  scoping to a direction, the selection model. `@toolpath/part-contracts`
  already holds the selection semantics; what is not yet extracted is the viewer
  component and its highlighting. Deferred because it is the largest single
  extraction and the catalog can select features from a list until then.
- **Fusion import**: read a shop's existing library, match it to catalog tools,
  and to features.
- **Fusion export**: emit a library from a selection. The prior repository's
  pipeline produced Fusion libraries as its primary artifact, so the shape of
  that document is known.

### Taken out on 2026-09-01

Paul's call, all of it, while the part half is being worked on. **Nothing here
was deleted because it was wrong** — it was deleted because a branch nobody can
read is worse than one that has to be restored from git, and git has all of it
on `paul/tool_catalog`.

- **All-holes mode.** Reading every hole on the part at once — the table, the
  plan, the per-size drill and tap, the zoom walk, "machine from the other
  side", and applying a thread to every size in one press. It was
  `components/hole-table.tsx`, `shared/hole-plan.ts`, `shared/hole-rows.ts`,
  the grouping half of `shared/hole-mode.ts`, and the mode switch in
  `components/selection-panel.tsx`. `git show e34b952:apps/catalog/…` brings any of
  it back; what has to be rebuilt is the wiring in `routes/part.tsx`.
- **The catalog browser and the family list.** Still there, still tested, and
  reachable at `/catalog` and `/families` — nothing links to them, and `/` is
  the part flow. Two `NavLink`s in `components/app-header.tsx` put them back.
- **Thread milling** stays out of `HOLE_MODES` (2026-09-01), and the type still
  carries it.
- **The thread suggestions as chips.** One select, with the readings in it.

**Then the QA pass of the same day** took the rest: the STEP exports from the
order list and the by-feature grouping (Paul: "we won't do that (for now)"),
the 3D tool in the viewer with the wrench that toggled it — and with it
`components/assembly-model.tsx`, `shared/worst-spot.ts`, `shared/step-file.ts`
and `shared/tool-profile.ts` — the vendor placeholders in the filter panel, and
the sheet's caution colouring in the type picker.

Everything that lost its last caller went with it — `shared/way-up.ts`,
`toolingScore`, `toggleKept`, `anywhereKept`, `likelyThread`,
`threadAtReading`, `clampedFrom`, `isEmptyQuery`, `toolHeadline`, `savedFrom`,
`FluteIcon` — because a function whose only caller is its own test reads as
load-bearing to the next person to open the file.

### Explicitly not now

- **No accounts, no database.** Everything a person sets is theirs and local
  until a phase says otherwise. If a shared store becomes necessary, that is a
  scope decision and not a refactor.
- **No scraping from the UI.** Adding a vendor family requires the human
  judgement calls the scraper's `ADDING-A-VENDOR.md` runbook documents.
- **No feeds-and-speeds calculation.** Displaying data a pipeline produced is in
  scope; computing cutting data interactively is not.
- **No editing tool data.** Corrections belong upstream in the scraper and flow
  forward. The application may write a person's own state — a mapping, a
  preference, an assembly — and never a diameter.

## Shared code

The rule is in `AGENTS.md`: the second application to need something triggers
extraction, and what gets extracted is the pure part.

**`@toolpath/domain`** — unit conversion and formatting, class composition,
keyboard movement through a list. `loadUnit`/`saveUnit` changed on the way out:
they take the storage key from the caller instead of naming one, so two
applications on one origin do not silently share a preference. The DFM app
passes `part-viewer.unit`, unchanged, so nobody's stored preference reset.

**`@toolpath/part-contracts`** — the redacted report the browser is allowed to
see, the analysis event, which CAD files are accepted, the datasheet readers,
and the feature-selection model. Split into subpaths on purpose: the root is
server-safe, while `/report`, `/picks` and `/selection` reach
`@toolpath/viewer`, which installs camera controls against a DOM at import.
`/datasheet` is the viewer-free half of the report readers, which is what lets a
Hono server and the tool fit both read a datasheet without loading a 3D viewer.

**`@toolpath/part-server`** — `createPartApi({ appName })`: secure headers,
CSRF, the encrypted BYOK connection cookie, part creation, analysis events, and
the mesh relay. `appName` names the cookie and domain-separates the key it is
sealed with, so the two applications cannot read each other's session on one
origin. Changing it invalidates that application's sessions.

**`@toolpath/part-client`** — the typed fetches and the session and analysis
hooks. `usePartUpload` deliberately stayed in each application: it ends in a
route, and the route is the application's.

Still to extract, when a second consumer earns it:

- **The viewer component and its highlighting** (phase 5) — the largest one, and
  the one that makes "the same part interactions" literally true rather than
  approximately.
- **Assembly fit**, once phase 3 exists in both applications.
- **`partTop`**, now implemented in both `catalog-data`'s `fit.ts` and the DFM
  app's `measurements.ts`. The same rule in two places is the next duplication
  to collapse — it belongs in `@toolpath/part-contracts` beside the datasheet
  readers.

## Testing

Nothing here needs a Toolpath API key, a network, or a scrape.

```sh
pnpm --filter @toolpath/catalog test          # unit tests, seconds — run constantly
pnpm --filter @toolpath/catalog-data test     # the data package's own
pnpm --filter @toolpath/catalog check-types
pnpm test:e2e:catalog                         # end-to-end, ~30 s
pnpm check                                    # the whole gate: style, lint, build, types, tests
```

Where a test goes, and why — taken from the DFM application's `docs/README.md`,
whose reasons hold here unchanged:

- **Pure logic goes in `app/shared/*.test.ts`.** That is the bulk of the value.
  `part-interaction.ts` is the model case: what a click, an arrow, a tick and
  Escape each mean, as one reducer with twenty assertions — after a day of
  fixing the same arrow three times through a rendered scene.
- **Component tests work.** `column-filter.test.tsx` pins the range control
  through a stateful harness, because both of its defects were in the round
  trip between what it wrote and what came back as its props.
  `part-viewer.test.tsx` mocks `@toolpath/viewer` and asserts the props that
  reach it — the seam that failed when `DirectionArrows` was drawn without a
  handler.
- **Anything that begins with a click on the part goes in
  `tests/on-the-part.spec.ts`**, against `tests/cube-fixture.ts`. The tool half
  of the application needs no part, so nothing else mounts geometry, and
  nothing else can say whether a click on the canvas reaches the reducer.
- **Never capture a real part's report and check it in.** The vendored viewer
  cube in `tests/fixtures/` is the one exception: geometry cannot be written out
  by hand, and `@toolpath/viewer` publishes `dist` only. Do not add a second
  exception without the same kind of reason.
- **Sensors, not tests, for conventions.** `eslint.config.js`,
  `scripts/check-style.mjs`, `scripts/check-style.test.mjs` and the CI
  `format:check` step. A rule that lives only in AGENTS.md drifts; see below.

## Defaults by feature

**The feature and the material are the whole question.** What the panel shows
about a feature, which of those numbers filter the tool list, which kinds of
tool are offered first, and what the other filters default to are all read
from one datasheet: `apps/catalog/app/shared/feature-defaults.csv`, one row
per kernel feature type, meant to be edited by hand.
`docs/FEATURE-DEFAULTS.md` is the guide; `shared/feature-defaults.ts` reads it
and `feature-defaults.test.ts` checks the committed sheet against the
vocabulary, so a typo fails the gate rather than showing nothing.

Reach is deliberately **not** a filter: it depends on the holder, and checking
that an assembly clears the part is the assembly's question. `LBH` stays on
each tool as a figure — flute length plus one diameter, capped so a third of
the overall length stays in the holder; never the vendor's shoulder length,
which on a tool with no neck is just the flute length again — and L/D is
length below holder over diameter. The derivation re-runs on every build, so
changing the rule and running `rebuild.mjs` reaches an existing dataset.

## Building an assembly

**The DFM catalog's flow (Justin Gray, 2026-08-05 → 08-10), followed here.**
Three panes, each narrowing the next — `components/assembly-picker.tsx` over
`catalog-data/assembly-picking.ts`:

- **Holders** that can hold the shank, filtered by spindle taper, spindle
  contact, holding style and collet series. Counts are live; a value with no
  matches is disabled where it stands, never hidden; an axis the selection has
  answered away (series, under a bore style) is locked with a sentence. The
  order is the recommendation — smallest collet series, then shortest gauge
  length, the least overhang a machinist picks by hand — and the first row is
  badged, so a choice made on the shop's behalf is visible as one.
- **Collets** of the chosen holder's series that close on the shank, closest
  to on-size first. A bore holder needs none, and the pane says so rather
  than showing an empty list.
- **The assembly**: the three parts, numbered and described in words, and
  _Save assembly_.

The selection is one `BuildSelection` (`catalog-data/assembly-selection.ts`)
that the picker and the drawing both read, so they cannot disagree. On the
tool page it lives in the URL — an assembly _is_ that page. On the part page
it belongs to the feature: guids and stickout go on a **setup sheet**
(`shared/setup-sheet.ts`, references only, per part, in this browser); the
filters stay on the page and sticky across features. Changing a filter clears
the holder and collet; choosing a holder clears the collet; a link can never
describe an assembly the page is not showing.

**Stickout** is set on the drawing. Its default is this application's — the
tool's length below holder — and its ceiling leaves a third of the overall
length in the holder (`HELD_SHARE`, the same third that caps the derived
length below holder; Paul's rule, 2026-08-29, replacing three shank diameters
because how much a collet needs is about the tool's leverage, not its shank),
or the collet's own grip where a vendor states one, whichever is stricter. A
tool whose stated length below holder outruns that collapses the range and
the card says why. No vendor publishes a stickout; the card says whose number
it is.

## Holder body

What REGO-FIX's per-part DIN 4000 XML states, read across the series on
2026-08-29 (the scraper's doc had pinned `A1`, `B3` and `B4` and carried the
rest unpinned):

| BT 30 / PG …  |  A1 |    A2 |    B1 |    B2 |  B3 | B3_WOA |    B4 |
| ------------- | --: | ----: | ----: | ----: | --: | -----: | ----: |
| PG 6 x 050    |  10 | 12.02 | 10.55 |   9.6 |  50 |   47.5 |  98.4 |
| PG 10 x 062   |  16 | 17.89 |   9.9 | 18.05 |  62 |     58 | 110.4 |
| PG 15 x 065   |  24 |    28 |  26.9 |     — |  65 |   60.5 | 113.4 |
| PG 25 x 075   |  40 |    42 |  33.4 |     — |  75 |     69 | 123.4 |
| PG 6 x 080 H  |  10 | 14.34 | 10.55 | 26.76 |  80 |   77.5 | 128.4 |
| PG 10 x 160 H |  16 | 26.81 |   9.9 | 103.1 | 160 |    156 | 208.4 |

- `B1` is constant per collet size whatever the projection: the **nose
  length**.
- `A2`/`B2` step up from `A1` and run longer and narrower on the slim `H`
  bodies: the **body behind the nose**. Blank where the body goes straight to
  the taper.
- `B3 − B3_WOA` is 2.5 / 4 / 4.5 / 6 by series — the collets' own `B3` in
  their DIN 4000-93 sheets, to the decimal: the **seated collet's protrusion**.
- `A4` is 46 on every BT 30: the flange, from `BT MAS 403`.

`vendors/regofix.ts` reads them as such; `clearance.ts` sweeps collet, nose,
body, an _assumed_ cone to the flange (sampled so it can only refuse, never
pass, what the true body would not) and the flange; `outline.ts` draws the
same, dashed where assumed. What is still not stated: the shape between the
last body step and the flange (the STEP model has it), the flange thickness
(drawn as a BT 30's 20 mm), and every collet's own length and grip — the
collets' XML states `B1`, `B3` and `B71`, and reading it is the scraper's job.

## Holder collision

Engine API **1.0.4** (staging, 2026-08-29) puts a `reachCurve` on every
feature datasheet: for each distance out from the wall of the cut, how tall
the material within that distance stands above the feature's bottom, worst
case over the whole feature. An assembly is a solid of revolution, so the
check is one comparison per step of its profile — `catalog-data/clearance.ts`,
tested against literal curves, run wherever the assembly fit runs. The holding
panel shows each stack's verdict against the selected feature, and
`assemblyAgainst` counts a collision as a reason like any other.

Two things to keep in view:

- **The SDK drops the field.** `@toolpath/api` 0.2.3 and 0.2.4 were generated
  before 1.0.4, and their `FeatureDatasheetFromJSONTyped` copies thirteen
  named fields. `part-server/src/reach-curve.ts` reads the raw response and
  grafts the curve back by feature tag. `reach-curve.test.ts` reads the
  installed SDK's declaration and **fails the day it names `reachCurve`** —
  that failure is the instruction to delete the shim, read the field typed,
  and re-export the SDK's type from `@toolpath/part-contracts`.
- **The silhouette is the catalog's, not a holder's CAD.** Nose diameter,
  shank, and a neck where stated. A collet nut or a tapered body is finer than
  that, and a pass is a pass for exactly what `Clearance.checked` lists. The
  kernel's `importHolder` derives a true profile from holder CAD; if the API
  ever exposes that, the profile here is what it replaces.

## Lessons from 2026-08-28

A day that fixed the same three things repeatedly, and what now stops each
from coming back. Recorded because the next session will be tempted by the
same shortcuts.

| What went wrong                                                                | Why nothing caught it                                       | What catches it now                                 |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------- | --------------------------------------------------- |
| The arrows were never wired: `DirectionArrows` drawn without `onPickDirection` | No test rendered the viewer; three "fixes" went downstream  | `components/part-viewer.test.tsx`                   |
| A miss on the mesh un-armed the arrow that was just pressed                    | Arrow rules were `useState` interplay inside the route      | `shared/part-interaction.test.ts`                   |
| An armed arrow stayed armed, pinning every later click to one way up           | Same                                                        | Same                                                |
| `?job=` read as a filter; then filters wiped `?job=`                           | The URL round trip had no test                              | `shared/filter.test.ts` (`axes`, `searchWithQuery`) |
| A suggestion from the last feature outlived it (pocket kept the hole's drill)  | "Fill blanks only" looked right until two features in a row | `shared/suggest-filters.test.ts`                    |
| The range operator was derived from the bound, so ≤ with nothing typed was Any | No component test on the control                            | `components/column-filter.test.tsx`                 |
| The number box re-formatted "1." to "1.000" under the cursor                   | Same                                                        | Same                                                |
| The type grid spoke Fusion's names against a catalog that said `endmill`       | Two vocabularies, no facet for the finer one                | `form` derived at build; `build.test.ts`            |
| Eighty single-line `if`s against a rule stated in AGENTS.md                    | The rule had no sensor                                      | `pnpm lint` (`curly`), in `pnpm check`              |
| Holding keys would have emptied the tool list through `filterTools`            | Pre-empted, because `?job=` had done exactly that           | `shared/holding.test.ts`                            |
| A contract bump meant a re-scrape                                              | No way to re-run `buildCatalog` over an existing dataset    | `scripts/rebuild.mjs`                               |

Three habits from the DFM repository's history that would have saved most of
the day, now adopted:

1. **A rule is proven by a command or it is judgment.** AGENTS.md § Code
   Styling says which; `pnpm check` runs the cheap sensors first.
2. **Give a behaviour a sensor before fixing it a second time.** If a fix could
   be deleted with the suite still green, the fix is not finished.
3. **Pure logic out of the route.** Every rule about what a click means is a
   reducer with a test, and the page dispatches.

## Open questions

- **Where does the viewer belong in the order?** It sits in phase 5 because it
  is the largest single extraction, but the cross-cutting requirement asks for
  "the same part interactions as the DFM app" and the part page selects from a
  list today. The semantics already match — a selection is a set of feature
  tags either way — so moving it earlier costs nothing already built. Raised
  2026-08-27, deliberately left open.

- Is the derived catalog committed, or built in CI? (Phase 2.)
- Which vendors ship in the first real dataset, and who decides a family is
  worth ingesting?
- Who records the missing Kennametal toolholding family codes, and where — the
  scraper's family table is the only sensible place.
- When does `src/vendors/regofix.ts` move into the scraper? It is a stopgap by
  construction and the longer it lives here the more vendor knowledge accretes
  in the wrong repository.
- What does an inch tap's `TP` actually state — threads per inch, or a pitch in
  inches? Answering it puts thread pitch back in the catalog.
- ~~What is the denominator for "percentage of the part mapped"?~~ Decided
  2026-08-27: features with a tool mapped, counted separately for roughing and
  finishing. Note this differs from the DFM application, which measures coverage
  by **surface area** — deliberately, because area needs a measurement this
  catalog would have to defend and a feature is the unit the selection already
  works in.
- When does `apps/dfm` here join the lint and check-style scope? It is the
  template's copy; the DFM repository's `paul/directions-mapping` already
  settled its styling and layering with the same sensors. Merging that branch
  in is the trigger — see AGENTS.md § Code Styling.
- Do the two applications deploy together or separately? It decides whether the
  unit preference should be shared rather than keyed per application, and
  whether one session could serve both.
- How is an assembly visualised — a drawing from stated dimensions, or vendor
  CAD? (Phase 3.) The reach curve is drawable too, and an assembly silhouette
  laid over it is the picture of _why_ a holding fails.
- When `@toolpath/api` ships a build from Engine API 1.0.4, retire
  `part-server/src/reach-curve.ts` — its own test says how.
