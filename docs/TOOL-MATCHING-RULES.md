# Tool matching rules — Justin's catalog's, written out for review

> These are Justin Gray's rules over the Engine's facts. **Toolpath's own**
> rules — what app.toolpath.com's engine does — are written out in
> [ENGINE-TOOL-MATCHING.md](ENGINE-TOOL-MATCHING.md), with the proposal for
> simplifying them into this catalog.

How Justin Gray's tool catalog (`~/dev/justins_tool_catalog`, `apps/web/src/data/`)
turns a kernel feature into the tools that can cut it. Recorded 2026-08-29 as
the candidate rule set for this application; the last section says where this
application differs today. Every number below is in millimetres.

## 1. A feature asks for a requirement, not a tool

For each feature, the kernel's `facts.kind` — never `featureType`, which is an
open set — decides one or more **requirements**: an approach, the cutter
classes that can answer it, and bounds read straight off the datasheet, each
carrying the field it came from. A feature with no datasheet, or a kind the
bridge does not know, is **refused** and shown as refused — never silently
dropped.

| `facts.kind`             | Approach            | Cutter classes                                                                                       | Bounds                                                                                                        |
| ------------------------ | ------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Hole                     | drill               | drill                                                                                                | ⌀ ≤ `maxDrillDiameter`; flute length ≥ hole depth; reach                                                      |
| Hole                     | helical interpolate | flat end mill, bull nose end mill                                                                    | ⌀ ≤ `maxEndmillDiameter`; reach                                                                               |
| Pocket, sharp floor      | mill                | flat end mill                                                                                        | ⌀ ≤ `cd.ignore.min`; reach                                                                                    |
| Pocket, filleted floor   | mill                | bull nose end mill                                                                                   | ⌀ ≤ `cd.ignore.min`; corner radius ≤ `cd.terminalCornerRadius`; reach                                         |
| Face                     | mill                | flat end mill                                                                                        | ⌀ ≤ `cd.ignore.min`; reach                                                                                    |
| Wall, Profile, Boss      | mill                | flat end mill, bull nose end mill                                                                    | ⌀ ≤ `cd.ignore.min`; reach (cut by the side, so the floor form is free)                                       |
| Three (surface / fillet) | finish              | ball only if `useOnlyBallToolsForFinish`; else bull nose if `toolFit.cornerRadius` ≥ 0.01, else flat | ⌀ ≤ `toolFit.toolDiameter` (falls back to `cd.ignore.min`); corner radius **≥** `toolFit.cornerRadius`; reach |
| Chamfer                  | chamfer             | chamfer mill                                                                                         | angle ≥ `bevel.angleDeg`; reach                                                                               |
| Tslot                    | undercut            | t-slot cutter                                                                                        | ⌀ ≤ `maxEntryCd`; reach                                                                                       |
| Dovetail                 | undercut            | dovetail cutter                                                                                      | ⌀ ≤ `topOpeningWidth`; angle ≥ `taperDeg`; reach (unverified against real output)                             |

Rules inside the table:

- **A hole offers both approaches at once**, because `holeProcess` reads
  `Automatic` on every real hole. The drill approach is the only one that
  demands flute length ≥ depth: a mill helixes or steps down.
- **The kernel's hole arithmetic**, measured exact on 78 holes and pinned by a
  test: `maxDrillDiameter = diameter + 0.0254` (a thousandth of an inch of
  oversize — the drill is nominal) and `maxEndmillDiameter = 10/11 ×
diameter` (the helical clearance ratio).
- **The diameter cap from a `cd` band is its `min`, not its `max`.** `min` is
  the largest tool that reaches every point of the feature; `max` is the
  largest that fits somewhere, and it bounds nothing. `max` is never turned
  into a minimum diameter: a smaller tool always fits.
- **The band is `ignore`** — the tightest of the three: the tool has to fit
  without deviation. A sharp inside corner makes `ignore.min` zero, nothing
  matches, and the app says so rather than offering a cutter that leaves a
  corner the part does not have. Which band a _roughing_ pass may consume is
  an open question and is not emitted.
- **A floor fillet below 0.01 mm is a numerical artifact**, not a corner the
  tool must carry (real fillets start at 2.5 mm; the artifacts are 0.00127).
- **Reach is measured from the stock surface, not the feature's depth.** The
  part's bounding box is projected onto the machining direction; the entry
  surface is at the projection's maximum (verified: every top face sits there);
  reach = entry − `zMin`. On the sampler part the two differ by up to 72.8 mm.
- **Corner radius on a surface is a minimum** (`≥`): the kernel's
  `toolFit.cornerRadius` is the nose it wants against the surface, and a
  flatter tool leaves a cusp. On a pocket floor it is a maximum (`≤`): a bigger
  corner cannot sit in the fillet.

## 2. A tool satisfies a requirement, or it does not

- The tool's type must be one the cutter class maps to. The map is one table
  (`CATALOG_TYPES_BY_CUTTER_CLASS`); a class no tool in the catalog answers
  yields an honest empty result, never a widened search. A test fails if a
  scraped tool type is neither reachable through the table nor listed as
  deliberately unreachable (taps, until the kernel detects threads).
- Every bound is checked in millimetres, **converting** each tool's stated
  dimension whatever its label says — a 3/8" shank really is 9.525 mm. (The
  browsing filters refuse to convert, for the opposite reason: interleaving
  0.25 in and 6 mm in a size column is wrong by 25.4×. Same data, two correct
  answers, two functions.)
- **A tool missing a dimension the requirement constrains does not fit.** A
  null is the absence of an answer, not a pass.
- No tolerance on the bounds: every one is an inequality against a computed
  cap, so conversion error cannot flip a fit. (The one equality in the system —
  a bore chuck against a shank — carries a 2 µm epsilon, sized from the data.)
- A **near miss** — right kind, fails on exactly one bound — is reported with
  the shortfall ("0.05 mm too wide", "3 mm short of reach") so an empty
  result says whether to re-read the model or order a tool. It is never a
  result, never counted, never selectable. A tool that misses on more than one
  bound is not a near miss; a tool missing a dimension has no distance.

## 3. Ordering what fits

- The fit set is not ranked by the data layer; the catalog's own order is
  returned, and ordering lives behind a control the user can see.
- The default order is **the biggest cutter that fits** — fewest passes when
  milling; for a drill it is also nearest to nominal, which is arithmetic
  because the cap is `diameter + 0.0254`. Alternatives: shortest reach,
  smallest, catalog order. Compared in millimetres across unit systems; each
  row still displays in its own unit.

## 4. Preference is not requirement

Two kinds of narrowing, rendered differently so a preference never reads as
"the catalog has nothing":

- the **requirement**, from the kernel, shown with the datasheet field that
  produced it, not negotiable;
- the **preference** — type (drill vs mill a hole), brand, flute count,
  material index, unit system, product family, free text — the user's own,
  always relaxable, sticky across features and parts.

Dimension ranges are deliberately **not** preferences: the kernel has already
said what diameter, reach and corner radius must be, and a second diameter
control beside a derived cap invites fighting the geometry with a slider.

## 5. Identical features are one job

Features whose derived requirement is byte-identical (cutter classes, bounds,
provenance, and `featureType`) collapse into one row; choosing a tool for the
row chooses it for every feature in it. Nothing is rounded: two holes that
differ in the twelfth decimal are two rows, and that is the safe failure.
`minReach` and `minFluteLength` stay in the key — a tool that reaches 8 mm
does not reach 40. Refusals are rows too, sorted last.

When several readings are cut as one (the DFM's `worst-case.ts`), the combined
datasheet takes the **harder** answer per field: lowest floor, highest top,
smallest `cd.min` / `maxEndmill` / `maxDrill` / `maxEntryCd` / bore /
fillet, areas summed; a field nobody reports is not invented.

## 6. A tap's hole

Kennametal publishes no tap-drill size per part, only the formula (their
calculator, read verbatim): inch `major − engagement% × pitch × 0.013`, metric
`major − engagement% × pitch / 76.98`; a blank engagement is a 100 % thread,
`major − pitch`, the hard bound the drill list stops at. **75 % engagement is
this app's default and is labelled as one.** Every candidate drill shows the
engagement it actually gives rather than one drill being presented as _the_
answer. Forming taps are not implemented — none in the catalog.

## 7. Non-ferrous

A family flagged non-ferrous drops both ferrous cutting-data presets, and a
test re-reads the vendor's own `Material Groups` facet and fails if such a
family turns out to be indexed to a ferrous group after all. Config states the
fact; a test proves the data still agrees with it.

## Where this application differs today

- Ours applies `maxEndmillDiameter` / `maxDrillDiameter` by the tool's kind
  (drill vs endmill) inside one fit, rather than emitting two approaches a
  user picks between. The **type preference** rule (drill or mill a hole) is
  what makes two approaches usable; we have a form filter that does the same
  job by hand.
- Ours reads `cd.ignore.min` as the cap (same rule) but does not yet distinguish
  `Three` surfaces (`toolFit`, ball-only, corner radius as a _minimum_), Tslot
  (`maxEntryCd` is shown, not enforced in the fit), Dovetail, or a chamfer's
  angle.
- **Reach**: ours measures depth below the part top from the highest
  `extendedZMax` of features cut the same way, not from the mesh box, and
  deliberately does not make it a tool filter (it is the holder's question,
  swept from the reach curve). Justin's makes reach a tool bound.
- Ours has no near-miss accounting; an empty list names the feature that ruled
  the most tools out, not the closest tool and by how much.
- Ours has no tap-drill rule and no job grouping beyond identical holes.
- Ours orders by preference (rough/finish, material standing), then by the
  chosen tool-type and brand priority; not "largest that fits".
- Ours filters by the feature datasheet (`feature-defaults.csv`) rather than
  by `facts.kind`; the two vocabularies overlap but the sheet names tool
  _forms_ where Justin's names cutter _classes_.
