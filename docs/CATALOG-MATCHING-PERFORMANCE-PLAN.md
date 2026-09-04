# Catalog matching performance - demo implementation plan

_Updated 2026-09-04 after a sixteen-wall selection made the catalog unusable.
This is the handoff plan for the demo. It deliberately chooses the smallest
architecture that removes matching from the browser UI thread; it is not a
production backend design._

## Decision

Run catalog matching in **one browser Web Worker**.

The catalog is already bundled into this static application. Matching currently
runs in React renders and event handlers over a 17,470-tool dataset, which
blocks the one browser thread responsible for clicks, typing, animation, React
commits, and painting. A Web Worker is a standard browser API for this exact
case: it runs JavaScript on a second thread while preserving the existing
client-side data model and avoiding a new server API.

This is the right tradeoff for a demo likely to be discarded:

- it keeps the existing bundled-catalog architecture;
- it reuses the existing pure matching engine rather than rewriting rules;
- it needs no deployment, queue, worker-pool, authorization, or shared-cache
  infrastructure;
- it fixes the actual user-visible defect: matching may take time, but it no
  longer makes the application unresponsive.

Do not move matching server-side in this implementation. A future product may
keep the same request/result boundary and replace the browser worker with a
server API backed by Node worker threads. That is intentionally out of scope.

## Scale and root cause

The real scraped catalog on the machine that exposed the issue contains:

| Data                |  Count |
| ------------------- | -----: |
| Cutting tools       | 17,470 |
| Flat end mills      |  6,900 |
| Bull nose end mills |  4,380 |
| Ball end mills      |  3,315 |
| Slot mills          |  2,261 |
| Drills              |    485 |
| Taps                |    129 |

Walls are not grouped like identical holes. A group of sixteen walls is sixteen
separate feature demands.

The blocking code paths are:

| Path                                  | Current behavior                                                                | Why it freezes                                                                                                                           |
| ------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `app/routes/part.tsx` main tool table | Calls `fittingTools(...)` while React derives the selected tool list.           | It evaluates selected features against the catalog, allocates verdicts, performs collision checks, and sorts before the page can commit. |
| `part.tsx` `topFor(...)`              | Calls `fittingTools(...)` to find one recommendation.                           | A feature-list row runs an expensive full-catalog match merely to display one tool.                                                      |
| `app/shared/recommendations.ts`       | Calls `topFor` while deriving feature-list rows.                                | A one-each group can invoke matching once per wall during render.                                                                        |
| `part.tsx` `billFor(...)`             | Calls `answerFor` for every child when confirming a one-each group.             | One click can synchronously run up to sixteen matching passes.                                                                           |
| `app/shared/judge.ts`                 | Applies rules, derives relative best values, and checks reach-curve collisions. | This is correct domain work, but it must not run on the UI thread.                                                                       |

`useMemo`, `useDeferredValue`, and `startTransition` do not solve this. They
change when React renders; they do not move a long synchronous JavaScript loop
off the main thread.

## Scope

### Build now

1. One Vite module Web Worker that imports the immutable catalog and existing
   pure matching functions once.
2. One browser hook that owns worker lifecycle, requests, pending state, and
   stale-response rejection.
3. Asynchronous detailed matching for the one feature/group currently open in
   the tool table.
4. Batched asynchronous recommendations for visible feature-list rows and
   every child of a one-each group.
5. Pending/error UI states that keep selection, chips, the viewer, and the rest
   of the application interactive.
6. Confirmation that consumes ready worker results instead of matching in its
   click handler.
7. Focused unit/component/browser coverage and a source sensor preventing a
   future main-thread matching call.

### Explicitly defer

- a catalog matching HTTP API;
- Node `worker_threads`, queues, a process pool, or server-side cache;
- cross-user/shared caching;
- matching pagination, remote search, or a database index;
- optimized geometry/categorical indexes and a custom streaming matcher;
- catalog-data package extraction;
- runtime performance instrumentation.

The first worker implementation is allowed to use the existing full matcher
unchanged. That preserves matching behavior and gets the UI usable quickly.
Optimizing worker throughput is a later task, only if answer latency remains
unacceptable after the UI no longer freezes.

## Required files and boundaries

| File                                                 | Change     | Responsibility                                                                                                                     |
| ---------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `apps/catalog/app/client/catalog-matcher.worker.ts`  | Add        | Worker entry. Imports the catalog and pure matching code; handles messages; owns optional small per-tab cache.                     |
| `apps/catalog/app/client/catalog-matcher.ts`         | Add        | Browser-only hook. Creates/terminates the worker in an effect; posts requests; exposes status and results.                         |
| `apps/catalog/app/shared/catalog-matcher.ts`         | Add        | Pure request normalization, stable keys, worker DTO types, and result conversion. No React, DOM, Worker, route, or server imports. |
| `apps/catalog/app/routes/part.tsx`                   | Change     | Builds requests; reads async results; never invokes matching directly.                                                             |
| `apps/catalog/app/shared/recommendations.ts`         | Change     | Projects supplied answers only. It must not accept a callback that can calculate an answer.                                        |
| `apps/catalog/app/components/feature-list-panel.tsx` | Change     | Renders ready, pending, no-fit, and error recommendation states.                                                                   |
| `apps/catalog/app/components/group-editor.tsx`       | Change     | Shows matching progress and disables confirmation until current results are ready.                                                 |
| `apps/catalog/dev-server-exclude.ts`                 | Change     | Leaves Vite worker module requests, including `worker_file`, to Vite.                                                              |
| `apps/catalog/app/**/*.test.*`                       | Add/change | Protocol, hook, component, and behavior coverage below.                                                                            |
| `scripts/check-style.mjs` or `eslint.config.js`      | Change     | Add a narrow sensor preventing route/component imports of runtime matching values.                                                 |

Matching remains app-local. `@toolpath/catalog-data` owns catalog types and
domain helpers, but no second application currently needs this browser-worker
protocol, so extracting a new package would slow this demo without a consumer.

## Worker design

### Startup

The hook creates the worker only in `useEffect`:

```ts
new Worker(new URL('./catalog-matcher.worker.ts', import.meta.url), { type: 'module' })
```

Do not construct `Worker` at module scope. React Router still creates a shell
build, and server execution must never attempt to access the browser API.

The worker imports `shared/catalog.ts`, so Vite bundles the catalog separately
for the worker and loads it once per open tab. Do not post 17,470 tools from the
route to the worker for every request.

The worker imports the existing pure values:

- `fittingTools` and `closeCandidates` from `shared/tool-fit.ts`;
- filtering/holding helpers from `shared/filter.ts` and `shared/holding.ts`;
- holder checks from `shared/holder-choice.ts`;
- rules/knobs and thread-bore helpers currently assembled in `part.tsx`.

The worker must not import React components, route modules, browser storage, or
the Hono server.

### Messages

Use plain structured-cloneable objects. Send feature/report data and matching
settings; do not send functions, `Map`, `Set`, DOM objects, React state, or the
catalog itself.

```ts
export type MatchRequest = {
  readonly requestId: number
  readonly kind: 'table' | 'recommendations'
  readonly key: string
  readonly context: MatchContext
  readonly demands: ReadonlyArray<MatchDemand>
}

export type MatchResponse =
  | {
      readonly requestId: number
      readonly kind: 'table' | 'recommendations'
      readonly key: string
      readonly results: ReadonlyArray<MatchResult>
    }
  | {
      readonly requestId: number
      readonly kind: 'error'
      readonly key: string
      readonly message: string
    }
```

`MatchContext` includes only answer-affecting data:

- the effective tool query and material group;
- selected/derived feature data and the full report feature list required for
  part-top, rules, and reach calculations;
- thread choices and effective tap-drill bore;
- rule knobs, clamping rule, and tool geometry policy;
- holder filters, margins, thresholds, holder data, and collet data.

`MatchDemand` names a selected tag set and contains the effective features to
judge. It has a stable `demandKey` so batched feature-list answers can be
looked up without depending on result order.

### Result DTOs

The worker returns GUIDs and compact matching data, not copied `CatalogTool`
objects. The route already has the bundled tool list and rehydrates a GUID via
the existing catalog lookup.

```ts
export type RecommendationResult = {
  readonly demandKey: string
  readonly state: 'ready' | 'nothing-fits'
  readonly toolGuid: string | null
}

export type DetailedResult = {
  readonly demandKey: string
  readonly fitting: ReadonlyArray<CompactVerdict>
  readonly excluded: ReadonlyArray<CompactVerdict>
}
```

`CompactVerdict` carries a tool GUID, standing, reasons, rank key, and rank
readings. This is enough to retain current ordering, counts, close misses, and
column marks without cloning the entire catalog record per verdict.

For this demo, returning complete compact detailed results is acceptable. The
table is already DOM-virtualized. If data transfer becomes the next bottleneck,
add paging later; do not build it before proving it is needed.

### Matching behavior

The first worker version must preserve existing semantics exactly:

- tool form/default rules still determine compatibility;
- relative `best` rules use the same surviving set;
- rank ordering and catalog-order ties remain unchanged;
- reach-curve collision checks stay in the evaluator;
- holder checks still happen after cutter compatibility;
- saved tool choices still override recommendations.

For a detailed request, move the route's current `fittingTools` orchestration
to a pure helper and run it in the worker unchanged.

For recommendations, move the route's current `topFor` orchestration to a pure
helper and run it once per demand inside one batched worker message. It may use
the current filter-before-judge behavior. It returns the first holdable ranked
tool or `nothing-fits`.

Do not write a second rule engine or an approximate “first plausible tool”
algorithm. The worker changes where matching runs, not what matches.

### Cache and cancellation

Caching is optional for the demo. If added, it is a small worker-local `Map`
keyed by a stable normalization of demand plus all matching inputs. It is
per-tab, has a fixed maximum size, and is an optimization only.

Do not build a cross-tab, server, persistent, or tenant-aware cache.

Every request has a monotonic `requestId`:

- the hook retains the latest ID for each request slot (`table` and
  `recommendations`);
- a response older than that slot's latest ID is ignored;
- an old response must never update a group after a wall was added or removed;
- the route can post a new request immediately while the worker is busy;
- the worker may process an obsolete request to completion in this first
  version, but it must not block the UI thread and its response is discarded.

Batch/debounce rapid changes by approximately one animation frame or a short
timeout. “Add every Wall” must produce one latest batch request, not sixteen
sequential requests. Do not delay ordinary single clicks long enough to make
the UI feel inert.

## Route integration

### No more runtime matcher calls in UI code

After migration, no route or component may call any runtime matching value:

- `fittingTools`;
- `judgeTools`;
- `topFor` or an equivalent synchronous recommendation function.

`part.tsx` builds `MatchDemand` values, passes them to the hook, and reads
result state. The worker/pure matching helper is the only execution path.

Existing type-only imports are fine. Add a source sensor that blocks runtime
matching imports in `apps/catalog/app/routes/` and
`apps/catalog/app/components/`.

### Main tool table

When the open feature/group changes:

1. Build one detailed `table` request for the current effective selection.
2. Keep the previous table visible or show a localized loading state.
3. Send the request to the worker.
4. Rehydrate compact verdict GUIDs when the response is current.
5. Feed the current table components the same shape they already expect, or a
   minimal adapter from `DetailedResult` to that shape.

The viewer selection, group chips, filter controls, and page navigation must
remain interactive while the table is pending.

### Feature-list recommendations

Replace the render-local `answerFor` map and synchronous `topFor` callback.

1. Derive demand keys for visible list items and open one-each group children.
2. Batch unmatched demands into one `recommendations` request.
3. Let `recommendationRows` receive an answer map with four explicit states:
   saved choice, pending, ready, and nothing fits/error.
4. Render `Finding a compatible tool...` for pending. Pending must never read
   as `nothing fits`.
5. Saved choices are resolved immediately from the local setup sheet and need
   no worker request.

The old cache must be deleted once all users have migrated. It is bound to a
`topFor` closure and is the reason unrelated state can invalidate answers.

### Group confirmation

For a one-tool-for-all group, retain the current explicit user tool selection.
For a one-tool-per-feature group:

1. Request every distinct feature demand as a batch when the group changes.
2. Disable the confirmation button while any current demand is pending or
   errored.
3. On confirmation, read ready recommendation GUIDs from worker result state.
4. Write those GUIDs to the setup sheet.
5. Never call the matcher from `billFor`, `confirmDraft`, or a button handler.

If a user changes the group while matching, the button returns to pending and
the response for the prior group is ignored.

## UI requirements

| User action           | Required immediate behavior                                 | Matching behavior                                                               |
| --------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Add every Wall        | All chips and mesh highlights update without waiting.       | One batched request starts after the selection update.                          |
| Remove a wall chip    | Chip disappears and mesh selection updates without waiting. | A replacement request starts; previous answer is not assigned to the new group. |
| Open a feature/table  | Existing UI stays usable.                                   | Table area shows pending until the detailed result is current.                  |
| View a saved feature  | Saved tools appear immediately.                             | No recommendation work is required.                                             |
| Create one-each group | Button accurately says it is waiting for answers.           | It enables only when every current recommendation is ready.                     |
| Worker failure        | Page stays interactive.                                     | Show a clear error/retry state; never report a false no-fit result.             |

Do not defer the visual selection itself. The chips and mesh must agree
immediately; only the computed matching answer is asynchronous.

## Tests

### Pure tests

Add `app/shared/catalog-matcher.test.ts` to cover:

- stable request-key creation;
- thread-bore substitution in a demand;
- conversion between full matcher verdicts and compact DTOs;
- recommendation parity with the existing `topFor` behavior;
- detailed-result parity with existing `fittingTools` fixtures;
- a sixteen-wall batch producing one result per demand;
- saved choices bypassing recommendation requests.

Existing `matching.test.ts` and `judge.test.ts` remain the behavior oracle.
The first worker implementation must use their fixture results unchanged.

### Hook and component tests

Mock `Worker` in `app/client/catalog-matcher.test.ts` and prove:

- a request enters pending state;
- only the latest response updates a request slot;
- stale responses after a wall removal are ignored;
- worker errors are exposed as errors, not no-fit results;
- cleanup terminates the worker.

Update feature-list/group-editor tests for ready, pending, nothing-fit, and
error states. Add no raw timing assertions to unit tests.

### Browser test

Add a catalog Playwright journey using a permitted fixture with sixteen walls:

1. Start a group and press “Add every Wall.”
2. Assert all chips/highlights are visible before the matcher response is
   released from a mocked/delayed worker.
3. Remove one wall while the first response is pending.
4. Release both responses.
5. Assert only the fifteen-wall result is displayed and eligible for
   confirmation.

The test begins with part interaction, so it belongs in
`apps/catalog/tests/on-the-part.spec.ts`. Do not add a captured customer report.

## Implementation order

| Step | Work                                                                                                                  | Proof                                                                  |
| ---- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 1    | Extract request normalization and current route matching orchestration into pure helpers. Do not change behavior yet. | New pure tests agree with existing matching fixtures.                  |
| 2    | Add worker entry, DTOs, hook, dev-server exclusion, and mocked-worker tests.                                          | Worker starts in dev/test; hook handles pending/current/error/cleanup. |
| 3    | Move the open tool-table match into the worker.                                                                       | Existing table behavior passes against worker result adapters.         |
| 4    | Move feature-list `topFor` work to batched worker recommendations.                                                    | Recommendation rows never invoke matching during render.               |
| 5    | Make one-each confirmation consume ready recommendation results.                                                      | No click handler calls the matcher; group test passes.                 |
| 6    | Add source sensor, sixteen-wall browser regression test, and remove old synchronous paths.                            | `pnpm check` and catalog Playwright pass.                              |

Build each step as a working commit-sized change. Do not start optional cache or
algorithm work until step 6 passes on the real scraped dataset.

## Acceptance criteria

The demo performance work is complete when all of these are true:

| Scenario              | Requirement                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------ |
| Add all 16 walls      | Selection chips and viewer feedback occur immediately; matching cannot block the UI thread.      |
| Remove a wall         | The removal is immediately visible and interactive, independent of a current/old match.          |
| Rapid changes         | Only the newest request's result reaches the UI or setup sheet.                                  |
| One-each confirmation | It never synchronously calculates recommendations in the click handler.                          |
| Tool table            | It remains interactive while detailed matching runs.                                             |
| Behavior parity       | Existing matching order, reasons, holder behavior, and saved-choice precedence remain unchanged. |
| Worker error          | The page reports an error/retry state without freezing or falsely saying no tools fit.           |
| Regression prevention | Route/component code cannot re-import runtime matcher values.                                    |

The relevant success measure is UI responsiveness, not zero calculation time.
Matching 17,470 tools can still take noticeable time on a slow machine. With
this plan, that time is isolated to the worker while the demo remains usable.

## Future product path

If this demo becomes a product with customer-specific tool libraries, very much
larger catalogs, shared result caching, or strict backend authorization, retain
the request/result types and move their implementation to a server endpoint
backed by Node `worker_threads` or a job service. That future migration is
deliberately separate from this demo implementation.
