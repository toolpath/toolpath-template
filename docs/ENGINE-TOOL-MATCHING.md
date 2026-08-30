# Toolpath's tool matching — the engine's rules, written out, and a simpler shape for the catalog

How **app.toolpath.com** decides which tools can cut a feature. Recorded
2026-08-29 from the engine source — `toolpath/ToolpathPackages`,
`ToolpathEngine/src/` (`tool_filtering.jl`, `feature_tools2.jl`,
`tool_selection.jl`, `tool_selection_utilities.jl`, `tool_failures_dict.jl`,
`BaseTP/src/constants.jl`) — and the UI that shows it (`toolpath_ui`,
`apps/frontend/src/lib/report/feature-tools/`, `constants/feature-tool.ts`,
`lib/assets/types/machining-settings.ts`, the `tool_check.proto` in
`services`). The engine works in **inches**; every number below gives both.

Part 1 is what the engine does. Part 2 is the proposal for this catalog:
keep the engine's shape, drop what needs geometry we do not get, and put the
rest in a table a person can edit.

---

## Part 1 — What the engine does

### 0. The shape of it

For every feature, for every tool in the enabled libraries, the engine runs
**named checks**. A check that fails is recorded against the tool with its
name, the tool's value, and the bound (`{value}`, `{lower}`, `{upper}`), which
is exactly what the report's "why not this tool" panel prints. Checks are
recorded per **pass**: `VALID` (the tool cannot cut this feature at all),
`PARTIAL_ROUGH`, `TERMINAL_ROUGH`, `PARTIAL_FINISH`, `TERMINAL_FINISH`. A tool
with no `VALID` failure and no failure at a terminal pass is a candidate for
that pass; one candidate per pass is then chosen by a ranking. If no candidate
exists the engine tries a **deviation** (relax a bound inside the part's
tolerance band and say so), then **tool recommendation** (search a vendor
library for something that would have passed).

The UI sorts the failures into three buckets (`constants/feature-tool.ts`):

| Bucket                  | Meaning                                   | Examples                                                                                                       |
| ----------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **Incompatible**        | hard; cannot be overridden                | wrong type, cannot side mill, cannot helix, holder clearance, ramping space, pitch, disabled, missing role     |
| **Tools with warnings** | geometric; a person may override          | diameter, flute length, stickout, length below shoulder, corner radius, cone angle, drill too small/large      |
| **Compatible, demoted** | it would cut; something else is preferred | undesirable finishing tool, excessive stickout (L/D band), a drill is preferred, Pareto-inferior, consolidated |

### 1. Type table — which kinds of tool a feature will even consider

`is_compatible_by_type`. "Bull" is a bull-nose (radius) end mill; "side mill"
means the tool's cutting-edge flags allow side milling.

| Feature                                   | Considered at all (`VALID`)                              | Terminal rough                                   | Terminal finish                                                           |
| ----------------------------------------- | -------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------- |
| Pocket / boss, **filleted floor**         | flat, bull, ball — side mill                             | flat, bull                                       | **bull only**                                                             |
| Pocket / boss, **through**                | flat, bull — side mill                                   | flat, bull                                       | flat, bull, ball                                                          |
| Pocket / boss, plain                      | flat, bull — side mill                                   | flat, or bull with r < **roughing radius limit** | flat, or bull with r < **finishing radius limit**                         |
| Profile, wall                             | flat, bull — side mill                                   | same                                             | same                                                                      |
| Facing (stock top)                        | flat, bull; a face mill that cannot side mill is allowed | same                                             | same                                                                      |
| Face                                      | flat, bull, ball                                         | same                                             | same                                                                      |
| 3D (contour, slanted, fillet, 3D chamfer) | any end mill (fillets/chamfers: flat, bull, ball)        | any end mill                                     | ball if the surface demands it; else ball, bull, chamfer — **never flat** |
| Chamfer, countersink (2D)                 | chamfer mill; a ball for a round countersink             | chamfer mill or end mill                         | chamfer mill or end mill                                                  |
| Outer fillet (corner-rounded)             | corner-rounding mill                                     |                                                  |                                                                           |
| Back chamfer                              | nothing — not implemented                                |                                                  |                                                                           |
| Hole, plain blind                         | drill, flat, bull, ball; tap/thread mill if threaded     | drill, or a side-milling flat/bull/ball          | drill, flat; bull/ball only with r < **finishing radius limit**           |
| Hole, through                             | same                                                     | same                                             | drill, flat, bull, ball                                                   |
| Hole, filleted blind                      | same                                                     | same                                             | drill, flat, bull                                                         |
| Synthetic hole (helix entry)              | end mill                                                 |                                                  |                                                                           |
| Dovetail                                  | dovetail cutter                                          | filleted → corner radius > 0; else = 0           | same                                                                      |
| T-slot / undercut                         | slot (keyseat) cutter                                    | filleted → corner radius > 0; else = 0           | same                                                                      |

### 2. Hard geometric checks — the filtering stage

Run at `VALID`. A failure here is a tool that cannot cut the feature.

**Every feature**

- **Diameter ≤ the widest clearance** (`max_cd`, the "ignore" band — the
  widest tool that fits _somewhere_ in the feature).
- **Stickout ≥ required stickout.** The tool's silhouette — flutes skipped,
  shank and holder included — is swept against the feature's local depth
  variation (the same idea as the API's `reachCurve`). Required stickout is
  the tool's stickout plus whatever it was short by. Through features add the
  corner radius and an **overcut** (rough 0.010 in / 0.254 mm, finish 0.005 in
  / 0.127 mm).
- **Flute length ≥ required flute length.** Feature height; walls and through
  holes add corner radius + overcut; 3D surfaces need only the max stepdown;
  drills and taps need none. Tolerance 0.0002 in. A T-slot cutter's flutes may
  be _at most_ the slot height.
- **Length below shoulder ≥ required** — only when the shoulder is at least as
  wide as the cut (a shoulder narrower than the flutes is a neck, not a
  shoulder).
- **Can side mill** (everything but facing), **center cutting** (closed
  pockets, holes), **can helix** (holes), **can top mill** (dovetail, T-slot).

**Holes** — the diameter cap depends on the kind of tool:

| Tool        | Cap                                                                                                                             |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------- |
| end mill    | (hole ⌀ − 2 × stock to leave) ÷ (1 + 0.10) — i.e. **10⁄11 of the hole**, the helix room                                         |
| drill       | hole ⌀ + **oversize** (engine default 0.001 in / 0.0254 mm; UI default 0.004 in / 0.1 mm); **undersize** the same the other way |
| tap         | = thread major ⌀ (±0.0001 in); pitch must match                                                                                 |
| thread mill | ≤ 0.98 × minor ⌀; pitch matches (multi-tooth) or lies in the tool's pitch range (single point), tooth taller than the thread    |
| spot drill  | ≤ the allowable spot diameter; cone ≤ 150°                                                                                      |

The API's `maxDrillDiameter = ⌀ + 0.0254` and `maxEndmillDiameter = 10⁄11 ⌀`
are these two rows with the engine's defaults baked in.

**Chamfers**: chamfer angle within 0.15° of the feature; the tool's cutting
edge (slant) ≥ the chamfer's; overcut below the chamfer ≤ what the geometry
allows; bottom diameter ≤ the clearance at the chamfer's foot; a feasible tip
offset between the min/max the config sets (0–1 in).

**Dovetail**: bottom diameter within the min/max clearance; taper within
0.15°; corner radius ≤ the terminal corner radius.

**T-slot**: diameter ≤ clearance capped by the **entry width**; undercut depth
≥ the feature's; corner radius ≤ terminal corner radius; sidewall height ≤ the
slot's.

**Inner fillet**: diameter ≤ clearance; corner radius ≤ the fillet.

### 3. Pass checks — can it _finish_ the feature, or only rough it

Run per pass on tools that survived stage 2.

- **Corners.** A tool wider than the **tightest clearance** (`min_cd`, the
  widest tool that reaches every point) can rough but not finish: it fails
  `TERMINAL_ROUGH` and `PARTIAL_FINISH` with "diameter too large to machine
  the required internal corner radius". Walls and profiles use an _effective
  adaptive_ diameter (tool ⌀ shrunk by the **min radius reduction**, 5 %, plus
  stock to leave) because adaptive roughing needs room to trochoid.
- **Corner radius.** Filleted floor: rough r ≤ fillet; finish 0 < r ≤ fillet.
  Through: r ≤ terminal corner radius − overcut. Plain floor: rough r ≤
  **roughing radius limit** (0.03 in / 0.762 mm), finish r ≤ **finishing
  radius limit** (0.001 in / 0.025 mm). This is "bullnose substitution".
- **Bottom of a blind hole.** Drill tip vs the CAD cone: a shallower tip is
  allowed up to **+35°**, a more acute one **−0°** (a step at the bottom). A
  flat-bottom counterbore must stay flat — no pointed drill, ever.
- **3D surfaces.** ⌀ ≤ tightest clearance; corner radius ≤ terminal corner
  radius; bottom (flat) diameter ≤ what the surface allows; finish only with a
  ball where the kernel says `use_only_ball_tools_for_finish`.
- **2.5D features.** Tool cone angle must be 0; bottom diameter within the
  feature's; a wall's corner radius ≤ terminal corner radius − overcut.
- **Practicality.** A tool is dropped when the area it can actually reach is
  under twice its own footprint _and_ under half the feature — a 1/16" end
  mill in a 4-inch pocket is valid and useless.
- **Clearance around the shank.** Shaft below the shoulder must clear the walls
  by 0.005 in / 0.127 mm; the **holder** must clear by 0.025 in / 0.635 mm —
  `HOLDER_CLEARANCE_NOT_ENOUGH`, a hard failure at `VALID`.
- **Ramping room** for partial roughing unless the tool can plunge or slot.
- **Role.** The tool must carry the preset for the role the plan needs
  (Adaptive Rough, Wall Finish, Drill, …) and not be `Disabled_`. This is the
  cut config, not geometry.
- **Constraints.** A person's "require this tool" / "exclude this tool" on a
  feature and pass.

### 4. Demotions — "it would cut, but"

Recorded as failures so they show in the panel, but forgiven when nothing
better exists (`RELATIVE_PREFERENCE_FAILURES`).

- **Undesirable finishing tool** — a 2.5D feature's internal corner should not
  be finished by the tool whose radius _equals_ it: any tool wider than
  0.95 × tightest clearance is demoted if a narrower one is valid.
- **Excessive stickout** — Tim Paul's L/D bands. `loss = max(0, stickout/⌀ −
4)` for mills (14 for drills); a tool more than **2×D** worse than the best
  valid one for that pass is demoted. Bands: 0–4×D free; then 4–6, 6–8, … one
  tool length per band, sized to the deepest feature in the band.
- **A drill is preferred** — with "prefer drilling holes up to ⌀", any valid
  drill beats every end mill on a hole that size.
- **Pareto-inferior across the setup** — a tool dominated by another on every
  feature in the setup is dropped to reduce the tool count.
- **Chamfer consolidation** / **finish via chamfer** — one chamfer tool covers
  several features; the chamfer pass owns the finish.
- **Tool compaction** — "maximum tools per setup".

### 5. Ranking — which valid tool wins

`argmin` over a tuple compared left to right (`ToolLoss`), so the first
component that differs decides:

1. **User priority** — library priority (Preferred 1 / Standard 2 / Backup 3),
   then the preset's position or star for the role.
2. **Type fit** — chamfer: chamfer mill < ball (finish) < bull < flat. 3D
   surface: bull < flat < ball ("a ball has zero speed at the tip"). Blind
   pocket / hole / boss rough: r under the roughing limit first. Face: not a
   ball. Wall: flat. Filleted rough: exact-match radius first, then the least
   excess.
3. The **undesirable-finish** flag.
4. **Flute length short of the feature height** (pockets, walls, profiles,
   bosses, undercuts) — least shortfall.
5. **Finish corner radius** — |fillet − r| for pockets, bosses, faces, walls.
6. **Drill cone mismatch** on a blind hole.
7. Sub-slot clearance.
8. **Diameter** — bigger is better, _up to 0.9 × the widest clearance_; past
   that every tool ties (a 3/8 that need not slot beats a 1/2 that must).
   Drills: bigger, unless over the cap. T-slot: closest to 1.1 × undercut
   depth. Tiny features prefer shorter tools.
9. **Stickout ÷ diameter** — shorter is better.
10. Corner radius vs fillet, then tool number.

If the finishing winner is also valid for roughing and no worse on user
priority, one tool does both.

### 6. What a person can turn

From the cut config (`machining-settings.ts`):

| Knob                                                 | Engine default (in → mm)        | What it moves                                         |
| ---------------------------------------------------- | ------------------------------- | ----------------------------------------------------- |
| Bullnose substitution, roughing radius               | 0.03 → 0.762                    | §1 type table, §3 corner radius                       |
| Bullnose substitution, finishing radius              | 0.001 → 0.025                   | same                                                  |
| Max tool diameter (+ face mills/drills/taps)         | off                             | a global cap before matching                          |
| Drill oversize / undersize                           | 0.001 / −0.001 (UI 0.004 → 0.1) | §2 hole drill cap                                     |
| Drill angle tolerance + / −                          | 35° / 0°                        | §3 blind-hole bottom                                  |
| Prefer drilling holes up to ⌀                        | on, ∞ (UI 0.375 in / 10 mm)     | §4 non-drill demotion                                 |
| Prefer pre-drilling / spot drilling / thread milling | on / on / off                   | pass structure                                        |
| Min radius reduction, rough / finish                 | 5 % / 5 %                       | §3 effective adaptive diameter, §4 undesirable finish |
| Chamfer tip offset min / max                         | 0 / 1 in                        | §2 chamfer                                            |
| Deviations: ignore under / suggest up to             | 0.005 / — in                    | §0 deviation fallback                                 |
| Tools per setup                                      | 50                              | §4 compaction                                         |
| Library priority, roles, stars                       | —                               | §5 rank 1                                             |

Not exposed but in the engine: through overcut rough/finish (0.010 / 0.005
in), L/D thresholds (4 mills, 14 drills), shaft / holder clearance (0.005 /
0.025 in), chamfer and dovetail angle tolerance (0.15°), flute-length
tolerance (0.0002 in), ramp diameter ratio (0.10).

---

## Part 2 — A simpler shape for this catalog

### What changes the problem

The engine matches against the **whole geometry**: the medial-axis clearance
map, depth maps, the mesh for sweeps, the stock. This application gets the
**Engine API's datasheet** for one feature: `cd` bands (`ignore` /
`deviate`, `min` / `max`), `terminalCornerRadius`, `maxDrillDiameter`,
`maxEndmillDiameter`, `fullConeDeg`, `filletRadius`, `bevel` angle and slant,
`maxEntryCd`, `taperDeg`, `toolFit`, `useOnlyBallToolsForFinish`, and the
`reachCurve`. That is enough for §1, §2's diameter and length rules, §3's
corners and bottoms, §4's L/D, and §5's ranking. It is not enough for
ramping room, the practicality area test, effective-adaptive diameters, or
stock-to-leave — and this application has no passes, roles or cut config,
because the person picks the pass by choosing the tool.

### The shape to keep

Four stages, in the engine's order, because the order is what makes the
answer explainable:

1. **Type** — which tool forms a feature considers. A table.
2. **Must** — bounds that make a tool unable to cut the feature. Every one
   reports `value` against `bound` like the engine's `{value}/{lower}`.
3. **Should** — bounds a person may override; shown as warnings, tool stays
   in the list, greyed. (The engine's "Tools with warnings".)
4. **Prefer** — demotions and the ranking. A tool is never removed here.

### The mechanism: one rules table, one knobs table

Extend `feature-defaults.csv` (already the file a non-coder edits) with a
**rules sheet**, one row per rule:

```
feature,           tool types,        rule,                                     level,  note
*,                 *,                 flute length >= feature depth,            must,   flutes must cover the cut
ThroughHole,       drill,             diameter <= largest drill diameter,       must,   hole ⌀ + drill oversize
ThroughHole,       *end mill,         diameter <= largest tool diameter,        must,   10/11 of the hole: helix room
Pocket,            *,                 diameter <= largest tool diameter,        must,   widest cutter that reaches every corner
Pocket,            bull nose end mill,corner radius <= floor fillet radius,     must,
BlindHole,         drill,             tip angle <= hole tip angle + drill angle tolerance +, should,
*,                 *,                 L/D <= L/D limit + 2,                     prefer, Tim Paul's bands
*,                 *,                 diameter closest to 0.9 x largest tool diameter, rank,
*,                 *,                 stickout / diameter smallest,             rank,
```

- **`feature`** — a kernel feature type, a `when` condition as today, or `*`.
- **`tool types`** — the forms the rule applies to (`drill`, `*end mill`,
  `*`), the same vocabulary as the tool-type tiles.
- **`rule`** — `tool field  op  feature field  [± knob]`. Tool fields are the
  catalog's own (`diameter`, `flute length`, `length below holder`, `corner
radius`, `tip angle`, `flutes`, `L/D`); feature fields are the existing
  `FIELDS` in `feature-defaults.ts`; knobs are named numbers from a second
  small table. The parser is the one `parseCondition` already has, with one
  more clause for the `± knob`.
- **`level`** — `must` (removed, with the failed bound), `should` (kept,
  warned), `prefer` (kept, sorted after the tools that pass), `rank` (a sort
  key, read in file order — the engine's tuple, made visible).
- A rule that names a field the datasheet does not report **stands down**
  rather than failing the tool — the engine's `Inf` bound, and what `readMetrics`
  does in the DFM app.

And **`knobs.csv`** with the engine's defaults as the starting values:

```
knob,                          value,  unit, note
drill oversize,                0.1,    mm,   Toolpath UI default; engine 0.0254
drill undersize,               0.1,    mm,
drill angle tolerance +,       35,     deg,
drill angle tolerance -,       0,      deg,
finishing radius limit,        0.025,  mm,   bullnose as flat, finishing
roughing radius limit,         0.762,  mm,   bullnose as flat, roughing
through overcut,               0.127,  mm,   finish value; rough is 0.254
L/D limit,                     4,      ratio, drills 14
min radius reduction,          5,      %,    do not finish a corner with its own radius
```

### What this drops, on purpose

- **Passes and roles.** No rough/finish split, no presets — the person picks
  the pass by picking the tool, which is the product decision already made.
  Where the engine has two thresholds (rough/finish overcut, rough/finish
  radius limit) the sheet carries the finishing one; roughing is a looser
  bound the person applies by eye.
- **Ramping, practicality, effective-adaptive, stock to leave.** Need the
  geometry we do not receive. If the API grows them they are new fields, not
  new code.
- **Deviation and recommendation.** Our version is the near-miss line: when
  a `must` rule empties the list, say which rule, the closest tool, and by how
  much — the engine's `closest_tool` in `ToolErrorType`.
- **Library priority.** Ours is the brand / type priority already on the
  tiles; it becomes rank 1 exactly as in the engine.

### What this keeps that the sheet does not have today

- Corner-radius rules per floor type (filleted: 0 < r ≤ fillet; plain: r ≤
  finishing radius limit; through: r ≤ terminal corner radius − overcut).
- The drill's window (undersize as well as oversize) and the blind-hole tip
  angle tolerance.
- The through-feature overcut on flute length and reach.
- The tightest-vs-widest clearance distinction: `must` on the widest
  (`cd.max` — cannot enter), `should` on the tightest (`cd.min` — can rough,
  cannot finish the corners). Today we only apply the tightest, as a `must`.
- L/D as a _preference band_ relative to the best tool, not a filter.
- A visible, reorderable ranking.
- Holder clearance stays where it is — the assembly's reach-curve sweep — but
  it is the engine's `HOLDER_CLEARANCE_NOT_ENOUGH` and should read as a `must`
  once a holder is chosen.

### How it would be proven

- `rules.test.ts`: every rule parses; every field and knob it names exists;
  every kernel feature type has at least one `must` on diameter or is
  documented as unbounded.
- A fixture of datasheets (the cube, plus hand-written ones per kind) with
  the expected removed / warned / order for a small tool set, so a changed row
  in the sheet is a failed test that names the row.
- The engine's defaults as the initial knob values, each with the engine's
  field name in the note, so drift from Toolpath is a diff on one file.
