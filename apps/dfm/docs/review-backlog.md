# Review backlog

Nine findings from the code review of `paul/directions-mapping` (2026-08-28),
read against `c0867e8`. None is fixed. The review was asked for structure and
adherence to the steering docs — specifically for patterns that are yielding
more code — so most of what follows is about `app/components/`, which is where
the mass is.

**The gates were clean when this was written**: `pnpm lint`, `pnpm check-types`,
`pnpm test`, and `pnpm audit` all pass. Nothing here is a failing check. Every
one of these is something no check can see, which is the point — items 5 and 7
are proposals to give two of them a sensor so they stop being judgment.

There is no configured coverage script, so there is no coverage number. That is
a gap in what can be measured, not a failing check.

`app/shared/` and `apps/dfm/server/` are in good shape and are not the subject of
any finding below: 50 pure modules with a colocated test beside every one but
`reach.ts` (item 4), a 55-line `server/app.ts`, `zValidator` at every boundary,
and a redaction with its own sensor.

| #   | What                                                        | Where                                 | Severity |
| --- | ----------------------------------------------------------- | ------------------------------------- | -------- |
| 1   | `planIsGenerated` invariant dropped at four hand-edit sites | `part-inspector.tsx:1634`             | Medium   |
| 2   | `PartInspector` holds ~979 lines of untested orchestration  | `part-inspector.tsx`                  | Medium   |
| 3   | The proven state-consolidation seam was never extended      | `part-inspector.tsx:239`              | Medium   |
| 4   | `reach.ts` is the only untested module in `app/shared/`     | `app/shared/reach.ts`                 | Medium   |
| 5   | `memo` + `useStable` covers four panels of six              | `feature-viewer.tsx`, `face-list.tsx` | Low      |
| 6   | `part-view.tsx`'s stated rationale is out of date           | `part-view.tsx:24`                    | Low      |
| 7   | `useStable`'s two invariants have no sensor                 | `app/shared/stable.ts:38`             | Low      |
| 8   | Dead error-boundary override                                | `feature-viewer.tsx:56`               | Low      |
| 9   | Two `docs/` process artifacts expire on merge               | `docs/migration.md`, `-replay.md`     | Info     |

Item 1 is the only one with a user-visible wrong answer. Items 2 and 3 are one
structural problem stated from two ends, and item 1 is a bug that problem
produced — so doing 1 as the reducer described there is also the first step of 3.

---

## 1. `planIsGenerated` is a hand-maintained invariant, and four sites drop it

**Where:** `apps/dfm/app/components/part-inspector.tsx:1634`, the rule at `:1571`

The rule is written down at `part-inspector.tsx:1571`:

```ts
// A hand edit makes the whole plan somebody's decision — see `planIsGenerated`.
setPlanIsGenerated(false)
```

**Evidence.** It is enforced by remembering to call a second setter beside the
first. `setPlan` has 17 call sites; `setPlanIsGenerated(false)` appears at four
(`:1573`, `:2405`, `:2485`, `:2489`). These four mutate plan assignments by hand
and never clear it:

| Site                      | What it does                                               |
| ------------------------- | ---------------------------------------------------------- |
| `part-inspector.tsx:676`  | `cutMadeFrom` — re-points a made reading at another way up |
| `part-inspector.tsx:694`  | `deleteMade` — deletes a made reading and its claims       |
| `part-inspector.tsx:1597` | `removeSetup` — drops a setup and every claim it held      |
| `part-inspector.tsx:1829` | `onConfirmMade` — claims passes for a newly drawn reading  |

**Impact.** `planIsGenerated` is passed as `seeded` into the generator
(`:1699`). `generate.ts:326` states what that flag buys:

> Unseeded, every claimed face is marked "held by somebody else, and not ours to
> improve on" [...] That is right for a plan somebody built by hand and wrong for
> one this same file wrote a moment ago.

`best-reading.ts:408` is where it takes effect. So after removing a setup or
deleting a drawn reading, the flag is still `true`, and the next **Generate**
treats the user's remaining hand-made claims as the generator's own scratch work
and is free to overwrite them — exactly what `:1571` says must not happen.

**Fix.** Do **not** add four more `setPlanIsGenerated(false)` calls; that
reproduces the pattern and leaves the fifth site to be forgotten later. Make the
flag underivable by hand: fold it into the plan state behind a small reducer in
`app/shared/`, so `generate` is the one transition that sets `generated: true`
and every other sets `false` by construction.

**Test.** The reducer's own test in `app/shared/`, asserting each non-generate
transition clears the flag. That is what makes this safe to land before the
call sites move.

---

## 2. `PartInspector` is the app's single point of coupling, and has no unit test

**Where:** `apps/dfm/app/components/part-inspector.tsx` (2,583 lines)

**Evidence.**

| Measure               | Value                                                     |
| --------------------- | --------------------------------------------------------- |
| Body before `return`  | 2,052 lines (962 comment, 111 blank → ~979 lines of code) |
| `useState`            | 30                                                        |
| `useMemo`             | 25                                                        |
| Named handlers        | 27                                                        |
| `setState` call sites | 146, across 33 distinct setters                           |
| Panels rendered       | 7                                                         |
| Colocated test        | none                                                      |

The contrast is the finding, not the size. `app/shared/` has a test beside every
module but one. `app/components/` has tests beside the small components
(`number-box`, `pass-buttons`, `reading-row`, `tool-button`, `plan-choices`,
and `setups-panel` as of `c0867e8`) and none beside the largest —
`part-inspector` (2583), `feature-viewer` (765), `create-feature` (588),
`feature-detail` (463), `rules-panel` (373). AGENTS.md asks that behavior which
can be pure and tested live in `app/shared/`; ~979 lines of gesture arbitration
are covered only by Playwright.

**Impact (blast radius).** Adding one gesture costs a `useState` here, a prop on
one or two panels, a branch in `pickFromPart` (`:917`, an 8-way dispatch), and a
rung in the Escape ladder — whose last rung already fires six setters in sequence
(`:1291`–`:1296`) to express one intent.

**Fix.** Item 3.

**Test.** Each cluster extracted per item 3 takes its test with it into
`app/shared/`, where it is cheap. There is no useful unit test to write against
the component in its current shape, which is itself the finding.

---

## 3. The state-consolidation pattern is proven once and was never extended

**Where:** `apps/dfm/app/components/part-inspector.tsx:239`, `app/shared/pick-mode.ts`

**Evidence.** The codebase already diagnosed this and fixed it exactly once. From
`part-inspector.tsx:239`:

> `picking` carries the mode, the painted set and the way up being held — they
> change together, so they are one state rather than three that can disagree
> (§3.6 lists thirteen pieces and says most of the picker's bugs were two of them
> out of step).

That produced `shared/pick-mode.ts`: a tested reducer, and the one piece of
interaction state that cannot self-contradict. The rest stayed loose, in the same
co-changing clusters:

- `draft` / `justMade` / `addingFace`
- `proposal` / `proposed` / `showingUncut`
- `selection` / `focusFeature` / `hoveredTags` / `hoveredFace` / `currentFace` / `revealFace`
- `arrows` / `arrowsBefore` / `activeDirection` / `litDirection`
- `plan` / `planBefore` / `planIsGenerated` / `planBit` ← item 1 is this cluster

Visible from the other end too: after the `PartView` context removed the shared
data props, `MapFeaturesPanel` still takes 36 props (`map-features.tsx:795`) —
18 stabilised callbacks, plus 18 value props that are exactly this loose state.

**Impact.** Every cluster is a class of "two pieces out of step" bug, which
§3.6 already says was the picker's dominant failure. Item 1 is one instance that
has actually shipped.

**Fix.** Extend the shape that already works: one reducer per cluster in
`app/shared/`, passed to panels as one prop. `pick-mode.ts` is the template.
Start with the plan cluster, because item 1 opens it anyway.

**Test.** Per reducer, in `app/shared/`, alongside `pick-mode.test.ts`.

---

## 4. `reach.ts` is the only untested module in `app/shared/`, and it is load-bearing

**Where:** `apps/dfm/app/shared/reach.ts` (125 lines, 7 exports)

**Evidence.** Imported by `infer.ts`, `setup-offers.ts`, `best-reading.ts`, and
`generate.ts` — the four modules that decide the generated plan. `forcedRegions`,
`requiredDirections`, `undercutOnly`, and `scoreIn` are pure functions over
features with no test file, while every peer module has one. (`test-part.ts` is a
fixture; `class-names.ts` and `direction-colors.ts` are trivial data. This is the
only real gap.)

**Impact.** Undercut and reachability decisions are upstream of every generated
plan, including the one item 1 can corrupt. A wrong answer here is silent.

**Fix / Test.** `reach.test.ts` beside the rest. Cheap, self-contained, and worth
doing before item 1 since item 1 sits on it.

---

## 5. The `memo` + `useStable` treatment covers four panels of six

**Where:** memoised — `map-features.tsx:1575`, `rules-panel.tsx:373`,
`setups-panel.tsx:730`, `part-summary.tsx:257`. Not — `feature-viewer.tsx:148`,
`face-list.tsx:106`.

**Evidence.** `4c4ce08` memoised four panels and gave them stabilised callback
bags via `useStable` (`part-inspector.tsx:1767, 1948, 1950, 1973`).
`FeatureViewer` (765 lines, hosts the 3D `Viewer`, mesh, arrows and paint layers)
and `FaceList` (1,002 lines) got neither, and receive inline arrow handlers
instead — a 35-line inline arrow at `part-inspector.tsx:2250`, a ~30-line one at
`:2427`. Because the parent re-renders on all 146 `setState` sites, these two
re-render unconditionally and cannot be memoised until their handlers are
stabilised.

**Impact.** Not a measured regression, and some of it is legitimate — hover state
genuinely feeds the viewer's paint. The finding is that the split is undocumented
and nothing keeps the next panel on the right side of it.

**Fix.** Decide the two panels deliberately, and record why if the answer is "not
memoised".

**Test.** This is a rule a check could prove, and should be one: a case in
`scripts/check-style.mjs` rejecting multi-line inline arrow props in
`part-inspector.tsx`, or a test asserting every panel it imports is `memo`-wrapped.
Left as a convention it will be violated again.

---

## 6. `part-view.tsx`'s stated reason for keeping callbacks as props is stale

**Where:** `apps/dfm/app/components/part-view.tsx:24`

**Evidence.** The docstring says:

> The callbacks stay props, deliberately. They close over the page's state, so
> lifting them in here without stabilising their identity first would trade a
> long prop list for a class of stale-closure bug.

`shared/stable.ts` now provides exactly that stabilisation and is used at four
sites. The same docstring's prop counts are also out of date: it says
"`MapFeaturesPanel` took forty-two props, `FeatureViewer` thirty, `FaceList`
twenty-seven"; the current numbers are 36, 24, and 25.

**Impact.** A reader following the comment keeps threading callbacks by hand, on
a rationale a later change removed.

**Fix.** Either update the comment to say the trade is now available and why it
is still declined, or take it. Not a refactor proposal — the comment as written
is factually wrong.

**Test.** None; this is prose.

---

## 7. `useStable`'s two correctness invariants have no sensor

**Where:** `apps/dfm/app/shared/stable.ts:38`

**Evidence.** Both are stated as prose and enforced by nothing:

- _"The current bag is stored in a layout effect [...] Every caller here is a
  user event, which cannot run before layout effects have flushed."_ A child
  calling a stabilised handler from its own `useLayoutEffect` gets the previous
  render's closure, since child layout effects run before the parent's.
- _"The keys are read once. Call it with an object literal."_ A conditionally
  added key is silently dropped for the life of the page, with no error.

**Impact.** Latent, not live. The one effect-driven callback in the tree,
`face-list.tsx:221` `onCurrentFace(open)`, is a passive `useEffect` and receives
a raw setter (`part-inspector.tsx:2454`), so both invariants hold today.

**Fix / Test.** A dev-mode check inside `useStable` comparing
`Object.keys(callbacks)` against `keys.current` each render and throwing on drift
turns the second into a failure. The first stays documentation unless a lint rule
forbids stabilised props inside `useLayoutEffect`.

---

## 8. Dead error-boundary override

**Where:** `apps/dfm/app/components/feature-viewer.tsx:56`

```ts
componentDidCatch(_error: Error, _info: ErrorInfo) {}
```

**Evidence.** An empty override that neither reports nor suppresses — React logs
the error regardless. There is no `console.*` anywhere under `app/` and no
telemetry, so there is nothing for it to hook into.

**Impact.** It reads as "errors are handled here" while doing nothing. The
fallback UI at `:58` is provided by `getDerivedStateFromError` alone.

**Fix.** Delete it, or give it a real destination.

**Test.** None warranted for a deletion.

---

## 9. Two of the four `docs/` process artifacts expire on merge

**Where:** `apps/dfm/docs/` — 5,746 lines, ~3,950 of them process artifacts

**Evidence.** `directions-parity-findings.md` (2,083) is the durable one: F1–F67,
each a real defect, and the record of the bug class item 1 belongs to. But
`migration.md` (491) is indexed in `README.md:16` as "read this before the PR" —
it expires when this branch merges — and `directions-replay.md` (555) describes
rebuilding from scratch, which `README.md:26` itself says "is not what happened
here."

**Impact.** ~1,050 lines of superseded prose inherited by every template user who
clones this.

**Fix.** A deliberate keep/drop decision at merge, not a default. The README does
explain each file's role, so this is informational rather than a defect.

**Test.** None.

---

## Suggested order

1. **Item 1** — the only user-visible wrong answer, and the reducer it needs is
   the first step of item 3.
2. **Item 4** — cheap, and it is upstream of what item 1 touches.
3. **Item 3** — extract the next cluster, starting with the one item 1 opened.
4. **Item 5** — give it a sensor, then decide the two panels on purpose.
5. **Items 6, 7, 8** — housekeeping, independent, any order.
6. **Item 9** — at merge.

Items 1 and 4 are self-contained. Item 3 is the one that needs its tests first.
