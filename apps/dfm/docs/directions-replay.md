# Replaying the directions work — the clean order

The sandbox took eighty commits to reach six hundred and sixty-seven unit tests
and eighty-six end-to-end tests. **Roughly a third of those commits undo the other
two thirds.** This is the same work with the wrong turns removed: what to port,
in what order, what to watch for at each step, and what not to try.

Read with [directions-parity-plan.md](directions-parity-plan.md) for what the
page _is_, and [directions-parity-findings.md](directions-parity-findings.md)
for why each warning below exists — findings are cited as **F1**–**F67**.

**Steps 1–9 are the plan.** Step 10 is what using the app on a real part asked
for afterwards, and it is not optional-feeling once you have seen a part with
sixteen identical holes on one face. **Steps 11–15 are past the plan
altogether** — the plan assumes a reading is cut whole from one way up, and
everything from 11 on is what happens when that stops being true. Each is
shippable on its own, and 15 is where staging into another codebase should start
rather than end. See [staging.md](staging.md).

> **The patches in `~/dev/directions-patches/` are not this order.** They are the
> history including its mistakes: `0003` adds a Directions route and `0004`
> reverts it; F32, F34, F35 and F36 are four successive fixes to one function.
> Replaying them re-lives all of it. Use them as reference for _what the code
> ended up being_, and this document for the order to write it in.

---

## Before anything

### The loop you will run a hundred times

Everything below is verified from `apps/part-viewer`. Nothing needs AWS, Docker
or the database — the app is a client-rendered SPA that talks to
`api.staging.toolpath.com` with the user's own key.

```sh
pnpm --filter @toolpath/part-viewer dev --port 5173   # the app
npx tsc --noEmit -p tsconfig.json                     # types, ~10 s
npx vitest run                                        # 506 unit tests, ~2 s
npx vitest run app/shared/hole-groups.test.ts         # one file, sub-second
npx playwright test                                   # 47 end-to-end, ~40 s
npx playwright test tests/mapping.spec.ts -g "narrows"  # one test
```

`vitest` is fast enough to run whole after every change. `playwright` is not —
run the one spec you are touching, and the suite before committing. **Check exit
codes before committing, not after**: one commit went in with a failing suite
because both ran in the same shell line.

### How the tests are arranged, and why

| Where                       | What belongs there                                                                                            |
| --------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `app/shared/*.test.ts`      | Everything pure. The bulk of the value, and the part that ports with no changes at all                        |
| `app/components/*.test.tsx` | Only components that avoid `@toolpath/ui` — anything else dies inside React under vitest (F45)                |
| `tests/*.spec.ts`           | Playwright, against a hand-built report. The only place the datasheet, the summary and the viewer are covered |
| `tests/part-fixture.ts`     | The shared report builder — `feature`, `hole`, `faces`, `report`, `openPart`, `openFeature`                   |

`tests/part-fixture.ts` serves one report as a single SSE `analysis` event and
opens the inspector straight on it — no upload, no mesh. The upload and
connection specs deliberately do **not** use it: they test the path it skips.
Build fixtures by hand in the Engine's wire shape; do not import captured JSON
(F15).

Two test shapes that caught bugs nothing else would:

- **Re-render tests**, for anything about focus. Firing events cannot catch a
  component that remounts every row.
- **Part-sized tests**, for anything about termination or cost. Everything in the
  sandbox ran on parts of three to twenty-six faces, where non-termination is
  unreachable and quadratic behaviour is invisible. `app/shared/perf.test.ts` is
  108 faces and 156 readings and found both instantly (F36).

### Traps that are not about the code

- **Rebuild `@toolpath/viewer` after any change to its `src`.** The app runs
  its `dist`, and types resolve there too — so the build, the types and every
  test stay green while the running app executes the old code. One feature was
  dead for a day this way (F51).
- **No end-to-end fixture mounts a mesh** (`hasMeshGlb: false`), so nothing
  about what the part _looks like_ is covered by the suite. Verify paint by
  looking at the part (F51).
- **Restart the dev server after touching `routes.ts` or `styles.css`.** Both
  wedge it while leaving the build, tests and types completely clean. It cost
  two round trips and one "blank black page" panic (F12).
- **Read `docs/inference.md` in the picker, whole.** 158 lines, every rule a
  reported bug, none guessable from the code. It was missing from the plan's
  source list and is the most valuable document in it (F23).
- **`@toolpath/viewer` is two different packages.** The picker's is private
  v0.0.0 (`core/ api/ react/`); this repo's is published v0.3.1 (`render/
engine/`). The inventory's Status column was written against the picker's, so
  **"Built" can mean "built somewhere else"** — rows 9, 12, 14 and 15 all cite
  paths that do not exist here (F25).

---

## 1 — The model

Port `src/setups/setups.ts` and `src/setups/directions.ts` whole. Nothing
renders. **Half a day, and the cheapest part of the job.**

| Do                                                                                                  | Because                                                                                                                                                               |
| --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Swap three import lines: `Vec3` from `@toolpath/api`, `PartFeature`/`PartReport` from `./contracts` | The types are structurally identical. There is no mapping layer to build (F1)                                                                                         |
| Rename `feature.tag` → `feature.featureTag` throughout                                              | The picker normalises its reports; this app consumes the raw wire shape (F6)                                                                                          |
| **Narrow signatures immediately** — `PartFaces = Pick<PartReport, 'regions'>`                       | The app renders from `PublicInspectionReport`, which strips presigned URLs. A function demanding a whole `PartReport` is uncallable from the page that needs it (F14) |
| Export `directionKey` and `kindOf` from `report.ts`                                                 | Both are private helpers that two panels will need. Doing it now avoids a later change to unrelated files (F7)                                                        |
| Avoid `toSorted`, `findLast`, and friends                                                           | This repo targets ES2022; the picker targets ES2025. It passes `vitest` and fails `check-types`, which is the slower place to find it (F7)                            |
| Build fixtures by hand, in the Engine's wire shape                                                  | Do **not** import the picker's captured JSON. The data is this app's; a foreign report tests that codebase's normalisation too (F15)                                  |

**On the tests:** roughly a third of the picker's `setups.test.ts` builds its
plans by calling `generate`, which does not exist yet. Hand-build equivalent
covering plans rather than deferring those tests — the invariants they check
(de-duplication by region, the ≤1 ceiling) are the ones that matter most (F8).

---

## 2 — The Directions tab

A **tab** beside Inspector and Rules. Not a route.

- The picker's Directions _is_ a view beside Inspect and Rules, and the report
  here is component state from one SSE subscription with no cache — a sibling
  route re-opens the stream on every visit (F9, F13, F16).
- **Two existing tests assert the tab does not exist**, in different files. Both
  must be updated. They read as regressions and are the opposite (F11).
- Left column: coverage bars per pass, then the confirmed directions, then what
  is not cut.
- **Count faces, never readings.** A face is reported from every way up that
  reaches it, so most readings must lose. Counting readings makes a finished
  arrangement read as mostly unmapped (F31). Coverage and "not cut yet" measure
  the same thing and must agree.
- Faces **no reading reaches from any direction** are a gap in the _analysis_.
  Name them separately or an arrangement looks incomplete for something no
  arrangement could fix.
- **Set the font size on the container, not the row.** `styles.css` has an
  unlayered `button { font: inherit }`, which beats Tailwind's layered
  utilities — text-size classes on a `<button>` do nothing (F20).

> **Do not build PR 2a as specified.** "The direction list, read-only" shows
> nothing on an empty plan, and three of its four inventory rows mutate the
> plan. Merge 2a and 2b (F10).

---

## 3 — Assignment

`setPassFor`, the pass buttons, the keys.

- **One update per press.** `setPassFor` takes a _list_ of passes and applies
  once. Two `setState` calls from one snapshot lose the first — "Both" set
  finishing and dropped roughing in the picker.
- **Judge a group across the group.** Where every reading is already cut there,
  pressing takes them all off; where some are not, it puts the rest on.
- Put the pass buttons on **the reading being read**, not only on the
  multi-reading candidate list. A feature with one reading is the one most worth
  mapping, and it was unassignable for a day (F19).
- Rank the readings of a face: **what the plan already cuts**, then **square ways
  up** (±X/±Y/±Z), then as the click ranked them. Off-axis wants a fifth axis and
  should not be a default.
- **Keyboard at the window, not per list.** R/F, A or B, X. The `data-keynav`
  guard must cover **arrows only** — guarding every key means the row under the
  keyboard, which is almost always inside a list, never receives one.
- **X prunes an offer and only an offer.** A key that quietly unmakes a decision
  is a plan that changes when a hand brushes the keyboard.

---

## 4 — Map features, and the two pick modes

The biggest single step, and where most of the interaction lives.

- **Row components at module scope.** Defined inside the panel they are a new
  component type every render, so React remounts every row — and arrowing onto a
  row reads it, which re-renders, which destroys the focus that just moved. The
  keyboard does nothing at all and nothing in the types or a fired-event test
  says so. **Only a re-render test catches it.**
- **Multi-pick means two different things.** Inspecting, holding two faces asks
  what they are both part of — the **intersection**. Mapping, the faces need not
  share a feature — **gather** them. Narrowing while mapping empties the list
  exactly when somebody is accumulating work into it.
- Group the readings **by way up**, and make the group header a control: it
  lights what that direction would cut, and its R/F/Both act on the whole group.
- **Painting paints the reading, not the face.** With a direction held, a click
  is not asking about a face — a feature is one operation, so the whole reading
  goes on or comes off (F24).
- **Painting gets its own colour.** Routing it through the picked-face highlight
  paints two meanings in one hue and neither can be told apart. Orange for
  painting, violet for an offer, and the **selection palette follows the wash** —
  warm over the cool direction cycle, cool over the warm difficulty ramp (§3.5).
- **One clearing path.** Escape, empty space and closing the datasheet must all
  go through the same function. Four separate stuck-highlight bugs came from
  "N places set it, N−1 clear it".
- **Choosing from inside the face list must not clear the list.** Naming a
  feature from a list _about the plan_ asks a fresh question; naming one from
  inside the face list answers the question that list is asking. §3.2 says this
  shipped broken twice in the picker; it broke a third time here.

---

## 5 — Painting by direction

- Put `directions` back in `PAINT_MODES`, **pointed at the plan** — colouring by
  the Engine's reported direction paints a decision nobody made. A face with no
  colour is a face nothing cuts.
- **Difficulty must follow the plan too**, or the gentlest reading of a face wins
  and the part reads as easier than the plan makes it (F29).
- Pass toggle beside the modes, and only while they mean something.
- Two tests pin the mode's deliberate absence and must be inverted (F27).

---

## 6 — The four cheap generators

`planFor`, then `required only`, `required, filled`, `from toolpath`, `by hand`.
Small and mechanical — about a third of one PR, not the 450 lines the plan
budgeted. **They depend on nothing but step 1**; the plan sequences them after
the workflow and that dependency is not real.

Guard: **undercuts are never volunteered**, by any generator or by inference,
unless the face has no other reading anywhere.

---

## 7 — Inference

Read `docs/inference.md` first. Then:

- **Nothing is inferred until Infer is pressed; nothing is assigned until a pass
  is pressed on a row.** Both halves shipped broken in the picker.
- **An offer is a set of faces, not a set of readings.** Pruning a face
  re-covers the rest. Holding readings makes enabling one wall summon the
  profile containing it.
- Build smallest-first, **then a rescue pass** for what the small readings
  blocked — a two-face fillet taken early otherwise blocks a twelve-face pocket
  and eleven faces come back uncovered.
- Violet for the offer, green for the one being read. Right-click reads a
  reading without changing the offer; a peek with **no list on screen does
  nothing**, because guessing one of a face's readings is the silent best guess
  §3.8 forbids (F28).
- X / Delete / Backspace prune **and keep the keyboard's place**.

---

## 8 — `byBestReading`, on its own

**All of the remaining risk is here.** ~470 lines. Give it its own step and its
own review.

**Write the part-sized performance test in the first commit.** Every test in the
sandbox ran on parts of three to twenty-six faces, where non-termination is
unreachable and quadratic behaviour is invisible. A 108-face part with 156
readings found both instantly (F36).

The rules, each of which was a bug first:

| Rule                                                                     | Without it                                                                                                                                                   |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Fill free ground **before** judging any swap                             | A 26-face reading scoring 58 displaces a 14-face reading scoring 80, for twelve faces something better was about to take                                     |
| Judge a swap on **net gain over the whole swap**, not dominance per face | A 3-face wall scoring 74 is refused entirely because two of its faces are better served, and the face it _was_ best for falls to a 1-face reading scoring 40 |
| Value stranded ground at its **best remaining answer**                   | A big mediocre reading becomes unassailable — the bigger it is, the more it appears to cost to displace                                                      |
| **Coverage before quality**, but only once free ground is exhausted      | Either the arrangement trades coverage for average, or it never takes anything on an unjudged part where every score is zero                                 |
| Count operations on **both sides** of a swap                             | One reading displacing one nets to nothing, and ten such swaps quietly turn one operation into eleven (F37)                                                  |
| **Bound the rounds**                                                     | The estimate that values stranded ground is a _prediction_, and a hill-climb whose objective is a prediction does not terminate. This froze the page (F36)   |
| Keep a **reverse index** of reading → faces held                         | Finding "everything this reading holds" by scanning the model is quadratic inside a fixed point                                                              |

Two orderings that look like one question and are not: **which reading cuts a
face** (score, then band) and **whether a way up is worth its re-fixture**
(score-weighted area). Conflating them was a bug in each direction.

**Known open — do not expect to close it on the way past.** Neither allocator
covers a part alone: over the same three directions `planFor` reached 70% and
`byBestReading` 72%. The one that covers decides badly; the one that decides well
leaves ground uncut. Sweeping first and arguing around it reaches 100% and keeps
every mistake the sweep made; arguing first leaves nothing for the sweep to fix.
Both were tried and reverted (F42). **Required only → Fill from current remains
the better answer on parts that force few directions.**

---

## 9 — The plan limits, as rules

These have since become **plan rules** in the rules list — see interactions §16.
What follows describes the shape they had when the replay was written:
`maxDirections`, `newDirectionGain`, `operationCost` — a ceiling on ways up, what
a re-fixture must earn, what one more cut must earn. They belong in the rules
panel: numbers a shop sets that change what the app decides.

**They were never passed to the generators** in the sandbox until the last day,
so every arrangement was built against the defaults and a limit somebody had set
was silently ignored. Wire `ruleSet.plan` through from the start.

**Not a bug, and settled.** A refusal past two ways up is exceeded where the
geometry forces it: a wall is a statement about _choices_, and a forced
direction is not one — the only thing that reaches an undercut cannot be
declined without leaving the part uncut. What was wrong was the silence, and
the rules panel now reports how many setups were forced past the wall.

---

## 10 — What a real part asked for

None of this is in the plan. All of it came from opening a part with 420 features
and finding the panel unusable in a specific way. **Do it in this order** — each
step is small, and the later ones assume the earlier.

### 10a — Identical holes are one row (F44)

The single biggest change to how the panel reads. `hole-groups.ts` is 200 lines
and pure; write it and its tests first, then the row.

- **Group on the way up, the diameter and the depth. Nothing else.** A hole and a
  pocket sharing a diameter are not one job.
- **Depth is a tolerance, not an equality** — a twentieth, floor of a hundredth of
  a millimetre. The same drill through a curved face reports 1.036 and 1.052.
  Matching exactly split one group in two on a real part.
- **Two grouping functions, and they are not interchangeable.**
  `groupAcrossPart` for the by-face candidates, which hold the readings of one
  _face_ and so see one hole of sixteen; `groupHoles` for any list that is an
  answer about a set — the painted faces, the offer, Unmapped. Reaching across
  the part in those offers holes nobody painted.
- **The row is the group and it opens.** One press maps all sixteen; opened, each
  hole reads, lights and presses on its own.
- **Put `data-holes` on the row.** The assign keys are handled once at the window
  and only see the DOM. Do not re-derive the group there — the two lists group by
  different rules.
- **Add `alone` to the selection state.** A hole named from inside its opened
  group is the one place somebody said _this one_; without the flag the part
  lights the other fifteen.
- **A group reads as focused when any of its holes is.** Comparing against the
  first one leaves a click on the ninth hole lighting no row at all.
- **Name it as the several it is** — "Blind holes ×16", count immediately against
  the name. A singular in front of a count makes the reader correct it, and a
  count pushed out past the tool and the face count stops being part of the name.
  `pluralLabel` is English's regular rule and nothing more; every type the Engine
  reports is a plain noun phrase.

### 10b — What is not cut, as a third thing the panel does

`Unmapped` sits in the same group as the two pick modes, not beside them: it is
not a filter laid over a mode, it is a third answer to one question, and exactly
one of the three is lit.

- **One tint for all three.** Amber is this app's colour for a filter — a
  narrowing with a flag saying so. Giving Unmapped its own colour said there were
  two kinds of thing in a row of three (F48).
- **By face is drawn first**, because it is where the page opens: By direction
  needs a way up held before a click paints anything, so it cannot be the mode
  somebody arrives in.
- **No count on the button** (F47). The honest measure of what is left is faces;
  the list under the button is readings. Say it in the Directions tab, in a
  sentence with room to name its unit.

### 10c — Holding a way up narrows what is left

`activeDirection` already scopes what a click on the part resolves to. Make it
scope the Unmapped list too — that was the one list ignoring it. "What is not
cut" and "what is not cut _from here_" are the two questions somebody planning
asks.

Two things follow, and both are about keeping the gesture reachable:

- **Entering Unmapped puts the arrows on screen**, the same reason By direction
  does: a mode whose only gesture is invisible is one nobody starts.
- **Holding one must not narrow the arrows to it while Unmapped is showing.**
  Everywhere else that narrowing is right. Here the arrows _are_ the control, and
  one that vanishes after a single press cannot choose a different way up.

**Do not add a flag to the panel.** The viewport already carries one with its own
Clear (F48). And say "+Z has nothing left unmapped" rather than showing an empty
list under a filter, which reads as a broken filter.

### 10d — Three states for the arrows (F43)

All → Confirmed → Off, and round. The cycle **narrows** all the way through; one
that widened halfway is one nobody can press without watching.

- `DirectionArrows.shownDirection` in `packages/viewer` has to widen from
  `number | null` to `number | readonly number[] | null`. One prop, not a plural
  beside the singular — two would need a rule about which wins.
- **Confirmed means the plan's setups plus whatever is being read.** A reading's
  own direction is part of the answer whether or not the plan has claimed it;
  dropping it makes clicking a feature take its arrow away.
- **Holding still narrows to one, in any state.**
- **Confirmed with an empty plan draws nothing**, deliberately. Falling back to
  all of them is the toggle refusing the state it was put in. What makes that
  legible is the button carrying its state as a **word** — one tint can say on
  and off, and there are three.
- Read `arrowsVisible` **off** `shownArrow` rather than deciding the same
  question again. They were two functions computing one picture and would have
  drifted the first time an empty set appeared.
- Call it `confirmed`, not `active` — `activeDirection` already means the way up
  being held, and one word for both makes every sentence about arrows ambiguous.

---

## 11 — A claim takes faces, not readings (§10 of interactions.md)

**The change everything after this depends on, and the one that reverses a rule the
other documents state plainly.** Do not start it without reading F49.

Before: claiming one wall of a twelve-face profile unassigned the profile outright,
and eleven faces silently left the plan. After: the profile gives up that one face,
keeps the other eleven, and carries a note of what it lost.

- `Assignment.without` — what a reading gave up, per pass. Absent means "all of it",
  so a plan a generator wrote is shaped exactly as before.
- **`cutRegions` is the one function to ask** what a reading cuts. Every place that
  read `feature.regionIdxs` for that question is now a bug: coverage, the claimed
  set, what is not cut yet, and all five paint layers.
- A reading cutting nothing is unassigned outright, note and all.
- Its pass buttons read `mixed` — dashed, not filled. Pressing dashed takes the rest
  back; pressing lit lets go (F52, F53).

**The cost, stated:** a reading cut on part of itself is not one CAM operation. Every
other document here says whole readings only and means it. What buys it back is that
the old behaviour silently discarded work.

## 12 — The face editor (§11)

The face count becomes a **control** in every list. Pressing it opens that reading's
faces in place of the datasheet.

Order matters here — these went wrong in sequence and each fix depended on the last:
paint faces and never features while it is open (F50), give the face layer a colour
of its own (F51), make a face-level press move **one face** (F54), then the tick.

- **The tick means both passes, and reads both.** It writes both, so reading one left
  a face this reading finishes sitting unticked in its own editor (F63).
- **One highlighted row** — the one being worked on. Cut rows carrying a fill of
  their own means every line lit the moment it opens (F62).
- **Add a face**: a reading can be handed a face it does not cover.
  `Assignment.also`, the exact mirror of `without`. The face's row must list the
  reading it was added to, or the only row shown is the Engine's and pressing it
  undoes the add.
- **`faceCounts` is the one function** for the number four lists show (F64).

## 13 — Drawing a reading the Engine did not report (§12)

`make-feature.ts`. A four-step panel: way up, faces, type, passes. Then chain
selection, the perimeter, and continuity from real mesh adjacency (F59 — the
co-membership proxy is wrong and looks right).

**Build the Profile button early.** It fills the faces from the Engine's own contour,
which is the one seam that makes the whole flow drivable without a mesh, and it is
how F60's four bugs were finally found.

A made reading opens its **datasheet**, not its faces — the opposite looks like a
design decision and is really a lookup in `report.features` instead of
`part.features`.

## 14 — Machining several readings as one (§13)

**Do not build a mode for this.** The selection is By direction's, unchanged — merging
is a second thing to _do_ with readings already chosen, and every step you design for
it will be a re-implementation of something that already exists (F66). Its whole state
is the passes.

The arithmetic is `worst-case.ts`: deepest floor, highest top, summed area, tightest
corner, smallest bore. The derived rows come out right on their own.

**Mark it as ours.** `derivedHere` on every datasheet the app computes, a plain
warning on the panel, and the raw sections must drop the word "API". The rules are
given the _report_, not the part, so no verdict is ever computed over arithmetic.
`withEngineDatasheet` is the seam where a real analysis lands.

## 15 — Test what a click on the part means

**Do this first if you are staging rather than replaying.** Every fixture in the
sandbox built a report by hand with `hasMeshGlb: false`, so picking, the region
attribute, the highlight layers and every panel behaviour beginning on the part were
hand-verified only for the whole of steps 1–14. Three of the bugs in the findings
reached a user because nothing could catch them.

`tests/cube-fixture.ts` mounts the viewer package's own cube through the same API
routes the app calls: six planar faces, four ways up, twenty-four readings, one real
GLB. Seven tests over it cover what no other spec can reach.

Two notes on writing them: scan the **face** points off the rendered canvas once and
comment what each one hits; find the **arrow** at run time, because it floats outside
the part along its direction and the camera is one view-cube click away from
somewhere else.

---

## What not to do

Each of these was built and reverted. They are plausible, which is why they are
worth naming.

| Don't                                                     | Why                                                                                                                                                                                                                                           |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A standalone Directions **page**                          | The picker has no such thing. Its Directions is a view whose left column is the setups panel (F13)                                                                                                                                            |
| A **PR 0** for a type-mapping layer                       | Three import lines (F1)                                                                                                                                                                                                                       |
| **Checkboxes** for a second multi-selection               | They select without reading, as the spec asks, and feed only a bulk action a row's own buttons already do                                                                                                                                     |
| Seeding `from the rules` with a **swept plan**            | Passing it as `keep` freezes its mistakes; making it improvable trades one part's quality for another's (F42)                                                                                                                                 |
| Tying the **sliver floor** to `newDirectionGain`          | Raising the improvement price to consolidate then also blocks the directions needed to cut the part at all — three setups and 72% coverage (F39)                                                                                              |
| A **count on the Unmapped button**                        | The button's honest measure is faces, the list under it is readings, and one word over two numbers is a figure somebody has to be told how to read (F47)                                                                                      |
| A **filter flag in the Map features panel**               | The viewport already has one, with its own Clear. A filter switched on from the part must be clearable from there (F48)                                                                                                                       |
| ~~**Component tests for anything using `@toolpath/ui`**~~ | **No longer true.** `face-list.test.tsx` renders a component importing the kit and passes. F45's two-Reacts failure does not reproduce; component tests are the cheapest coverage available and several of the newer ones are component tests |
| A **mode** for merging                                    | The selection already exists. Every step designed for it re-implements By direction, and the draft ends up carrying a second copy of the way up and the readings (F66)                                                                        |
| Judging a **made** reading with the rules                 | Its numbers are the app's arithmetic, not a measurement. A verdict over them appears in the same band, colour and summary as one about geometry the Engine looked at                                                                          |

---

## Mechanical traps that cost real time

- **Prettier reflows lines, and text-based edits then miss silently.** Three
  times; once it shipped a runtime crash that `tsc` could not see, because the
  old symbol still existed. After a rename, `grep` for the old name.
- **Test files disagree about `it` versus `test`.** Match the file you are
  appending to. Three slips.
- **Check exit codes before committing, not after.** One commit went in with a
  failing suite because both ran in the same command.
- **`toSorted` compiles in the picker and not here.** ES2025 versus ES2022.
- **An apostrophe inside a single-quoted test name is a syntax error**, and the
  failure is an esbuild transform error pointing at the line, not a test failure.
  Cost one round trip.
- **`getByText` in Playwright is a substring match and strict about duplicates.**
  Asserting on visible text is how the duplicate filter flag was caught (F48), so
  this is a feature, but expect the strict-mode violation rather than a miss.
- **`reduce(Math.min)` is `NaN`, silently.** `reduce` hands the callback four
  arguments and the fourth is the array. No type error, no exception — the whole
  merged datasheet came out `NaN` (F65). Never pass a variadic function straight
  to `reduce`, `map` or `forEach`.
- **A component declared inside a render loses clicks**, not just performance. A
  `click` needs mousedown and mouseup on the same element, and the element is
  replaced on every render — so any render mid-press swallows it while the
  button stays in the tree and reports enabled (F67). Two sessions.
- **A `window` listener's dependency array is not about staleness of render.** A
  missing dependency there is a stale _closure_ that keeps answering with state
  as it was at mount. Escape's new rungs silently did nothing.
- **An empty `Map` is truthy.** Guard on `.size`, not on the object (F60).
- **The list's labels are sentence case and the datasheet's are title case.**
  `typeLabel` gives "Blind hole", `featureSummary` gives "Blind Hole". A
  case-sensitive locator matching one will not match the other.

---

## What actually finds the bugs

Ranked by what worked in the sandbox:

1. **Using the app on a real part.** The two-press sequence beating the one-press
   generator is a fact no test would have produced.
2. **Pulling the real report and measuring.** `/v1/parts/{id}` plus
   `/v1/parts/{id}/features?ids=…` in batches of 50 for the datasheets — without
   them every rule says nothing and every score is zero. Reproduce, then measure.
3. **Re-render tests**, for anything about focus.
4. **Part-sized tests**, for anything about termination or cost.

Reasoning about the algorithm without measuring was wrong more often than it was
right — the operation cost, the direction ceiling and the sweep-first fix were
all confidently argued and all disproved by a single run against a real part.
