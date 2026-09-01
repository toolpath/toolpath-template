# The rules sheet — plan

Toolpath's engine rules (`ENGINE-TOOL-MATCHING.md`) as the starting point,
in a file a person edits, with a level per rule and an order that says what
wins. Drawn up 2026-08-29 for Paul's review; the visual version is the
"Catalog Rules Sheet" artifact. Not built yet.

## The test of the design

Every preference must be one row. Paul's four:

| Wish                                                            | Row(s)                                                                                                                                       |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Filleted pocket: exact corner radius best, smaller radii usable | `Pocket, filleted, bull nose end mill, corner radius <= floor fillet radius, must` + `…, corner radius closest to floor fillet radius, rank` |
| Prioritise the most rigid tools                                 | `*, *, L/D smallest, rank` — moved up the rank list                                                                                          |
| Longest holder, shortest stickout                               | `holder, gauge length longest, rank` + `holder, stickout shortest, rank`                                                                     |
| Default to radii 5 % under the tightest corner (load spikes)    | `*, *end mill, diameter <= largest tool diameter − corner clearance, prefer` with `corner clearance = 5 %` in knobs.csv                      |

## Mechanism

Six stations in the engine's order, per tool, per feature:

1. **Type** — the forms the feature considers (the `tool types` column).
2. **Must** — cannot cut it; removed, reported as `value vs bound`.
3. **Should** — a person may override; kept, warned.
4. **Prefer** — would cut, but; kept, sorted after everything that passes.
5. **Rank** — tie-breaks, rows read top to bottom; feature-specific rows
   beat `*` rows.
6. **Holder** — the same sheet's `holder` rows order the picker and set the
   stickout default; the reach-curve sweep is the must.

Two files beside `feature-defaults.csv` (which keeps its job — what to show,
which types to offer first):

- `rules.csv`: `feature, when, tool types, rule, level, note`. Rule shapes:
  a bound (`tool field <=|>=|= feature field [± knob|number|%]`), a form
  (`form is drill`), a rank (`tool field smallest|largest|closest to feature
field`, with `up to N % of …` caps). A row naming a field the datasheet
  does not report stands down.
- `knobs.csv`: `knob, value, unit, note` — every number once, with the
  engine field it came from: corner clearance 5 %, drill oversize/undersize
  0.1 mm, drill angle tolerance +35°/−0°, finishing radius limit 0.025 mm,
  through overcut 0.127 mm, L/D band 2, prefer drilling up to 10 mm, chamfer
  angle tolerance 0.15°, thread mill share 98 %, held share 33 %.

The list shows **Fits · With warnings · Not preferred · Removed (collapsed,
with a count)**, a one-line why per row, and a nearest-miss line when
nothing fits.

Dropped on purpose: passes/roles/presets (the person picks the pass by
picking the tool), ramping / practicality / effective-adaptive / stock to
leave (need geometry the datasheet lacks), deviation and recommendation
(the nearest-miss line instead), in-app editing of the sheet.

## Build order

| Step      | What                                                                                                            | Proven by                                                                                                             |
| --------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 1 sheets  | `rules.csv`, `knobs.csv`, parser in `shared/rules.ts`, guide `docs/RULES.md`                                    | `rules.test.ts`: every row parses; every field/knob/type exists; every knob used; every kernel type bounded or listed |
| 2 judge   | `shared/judge.ts`: `judge(tool, feature)` → removed-by, warnings, demotions, rank key; `fit.ts` reads the sheet | fixtures: cube datasheets + one per feature kind, a dozen tools, expected removed/warned/order                        |
| 3 list    | groups + why-line + rank as default sort + nearest miss in `tool-table.tsx` / `filter.ts`                       | component test on the groups; on-the-part e2e                                                                         |
| 4 holder  | `compareHolders` reads the holder rank rows; `HELD_SHARE` moves to knobs                                        | picking tests re-pinned; assembly e2e                                                                                 |
| 5 sensors | units, vocabulary, coverage, provenance note per knob                                                           | `pnpm check`                                                                                                          |

## Decided (Paul, 2026-08-29)

- **Flute length is a must** — never rub the shank. Length below holder is
  not a tool rule at all: it is the holder stage's business.
- **The holder band, in the sheet.** `held share` = the share of the overall
  length in the holder at the stickout the stack needs. ≥ `good hold` (33 %)
  is good; between `least hold` (25 %) and 33 % is possible but bad, ranked
  after; below 25 % is not compatible (`must`).
- **Default stickout, every tool** = flute length + whatever the chosen
  holder needs to give the entered clearances — the number to set the tool
  up at. Clearances are knobs: `radial holder clearance` and `axial holder
clearance`, 0.02 in (0.508 mm) each, entered by the person. The holder /
  collet list shows the stickout required, both clearances, and a flag —
  good / medium / bad.
- **Reduced-shank tools are their own quick filter** (`shank` = reduced when
  there is a real relief — a shoulder under the flute diameter with a length
  past the flutes — Paul's definition, 2026-08-30: 74 end mills in the data,
  all Kennametal; Destiny's 171 zero-length shoulders are a data question for
  the scraper); the prefer rows were later dropped by his call.
- **The 5 % corner clearance is `prefer`, and flagged.** The tool list carries
  a summary line per tool of what the sheet cares about for that feature —
  the rank rows' verdicts, in order.
- **Removed tools are hidden with a count.** A tool with no holder that
  clears the part within the band above is not shown at all.
- **Rank rows: both** — a feature's own first, then the `*` rows; refine from
  there.
- **No tool-type ranking of ours.** The tile priorities go; the defaults
  sheet's `tool types` column is the engine's type table (which forms a
  feature considers), and the engine's type preferences are `form in order …`
  rank rows in `rules.csv`. Brand priority stays, as the engine's library
  priority.

## Where it stands

Steps 1–4 are built to Paul's layout; on 2026-08-30 the list was corrected
after his review of a real part:

- **Standing**: a `should` (a geometric warning — over the tightest corner,
  a flat end on a filleted floor) now outranks a `prefer` (a preference):
  fits, then not preferred, then warned. Read the other way, tools over the
  corner sat among the merely not-preferred and, being wider, sorted above
  the ones that fit.
- **Diameter rank** is `closest to 90 % of largest tool diameter`: bigger
  is better up to the engine's cap, and past the corner the nearest to it —
  a tool over the corner is not better for being bigger.
- A flat or ball end on a **filleted floor** is warned (the engine's
  finishing type), not silently ranked.
- The **reduced-shank** prefer rows are gone; the shank is in the tool's
  name and is its own filter under More filters.
- Reasons and readings are worded **in the page's unit** (they were
  millimetres under an inch display).
- 350 tools with 3/8" shanks read `9.524999999999999` against a collet's
  `9.525` and had "nothing in the crib": the grip test now tolerates a
  hair.
- The drawing is the assembly alone, large, with the tool's numbers listed
  under it; the part section and the on-tool dimensions are gone. The saved
  strip is hidden for now (Save still writes the setup sheet).

Paul's rules of 2026-08-30, in the sheet: **terminal finishing rules for
everything** — over the tightest corner is a `must`, a flat end on a
filleted floor or a 3D surface is a `must`; **the 5 % corner clearance is
the target**, not a demotion — `diameter closest to largest tool diameter -
corner clearance` ranks, and a tool inside the 5 % is warned; **no L/D
band** — a long tool that reaches is not penalised, `L/D smallest` is only a
late tie-break; **filleted floors** rank bull nose first (exact radius, then
smaller), ball usable and last; **drills preferred up to 25.4 mm** on
pointed blind holes and through holes; flat-bottomed holes have their own
rules. The holder length rank rows are parked.

2026-08-30, after Paul's "it isn't finding a longer tool" and "the tools
in red should simply not be shown": the provisional `wall at the cut` field
and its two rows are gone. They read the curve at one offset for every tool,
while a ⌀0.093 in tool on a ⌀0.125 in shank meets the wall 0.4 mm further
out — so the sheet said "fits" and the holder sweep said "shank rubs, no
stickout clears it", on the same row. The judge now sweeps the tool's own
shank and neck against the reach curve itself (`toolCollisions`, the same
margins as the holder sweep, the card's entered clearances through
`knobsWith`) and removes what rubs, beside the type table; the reason says
to find longer flutes or a reduced shank, with a shortfall so close misses
can say by how much. Also: the part material sets the flute count only —
it was a hard term over the vendors' material tags, which 799 tools do not
state, hiding fitting tools while the close-miss fill ignored it; the fill
now stays inside the chips (`closeCandidates`), and the list header says
how many fitting tools the filters hide. The default stickout is the
sheet's: `least stickout` (12.7 mm), `stickout step` (3.175 mm) and `metric
stickout step` (3 mm), read by name in `holder-choice.ts`. The filters sit
open in the left column again.

Built 2026-08-30 (Paul: "tools with no compatible holders should not be
shown in the list — make sure you stop doing this"): every tool that fits
gets its holder options before the list is cut to ten, and a tool with no
option better than _bad_ — nothing grips its shank, or nothing clears the
part at a stickout it allows with at least the least hold — is not shown,
in the best or in the fill; the header counts them ("N with no holder that
clears"). `canBeHeld` in `holder-choice.ts`.

The drawing (2026-08-30, Paul's reviews): beside the stack, the wall the
sweep read — the part wall at the cut, the reach curve's staircase, the room
wanted dashed — and two clearances, each at its own tightest point: **up**,
from the wall under a part to that part (the sweep's verdict, so a gap
exactly the room is a pass), and **sideways**, from a part's edge to the
wall face standing taller than it (a different part, often). Readouts sit
in a column at the right with leaders. A collision reads negative up, and
nothing sideways. `shared/drawn-assembly.ts` builds the stack once for the
card and for the viewer's **wrench toggle** (`components/assembly-model.tsx`):
the same outline lathed into the scene, off by default, standing where the
holder has the least clearance on this part — the reach curve does not say
where on the feature its worst case lies, so `shared/worst-spot.ts` finds
it from the mesh: the stack's steps swept against the nearby part triangles
at every candidate tip on the feature's floor (vertices and centroids,
capped at 160), the worst axial-or-radial slack wins, tip at `zMin`. The
wrench hides the direction arrow while it is on. The wall's linework keeps
every sampled rise (`wallCorners` drops only float noise) and draws a run of
closely spaced corners as a Catmull-Rom spline, big rises as sharp joins
(`wallPath`) — so a fillet reads as an arc and a wall as a wall; thinning to
chords had turned a fillet into a chamfer, and Paul said so.

**The matching's behaviour is pinned.** Paul, 2026-08-30: "tool matching is
working pretty well right now so let's make sure we keep the behavior."
`app/shared/matching.test.ts` is the lock — one fixed crib of fourteen tools
against eight kinds of feature, asserting the whole list: every tool, in
order, with its standing. `judge.test.ts` still covers the rules one at a
time; this says what they add up to, so a changed row or knob shows up as a
named tool moving rather than as a silent reshuffle.

Parked: the holder rank rows; the saved-assemblies view; step 5 sensors.
