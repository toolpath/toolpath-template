# Directions parity — sandbox findings

A running log of what the [parity plan](directions-parity-plan.md) gets right and
what it will hit, gathered by working through it in a **detached sandbox** while
`toolpath` is frozen for the repo split (20 Aug 2026).

Nothing here has been pushed. See §5 for how this travels to the real repo.

---

> **The replay order lives in
> [directions-replay.md](directions-replay.md).** These findings are why each
> instruction there exists; that document is what to follow.

## 1. The sandbox

|          |                                                                                                                       |
| -------- | --------------------------------------------------------------------------------------------------------------------- |
| Where    | `~/dev/toolpath-sandbox` — a clone of `~/dev/toolpath` @ `fdcff0e`, branch `paul/directions-plan`                     |
| Remote   | **none.** `git remote -v` is empty; pushing is impossible, not merely discouraged                                     |
| App      | `pnpm --filter @toolpath/part-viewer dev --port 5173` → http://localhost:5173                                         |
| Picker   | `~/dev/tp-ui` @ `pc-feature-picker`, `pnpm --filter @toolpath/feature-picker dev --port 5178` → http://localhost:5178 |
| Baseline | 25 files / 206 tests pass, `check-types` clean, before any change                                                     |
| Now      | 42 files / 506 unit tests and 47 end-to-end tests pass, `check-types` clean, on branch `paul/directions-throwaway`    |

The real `~/dev/toolpath` has its push URL replaced with
`/Users/paulclauss/dev/PUSH-BLOCKED-repo-split-use-toolpath-sandbox`, so a reflex
`git push` there fails loudly and names the sandbox. `git fetch` still works.
Undo when Nathan is done: `git remote set-url --push origin git@github.com:toolpath/toolpath.git`.

> There is nothing else to sandbox. `apps/part-viewer` is what deploys to
> `dfm.staging.toolpath.com` (`.github/workflows/staging.yml` → `application: part-viewer`),
> it is a client-rendered SPA with a Hono server, and it is bring-your-own-key
> against `api.staging.toolpath.com`. Running it locally _is_ running staging's code.

---

## 2. Findings against the plan

### F1 — `@toolpath/viewer/api` does not exist here — but it barely matters _(corrected)_

**Severity: low. This was first written as "blocks PR 1a", which the port disproved.**

The packages really are different — the picker's `@toolpath/viewer` (0.0.0, private)
exports `.` `./core` `./api` `./fixtures/*`; this repo's (0.3.1, published) exports
`.` and `./engine`, with no `./api` at all. And every file the spine ports does
open with `import ... from "@toolpath/viewer/api"`.

But the types behind that import are **structurally identical to types this repo
already has**, from a different package:

| picker, via `@toolpath/viewer/api` | here                             | how it went                                     |
| ---------------------------------- | -------------------------------- | ----------------------------------------------- |
| `Vec3`                             | `Vec3` from `@toolpath/api`      | identical `{x, y, z}`                           |
| `PartModel`                        | `PartReport` from `./contracts`  | `regions[].area` present; all `setups.ts` needs |
| `PartModelFeature`                 | `PartFeature` from `./contracts` | one field renamed — see F6                      |

So the fix is three import lines per file, not a type-mapping layer.
**PR 0 is not needed and the earlier recommendation for one is withdrawn.**
`DIRECTION_COLORS` and `directionColor` both exist here too, so `setupColor`
ports unchanged.

The §5 warning is still right about PR 7 — the _outline_ lives in the picker's
`core/part.ts` and has no counterpart here. It just does not generalise to the
type surface, which is what I extrapolated it to.

### F6 — the actual cost of PR 1a is a field rename _(new, from doing it)_

`setups.ts` and `directions.ts` are now ported and green. The one thing that
touched every function was not types — it was `feature.tag` → `feature.featureTag`.

The picker runs reports through `normalizePartReport`, which renames the wire
field `featureTag` to `tag`. This app consumes the **raw wire shape**, so it uses
`featureTag` throughout. Every `plan.assigned[feature.tag]` becomes
`plan.assigned[feature.featureTag]` — mechanical, but it is in `coverageOf`,
`claimedRegions`, `scoreSetups`, `cutOnce` and `withoutEmptied`, i.e. everywhere.

A pleasant consequence: the captured fixtures in F4 are **closer to this app than
to the picker**, because they are raw reports and the picker has to normalise them.

### F7 — three smaller things the port turned up _(new)_

1. **`directionKey` was private.** It lived unexported in `metrics.ts`;
   `alreadyHeld` needs it. Moved to `report.ts` beside `directionLabel`, which is
   where it belonged — `metrics.ts` now imports it. One line, but it is a change
   to existing code, which PR 1a was not expected to make.
2. **`axis` nullability disagrees three ways.** The SDK types it
   `axis: PartFeatureAxis` (**required**); the picker types it `Vec3 | null`; and
   the captured `local-0.3.0-cube.json` **omits the field entirely** on all 24
   features. `axisOf` guards anyway rather than trusting the type. Worth a
   contract fix at some point — the generated type is wrong about the wire.
3. **ES2022 here, ES2025 in the picker.**
   `tp-ui/packages/typescript-config/base.json` targets ES2025; this repo's
   `tsconfig.json` targets ES2022. Ported code using recent array methods compiles
   in one and not the other — `toSorted` in the ported test passed `vitest` and
   failed `check-types`. Cheap to fix (`[...x].sort()`), but it will recur in every
   ported file, and it fails at the check rather than in the tests, which is the
   slower place to find it.

### F8 — PR 1a's tests cannot fully come across without PR 9 _(new)_

The plan gives PR 1a "its share of `tests/setups.test.ts`". That share is smaller
than it looks. Of the picker's 28 `describe` blocks, the ones covering
`coverageOf` and `scoreSetups` — the two functions whose invariants matter most —
build their plans by calling `generate`, which is PR 9a/9b.

Ported here by hand-building an equivalent covering plan, so the invariants
(de-duplication by region, the ≤ 1 ceiling, whole-part coverage) are still under
test. But it means **PR 1a's tests are not a straight lift**, and roughly a third
of `setups.test.ts` has to wait for the generators or be rewritten as this was.

Result: **27 test files, 245 tests, `check-types` clean** — up from 25 / 206.

### F2 — PR 6's `direction-scores.ts` is in a tree that was already ported, and drifted

**Severity: changes PR 6's shape.**

§9 points at `src/setups/*.ts`. `direction-scores.ts` is not there — it is at
`src/rules/direction-scores.ts` (109 lines). That matters because the picker's
whole `src/rules/` tree already has counterparts here, ported at some earlier point
and since **diverged**:

| picker `src/rules/` | here `app/shared/` |        lines | diff lines |
| ------------------- | ------------------ | -----------: | ---------: |
| `expression.ts`     | `expression.ts`    |    329 → 304 |        418 |
| `metrics.ts`        | `metrics.ts`       |  1477 → 1368 |       1835 |
| `rules.ts`          | `rules.ts`         |  1041 → 1070 |       1033 |
| `band-display.ts`   | `bands.ts`         | 283 → **52** |        326 |

So PR 6 is a **merge into diverged code**, not a port into empty space — the only
PR in the plan with that character. Concretely, `direction-scores.ts` imports
`bandColor` from `band-display.ts`; this repo's `bands.ts` has no `bandColor`. It
has `bandCss` and `bandHex` instead. It also needs `bandRank`, `scoreFeature`,
`worstBand` from `rules.ts` — worth confirming all three survived the drift before
PR 6 is scheduled.

`band-display.ts` losing 283 → 52 lines is the sharpest signal: the highlight
helpers (`setupHighlights`, `proposalHighlights`, `bandHighlights`, `sharpFeatures`)
did not come across. PR 8b and PR 10 both assume that kind of helper exists.

### F3 — the generator budget is short by ~40%

**Severity: scheduling.**

§5 splits generators across PR 9a (450) + PR 9b (450) = **900 LOC**. The source is
`src/setups/generate.ts` at **1,264 lines**, single file. Either the split is three
PRs, or 9a/9b are ~630 each and outside the size the plan sets for itself (R4).

Other LOC figures check out exactly — `setups.ts` 410, `directions.ts` 237,
`saved-plans.ts` 232. `leftovers.ts` is 102 against a 150 estimate, which is fine
(the estimate includes wiring).

### F4 — the picker ships captured Engine reports, which removes the biggest friction

**Severity: opportunity, and probably do this first.**

`~/dev/tp-ui/packages/viewer/fixtures/` holds real captured reports **with matching
meshes** — it is an export of that package (`"./fixtures/*"`):

| Fixture                                    | What it is                                                                                              |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `local-0.3.0-cube.json` + `.glb`           | 24 features, 6 regions, 4 directions, 12 triangles. One analysis run, report and mesh captured together |
| `staging-0.2.0-feature-rich.json` + `.glb` | 305 features, 15 feature types                                                                          |
| `staging-0.2.0-test-model.json` + `.glb`   | 793 features, **10 candidate directions, 4 non-axis-aligned**                                           |

This app is BYOK: today, playing with it means an API key, a CAD upload and an
analysis round-trip **per reload** — which is a poor loop for something you iterate
on all day, and worse for the directions work specifically, where you want the same
part in front of you across many small changes.

The `0.3.0` shape lines up closely with `PartReport` here:

```
fixture top-level  partId kernelVersion features regions candidateDirections
                   meshPointCount meshTriangleCount thumbnailUrl meshStlUrl
                   meshGlbUrl downloadMs analysisMs totalMs
fixture feature    featureTag featureType machiningDirection regionIdxs datasheet
```

Missing versus the shape `tests/part-viewer.spec.ts` already builds by hand:
`reportId`, `jobId`, `units`, and `axis` on the feature. That is a small adapter,
not a port.

**`staging-0.2.0-test-model.json` is the one that matters for this plan** — 10
candidate directions with 4 non-axis-aligned is precisely the input that finds bugs
in direction assignment, and it is not a part you would happen to upload.

Recommend a fixture-loading dev path **before PR 1a**. It is not in the plan, it
costs little, and every stage after it is easier to judge.

### F9 — decision 4 ("a route") is the right call, but not for the reason given _(new, PR 2a)_

§7.4 says a route is "cheap in PR 2a, awkward afterwards". In this app it is the
other way round: it is the _only_ moment it is cheap, and it is not free.

The report is not in a store. It arrives over SSE inside `useAnalysisEvents` and
lives in `ActivePart`'s component state, with no cache anywhere —
`server/routes/analysis.ts` re-fetches it per stream, and the README says the
absence of a cache is deliberate. So a **sibling** route at
`/parts/:partId/directions` would re-open the stream and re-fetch the report on
every visit between the two pages.

Fixed by making `parts/:partId` a **layout route** that owns the subscription and
hands the report down through `Outlet` context:

```
route('parts/:partId', 'routes/part.tsx', [
  index('routes/part-index.tsx'),        // the inspector, unchanged
  route('directions', 'routes/directions.tsx'),
])
```

One subscription, two URLs, no refetch. But note this **restructures the part
route**, which PR 2a was not scoped to touch: `part.tsx` becomes a layout,
`PartInspector` moves behind a new `part-index.tsx`, and a `usePart()` context
hook appears. Small, and it is the right shape — but it is a change to existing
routing, and doing it later (once selection and pass state also need sharing)
would be materially harder. **Decision 4's "awkward afterwards" is right; its
"cheap" is optimistic.**

### F10 — PR 2a's own row list is not read-only _(new)_

§5 gives PR 2a "the direction list read-only … Rows 13, 17, 27, 29". Three of
those four rows mutate the plan:

| Row | What it is                                                                    | Read-only?                     |
| --- | ----------------------------------------------------------------------------- | ------------------------------ |
| 13  | An arrow means "hold it this way" — **creating the direction and opening it** | No — creates a setup           |
| 17  | A direction row focuses, **opens its direction**, refills Map features        | Partly — "opens" needs a setup |
| 27  | **Rename, remove**, open a direction                                          | No — mutates the plan          |
| 29  | ↑ ↓ walk the list, highlight follows                                          | Yes                            |

Only row 29 is genuinely read-only. The rest need `setups.ts` wired to state,
which is PR 2b. So PR 2a as written is either not read-only, or is smaller than
its row list — it cannot be both.

**Shipped here as the honest read-only subset:** the route, one row per candidate
direction with what it reaches, and row 29. Rows 13, 17 and 27 move to PR 2b,
where the plan state they need already lives.

### F11 — an existing test already pins decision 4 _(new)_

`tests/viewport-reach.spec.ts:522` — "does not offer a directions view" — asserts
there is no Directions **tab** and no Directions **paint-mode button**. Nobody
wrote it for §7.4, but it enforces it: the route-and-link approach keeps it
passing, and a tab would have failed it immediately.

Worth knowing for PR 3, which puts `directions` back into `PAINT_MODES` (§3.4
footnote 7) — **that half of this test has to be updated in PR 3**, and it is the
kind of assertion that reads as a regression when it is actually the point.

### F12 — editing build config wedges the dev server _(twice now)_

Twice, editing a file the build treats as _configuration_ has left the running
dev server broken while the code was completely fine:

| Edited                  | Symptom                                                                                  | Reality                          |
| ----------------------- | ---------------------------------------------------------------------------------------- | -------------------------------- |
| `routes.ts`             | 500 on **every** route, including unchanged ones                                         | `react-router build` clean       |
| `styles.css` (`@theme`) | Blank black page; `/app/styles.css?t=…&url` 404s, routed through the app instead of Vite | Tests, types and build all clean |

Both times the tell was identical: **build and tests green, server returning 200,
browser broken**. Restart the dev server after touching either file rather than
trusting the reload. Both times the failure looked far more alarming than it was,
and both times it cost a round trip to diagnose.

### F13 — the standalone Directions page was a wrong turn _(new, superseding F9–F11)_

Built, then reverted. Recording it because the mistake is more instructive than
the code was.

**The picker has no such page.** Its Directions page left column is _Coverage ·
Generate directions · the direction list · Not cut yet_, and "the direction list"
is the list of **setups in the plan** — ways up somebody has chosen, and what
each cuts. `docs/build/directions.md` describes Stage 1 as "see the direction
list **fill**". On an empty plan it is empty.

What got built instead was a static table of every _candidate_ direction with its
potential reach — plan-independent, and in no picker file. Two things made that
worse rather than better:

1. **It duplicated existing UI.** `part-summary.tsx` already had a "Machining
   directions" heading with a chip per direction — colour, label, feature count,
   click to scope.
2. **It papered over the real finding.** F10 said PR 2a is not a shippable stage
   on its own. The right response was to report that; instead the vacuum got
   filled with invented content.

**Resolution — Paul's call, and the better one:** the existing chips _are_ the
direction list. They were extended in place with what each way up reaches and,
once something is mapped to it, what it has been given. PR 2a and 2b merged.

F9 (the layout route) and F11 (the tab-vs-route test) are **moot** — there is no
separate route now, `routes.ts` is back to what it was, and
`viewport-reach.spec.ts:522` passes untouched. F9's _observation_ still stands
and is worth keeping: the report is component state from an SSE subscription with
no cache, so any future page needing it must be a nested route or a tab, never a
sibling.

### F14 — ported signatures asked for more than they read _(new)_

`setups.ts` came across taking `PartReport`. The app renders from
`PublicInspectionReport`, which strips the presigned mesh URLs at the boundary on
purpose — so every ported function was uncallable from the page that needed it,
and `check-types` said so the moment the wiring started.

Fixed by narrowing to what each actually reads (`PartFaces = Pick<PartReport,
'regions'>`, and a similar `PartDirections`). Worth doing to the rest of the port
as it lands: the picker's `PartModel` carries mesh refs, this app's public report
deliberately does not, and a ported signature that demands the whole report will
hit this every time.

### F15 — fixtures have to come from this app too _(new)_

The first cut of the ported tests imported `local-0.3.0-cube.json` out of the
picker's viewer package. That is the wrong direction of travel: the interactions
and UI are being recreated here, but the **data is this app's**, and a captured
report from another codebase tests that codebase's normalisation as much as this
one's arithmetic.

Replaced with `app/shared/test-part.ts`, built by hand in the Engine's wire shape
the way this app's other tests build one — six faces, four ways up, one face
reachable from three of them. No file in `app/` or `server/` now reads anything
from `tp-ui`.

### F16 — the Directions page is a tab, and it is the setups panel _(new)_

Two rounds of getting this wrong, so recording what it actually is.

The picker's Directions page is a **view** (`Inspect | Directions | List | Holes
| Rules`) whose left column is _Coverage · Generate directions · the direction
list · Not cut yet_. The "direction list" is the plan's **setups** — ways up
somebody has confirmed — not the Engine's candidates. Built here as a third tab
beside Inspector and Rules, which is also §7.4 settled the other way: a tab, not
a route, because the report is component state from one SSE subscription (F9).

`viewport-reach.spec.ts` asserted "no Directions tab" in **two** places, not the
one F11 found. Both updated. The Directions _paint mode_ is still absent and
still asserted, which is PR 3.

### F17 — four of six generators port cleanly; the other two are the hard half

`generate.ts` is 1,264 lines, and it does not divide evenly:

| Generator               | Rests on                          | Ported |
| ----------------------- | --------------------------------- | ------ |
| `required only`         | `forcedRegions` + `planFor`       | Yes    |
| `required, filled`      | `requiredDirections` + `planFor`  | Yes    |
| `from toolpath`         | `planFor` over the reported order | Yes    |
| `by hand`               | nothing — returns an empty plan   | Yes    |
| **`from the rules`**    | **`byBestReading`**               | **No** |
| **`fill from current`** | **`byBestReading`**               | **No** |

`planFor` is ~90 lines and came across with only the `tag` → `featureTag` rename.
`byBestReading` is ~250 lines whose every ordering rule is a fixed bug, spelled
out in its own comments: band before score (a refused reading can still average
well and win), area-weighted spread (ranking by score alone arranges a part
around its smallest features), whole-readings-only displacement, a purchase
threshold for a new orientation, then a second sweep for ground nothing cuts at
all because the threshold answers the wrong question about unclaimed faces.

Deliberately not half-ported. A subtly wrong `from the rules` is worse than an
absent one — it is the flagship generator and every one of those rules exists
because the obvious version shipped and was wrong. **This is the single largest
remaining piece of the plan**, and PR 9's ~450 LOC estimate covers `planFor` and
the four easy generators, not this.

### F18 — the plan's estimate for PR 9 is the wrong shape

F3 already noted PR 9 is short on lines. Having ported half of it, the split is
wrong in kind as well: the natural seam is not "generators 1–3 / generators 4–6"
but **`planFor` and everything resting on it** (small, mechanical) versus
**`byBestReading`** (large, subtle, and where the value is). Two PRs, but not the
two the plan names.

### F19 — Map features, and the one gate that keeps hiding the mapping UI _(new)_

The right panel is now the picker's Map features: a mode toggle, and under it
either the readings owning a picked face or the ways up that would cut a painted
set. `pick-mode.ts` holds the mode, the painted set and the held direction as
**one** state — §3.6 lists thirteen independent pieces and says most of the
picker's bugs were two of them out of step, so the three that change together
change together here.

Landed: the always-visible toggle, both modes, the switching rules (§3.9),
painting with no modifier, per-direction offers built **smallest reading first**
(§8 — an eight-face profile can only be taken or left; eight walls can have one
clicked off), the selected-features multi-selection with checkboxes that select
**without** reading (§3.8), and a bulk pass action over the ticked group.

Not landed: **inference and the standing offer** (§4c, rows 3–5, 18, 24–26) —
that is PR 10 and is a separate body of work, and the quiet focus (row 10).

**The recurring bug worth naming.** Three times now a mapping control has been
invisible because it sits behind a gate that a click on the 3D part is the only
way through:

1. R/F/Both rendered only when a face had **more than one** reading.
2. `candidates` populates only from a part click, never from choosing a feature
   in a list — so the whole by-face list is empty until somebody clicks geometry.
3. By direction paints nothing until an arrow is pressed, and the arrows were off.

Each was defensible alone. Together they mean **the mapping interactions are
unreachable from the feature lists**, which is how most people arrive. Fixed by
putting assignment on the feature being read too, and by turning the arrows on
when by-direction is entered. Worth watching for on every remaining PR — the
picker's design assumes the part is the primary input, and this app's lists are
much more prominent than the picker's.

**Default mode is `face`, not `direction`.** By direction is worked by pressing
an arrow; opening there would open in a mode whose only gesture is not on screen.
The toggle still lists By direction first — it is the question the page is for —
but the page starts where somebody can act.

### F20 — a Tailwind reset silently kills font sizes on buttons _(new)_

`app/styles.css` has an **unlayered** `button, input { font: inherit }`. Tailwind
v4 puts utilities in `@layer utilities`, which loses to unlayered CSS — so
`text-2xs` on a `<button>` does nothing and the button takes its container's
size. `PartSummary` looked right only because its container sets `text-xs`.

Every panel ported from the picker will hit this, because the picker's rows set
their own sizes. **Set the size on the container, not the row.**

### F21 — by-direction shows the held way up only _(divergence from the picker)_

§3.9 says the panel under the toggle in `direction` mode is "the per-direction
offers: what **each** way up would cut of what is painted". Built that way, and
Paul's response on seeing it was the right one: _holding a direction is the
choice_. Offering the other three afterwards asks somebody to make the same
decision twice, and on a real part it filled the panel with three ways up nobody
had pointed at.

So this app shows **only the held direction's** offer, and says plainly when that
way up reaches none of the painted faces rather than showing an empty list.

**Deliberate divergence, recorded rather than smoothed over.** The picker's shape
is right for _its_ next step — inference proposes a whole arrangement and wants
alternatives on the table. It is wrong for a mode whose entry gesture is choosing
one. If inference lands here (PR 10), the multi-direction shape may earn its way
back **in the offer**, not in this panel.

### F22 — grouping the list broke three things that depended on its old shape

The face list changed from flat-and-intersected to gathered-and-grouped, and
three separate things quietly kept using the old shape:

1. **The highlight** — ticked readings and painted faces were computed but never
   handed to the viewer, so selecting painted nothing.
2. **Choosing a reading** — used the handler that clears the picks, so the list
   emptied the moment somebody chose from it. §3.2 says this exact bug shipped
   twice in the picker; this was the third time.
3. **The keyboard** — the window shortcut walked `selection.candidates` (the
   order the click produced) while the eye read the grouped order, and both it
   and the list's own handler fired on every press.

None was caught by types, and each surfaced only by using the app. The lesson for
the remaining PRs: **when a list's shape or order changes, the highlight, the
choose-handler and the keyboard are three separate consumers of that shape**, and
they do not follow automatically.

### F23 — inference ported; the spec is `docs/inference.md` and it is worth reading whole

PR 10's core is in: `inferable`, `coverFaces`, `readingsFor`, plus a `Proposal`
lifecycle and the three scopes (Only here · Infer features · Holes on axis).

The picker has a **dedicated 158-line spec** for this — `docs/inference.md` —
which §9 of the parity plan does not list among its source material. It should:
every rule in it is a reported bug, and none is guessable from the code alone.
The load-bearing ones:

- **Nothing is inferred until Infer is pressed; nothing is assigned until R, F
  or Both is pressed on a row.** Both halves shipped broken once, as _"it's
  enabling features without me telling it to"_ and _"you're creating setups from
  out of nowhere"_. Hence three visibly distinct states: nothing, **proposed**
  (violet — neither a direction colour nor a difficulty band, so it cannot be
  mistaken for a decision), assigned.
- **An offer is a set of faces, not a set of readings.** Pruning a face
  re-covers the rest. Holding readings makes enabling one wall summon the
  profile containing it — reported as _"when I select this wall, it's chaining
  the wall into the full profile"_.
- **Smallest readings first, and the second-hearing pass.** Small-first keeps an
  offer arguable, but a two-face fillet taken early blocks the twelve-face
  pocket sharing one of them and the pocket's other eleven end up covered by
  nothing. The rescue re-offers the larger reading **only** where it wholly
  contains what it displaces.
- **Undercuts are never volunteered** but stay assignable by hand.
- **What another setup cuts is still offered.** Excluding it answered "0
  features" on every part that had been mapped.

**Two of my own test expectations were wrong before the code was**, both in the
same direction: I assumed "smallest first" meant small readings always win. It
does not — where a larger reading wholly contains the small one and reaches
further, it takes over. The algorithm was right both times. Worth flagging for
whoever ports next: `inferable` and `coverFaces` have behaviour that reads as
surprising until the _why_ in the spec is read.

### F24 — painting paints the reading, not the face

§4d says "every click adds a face". The picker's own on-screen flag says
_"clicking a face paints what it cuts"_, and that is the truer description: with
a way up already held, a click is not asking about a face, so the whole reading
goes on or comes off together. Painting three of a pocket's eight faces describes
nothing anybody can run.

Implemented as `paintReading`, judged on the face clicked so a half-in reading
cannot toggle unpredictably, falling back to the single face where the held
direction reads nothing there.

### F25 — row 14 is marked Built, and half of it is not here _(new)_

The inventory marks row 14 — _"Right-drag pans, right-**click** picks — a
distance test tells them apart"_ — as **Built**, sourced to
`packages/viewer/src/core/controls.ts`. That is the **picker's** viewer. This
repo's viewer emits picks from `onClick` only, and `click` never fires for the
right mouse button — so `PartPick.modifiers.secondary` was computed on every
pick and could never once be `true`.

Nothing surfaced it until §4c needed it: right-clicking a proposed face should
read that reading without changing the offer, and the handler simply never ran.
It types fine, the flag exists, and the branch is unreachable.

Fixed in `packages/viewer/src/part-mesh.tsx` by emitting on `contextmenu` as
well, behind the same tap guard (right-drag is the camera pan, and the end of a
pan is not a request to act on whatever it finished over) and only calling
`preventDefault` once something was actually picked, so a right click on empty
space still gets the browser's own menu.

**The general lesson, and it applies to the whole §3 inventory:** a row marked
**Built** was verified against the _picker's_ packages. Where the two viewers
differ — and §5's PR 7 note says they differ a lot — "Built" means "built
somewhere", not "built here". Worth re-checking every viewer-sourced row before
trusting it: rows 9, 12, 14 and 15 all cite `packages/viewer/` paths that do not
exist in this repo.

### F26 — right is the peek gesture, everywhere _(divergence, and a simplification)_

§4c gives right-click one job: inside a standing offer, show that reading in
green and change nothing. Everywhere else the picker's right button does nothing
at all.

Paul's call, and it is the better rule: **left does something, right only ever
reads.** What left does depends on the mode — picks a face, paints a reading,
prunes a face out of an offer — and having one button that is guaranteed never
to change anything is what makes a part safe to interrogate half-way through a
decision. Under §4c's rule, asking "what is this violet face" outside an offer
meant clicking it, which paints or prunes.

Which of a face's readings a peek means is decided by **what is already on
screen**, most specific first: offered, then painted, then mapped, then the
click's own ranking. That last fallback matters — a face in no list has nothing
it could be asking about except the geometry.

This makes §4c's special case disappear rather than adding to it: the offer's
right-click behaviour is now just what right-click does.

### F27 — PR 3 landed, and F11's prediction was right twice over

Painting by direction is back in `PAINT_MODES`, pointed at the **plan** rather
than at the Engine's reported direction. That distinction is the whole of it: a
feature is reported from every way up that can reach it, so colouring by
`machiningDirection` would paint a decision nobody made. A face with no colour
here is a face **nothing cuts**, which is the question the page exists to close.

The pass toggle (row 40) sits beside the modes and only while they mean
something — roughing and finishing are separate claims on a face, so a part
coloured by direction is showing one of two answers and has to say which.

F11 predicted this would require updating the test that asserts the _absence_ of
a Directions paint button. It required updating **two**, in different files and
of different kinds:

- `paint.test.ts` — "falls back to plain for the removed directions mode",
  pinning `loadPaintMode`'s deliberate fallback for a stored `'directions'`.
  Now asserts the restoration, with a second test keeping the fallback honest
  for a mode that genuinely is not offered.
- `viewport-reach.spec.ts` — the paint-button half of the assertion F11 named.

Both are the kind that read as a regression and are the opposite. §3.4 footnote 7
is the only reason either is legible; without it, somebody would have "fixed"
the code to make the tests pass again.

**§3.5's palette rule, settled.** _"The selection palette follows what the part
is painted with: warm over the cool direction cycle, cool over the warm
difficulty ramp."_ The blue triad stays over Difficulty and a warm one
(`SETUP_COLORS`) is worn over Directions. Paul reported the symptom before the
rule was applied: the hover sat a shade from the first direction colour, so a
face being asked about and a face cut from +Z looked the same.

Worth recording _why_ it is spread in **lightness** rather than hue: the warm end
is crowded. The viewer's own note in `DIRECTION_COLORS` reserves the warm ramp
for difficulty, red for sharp corners, orange for faces being picked and green
for whatever is being looked at — so a warm selection has to share a hue with
painting (`PAINTED_HEX`, orange-500) and is told apart by sitting darker
(highlight) and lighter (hover) than it. `selection-colors.test.ts` pins that,
along with the rule that no selection colour may equal a direction colour.

### F28 — a peek needs a list, and the fallback I wrote broke §3.8

F26 gave right-click a fallback: with the face in no list on screen, open the
top-ranked reading. Paul's instinct that it should do nothing was right, and for
a stronger reason than tidiness — **that fallback is the silent best guess §3.8
forbids.**

> Never resolve a multi-face pick silently to a best guess. If a click is
> ambiguous the panel must list every owner. This is the main way the interaction
> goes wrong.

A face usually has several readings. Choosing one unasked is the app deciding
which question was meant, which is the exact failure the picker documents as
_"clicking two walls lit up an eleven-face profile"_. Peeking is a question
**about a list** — _which of these is this face?_ — so with no list there is
nothing to answer, and left click already asks the general question and answers
it with the whole list rather than one guess.

Worth noting how it slipped in: F26 was a simplification (right always reads,
left always acts) and the fallback looked like completeness. A rule that applies
"everywhere" is exactly where a guess hides.

### F29 — difficulty has to follow the plan once there is one

Painting by difficulty coloured every reading by its band, including the
alternatives the plan does not use — so the gentlest reading of a face won, and
the part read as easier than the plan makes it. A face cut the awkward way from
−Y showed the easy score of the +Z reading nobody chose.

The mapped reading now paints last and wins, per the pass being shown. Before
anything is mapped nothing wins and the view is what it always was, so it
degrades to the old behaviour on an empty plan rather than going blank.

This is the same class as F27's directions wash: **any view that colours "the
part" has to say whether it means the Engine's readings or the plan's**, and
until there is a plan the two are the same, which is why it stays invisible
until somebody maps something.

### F30 — `byBestReading` ported; all six generators are in

`from the rules` and `fill from current` are the same function with a different
starting plan: every face cut the way the rules like best, buying an orientation
only where something cannot be reached without one. **PR 9 is complete.**

**Two orderings, and conflating them was a bug in each direction.** This is the
thing to carry forward, because both look like the same question:

| Question                                                  | Ordered by                            |
| --------------------------------------------------------- | ------------------------------------- |
| Which reading cuts this face, among ways up already held? | **Band first**, then score, then area |
| Is a new way up worth its re-fixture?                     | **Score-weighted area**               |

**Divergence: this app orders the first question score-first, not band-first.**
Paul's call, and the trade is worth stating both ways.

The picker puts the band first because a score is a weighted average over every
rule while a band is the _worst_ of them — so a reading one rule refuses outright
can average better than one that merely scrapes through. Its position: _a refusal
is not a bad average; it is a no._

Against that: a band is five buckets and a score is continuous, so band-first
throws away every distinction inside a bucket and lets a reading that is mediocre
everywhere beat one that is excellent apart from a single rule. On a rule set
that refuses readily, band-first arranges the part around its most pessimistic
rule.

The cost is real and is **named in a test** — `'so a reading a rule refuses can
win a face — the cost of the trade'` — rather than left to be discovered. If it
bites, that test says exactly what to put back. Both comparators moved together:
ranking the list one way and judging a swap another is two opinions about the
same readings, and the plan would then depend on which code path reached a face
first.

The purchase question is untouched and genuinely different: what a whole
orientation is worth is how much of the part it settles, weighted by how well.

Writing the tests, I put the band-first assertion against the _purchase_ path and
it failed — correctly. The port was right and the test was asking the wrong
question, which is the third time that has happened (F23 twice, now this).
**`generate.ts` and `best-reading.ts` have behaviour that reads as surprising
until the `why` is read**, and their comments are the only place it exists.

**On the estimate.** `best-reading.ts` is 385 lines against F18's prediction that
this was where the real weight sat. §5's PR 9a/9b split of 450 + 450 was wrong in
kind: `planFor` and its four dependents came to roughly a third of one PR, and
this is the rest. The honest shape is **one small mechanical PR and one hard
one**, which is what F18 said.

Two rules deserve naming because they are invisible until a part misbehaves:

- **A patch nobody cuts is bought whatever it is worth.** The purchase threshold
  answers "is a _better_ reading worth a re-fixture", which is the wrong question
  about ground nothing reaches at all. Without the second sweep the generator
  stopped buying while faces still had no setup, and the coverage bar quietly
  read 94%.
- **The result is written straight out of the face-by-face decision**, not
  re-derived by walking directions in order. Re-deriving dropped readings whose
  ground had been settled, leaving their faces cut by nobody — the few per cent
  that never turned green.

### F31 — "not cut yet" counted the wrong thing, and made the generators look broken

Reported as _"from the rules is missing features it should be able to map"_ and
_"fill from current doesn't seem to be working"_. Both generators were correct.
The panel was counting **readings** with no way up.

A face is reported from every direction that can reach it, so a part with 74
features has far more readings than faces — and under cut-once **most readings
must lose**. That is the model working. But the panel then said "60 of 74
readings have no way up" beside a coverage bar reading 100%, so a finished
arrangement looked like a failed one, and pressing a second generator looked
like it had done nothing.

Now counts **faces**, which is what the phrase means and the same thing the
coverage bar measures — so the two can no longer disagree. A test pins that.

Faces **no reading reaches from any way up** are said separately: that is a gap
in the _analysis_, not in the plan, and counting it against an arrangement makes
one look incomplete for something no arrangement could fix.

**The general shape, and it has now happened twice** (see also F29): a number
about "the part" has to say whether it counts readings or faces, and readings is
almost always the wrong answer — there are several per face and only one of them
is ever run. Worth auditing every count in the app against that.

### F32 — dominance-per-face was the bug behind all three symptoms

Reported as three things: _from the rules is missing features it should be able
to map_, _fill from current does nothing_, and _a slanted face scoring 40 cut a
face a wall scoring 74 was plainly the better answer for_. **One cause.**

`wouldTake` asked a reading to beat the current holder of **every** face it
covers, and refused it outright otherwise. So a three-face wall whose other two
faces were already better served was refused **entirely** — and the face it _was_
the best answer for fell to the only reading left, a one-face slanted at 40.
Worse, that wall could never be taken at all, so faces only it reaches stayed
uncut for good. That is the coverage stalling at 62%, and the reason re-running
changed nothing: the block is deterministic, so `fill from current` recomputed
the same refusal.

Now judged as a **net gain over the whole swap**, ranked:

1. **Coverage first.** A face cut badly is worth more than a face nobody cuts, so
   a swap that would leave ground uncovered is refused however well it scores.
   This also keeps the generator working on an unjudged part, where every score
   is zero and a pure score comparison takes nothing at all — which is how the
   first attempt at this broke four tests.
2. **Then quality.** Where coverage is unchanged, the score-weighted total
   decides. That is the slanted-face case.

### F33 — the conflict Paul asked to have named: per-face optimal is not reachable

> _"it should check the optimal feature for each face on the part"_

It cannot, and the reason is worth writing down because it will come up again.

**A feature is one operation over all of its faces.** If face 2 is best cut by a
three-face wall, then running that wall also cuts faces 0 and 1. So if 0 and 1
are assigned to better readings, exactly one of these must give:

| Give up          | Cost                                                                                     |
| ---------------- | ---------------------------------------------------------------------------------------- |
| Cut-once         | The wall re-cuts 0 and 1; the estimate pays for both, and the shop machines a face twice |
| Whole readings   | The wall is run "partly", which is not a thing — the Engine reports one operation        |
| Per-face optimal | Faces 0 and 1 are cut slightly worse so that face 2 is cut much better                   |

Per-face optimal is only achievable by breaking runnability. **The reachable
version is the best _set_ of whole readings**, which is what net gain computes —
and on the reported case it gives face 2 the wall, at the cost of faces 0 and 1
dropping from `easy` to `alright`. The part comes out ahead overall; no single
face is guaranteed its own best reading.

If that trade is ever wrong for a particular shop, the lever is the scoring, not
the algorithm: a rule that refuses hard makes its band dominate the average, and
`newDirectionGain` decides how much improvement is worth a re-fixture.

### F34 — `fill from current` buys nothing _(divergence)_

The picker's version fills around what is held **and buys new orientations** —
it is "from the rules, with a head start". Paul's call is that it should make the
best of the ways up already held and buy none.

That makes the two generators answer genuinely different questions rather than
one being a warm start of the other:

|                       | Question                                         |
| --------------------- | ------------------------------------------------ |
| **From the rules**    | What is the best arrangement of this part?       |
| **Fill from current** | Given this fixturing, what is the best I can do? |

The second is the one a shop asks when the setups are already decided — soft
jaws cut, a fixture built — and the answer is worth having even when it leaves
ground uncut. **That shortfall is the answer, not a failure:** the remedy is to
hold another way up, which is a decision for somebody to make rather than for an
offer to make on their behalf.

Two consequences worth stating, both tested:

- **A forced direction is not brought into being either.** A face only one way up
  can reach stays uncut if that way up is not held. Buying it would be exactly
  the thing this generator is being told not to do.
- **With nothing held it does nothing at all**, which is the only honest thing it
  could do — and is very likely what "fill from current isn't working" looked
  like before the coverage bug was fixed.

### F35 — stranded ground is not lost ground

Third round on the same function, and the last of the greedy-swap pathologies.

A thirteen-face contour scoring **22** was holding a face that a one-face reading
scored **100** on, and another that a wall scored **64** on. The swap was refused
because dropping the contour looked like losing its other twelve faces — when
almost all of them had a better answer waiting.

`assignHeld` runs to a fixed point, so a face freed by a swap is offered to
everything else on the next pass. Valuing it at **zero** is what made a big
mediocre reading unassailable: the bigger it was, the more it appeared to cost to
displace, regardless of how badly it cut anything.

Stranded faces are now valued at their **best remaining answer** among held
directions. The consequence is that a reading is only protected by ground nothing
else can reach, which is the protection it should have.

**All three rounds were the same mistake in different clothes** — a greedy
pairwise swap judged against an incomplete picture of what would happen next:

| Round | What the swap was judged against       | Symptom         |
| ----- | -------------------------------------- | --------------- |
| F32   | Dominance on every face                | A 40 beat a 74  |
| F34   | Coverage before free ground was filled | A 58 beat an 80 |
| F35   | Stranded ground valued at nothing      | A 22 beat a 100 |

Each fix narrows the gap between the greedy step and the actual objective —
maximise score-weighted covered area over a set of whole, non-overlapping
readings. That is a set-partitioning problem and greedy will never be exactly
right; the tests name the cases that matter rather than claiming it is.

### F36 — the fallback estimate does not terminate, and nothing caught it

F35's fix froze the page. On a real part — 108 faces, 156 readings, six ways up —
`from the rules` and `fill from current` never returned.

**Two causes, and the first is the interesting one.**

**It did not terminate.** Filling free ground is monotone: every take covers
ground nothing held, so it settles on its own. Swapping is not. A swap is
accepted on an _estimate_ of what would pick up the ground it strands, and an
estimate can be wrong — so two readings can each look like an improvement on the
other and trade a face back and forth for ever. Every earlier version compared
against fixed, already-realised values, which made the total a strict potential
and guaranteed the loop ended. Introducing a speculative term silently removed
that guarantee.

Now bounded: fill free ground, one pass of swaps, repeat at most eight times.
Deterministic, and passes after the first few change almost nothing.

**It was also quadratic in the part.** Finding "everything this reading holds"
scanned every face of the model, inside a loop over every reading, inside the
fixed point. A reverse index — reading → the faces it holds, kept in step with
the forward map — makes a swap cost its own ground instead of the whole part.
**15ms** after, from never finishing.

**Nothing in the suite caught either.** Every test ran on parts of three to
twenty-six faces, where non-termination is not reachable and quadratic is
invisible. `perf.test.ts` now builds a part the size of a real one and asserts it
settles, with a deliberately loose budget: it is not policing milliseconds, it is
catching the loop failing to converge, which is what a frozen page is from the
outside.

**The general lesson.** Three rounds of correctness fixes (F32, F34, F35) each
made the greedy step smarter by reasoning about what would happen _next_. The
third one crossed a line: it began deciding on a prediction rather than on a
fact, and a hill-climb whose objective is a prediction is not a hill-climb. If
the arrangement needs to get cleverer again, the bound is what keeps it honest —
or the acceptance rule has to be made monotone in something real.

### F37 — the objective had no idea what an operation costs

Chased on the **real part** rather than a reconstruction — 241 features, 612
faces, datasheets stitched from `/v1/parts/{id}/features`. Reproduced exactly:
face 350 cut by a one-face `wall@30` from +X while a `profile@83` from −Z covered
it, and face 382 the same.

**The mechanism was the opposite of what it looked like.** The profile _does_ win
those faces in the free-fill phase. Then ten single-face readings displace it
**one at a time**, each scoring a little better on its own face. Each swap looks
like a wash — one reading replacing one — and ten of them quietly turn one
operation into eleven, leaving one face with nothing but a lone +X wall.

The objective was score × area and nothing else, so a lone cut and an eleven-face
profile cost the same per unit of surface. `operationCost` prices the cut, and it
is counted on **both sides** of a swap: the operations removed, against the one it
runs **plus one for every distinct reading that must pick up the ground it
strands**. That second term is the whole fix. My first attempt credited only
`displaced.size - 1`, which is zero for a one-for-one swap — and a sweep from 0
to 1.0 changed nothing at all, which is what said the model was wrong rather than
the constant.

Measured, not guessed. On the real part, at 0.3:

|                                        | before   | after    |
| -------------------------------------- | -------- | -------- |
| Faces cut ≥25 below the best available | 6        | 4        |
| Readings assigned scoring below 40     | 2        | 1        |
| Operations                             | 113      | 111      |
| Coverage · setups                      | 100% · 6 | 100% · 6 |

The four that remain are a `75` from −Z losing to a `100` from a direction doing
nothing else, which is the rule working.

### F38 — the shop's own limits were never passed to the generators

`PlanLimits` already existed in `rules.ts` with `newDirectionGain` and
`maxDirections`, and the rule set carries one — **and `runGenerator` passed no
limits at all**, so every arrangement was built against the defaults and a
ceiling somebody had set was silently ignored. I had also duplicated the type in
`best-reading.ts` rather than finding it.

Now wired, with `operationCost` living beside the other two. They are one idea at
three scales, and it is worth naming them together:

| Limit              | Prices                            |
| ------------------ | --------------------------------- |
| `maxDirections`    | A hard ceiling on ways up         |
| `newDirectionGain` | What a whole re-fixture must earn |
| `operationCost`    | What one more cut must earn       |

None of the three is exposed in the UI. That is the obvious next step: they are
the shop's economics, and they are the only levers that change what an
arrangement decides.

### F39 — buying a way up to cut ground had no price at all

Paul's hypothesis — _"likely allowing too small regions"_ — confirmed, with a
mechanism.

The putter (`c090274f`) has **261 faces running from 0.0045 to 3,339**, median
3.59: **151 of them under a tenth of the average**. `from the rules` spread it
across five ways up at 95%; `required only` then `fill from current` did it in
three at 100%, with −Y doing 72% of the work.

`byBestReading` buys directions in two loops. The first prices an _improvement_
against `newDirectionGain`. **The second — buying to reach ground nobody cuts —
had no price whatever.** On a part with a long tail of slivers there is always
some scrap left, so it bought direction after direction to chase them.

Fixed with `worthHolding`, a floor of half a per cent of the part, and
**deliberately not `newDirectionGain`**: tying them together looked right and was
wrong. Raising the improvement price to consolidate then also blocks the
directions the arrangement needs to cut the part at all — measured at 0.4 it
dropped to three setups and **72% coverage**, trading two setups for a third of
the part uncut.

### F42 — the sweep-first fix was wrong, and reverted

F41 shipped and Paul caught it immediately: _"from the rules is making some bad
decisions — like it is using worst rule instead of overall score."_ He was right
about the symptom and close about the cause.

Seeding with a sweep of the forced directions **passed that plan as `keep`** —
and `keep`'s ground is seeded untouchable, because it is meant for a plan
somebody made by hand. So the sweep's decisions were frozen, mistakes and all.
Fixed by adding a `seeded` flag that puts a starting point in at its **real
worth**, so every face can still be argued out of the reading that swept it up.

That helped and was still not right. Measured on both parts, faces cut ≥25 below
the best reading available for them:

|                             | Putter                          | The 241-feature part         |
| --------------------------- | ------------------------------- | ---------------------------- |
| No seed (shipped now)       | 95%, 5 setups, **40** bad faces | 100%, 6 setups, **4** bad    |
| Sweep first, frozen         | 100%, 3 setups                  | — (this is what Paul caught) |
| Sweep first, improvable     | 100%, 3 setups, **26** bad      | 100%, 6 setups, **25** bad   |
| Argue first, sweep the rest | 95%, 5 setups, **40** bad       | 100%, **4** bad              |

**Reverted to no seed.** The seeded version is better on the putter and clearly
worse on the other part, and there is no reading of the numbers where it is
simply an improvement. Argue-first cannot help at all: the argument has already
bought five directions by the time the sweep runs.

**What this actually establishes**, and it is worth more than the fix would have
been: the gap is neither a constant nor an ordering. Neither allocator covers a
part alone — 70% and 72% over the same three directions — and **the one that
covers decides badly while the one that decides well leaves ground uncut**.
Closing it needs an allocator that does both, not a sequence of these two.

The reasoning is written into `generate.ts` at the call site, with both failed
attempts named, so the next person does not spend an evening rediscovering them.

**Required only → Fill from current remains the better answer on parts like the
putter**, and it is one extra press.

### F41 — ~~neither allocator covers a part alone; the sweep has to come first~~ _(reverted — see F42)_

The putter forces **exactly three** ways up, and those three cut 100% of it. Yet
`from the rules` spread it over five at 95%, while pressing **Required only** then
**Fill from current** did it in three at 100%. Measured over the same three
directions:

|                                           | Coverage |
| ----------------------------------------- | -------- |
| `required only` alone — `planFor`'s sweep | 70%      |
| `byBestReading` alone, buying nothing     | 72%      |
| The sweep, then the argument around it    | **100%** |

**Neither reaches the part alone.** They are good at different things, and the
difference is structural rather than a constant:

- `planFor` sweeps a direction and takes everything it can reach. It covers
  ground, but decides it by the order directions happen to come in.
- `byBestReading` decides face by face on merit, and refuses whole readings that
  overlap ground already claimed — so faces reachable only by those readings are
  never cut at all.

`from the rules` now seeds with a sweep of the **forced** directions and argues
everything else out around it. The forced ones are the honest thing to seed with:
they exist whatever anybody decides, so committing to them commits to nothing
that was ever in question.

Result: **100% with 3 setups**, matching the two-press sequence, in one press —
and unchanged on the part that forces all six.

**How it was found is the point.** Paul's workflow was the evidence: he noticed
the two-press sequence beat the one-press generator, which is a fact about the
app no test would have produced. Three of my hypotheses were wrong first — the
operation cost (measured: identical with it at zero), the direction ceiling
(measured: three setups but 72%), and unpriced coverage purchases (a real bug,
but not this one). The measurement that settled it was the simplest: run each
allocator alone over the same three directions.

### F40 — the remaining gap is structural, not a constant _(superseded by F41)_

With the floor in, `newDirectionGain` still changes nothing on this part at any
value from 0.02 to 0.4. That is the finding: **every direction here is bought by
the coverage loop**, not the improvement loop, so the improvement price has
nothing to act on.

The difference between the two answers is not a threshold:

- `required only` → `fill from current` seeds the **forced** directions and
  **never buys**, so −Y keeps everything −Y can reach — 72%.
- `from the rules` buys a direction to cover a patch, and then `assignHeld` lets
  that direction take **everything it is better at**, stealing well-cut ground
  from −Y. −Y ends at 24%.

So a direction bought for a patch keeps the patch _and_ helps itself to the rest
of the part. The fix is not a number: **ground bought for coverage should stay
bought for coverage**, and a newly-bought direction should only take other work
where it clears the improvement price — which is what `newDirectionGain` was
always meant to govern and currently never sees.

Paul's own workflow is the evidence that the consolidated answer is the better
one, and it is reachable today by pressing **Required only** and then **Fill from
current**. That is worth knowing while this is open.

### F43 — the arrows could show one way up or all of them, and nothing between

`DirectionArrows.shownDirection` took `number | null` — one index, `null` for
all, `-1` for none. That covers every question the viewer had been asked until
the plan existed. Once it does, the useful question is neither: _draw the ways
up I have confirmed_, which is a **set**.

Widened to `number | readonly number[] | null` in `packages/viewer`. One prop
rather than adding a plural beside the singular, because two would need a rule
about which wins, and a caller with an answer to give should not also have to
say where to put it. Backwards compatible — every existing caller passes a
number or null.

The app side is `arrows.ts`: `Arrows` gained a third state and the cycle is
All → Confirmed → Off, narrowing all the way round. Two things worth carrying
across:

- **`arrowsVisible` is now read off `shownArrow`** rather than deciding the same
  question again. They had been two functions computing overlapping answers
  about one picture, which is two rules to keep in step; with a set in play they
  would have drifted the first time an empty one appeared.
- **Confirmed with an empty plan draws nothing, deliberately.** Falling back to
  all of them is the toggle refusing the state it was put in. What makes that
  readable is the button carrying its state as a _word_ — a single tint can say
  "on" and "off", and there are three states.

Named `confirmed`, not `active`: `activeDirection` already means the way up being
held, which is a filter on what a click resolves to. One word for both would make
every sentence about arrows ambiguous.

---

### F44 — identical holes are one decision, and every list has to say so

A real part carries dozens of holes the Engine reports separately, because each
is its own geometry. To a shop they are **one tool and one operation**. The part
in front of me had a group of sixteen ⌀1.78 mm blind holes on −X; the panel drew
sixteen rows, and mapping them was sixteen presses.

**What makes two holes the same job** — `hole-groups.ts`, and nothing else
groups:

|              | Why                                                                                                                      |
| ------------ | ------------------------------------------------------------------------------------------------------------------------ |
| The way up   | +Z and −Y are not even the same setup, whatever the size                                                                 |
| The diameter | The tool. Matched to a thousandth                                                                                        |
| The depth    | A 6 mm hole 4 mm deep and one 40 mm deep are the same drill and very different cuts, and the second may not be drillable |

**The depth has to be a tolerance, not an equality.** Depth is measured to where
the hole meets the surface, so one drill through a curved or slanted face reports
a different number every time — observed at 1.036 against 1.052 on one part,
which is one hole by any reading a shop would give it. Matching exactly split
those in two. A twentieth, with a floor of a hundredth of a millimetre, absorbs
it and still keeps 3.688 and 4.958 apart.

**Which holes a row stands for depends on which list is asking**, and getting
this backwards is the trap:

- **By face** — the candidates hold the readings of one _face_, so a hole
  arrives alone however many identical ones the part has, while the part lights
  all sixteen. Grouping in place says "×1" about a row the part is lighting
  sixteen of. It has to reach across the part (`groupAcrossPart`).
- **By direction, the offer, Unmapped** — each is an answer about a _set_: the
  painted faces, or what nothing cuts. Reaching across the part there offers
  holes nobody painted and puts mapped holes in a list of unmapped ones. They
  group within themselves (`groupHoles`).

**The group is the row, and the row opens.** The first thing offered is the
decision somebody almost always wants — all of them, one press. Opened, each
hole is a row in its own right: it reads on its own, lights on its own, and
carries its own two presses. "All but that one" is a fair question — a hole under
a boss, one that has to be reamed.

Two mechanisms this needs, neither obvious:

- **`data-holes` on the row.** The assign keys are handled once at the window
  and only ever see the DOM, so R on a row standing for sixteen has to mean
  sixteen. The row _says_ what it means rather than leaving it to be worked out
  there — the two lists group by different rules, and a handler re-deriving it
  would use the wrong one in one of them.
- **`alone` on the selection.** Naming a hole normally names all sixteen and the
  part lights them all. A hole named from inside its own opened group is the one
  place somebody has pointed at _this one_, and answering it by lighting the
  other fifteen is the app ignoring them.

And the row reads as focused when **any** of its holes is, not when its first one
is: a click on the part that landed on the ninth still lights the row that names
it.

### F45 — component tests cannot render anything from `@toolpath/ui`

The workspace has two Reacts on disk — the app pins 19.2.0, and `@base-ui/react`
under `@toolpath/ui` pulls 19.2.8. Anything rendering a `Button`, `Badge` or
`Tooltip` under vitest dies inside React with `Cannot read properties of null
(reading 'useMemo')`, which reads as a broken component rather than as a
resolution problem.

`vitest.config.ts` already fights this — it aliases `react` and `react-dom` by
path and inlines `@toolpath/ui` and `react-resizable-panels`. **That is not
enough.** Adding `@base-ui/react` and then `/@base-ui/` to `server.deps.inline`
both failed the same way: pnpm's nested `node_modules` still resolves base-ui's
own copy.

The consequence is structural and worth knowing before writing a test:

- Component tests exist only for components that **avoid** `@toolpath/ui` —
  `map-features.tsx`, `pass-buttons.tsx`, `tool-button.tsx`.
- Everything else — the datasheet, the summary, the setups panel — is covered
  end to end, where the real bundler resolves one React.

Not chased further, deliberately: the fix belongs in the workspace's dependency
graph, not in a test config, and the split is the moment to do it. **Worth
raising with Q2 in §3.**

### F46 — the app's own render cost, measured, and it is not the API

Paul asked whether the sluggishness was ours or the Toolpath connection. Measured
rather than argued, and the method is worth keeping.

**A/B against the commit before the day's work**, on a 420-feature, 860-region
fixture with the API stubbed out entirely:

|                            | before  | after   |
| -------------------------- | ------- | ------- |
| load to first paint        | 1853 ms | 2040 ms |
| open a type in the summary | 108 ms  | 86 ms   |
| read a feature             | 101 ms  | 91 ms   |
| show unmapped              | 137 ms  | 131 ms  |
| 20 arrow-key steps         | 557 ms  | 605 ms  |

Identical within noise, so the change was not the cause. The pure functions are
nowhere near the cost either: `uncutFaces` 0.058 ms per render on that part,
`groupAcrossPart` 0.050 ms.

**What is slow scales with rows drawn**, which is the actual finding:

```
  30 readings,   30 rows  →   8.4 ms per keystroke
 120 readings,   90 rows  →   9.1 ms per keystroke
 420 readings,  288 rows  →  27.1 ms per keystroke
```

Every row re-renders on every focus change. `Reading` takes `focusedTag` and
works out `isFocused` itself, so moving focus one row invalidates all 288 — each
redoing `setupForReading`, two `cutsFrom` lookups and its DOM.

**The fix, not applied here:** pass each row a precomputed `isFocused` boolean
and wrap `Reading` / `HoleRow` in `React.memo`, so a focus change re-renders two
rows rather than 288. The summary's feature list has the same shape. Left for the
real repo because it is a perf refactor nobody had asked for, and because the
measurement above is the thing worth carrying — **the API was never in it.**

The Engine's own share is separable and already on screen: Inspector → Timing
shows Download / Analysis / Total straight from the report.

### F47 — a count on the Unmapped button was two answers to one word

Built, used, removed the same day. The button showed how much was left; the
honest measure is **faces** (F31 — a face is reported from every way up that can
reach it, so counting readings makes a finished arrangement read as mostly
unmapped), but the list _under_ that button lists **readings**. A button reading
12 over a list of forty rows is a number somebody has to be told how to read.

The general shape, and it is not only about this button: a figure needs room to
name its unit. The Directions tab says the same thing in a sentence — "12 of 74
faces have no way up in the roughing pass" — and that is where a number like it
belongs.

### F48 — the panel kept trying to own state the part already owns

Twice in one day, the same mistake in two places:

- A **"Only −X" flag** was added to the Map features panel when Unmapped gained
  its direction filter. The viewport already had one, with its own Clear, and a
  comment saying why it lives there: a filter switched on from the part has to be
  visible on the part and clearable from there. Caught by an e2e strict-mode
  violation — two elements matched — which is a good argument for asserting on
  visible text rather than test ids.
- The **Unmapped button was amber** while By face and By direction were blue.
  Amber is this app's colour for a _filter_, a narrowing laid over something else
  with a flag saying so. Unmapped is not that: it is the third answer to the
  question the other two answer, exactly one is lit, and its own colour said
  there were two kinds of thing in a row of three.

Before adding a flag or a colour, ask which thing already owns that state.

### F49 — a claim should take faces, not readings _(experimental, reverses a rule)_

`cutOnce` unassigned the whole of any reading it took a face from. On the test
part that is invisible — the readings are one and two faces. On a real one it is
severe: claiming a single wall of a twelve-face profile for the way up that
squares it threw the other eleven faces out of the plan, said nothing, and left
them to be rediscovered in "not cut yet".

Now a claim takes the faces it asked for and no more. `Assignment.without`
records what a reading gave up, per pass; absent means all of it, so a generated
plan is shaped exactly as before.

**This reverses "whole readings only"**, which F32's table states as
_"the wall is run 'partly', which is not a thing — the Engine reports one
operation"_. That objection is still true: a part-cut reading is not one
emittable operation. The trade is that the alternative silently discards work,
and silence was the worse half.

Built on `paul/partial-readings` so it can be dropped whole. What it touched:

|                              |                                                                                                                                                                                            |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cutRegions` / `givenUp`     | The one place to ask what a reading cuts. Coverage, claimed ground, uncut faces and the paint all had to move onto it                                                                      |
| `cutRegionsByDirection`      | A part-cut reading paints through the viewer's **region** layer, not its feature layer — otherwise it colours a face another way up now holds. Disjoint from the feature layer by cut-once |
| `cutState` / `groupCutState` | Three states, not two. `aria-pressed="mixed"`, dashed rather than filled                                                                                                                   |
| `setPassFor`                 | "Already there" now means **wholly** there, or the toggle-off rule fires on the press meant to repair a split claim                                                                        |

Two things worth knowing before extending it:

- **Nothing is handed back when a claim is undone.** Several readings may have
  given the same face up over time, so there is no single right owner to restore
  it to. The face goes uncut and one press places it.
- **The generators are untouched.** They build whole-reading plans from scratch
  and never produce a `without`. If one is ever taught to split a reading, the
  scoring in `byBestReading` has to learn it too — it values a reading by the
  area of everything it covers.

### F50 — the level below a reading had no UI at all _(experimental)_

A row said "12f" and that was the end of the sentence. But a face is what the
plan is made of: cut once, counted by coverage, taken by a claim. Every
disagreement with an arrangement is a disagreement about a face, and the only
way to have one was to find that face on the part and click it — on a 420-feature
part, by hunting.

The face count is now a control. It opens the reading's faces in place of the
datasheet, each row tickable (cut it here, or don't) and expandable onto every
reading that covers that face, each mappable from where it sits.

Three things worth carrying:

- **It replaces the datasheet rather than sitting beside it.** Both are about
  one reading, and a page showing both asks somebody to hold "twelve faces" and
  "one of them" at once.
- **The count had to be its own button, not a `role="button"` inside the row's
  button.** Nested interactive content is invalid, and the assistive tree does
  not expose the inner one — Playwright could not see it either, which is how it
  was caught. A control nobody can reach is not a control.
- **The part paints the list, not the feature — every feature layer off, not
  just the selection.** Suppressing the selection was the obvious half: painting
  the feature lights faces the reading has given up, which is what the list is
  there to distinguish. The half I missed was `hoveredFeatures`, which is
  **layer 6 and paints over everything, faces included** — an open feature type
  in the summary covered the whole list's worth of faces, and it read as the
  face highlighting simply not working. **When a region layer looks broken,
  check what feature layer is above it**: of the seven layers in
  `applyHighlightLayers`, three outrank the region layer and two of them are
  feature-level.

`setFaceCut` inherits every rule the pass buttons already had rather than
inventing its own: cut once, per pass, a reading cutting nothing leaves the plan.
The one new capability is **ticking a face on an unassigned reading assigns it
cutting that face alone**, which is what makes building a claim up face by face
possible at all.

### F51 — the app runs the viewer's **build**, and two bugs hid behind that

`apps/part-viewer` depends on `@toolpath/viewer` as `workspace:*`, and that
package's `main` is `./dist/index.js`. **Editing `packages/viewer/src` changes
nothing the app runs until the package is rebuilt** —
`pnpm --filter @toolpath/viewer build`. Types resolve against `dist/*.d.ts`
too, so `check-types` stays green and every test passes while the running app
executes the old code.

Found because the three-state arrows "worked" in tests and not on the part: the
build was from the previous day, and `dist/index.js` still had
`shown !== null && shown !== index` — the single-index form, from before
`shownDirection` was widened to accept a set (F43). **That feature was never
live.** Rebuild after any change under `packages/viewer/src`, and expect to
restart the dev server after it (F12).

And the reason the tests could not have caught it: **every end-to-end fixture
sets `hasMeshGlb: false`**, so no mesh mounts and the viewer never paints. The
whole highlight stack — washes, region layers, selection, hover — is untested
end to end. That is a deliberate trade (a fixture with a mesh is a binary in the
repo and a slow suite) but it has to be known: anything about what the part
_looks like_ is verified by looking at the part.

The second bug it hid was mine, in the face list (F50). `READING_COLORS` and
`SETUP_COLORS` each define `highlight` and `picked` as **the same hex** — right
where they are used, because a clicked face and the reading it resolved to
should read as one thing. A face list borrowing either paints the whole set and
the row under the pointer identically, so a dozen faces light in one flat colour
with nothing to tell them apart. It looked exactly like the highlighting not
working.

The face layer is its own hue now — green, which the viewer's palette note
already reserves for "whatever is being looked at" — and
`selection-colors.test.ts` pins the collision that caused it.

Two more surfaced by looking at the part again, and both are the same shape:
**a layer above the one you are debugging.**

- The **picked** layer (5) still held faces picked earlier by clicking the part,
  which sat on top of the face list wearing the wrong colour. It reads as those
  faces not being in the list — the symptom was "some faces are not
  highlighting". While a face list is open, the picked layer holds only the row
  under the pointer.
- **The viewer paints a feature by expanding its tag to every region it
  covers**, so selection and hover lit faces a part-cut reading had already
  given away. `paintByCut` splits a tag set into the whole readings, which keep
  their tags, and the part-cut ones, which are painted face by face in the
  colour the tag would have worn. `cutRegionsByDirection` already did this for
  the direction wash; these were the two layers it had not reached.

The general form, for the next time a highlight looks wrong: ask what is painted
**above** the layer you are looking at, and whether a feature-level layer is
claiming regions the plan no longer gives it.

### F53 — "Both" grew a third meaning, and it was mine

The tri-state pass buttons (F49) are about **faces**: dashed means "held here,
but not on all of this reading". I let that leak into Both, which showed dashed
whenever _either_ pass was held — so roughing alone lit a button labelled Both.

A control with two passes to report has no room for a third meaning. Both reads
the two passes and nothing else:

|        |                                                               |
| ------ | ------------------------------------------------------------- |
| Lit    | Both passes held, both whole                                  |
| Dashed | Both passes held, one of them cut on only part of the reading |
| Off    | Anything less, including one pass held whole                  |

The general lesson is about where a new state is allowed to spread. `'some'` was
a true thing to say about R and about F, and it was not a true thing to say about
a button whose job is to report the pair. **A state added to a component reaches
every control in it**, and each one has to be asked separately whether the state
means anything there.

Pinned end to end, at the state that produced the report: a reading roughed on
some of its faces and finished nowhere.

### F52 — "Both" traded one pass for the other

`setPassFor` computed **"already there" inside the pass loop**, so a press for
two passes judged each one separately. Both on a reading already roughed read
"rough is already there", took roughing _off_, and put finishing on — one press
that assigned one pass and unassigned the other.

Pre-existing, and invisible until the tri-state pass buttons (F49) made the
states legible enough to notice.

"Already there" is one question with three dimensions, and it was answered on
one of them:

| Across     | Because                                                                                                                                                    |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The group  | Rough all where every reading is already roughed takes them all off; half-done gets the rest put on. Per feature, one press would both assign and unassign |
| The passes | Both means both. Judged per pass it traded one for the other                                                                                               |
| Wholeness  | A part-cut reading takes the rest back rather than letting go, or the only gesture that repairs a split claim is the one that destroys it                  |

Also from the same pass over the panel, and both worth carrying:

- **Green means cut, not covered.** The face list painted every face the reading
  covers, so on an open pocket the one face it was _not_ cutting — the largest
  of the four — dominated the highlight while the panel said "3 of 4 faces". A
  highlight that ignores the state the panel is showing makes that state
  unreadable.
- **The face count is one component in three places** (`FaceCount`): the mapping
  lists, the confirmed directions, the datasheet. Three copies of a number
  meaning "how much of this is being cut" is three chances for one of them to
  still be counting what the reading covers.

### F54 — a face-level claim went down the row-level path, and stole faces

`cutOnce` claims **every face the reading covers** — right for a press on a row,
which means "cut this reading here". The face editor's per-face controls went
down the same path, so moving one face of a profile to another way up unassigned
a wall that held a _different_ face of that profile. A face the press had
nothing to do with.

It survived a while because the visible half was right: the face moved, the
profile ended up cutting what it should. What was wrong was elsewhere on the
part, in a reading nobody was looking at.

`cutOnce` takes the faces it is given now, defaulting to all of the reading's; a
face-level press gives it one. Two rules read together:

| A press on | Claims                        | Because                                                                              |
| ---------- | ----------------------------- | ------------------------------------------------------------------------------------ |
| A **row**  | Every face the reading covers | It means "cut this reading here"                                                     |
| A **face** | That face                     | It means "cut this face there", and the rest of the plan is not part of the sentence |

The buttons under a face are therefore a **yes or a no**, not the three states a
row carries. The dash means "held, but not on all of this reading", and a face
is not a reading — a state that is true of one level is not automatically true
of the one below it, which is the same lesson as F53 pointing the other way.

**How to catch this class:** the assertion that found it checks what the press
_did not_ touch. A test that only checks the thing that moved passes on a
function that moves everything.

### F55 — `contextmenu` fires on mouse-**down**, so every pan was a right click

Right-drag pans the camera, and the viewer's tap guard exists to tell a click
from the end of a drag: it records the press and compares the release. Correct,
and useless here — `contextmenu` fires on right _mouse-down_, before the gesture
has moved at all. Every pan therefore emitted a secondary pick from the point it
started at, and the app answered it by opening a datasheet.

The right button is judged on `pointerup` now, where the gesture has actually
finished. `contextmenu` keeps the one job it is still needed for: suppressing
the browser's own menu, and only over geometry, so a right click on empty space
still gets it.

Two things this is worth remembering for:

- **A guard is only as good as the event it guards.** The tap logic was right
  and tested; it was wired to an event that cannot express what it measures.
- **`packages/viewer` had to be rebuilt for the fix to exist** (F51). The app
  runs `dist`, so a fix to `src` is invisible until then — and this one is
  unreachable from the test suite, because no fixture mounts a mesh.

Alongside it, the app stopped treating **the plan** as one of the lists a peek
can answer from. `peekTarget` reads what is on screen, most specific first — an
open editor, a standing offer, a painted set — and the plan is not any of those.
Counting it meant right click opened a datasheet on any mapped face, which on a
mostly mapped part is every right click. A list somebody put up is a question
they are asking; the plan is just the part.

### F56 — F20 again: a size class on a `<button>` does nothing

The face editor drew its readings half again the size of the same readings
everywhere else, and used what looked like the display face. Both were one
cause, and it is already written down as F20: `styles.css` carries an unlayered

```css
button,
input {
  font: inherit;
}
```

which **beats Tailwind's layered utilities**. So `text-2xs` on a `<button>` has
no effect at all and the row falls back to the document's 16px. Every other
panel sets `text-xs` on its container and lets rows inherit; this one set
nothing, so its buttons inherited from `body`.

Measured rather than argued — the class was present on both rows and only the
computed size told them apart:

|                                              | before   | after |
| -------------------------------------------- | -------- | ----- |
| Map features row                             | 12px     | 12px  |
| Face editor reading                          | **16px** | 12px  |
| Face row (a `<label>`, so its class applied) | 10px     | 12px  |

Two things worth carrying:

- **Set the size on the container, never on the row** — and if a row looks
  wrong, read `getComputedStyle`, because the class attribute will look right.
- The `<label>` rows were the giveaway: they honoured their class while the
  `<button>` rows next to them ignored theirs, which is the shape of this bug
  every time.

Guarded now by `reading-row.test.tsx`, which reads both source files and fails
if the shared row drifts — it had drifted twice by then. Rendering the two
components would compare each against its own markup, which is what let them
differ in the first place.

### F57 — a branch inserted into the wrong block, and nothing caught it

The face-picking branch for drawing a reading landed **inside the right-click
block**, so a left click never reached it and fell straight through to the
ordinary pick — which grabs whole features, the one thing that mode is not for.
Types passed, both suites passed, and the mode was unusable.

Nothing caught it because the click path begins on the part, and **no fixture
mounts a mesh** (F51). The whole of `pickFromPart` — five branches, first match
winning, which the parity plan calls the single most important thing to carry
across — is verified by using the app and nothing else.

Two habits it argues for:

- **Insert by anchor, not by line number.** It got there through a
  line-arithmetic edit that found the right line and closed on the wrong brace.
  A string anchor either matches or fails loudly.
- **Read the branch back after moving one.** Printing the function head took ten
  seconds and showed it immediately; three rounds of "it's still selecting
  features" did not.

The same round turned up two more of the same family, both about a mode not
owning what it should:

- **The arrows stayed on after a way up was chosen.** Every other arrow is then
  an alternative to a decision already made — and they are clickable, so
  leaving them up invites changing it by accident while clicking faces near one.
- **The datasheet stayed up while drawing.** It describes one of the Engine's
  readings, and drawing is about faces that do not belong to one yet.
- **The mode toggle stuck.** Four answers to one question and exactly one lit:
  naming any of the others has to leave the one you are in, or it is a mode
  people get stuck in.

### F58 — one geometry, two parts: adding a feature blanked the whole part

Creating a reading painted the entire part one flat colour and took hover,
selection and every wash with it. The cause is in the viewer, and it is a
lifecycle order nobody had reason to hit until a report could change without the
mesh changing.

`createPart` adds a region attribute to the geometry it is handed and removes it
again on dispose. The geometry comes from a cache keyed on the **mesh URL**, so
a report changing identity — a feature added, a re-fetch — rebuilds the part
against the _same_ geometry. React's order is:

1. render: the new part is built and **sets** the attribute
2. cleanup: the old part is disposed and **deletes** it
3. effect: the new part paints into an attribute that is no longer there

Every vertex then falls back to texel 0, which is one colour for the whole part.

Dispose now removes the attribute only if it is still the one that part set.
`part.test.ts` pins it, and the test fails on the old dispose — which is the
only way to know a regression test regresses.

The file's own doc comment said _"one geometry backs one part; sharing it
between two parts at once is unsupported"_, and it was right about rendering and
wrong about lifetime: two parts on one geometry is not a thing to draw, but it
is a state that happens for one render every time a report changes. **A
constraint that holds for what you draw does not automatically hold for what
exists.**

And it needed `pnpm --filter @toolpath/viewer build` to exist at all (F51).

### F59 — "faces that touch" is not a question the report can answer

A made feature has to be one continuous piece: an operation runs over faces that
touch, and a reading drawn from two unconnected groups is one no toolpath could
follow. So the panel had to answer _are these twelve faces one piece_ — and the
app has nothing to answer it with. A region carries a shape kind, an area and a
triangle range. There is no topology in a part report at all.

The stand-in was **co-membership in a reading**: two faces joined when some
reading from that way up covers both. It reads as reasonable — the Engine only
groups faces into a reading when they are one piece it could cut in one go — and
on a real part it is wrong in the worst direction. Twelve faces selected on a
top surface, plainly one piece on screen, came back as _"2 separate pieces — 1
and 11 faces"_: the large plane and the eleven fillets around it, which no
single reported reading covers.

Being conservative did not save it. A refusal somebody can see is wrong is worse
than none, because now the panel is arguing with the part.

**The answer is in the mesh, so it comes from the viewer.**
`regionAdjacency(model, geometry)` walks the triangles once, keys every edge by
the **positions** of its two ends, and joins the two regions that name it. Two
things it has to get right:

|                            |                                                                                                                                                                 |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Key by position, not index | A non-indexed mesh repeats a shared corner per triangle, so two triangles meeting on an edge have four indices for two points — index keys find no edges at all |
| Quantise before keying     | Adjacent surfaces are tessellated separately and their corners agree to floating-point noise, not exactly                                                       |

Handed to the app through `onAdjacency`, computed once per mesh: a report
gaining a feature does not move a triangle.

It also answers the other one. **Profile** was greyed out on almost every way up
— a part reports two contours across seven directions — and a button that is
only ever unavailable is one nobody learns the meaning of. With real adjacency
it falls back to following the surface a chosen face sits in, bounded by what
that way up can reach.

The lesson is the shape of the mistake, not the fix: **a plausible proxy for a
geometric fact is worth exactly one test against real geometry.** The cube
fixture would have caught this on day one — six faces, four neighbours each,
never the opposite one.

### F60 — four bugs in one flow, none of which any test could reach

"Creating a feature and telling it to rough and finish does not map it." One
report, four causes, and the only reason they were found is that **Profile fills
the faces without a click on the part** — which finally made the flow drivable
by a fixture with no mesh (F51). Until then every step after "choose a way up"
was verified by hand or not at all.

|                                          |                                                                                                                                                                                                                                                                         |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The type was never guessed               | The guess ran only where a click on the part changed the faces. A set chosen any other way — Profile, Clear, an ✕ on a row — left it unset and **Create disabled with nothing saying why**. One choke point now: the panel says what changed, the guess is what follows |
| An empty `Map` is truthy                 | Topology arrives from the viewer a moment after the panel does. Taken at face value, an empty one gave every face its own run, so a plainly continuous set read as one piece _per face_ and refused itself. Empty means "not yet"                                       |
| The panel vanished on success            | It was shown while a draft existed, and the draft is put down the moment it becomes a feature — so it disappeared at exactly the point it had something to say, taking the passes and the delete with it                                                                |
| A deleted reading left its way up behind | `withoutEmptied` keeps a setup that was empty _before_ a change, on the grounds somebody made it and has not filled it. Passing the feature list **without** the deleted reading made it look like exactly that, so the way up survived holding nothing                 |

The last one is worth the most: `withoutEmptied` reads _before_ and _after_, so
the list it reads them with has to span both. Handing it the world as it will be
makes the past unreadable.

And the shape of the day: **a flow only one gesture can start is a flow nothing
can test.** Profile was added as a convenience and turned out to be the seam
that made four bugs findable.

### F5 — §8's "what will bite" list is unverified here

Each item in §8 is described as a bug that was reported in the picker. Not yet
checked whether the picker's _current_ `pc-feature-picker` code still contains the
guard (e.g. `claimedRegions` seeding) or whether the fix is what shipped. Worth
confirming before trusting §8 as a specification — a fixed bug and a documented
bug read identically in that list.

---

## 3. Open questions for the repo split

The split is the largest unknown and it is not addressable from here:

1. **Does `apps/part-viewer` keep its path?** If it becomes a repo root, every
   patch below needs `-p3 --directory=`. Cheap either way, but decide once.
2. **Do `packages/ui`, `packages/viewer`, `packages/sdk-typescript` travel with
   it?** `apps/part-viewer/package.json` depends on all three as `workspace:*`,
   and the Dockerfile builds all three before the app. If they split away,
   `@toolpath/viewer` becomes a _published version pin_ — and F1 gets worse,
   because rehoming types onto a pinned dependency is a release cycle, not an edit.
3. **Does `@toolpath/viewer` stay at 0.3.1 through the split?** F1's fix depends
   on what that package exposes.

Q2 is still the one to ask Nathan today — not for PR 1a, which is done and needed
almost nothing from the viewer, but because `packages/ui` supplies the components
PR 2a onward renders with, and `@toolpath/viewer` supplies `DIRECTION_COLORS` and
the render surface PR 3's painting needs.

---

## 4. Where the running order actually landed

The plan's thirteen PRs, against what was built. **Stages 0–5 of the plan are
done**; the numbering below is the plan's, not the sandbox's — see
[directions-replay.md](directions-replay.md) for the order to write it in.

| Plan      | What happened                                                                                            |
| --------- | -------------------------------------------------------------------------------------------------------- |
| ~~PR 0~~  | **Withdrawn.** F1 was wrong; the type swap is three import lines                                         |
| PR 1a/1b  | **Done**, and cheaper than budgeted — `setups.ts` 395 lines against 410, `directions.ts` 211 against 237 |
| ~~PR 2a~~ | **Reverted.** A standalone Directions page is not in the picker; its Directions is a view (F13)          |
| PR 2a+2b  | **Done, merged.** Mapping on the existing chips — the chips already were the direction list              |
| PR 3      | **Done.** `directions` back in `PAINT_MODES`, pointed at the plan; the pass toggle; the warm selection   |
| PR 4/5/6  | **Done**, folded into `plan-summary.ts` rather than three files                                          |
| PR 8a/8b  | **Done.** Pick modes, holding, painting the reading, the per-direction offer                             |
| PR 9a/9b  | **Done.** All six generators, plus `byBestReading` and the plan limits                                   |
| PR 10     | **Done.** The standing offer, whole                                                                      |
| PR 11     | **Not started.** Naming a way up the Engine never reported — the only stage untouched                    |
| PR 7      | **Not started**, deliberately — R1, the selection outline, and now the strongest remaining candidate     |

### F61 — a `@toolpath/ui` `Button` that never fired _(solved: see F67)_

Delete in the face editor did nothing. Playwright found the element by role and
name, reported it visible and enabled, and confirmed its parent was the span the
component renders — and neither the handler nor a `console.log` placed as the
first line of its `onClick` ever ran. The **Close** button rendered from the same
kit, in the same span, one line below, worked throughout.

I could not account for it, replaced it with a plain `<button>`, and recorded it
as a live trap rather than a solved problem. It reappeared on the datasheet's
Delete two days later, which is what finally made it findable — **F67** has the
cause and the fix.

The lesson that survives: a control that is in the tree, matches every query and
reports enabled is one that normally proves itself working, so the usual next
moves — check the handler, check the state, check what might swallow the event —
all find nothing. When they do, the next question is whether the element being
clicked is still the element that was pressed.

### F62 — a highlight on everything points at nothing

Two reports, a week apart, that turned out to be the same mistake made twice.

The face editor painted **every** face the reading covered — green for cut, red
for not — and filled **every** cut row in its list. Both were deliberate and both
were asked for, and on a real part a twelve-face profile is normally cut on all
twelve: "opens the editor" therefore meant "every line in the list is filled",
and the current row competed with eleven others for the same signal.

My first fix backed off **both** channels, and that was wrong — the part's green
and red was the useful one and Paul asked for it back within the hour. The fix
is not less colour, it is **one question per channel**:

| Channel        | Says                          |
| -------------- | ----------------------------- |
| The tick       | Is this face in the reading   |
| The part       | Which faces those are         |
| The filled row | Which face is being worked on |

The row fill was the redundant one: the tick answers "is it in" unambiguously,
in the row, where the question is asked. The paint was not redundant at all — it
answers a question no list can, which is _where on the part_.

Two lessons, and the second is the one that cost time. **A redundant signal is
not free**: it costs a channel, and channels are scarce. And **"too much
highlighting" does not mean "highlight less"** — it means one of the channels is
answering a question something else already answered, and the job is to find
which.

### F63 — a control that writes two things and reads one

`0 of 12 faces`, above a list whose every expanded row showed that very reading
with **F** lit. The tick in the face editor **wrote** both passes — "cut this
face here" describes the work, not one half of it — and **read** only the pass
the viewport happened to be showing. Roughing on screen, a reading finished from
its own way up: nothing ticked, nothing counted, and the panel contradicting the
rows inside it.

Nobody wrote the read and the write at the same time. The write rule arrived
first, from a request about what ticking should mean; the read was inherited
from the pass toggle everything else in the panel follows, and it was correct
before the write rule existed.

**Where a control's write and its read disagree, the read is the bug** — the
write is the decision somebody made. Fixing the read also settled what dashed
means here: held in one pass, and pressing it fills up rather than empties, the
rule R, F and Both already followed. Taking one pass off one face keeps a
control of its own, which is that face's own R.

Worth grepping for the shape: any control whose `onChange` touches more state
than its `checked` reads.

### F64 — one number, four formulas, and the component that warned about it

`Edit Feature (0 of 12 regions)` in the confirmed directions, beside
`Edit Feature (2 of 12 regions)` in the datasheet, for the same reading in one
screenshot. The mapping lists said `12 regions` and the editor's own header said
`2 of 14 faces`. Four places, four answers, one of them right.

`FaceCount` is a single component and its own doc block says why:

> One component because it appears in three places that must agree … Three
> copies of a number that means "how much of this is being cut" is three chances
> for one of them to still be counting what the reading _covers_.

The component was shared. **The number passed into it was not**, and each caller
had grown its own arithmetic — `regionIdxs.length − max(givenUp)`,
`cutRegions(showingPass).length || regionIdxs.length`, and a sum over a group.
Each was right when written, and none was updated when a reading could be handed
a face it does not cover.

**Sharing the component is not sharing the number.** A prop is a seam, and a
seam is where the drift goes — the doc block anticipated the exact failure and
still could not prevent it, because it was attached to the half that was already
shared. The fix is `faceCounts` in `setups.ts`: one function, four call sites,
and an end-to-end test that reads the count in three lists in a single pass and
asserts they say the same thing.

Two smaller things settled with it, both from the same cause as F63 — the count
follows the **tick**, not the pass toggle. A face cut in either pass counts, so a
reading finished but not roughed no longer reads as untouched. And an unmapped
reading reads as whole rather than `0 of n`, because nothing has been decided
about it yet.

### F65 — `reduce(Math.min)` is NaN, silently

`values.reduce(Math.min)` reads correctly and is wrong. `reduce` hands its
callback four arguments — accumulator, value, index, **the array** — and
`Math.min(a, b, 0, [..])` is `NaN`. No type error, no exception; the merged
datasheet simply reported `NaN` for every field, and only a test that asserted
an actual number found it.

`(a, b) => Math.min(a, b)` is the fix, and the general rule is to never pass a
variadic function straight to `reduce`, `map` or `forEach`. `map(Number)` is the
famous case; this is the same trap in a place nobody quotes it.

### F66 — three tries at one feature, because I built the panel before the gesture

Merging went through three shapes in an hour: a mode with steps of its own that
picked whole readings; then the same mode with By face's list underneath and a
tick on each row; then what it should have been all along — By direction's
selection exactly as it is, with one extra bar under the offer.

Paul's correction was one sentence: "it should basically work exactly like the
By direction option in terms of selection, but then it just gives you the option
to say merge selections into one feature instead of mapping to a direction".

What I had missed is that **merging is not a way of selecting readings**. It is a
second thing to _do_ with readings already selected, and the app had a perfectly
good way of selecting them. Every step I designed — pick a way up, pick the
readings, see them listed — was a re-implementation of a mode that already
existed, and each one had to grow its own state, its own click handling, its own
highlighting rules and its own list.

The tell was in the state: `MergeDraft` started with a direction, a source list
and passes, and every one of the first two was a second copy of something the
panel above it already knew. It ended as `{ passes }`.

**When a new feature needs its own copy of state the app already has, the
feature is probably in the wrong place.** The version that shipped touches the
selection machinery not at all.

---

### F67 — a component declared inside a render, and the click that vanished

The cause of F61, found when the same symptom appeared on a second button.

`@toolpath/ui`'s `Button` renders its inner surface through a helper declared
**inside** the component:

```tsx
export const Button = ({ ... }) => {
  const ContentWrapper = ({ children }) => <div className={...}>{children}</div>
  const content = <ContentWrapper>{children}</ContentWrapper>
  return <button onClick={clickHandler}>{content}</button>
}
```

A component declared in a render is a **new component type on every render**, so
React unmounts the whole subtree and mounts a fresh one each time. That is
usually filed under "wasteful" — this file already records it costing keyboard
focus in the mapping list, which is why both row components there sit at module
scope.

It is not only wasteful. A browser dispatches `click` only when `mousedown` and
`mouseup` land on the **same element**, and the `<div>` filling the button is
the element the pointer is actually over. Any render occurring mid-press — a
hover handler on an ancestor is enough — replaces it, the two events land on
different nodes, and no `click` is dispatched at all. The handler is fine. The
button is fine. Nothing is logged, because nothing happened.

**Why only some buttons.** Whether a render lands between the two events, which
is why Close worked and Delete did not, and why the same Delete worked in
isolation. Two sessions were spent on a control that behaves differently
depending on what re-renders while it is held down.

The fix is one line: hoist the wrapper, or make it an element instead of a
component. The regression test asserts **identity** rather than output —
`button.firstElementChild` is the same node after a re-render — because the
rendered output was always correct, which is exactly why nothing caught it.

Two rules worth carrying over:

- **Never declare a component inside a render.** The React docs say it costs
  state and performance; they do not say it can cost you clicks.
- **Test identity, not just output**, for anything whose job is to stay put.

Everything after that is what the sandbox added beyond the plan, because using
the app on a real part asked for it: hole grouping (F44), the Unmapped list and
its direction filter, the three-state arrows (F43), the plan limits as rules
(F38), part-cut claims (§10), the face editor (§11) and drawing a reading by
hand (§12).

**Still open, in the order I would take them:**

|                                   | Why now                                                                                          |
| --------------------------------- | ------------------------------------------------------------------------------------------------ |
| The row re-render cost (F46)      | Measured, diagnosed, and the fix is contained. It is the only thing that makes the app feel slow |
| The selection outline (R1 / PR 7) | Five layers now paint the part and a face can only be one colour                                 |
| `maxDirections: 2` yields three   | Forced directions are pushed into `held` before the ceiling is checked                           |
| Quiet focus (R2, row 37)          | Half built — the keys already prefer the row under the keyboard; arrowing still lights it        |
| Two Reacts under vitest (F45)     | Blocks component tests for most of the app; belongs in the split                                 |
| Naming a way up (PR 11)           | The last stage of the plan                                                                       |

---

## 5. Getting this back to the real repo

The sandbox has no remote by design. Work leaves it as patches. There is an
`export-patches.sh` at the sandbox root, but it is **untracked and ignored**, so
it does not travel with the patches it makes — the whole of it is:

```sh
git format-patch fdcff0e -o ~/dev/directions-patches   # fdcff0e is the plan-doc commit
```

**121 patches, about 3.4 MB.** The series has been replayed onto `fdcff0e` in a
clean clone and lands on the same tree, so it is known to apply.

Then, once the split has landed and the new repo is cloned:

```sh
git am ~/dev/directions-patches/*.patch                    # if paths are unchanged
git am -p3 --directory=. ~/dev/directions-patches/*.patch  # if part-viewer became the root
```

Patches are used rather than a branch push because the split may rewrite history;
a patch series re-applies onto whatever the new base turns out to be, and a branch
built on `fdcff0e` may not.

**Do not replay the patches in order and expect the code to make sense on the
way.** Roughly a third of them undo the other two thirds — `0003` adds a
Directions route and `0004` reverts it; F32, F34, F35 and F36 are four successive
fixes to one function. The patches are the record of _what the code ended up
being_; [directions-replay.md](directions-replay.md) is the order to write it in.
Either replay the series and read the replay doc for why the end state is what it
is, or follow the replay doc and use the series as reference.

### F68 — three numbers asking one question, in a vocabulary nothing else used

"How many setups will you accept" was three fields: a count the shop would
_like_, a weight saying how much it cared about that count, and a hard ceiling.
Each was defensible on its own. Together they asked one question three times,
and none of the three looked like anything else in a panel where every other
limit a shop sets is **a band scale** — four thresholds and an optional refusal,
read as _two is easy, five is rats_.

Paul's correction was four words: _ways up should be a threshold rule_.

It is worth being precise about what that fixed, because "make it consistent" is
usually a cosmetic argument and this one was not:

- **The weight had no units.** `directionWeight: 1` "doubles the price at the
  first way up past the preference" — true, and unreadable. On a band scale the
  same statement is a table: `alright` costs ×2, `meh` ×4, `rats` ×8.
- **The ceiling and the preference disagreed by construction.** Two fields, both
  about how many setups, with nothing tying them together — a shop could set a
  preference of five and a ceiling of three and the panel showed no problem. On
  one scale the refusal is the last band and the arithmetic keeps them ordered.
- **Nothing else in the app knew the shop's answer.** The three fields were
  private to the allocator. A band is a thing the rest of the app already
  understands.

`newDirectionGain` stops being a flat price and becomes the ×1 price, multiplied
by the band the plan would land in. One number the shop sets once, climbing on
its own as the plan gets worse, instead of a number that had to be right for the
second setup and for the sixth.

**The compatibility shim is where the interesting bug was.** A saved set carries
`maxDirections` and no scale, so the obvious read is "default thresholds, with
that as the refusal". It is wrong. A refusal may only push the last boundary
_out_, never pull it in — otherwise a half-edited rule ("rats up to 12, no go
past 5") leaves values that are past every band and refused at once. So
`maxDirections: 1` grafted onto the default scale reads as _rats up to five,
refused past five_: the opposite of what it says. The old field was the shop's
whole statement about setups, so it has to become the whole scale — every
threshold clamped to it.

**And a default can disable its own fallback.** Putting `waysUp` in
`DEFAULT_PLAN_LIMITS`, as every other limit is, made `{...DEFAULT_PLAN_LIMITS,
maxDirections: 1}` silently ignore the ceiling: the shim only fires while the
scale is unset, and the default had set it. The test that caught it was the one
already there for the old field. A fallback and a default value for the same
field cannot both exist — the default belongs in the reader.

### F69 — a rule asking the right question of too narrow a number

`Sharp internal corners` was already right about the mechanism: a cutter is
round, so where the Engine reports the widest cutter a feature admits as
**zero**, no round tool goes in there. The rule tested `= 0` and raised `no go`.

It still missed corners, and the fix is not where I first put it.

**First attempt, wrong.** Paul's note said `facts.cd.deviate.min` of zero
indicates a sharp corner, so I widened the metric to report zero where _either_
band was. He corrected it: it is `ignore.min`, and the real point was not about
which band at all.

**The actual gap is that zero is not the only sharp corner.** A band of two
tenths of a millimetre is a tool nobody owns and nobody would run if they did,
so the feature is sharp in every sense that matters on a machine. Paul's line:
_anything needing a 0.01 in tool is effectively a sharp corner._

So the rule is a **threshold**, not a test for zero — `≤ 0.254 mm` — and the
metric goes back to reporting the band exactly as stated. Where that line falls
is a shop's to draw, and it now draws it with an operator and a number it can
change, rather than my burying a definition of "sharp" inside what the metric
reports.

Two things worth keeping:

- **A right rule and a too-narrow input look identical from outside.** Nothing
  was broken, no test failed, and the rule fired correctly on every feature it
  was shown. It was being shown the wrong ones.
- **My instinct was to encode the judgement in the metric; the judgement
  belonged in the rule.** A metric that reports what the Engine said can be
  argued with. One that has already decided what counts as sharp cannot.

### F70 — three guards, each defensible, all discarding the same finding

`facts.cd.ignore.min` of zero is the Engine saying **no tool fits**. A `Wall`
whose every cutter band was zero scored **93 out of 100, easy**, because the only
rule that spoke about it was the one about depth.

Three separate places turned that into silence, and no two of them are in the
same file:

1. `cutterFromBand` skips a band reported as zero — correctly, since a
   zero-width cutter cannot be divided by — and where _all_ of them were zero it
   returned `null`, so the cutter read as absent.
2. `ratio` answered `null` for a zero divisor, so the L/D read as absent.
3. `evaluateRule` rejected any value that was not `Number.isFinite` as
   unmeasured — so **even after the first two were fixed, nothing changed**.

The third is the one worth remembering. I fixed the first two, wrote up the
finding, and never checked that the value survived into a verdict. It did not.
The same instinct — _guard the arithmetic_ — had been written a third time one
layer up, and it silently undid the fix.

**A guard against bad arithmetic is not a statement about the world.** `null`
already meant "nobody measured" here, and reusing it for "measured, and the
answer is unbounded" made the two indistinguishable in every panel downstream.
The three now agree: `null` is nobody measured, `NaN` is arithmetic that went
wrong, and **infinity is a measurement** — the worst answer there is, and one
every scale already has a band for at its far end.

**And the audience was doing the metric's job.** `Sharp internal corners` was
aimed at cavities and profiles, on the reasoning that those are the things with
corners — so the one rule named for this could not see a wall. A feature
reporting no cutter is a sharp corner whatever the Engine called it, and one
reporting nothing at all is silence, so the measurement already decides who the
rule speaks about. It judges every type now; narrowing by type only ever lost
cases.

The Wall, through the shipped set: `easy` at 93 before, **`no go` at 28** after,
with `milling-ld` and `sharp-corners` both speaking. Its datasheet is pinned as
a test, field for field.

### F71 — the panel explained the silence with the wrong reason

Worse than the bug above, and found beside it: the rule reported _why_ it said
nothing using a different comparison from the one that decides whether it
speaks.

`evaluateRule` matches a rule's audience with `sameType`, which normalises. The
silence reason in `readEveryRule` used `featureTypes.includes(featureType)`, a
strict string match. A set can carry a stored type that normalises to the
Engine's but is not identical to it — so a rule that had been **firing correctly
on `Wall` for months** reported every other kind of silence as _"other feature
types"_.

The panel said the rule was aimed elsewhere. It was aimed here and had nothing
to measure.

**A wrong reason is worse than no reason.** It sends somebody to edit the
audience of a rule whose audience was never the problem — and it hid F70 for as
long as it was believed. Two code paths answering one question is the recurring
shape in this document; this is the version where one of them is only ever read
by a human.

**This document itself is the deliverable**, more than any code in the sandbox.
If nothing else survives, §2 and §3 should.
