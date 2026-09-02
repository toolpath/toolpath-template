# The 2D tool drawing, as its own package

A plan to replace `apps/catalog/app/components/assembly-drawing.tsx` with
**`@toolpath/tool-drawing`**, a self-contained 2D drawing package developed in
the `toolpath-ui-packages` repository and consumed here.

Written 2026-09-01. **This document is written to be picked up cold**, by a
reader — human or agent — with no memory of the conversation that produced it.
Everything needed to start work is here: the evidence, the absolute paths, the
decisions and who made them, the constraints discovered along the way, and a
phase-by-phase todo. Update it as the work lands.

**Before touching anything, read § 12** — this work spans two repositories with
two different branch and commit conventions, and the branches have to be cut
from the right places.

Related: `docs/TOOL-CATALOG-PLAN.md` is the catalog this draws for;
`docs/TOOL-SCRAPER-REFACTOR.md` is the precedent for moving a concern out of
this repository into a published package.

---

## 1. Orientation: the three repositories involved

| Repository               | Absolute path                                              | Role here                                                                                                                                     |
| ------------------------ | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **toolpath-template**    | `/Users/justingray/toolpath/new_code/toolpath-template`    | This repo. Holds the broken drawing and will consume the new package.                                                                         |
| **toolpath-ui-packages** | `/Users/justingray/toolpath/new_code/toolpath-ui-packages` | Where the new package is built and published from. Already publishes `@toolpath/ui`, `@toolpath/viewer`, `@toolpath/tool-scraper`.            |
| **tool_catalog**         | `/Users/justingray/toolpath/new_code/tool_catalog`         | **Reference, read-only.** An earlier 2D drawing that works.                                                                                   |
| **BetterToolLib**        | `/Users/justingray/JustinGrayLabs/code/BetterToolLib`      | **Reference, read-only.** A 3D viewer whose structure and profile generators are the model. Its 3D approach is explicitly _not_ what we want. |

The two reference repositories are not to be modified. Nothing in this
repository may import from them; they are read for their reasoning and their
geometry, and the code is ported deliberately rather than copied wholesale.

### The files that matter in each reference

**`tool_catalog`** (2D, the closest thing to the target):

- `apps/web/src/data/tool-profile.ts` — 262 lines. The silhouette generator and
  the honesty rule this plan adopts.
- `apps/web/src/data/assembly-drawing.ts` — 301 lines. Places a tool in a
  holder; the `ToolDrawing | AssemblyDrawing` discriminated union.
- `apps/web/src/components/AssemblyDrawing.tsx` — 191 lines. The SVG renderer.
  Note its header: it explains why 2D replaced BetterToolLib's 3D.
- `apps/web/src/components/DrawingCard.tsx` — 333 lines. The card and stickout
  control around the drawing.

**`BetterToolLib`** (3D, the structural model):

- `BetterToolLib/webapp/src/components/tool-viewer/tool-profiles.ts` — 390
  lines, fifteen profile generators. Four of them invent geometry; see § 6.
- `BetterToolLib/webapp/src/components/tool-viewer/types.ts` — the `ViewerTool`
  input contract worth copying.
- `BetterToolLib/webapp/src/components/tool-viewer/adapt.ts` — 84 lines. The
  adapter pattern: project the application's record onto the viewer's contract.
- `BetterToolLib/webapp/src/components/tool-viewer/tool-viewer-utils.ts` —
  `resolveToolDimensions` (invariant enforcement) and the two framing
  functions.
- `BetterToolLib/webapp/src/components/tool-viewer/Viewer3DShell.tsx` — the
  interaction shell. **Not being ported** (see § 4), but read it for how
  framing is computed as data rather than tangled into the view.

---

## 2. Why now: what the current drawing actually does

Measured 2026-09-01 against the local 35,573-tool dataset, at the panel size the
tool page gives the drawing (1450 × 297 px):

| Tool                     | guid                                   | viewBox produced (mm) | Actual tool extent (mm) |
| ------------------------ | -------------------------------------- | --------------------- | ----------------------- |
| `B041A01000CPG` ⌀1 drill | `dbbe918e-151d-546a-936a-7001871ec9a6` | 312 × 64              | 4 × 58                  |
| `910615` slot mill       | `2f6bd61b-b237-556e-87ea-19a77eead5e0` | 215 × 44              | 3.2 × 38                |
| `BV3160617` necked ball  | `0257a6de-2eda-5584-9bd6-6a5d7fc7e8fb` | 525 × 108             | 6.4 × 102               |

Three defects, each with a cause in the source rather than in the data.

### Defect 1 — the frame is derived from the panel's aspect ratio

`apps/catalog/app/components/assembly-drawing.tsx:484`

```ts
const spare = panel
  ? Math.max(0, (height * panel.width) / panel.height - stack * 2 - roomLeft - roomRight)
  : 0
```

`height` is the tool's length in millimetres. Multiplying it by the panel's
aspect ratio makes the **frame** wide when the **panel** is wide, and
`preserveAspectRatio="xMidYMid meet"` then shrinks the drawing to fit the
height. A ⌀1 drill gets a 312 mm-wide sheet. Roughly 85% of the panel renders
empty. The surplus is split into `rest` (line 490) and padded onto both sides
(491–492) rather than being spent on scale.

The scale should absorb the panel's shape. Instead the frame does, and the
drawing pays for it.

### Defect 2 — dimension text is sized in millimetres of tool

`apps/catalog/app/components/assembly-drawing.tsx:409`

```ts
const fontSize = Math.max(1.5, height * 0.018)
```

Type size is tied to how long the tool is, not to how big the drawing is on
screen. On a 58 mm drill that is ~1 mm of model space — about four pixels at
the rendered scale. Every dimension on every screenshot is illegible.

### Defect 3 — unknown forms draw as a cylinder

`packages/catalog-data/src/outline.ts:131` — `tip()` ends in:

```ts
default:
  return { points: [{ r: 0, z: 0 }, { r, z: 0 }], provenance: stated(tool, 'DC'), top: 0 }
```

Any form without an explicit case renders as a plausible, wrong picture rather
than as no picture. `slot mill` and `tap right hand` — both present in the
current dataset — take that path today. A keyseat cutter carries a corner
radius on **both** ends of its flute disc; drawn flat it is a featureless
sliver two pixels tall.

### Underneath all three

One 988-line component holds geometry, layout, theming, dimension placement,
part-section drawing and clearance dimensioning, with the coordinate transform
closed over inline at lines 494–495:

```ts
const x = (r: number) => r - left
const y = (z: number) => top - z
```

Nothing in it can be tested without rendering the whole thing, and nothing in
it can be reused. Orientation is not a variable anywhere — it is baked into
those two lines and threaded through every renderer below them.

---

## 3. What the three references establish

- **This repository** sets the visual language, and it is good. The drawing is
  its own sheet with its own ink (the `SHEETS` constant, one palette per
  theme), a silhouette outlined rather than blocked in, hatched sections,
  dashed joins where two sections meet at the same radius, and a proper
  long-short-long centreline. All of it survives the rewrite intact. Paul's
  notes justifying each choice are in the component's comments and should
  travel with the code.
- **`tool_catalog`** sets the honesty rule: **every number in a generated
  profile comes off a vendor measurement, and an unrecognised type returns
  `null`.** It deliberately declines to port four of BetterToolLib's fifteen
  generators because they invent geometry. Its header is worth reading in full
  before writing a generator.
- **`BetterToolLib`** sets the structure: a narrow `ViewerTool` input contract
  with an `adapt.ts` that projects the application's own record onto it;
  `resolveToolDimensions` enforcing geometric invariants before anything
  renders; and framing computed as data rather than tangled into the view. Its
  `slotMillProfile` is the correct keyseat geometry this repository is missing.

---

## 4. Decisions taken

All four were Justin's calls on 2026-09-01.

| Question              | Decision                                                                     |
| --------------------- | ---------------------------------------------------------------------------- |
| **Package name**      | `@toolpath/tool-drawing`                                                     |
| **Orientation**       | Auto-orient — the package measures its own box and draws along the long axis |
| **Interaction**       | Static fit-to-box. No pan, no zoom, no controls.                             |
| **Clearance overlay** | Moves into the package, as an **optional** subpath export                    |

`@toolpath/tool-drawing` was chosen over `@toolpath/tool-viewer` to keep it
clearly distinct from `@toolpath/viewer`, the existing 3D part viewer. The two
would otherwise read as a matched pair, which they are not: one shows a
customer's part in 3D, the other draws a catalog tool in 2D elevation.

### One refinement to the overlay decision

The overlay's **rendering** moves. The clearance **verdict** does not, and the
reason is a count. `clearance()` from `packages/catalog-data/src/clearance.ts`
has twelve non-drawing consumers:

```
app/shared/judge.ts          app/shared/rules.ts         app/shared/hole-mode.ts
app/shared/holder-choice.ts  app/shared/tool-fit.ts      app/shared/drawn-assembly.ts
app/shared/feature-defaults.ts
app/routes/part.tsx          app/routes/tool.tsx
packages/catalog-data/src/assembly-picking.ts
packages/catalog-data/src/assembly-fit.ts
packages/catalog-data/src/fit.ts
```

It is the catalog's tool-selection engine — it answers whether an assembly
clears a feature whether or not anything is ever drawn. Moving it into a
drawing package would put the selection engine behind a rendering dependency.

So the package takes the verdict **as data** — a material profile, the
collisions, the two tightest gaps — and owns every line drawn from it: the wall
in section, the hatch, the interrupted-view breaks, the clearance dimensions
and their readouts, and the collision paint on the silhouette.

`materialProfile` (in `packages/catalog-data/src/outline.ts`) stays here,
because `packages/catalog-data/src/section.ts` draws the feature section from
it too — it has two drawing consumers, not one.

This keeps the overlay optional in all three senses that matter:

1. a separate subpath, so a consumer that never imports it never pays for it;
2. no Toolpath schema dependency — the reach-curve shape is declared
   structurally in the package, so `@toolpath/part-contracts` is not pulled in;
3. omitting the props renders the tool alone.

### The `fit` prop — decided against

Justin's call on 2026-09-01, closing the last open question before phase 2.

A static `fit?: 'assembly' | 'cutter'` prop was proposed — BetterToolLib's
`computeToolCameraSetup` reduced to a caller-chosen frame, with the interaction
removed. **It is not being built.** `frameFor` takes one framing: the whole
assembly. Its signature stays narrower and there is one framing to test rather
than two.

The motivating case survives unfixed, and should be stated rather than
forgotten: a slot mill's 0.38 mm of cutting disc on a 38 mm tool is one pixel
at any honest whole-assembly scale, and no amount of correct arithmetic
rescues it. That is a real limitation of the shipped drawing, not an oversight.

The cost of the decision is known and accepted: dropping the prop later would
have been cheap, adding it later is not — retrofitting means changing
`frameFor`'s signature after its tests are written. Revisit it only when
someone actually asks for the cutter view.

---

## 5. The package

**`@toolpath/tool-drawing`**, at
`/Users/justingray/toolpath/new_code/toolpath-ui-packages/packages/tool-drawing`,
modelled on `@toolpath/ui` (`packages/ui/package.json` there is the template to
copy): `tsup` to ESM with types, `tsc --noEmit` for `check-types`,
`vitest run` for tests, React 19 as a peer dependency, and **no runtime
dependencies** — it is SVG and arithmetic.

Peering `react` and `react-dom` rather than depending on them is deliberate and
is judgment rather than a sensor in that repository: its guide notes a consumer
that ends up with two copies of a peer gets a broken render and no check sees
it.

### Internal layout

Follow `packages/viewer`'s house style, which that repository's AGENTS.md names
as judgment worth keeping: **pure logic in `model/`, rendering in `render/`,
React confined to the `.tsx` files.** It maps onto this work exactly — stages 1
and 2 of § 7 are `model/`, stage 3 is `render/` — and it is what keeps the
layout engine testable without mounting anything.

```
src/
  index.ts                 public surface: <ToolDrawing>, types, options
  model/
    outline.ts             assemblyOutline, the tip generators
    frame.ts               frameFor — orientation, scale, viewBox, toX/toY
    dimensions.ts          the dimension model: lanes, bands, figures
  render/
    tool-drawing.tsx       the component
    silhouette.tsx         outline, fills, joins, centreline
    dimension-lines.tsx    the dimension renderer
  geometry/index.ts        re-exports model/outline.ts — server-safe subpath
  clearance/
    index.ts
    model/gaps.ts          tightestGaps, wallFaceAt, wallCorners, lastRise
    render/overlay.tsx     wall, hatch, breaks, clearance dimensions
```

### Exports

```
@toolpath/tool-drawing             <ToolDrawing>, the input types, the framing options
@toolpath/tool-drawing/geometry    assemblyOutline and the profile generators — pure, server-safe
@toolpath/tool-drawing/clearance   the optional overlay
```

Split for the reason `@toolpath/part-contracts` is split, which AGENTS.md
already records: a barrel export drags the browser half into anything that only
wanted a type. The `geometry` subpath must stay importable by a Hono server.

### The input contract

Package-owned, so nothing in it depends on `@toolpath/catalog-data`:

```ts
export type Provenance = 'vendor-stated' | 'derived' | 'assumed'

export interface ViewerTool {
  readonly form: string
  readonly label?: string
  readonly geometry: Readonly<Record<string, number | undefined>>
  readonly provenance?: Readonly<Record<string, Provenance>>
}

export interface ViewerHolder {
  readonly noseDiameter: number | null
  readonly noseLength: number | null
  readonly bodyDiameter: number | null
  readonly bodyLength: number | null
  readonly projection: number | null
  readonly flangeDiameter: number | null
  readonly gaugeLength: number | null
  readonly colletSeries: string | null
  readonly colletProtrusion: number | null
  readonly provenance?: Readonly<Record<string, Provenance>>
}

export interface ViewerAssembly {
  readonly tool: ViewerTool
  readonly holder: ViewerHolder | null
  readonly stickout: number | null
}
```

`geometry` keeps the scraper's own field names — `DC`, `SFDM`, `OAL`, `LCF`,
`RE`, `SIG`, `NOF`, `shoulder-diameter`, `shoulder-length` — which is AGENTS.md's
standing rule and the thing that stops a translation table growing between the
two vocabularies. Renaming one here is how an `SFDM` silently becomes a `DC`.

`CatalogTool` already satisfies `ViewerTool` structurally. The adapter exists
anyway, to make the coupling explicit and keep it in one file that fails loudly
when either side moves.

---

## 6. What moves, and what stays

### Into the package

| From                                                                                                                      | To                                        |
| ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `packages/catalog-data/src/outline.ts` — `assemblyOutline`, `tip`, `arc`, `OutlinePoint`, `OutlineSegment`, `OutlinePart` | `/geometry`                               |
| `apps/catalog/app/shared/tool-dimensions.ts` (402 lines)                                                                  | `/` — the dimension model                 |
| `apps/catalog/app/components/dimension-lines.tsx` (318 lines)                                                             | `/` — the dimension renderer              |
| `apps/catalog/app/components/assembly-drawing.tsx` (988 lines)                                                            | split across `/` and `/clearance`         |
| `wallCorners`, `wallPath`, `lastRise`, `clipped`, `zigzag`, `arrow` (currently exported from `assembly-drawing.tsx`)      | `/clearance`                              |
| `tightestGaps`, `wallFaceAt`, `Gap`, `AxialGap`, `Gaps` from `packages/catalog-data/src/gaps.ts`                          | `/clearance` — drawing-only, one consumer |

Tests that travel with their code:
`apps/catalog/app/components/assembly-drawing.test.tsx` (629 lines),
`apps/catalog/app/shared/tool-dimensions.test.ts` (208),
`packages/catalog-data/src/outline.test.ts` (241),
`packages/catalog-data/src/gaps.test.ts` (126).

### Stays here

- **`clearance()`** and everything around it in
  `packages/catalog-data/src/clearance.ts` — `toolSilhouette`,
  `holderSilhouette`, `toolCollisions`, `Collision`, `Margins`, `NO_MARGINS`.
  Twelve consumers; see § 4.
- **Correction, 2026-09-01: `heightAt` did not stay.** It was listed here, but
  `tightestGaps` cannot be written without it, so phase 5 ported it as a small
  curve reader — the _reading_ of the curve the staircase is drawn from, not the
  decision made on it. **There is now a second copy**, and the test pinning the
  template's `materialProfile` against `heightAt` travelled with it so drift
  shows up on both sides. This is the second such duplication, after phase 1's
  `hasNeck`; phase 6 should record both rather than try to resolve them.
  `tightestGaps` also changed signature — it takes outline segments, a cutting
  radius and margins rather than an `Assembly`, since by drawing time the
  outline exists and an assembly record is the consumer's vocabulary.
- **`materialProfile`** in `packages/catalog-data/src/outline.ts` — two drawing
  consumers, one of which is the feature-section drawing.
- **`drawn-assembly.ts`**, **`drawing-card.tsx`**, **`assembly-picker.tsx`** —
  stickout policy, holder choice and page composition, not drawing.
- **`tool-icons.tsx`** — a set of 14-pixel type glyphs. A different thing
  entirely, and currently correct. Do not touch it.

---

## 7. The layout engine — the actual fix

Three stages, each pure and separately testable, replacing one inline pass.

**Stage 1 — Geometry (millimetres).**
`assemblyOutline(assembly) → { segments, height, radius }`. Substantially what
`outline.ts` already does, plus the honest tip generators of § 8.

**Stage 2 — Layout (pure).**
`frameFor(outline, dimensions, box, options) → Frame`

```ts
interface Frame {
  readonly orientation: 'vertical' | 'horizontal'
  readonly scale: number // px per mm
  readonly viewBox: string
  readonly toX: (r: number, z: number) => number
  readonly toY: (r: number, z: number) => number
  readonly fontSize: number // mm, back-derived from a target px size
  readonly bands: DimensionBands
}
```

**The inversion that fixes defect 1: the frame is content plus margins, and the
scale absorbs the panel's shape.** Never the other way round. `scale` is the
smaller of the two px-per-mm ratios that fit the content in the measured box;
the viewBox describes the content, not the panel.

**The fix for defect 2:** `fontSize` starts as a target in **pixels**, clamped
to a readable range, then divided by `scale` to land in model space. Type size
stops tracking how long the tool happens to be.

**Auto-orientation lives entirely in `toX`/`toY`**, which are the only two
functions that know which way the axis runs. Pick the orientation from the
measured box — draw along its long axis — and every renderer downstream
(silhouette, joins, centreline, dimensions, overlay) is written once and is
orientation-agnostic. This is the single structural reason the current code
cannot be patched into shape: orientation is baked into lines 494–495 and
assumed by everything below.

**Stage 3 — Render.** Pure SVG from a `Frame`, an outline, and a dimension
model. No measuring, no arithmetic beyond placement.

### Measuring the box

The current component uses a `ResizeObserver` on the `<svg>` and holds
`panel: {width, height} | null`, null on the server and on first paint. Keep
that shape — it is correct — but make the null case render at a sensible
default frame rather than at the stack's own width, so the first paint is not
visibly wrong before it settles.

---

## 8. Profile generators, and the honesty rule

Ported from BetterToolLib's fifteen, filtered by `tool_catalog`'s rule.

**Keep** — every number comes off a vendor field:

| Form                            | Source field         | Note                                                                                             |
| ------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------ |
| flat end mill                   | `DC`                 | square                                                                                           |
| ball end mill                   | `RE` reaching `DC/2` | full hemisphere                                                                                  |
| bull nose end mill              | `RE`                 | corner radius, clamped to `DC/2` and `LCF/2`                                                     |
| chamfer mill, counter sink      | `SIG`                | cone; 90° **assumed and marked assumed** when absent                                             |
| drill, spot drill, center drill | `SIG`                | cone; 118° **assumed and marked assumed** when absent                                            |
| **slot mill**                   | `RE`                 | **radius on both ends of the disc** — the correctness win from BetterToolLib's `slotMillProfile` |
| tap right hand, tap left hand   | —                    | **square**, deliberately                                                                         |

**Reject** — `taperedProfile`, `dovetailProfile`, `lollipopProfile` and
`probeProfile` all invent shape from a hardcoded `DEFAULT_TAPER_ANGLE_DEG` or a
`neckRadius = r * 0.4`. They do not come across.

**The two assumed angles are decisions, not defaults.** Justin's calls on
2026-09-01, after phase 1 raised them:

- An absent `SIG` on a chamfer mill or counter sink draws 90° and marks the
  segment `assumed`, exactly as the drill's 118° does. The table originally
  named `SIG` as their only source, which would have made a vendor's silence
  undrawable. It is worth knowing the argument against: 118° is a genuine
  industry standard for a drill point, whereas a chamfer mill's included angle
  is a real product variable — 90°, 82° and 60° all ship — so this assumption
  is weaker than the drill's and leans harder on the UI actually showing
  `assumed`.
- **`tap left hand` draws square too.** § 8's table named only `tap right hand`,
  which was an omission rather than a decision: the hand of a thread does not
  change the 2D elevation, so the two silhouettes are identical.

**Tap stays square** for `tool_catalog`'s stated reason: the vendors publish no
chamfer lead, and the length over which a plug tap tapers would have to be
invented to draw it.

**And the `default:` case goes.** An unrecognised form returns `null` and the
caller says so in words. A silent cylinder is how a made-up shape ships: it
renders, it looks plausible, and it is wrong.

---

## 9. Dataset constraint — read this before verifying anything

**Neither available dataset exercises the whole drawing.** This will waste an
afternoon if it is discovered rather than read.

| Dataset          | Path                                                 | Tools  | Holders | Collets | Forms present                                            |
| ---------------- | ---------------------------------------------------- | ------ | ------- | ------- | -------------------------------------------------------- |
| Committed sample | `packages/catalog-data/fixtures/sample-catalog.json` | 9      | **3**   | **5**   | flat end mill, bull nose end mill, drill, tap right hand |
| Local scrape     | `scrape-out/catalog.json` (gitignored)               | 35,573 | **0**   | **0**   | + ball end mill, **slot mill**                           |

So:

- **Assembly, holder and clearance-overlay work must be verified against the
  committed sample**, which is the only thing with toolholding in it. Both e2e
  configs already force it via `CATALOG_DATASET`.
- **Ball and slot-mill tip geometry only exist in the local scrape**, which has
  no holders — so those forms can only be checked as a tool alone.
- `apps/catalog/vite.config.ts` resolves the `catalog-dataset` alias to
  `scrape-out/catalog.json` when present and the committed sample otherwise.
  A running dev server on this machine is therefore showing the 35k dataset and
  will say _"This dataset carries no toolholding, so there is nothing to build
  with yet."_ That is the data, not a bug.

Both datasets are `version: 6`, matching `CATALOG_VERSION` in
`packages/catalog-data/src/types.ts:347`.

### What the two datasets actually contain (measured 2026-09-01)

| Dataset          | Tools  | Forms present                                                                                                                     |
| ---------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Committed sample | 9      | bull nose end mill (3), drill (3), tap right hand (2), flat end mill (1)                                                          |
| Local scrape     | 35,573 | tap right hand (11,695), flat end mill (9,272), bull nose end mill (7,539), ball end mill (4,321), slot mill (2,261), drill (485) |

**Every one of those ten forms has a generator. Nothing in either dataset draws
blank today**, so the dataset test passes trivially — its whole value is as a
tripwire for the next scrape.

The fourteen vocabulary forms with **no** generator, none of them present in
either dataset: `boring bar`, `circle segment barrel`, `circle segment lens`,
`circle segment oval`, `circle segment taper`, `counter bore`, `dovetail mill`,
`face mill`, `lollipop mill`, `radius mill`, `reamer`, `tapered mill`,
`thread mill`, `other`.

### Why the dataset test has two layers

The obvious design — read whichever dataset the machine has — passes in CI and
fails locally, or the reverse. What landed instead:

1. **Committed sample, via `allTools`.** Deterministic everywhere, and no policy
   had to be invented: `apps/catalog/vitest.config.ts` already pins
   `catalog-dataset` to the sample, with a comment saying why — "a suite whose
   result depends on whether somebody has run a scrape is a suite that fails on
   one machine." This is the layer that gates a merge.
2. **Local scrape, read off disk with `node:fs`, `it.skipIf` when absent.**
   Deliberately machine-dependent, and resolved from `import.meta.url` rather
   than cwd.

Layer 2 earns its keep because **the form vocabulary is closed**: `TOOL_FORMS`
has 24 entries plus `'other'`, and `buildCatalog` can only emit one of those. A
newly scraped family therefore cannot introduce a _new_ form — only surface an
existing one nobody was looking at. Once all 25 are classified, the literal rule
can never go red from data alone, so reading the scrape is the only thing that
catches a thread-mill family arriving.

The asymmetry is what makes the machine dependence acceptable: layer 2 can only
_add_ a failure, never mask one; layer 1 stands alone; CI never has the file, so
CI is unaffected; and a skip honestly says "not checked here", where inheriting
the vite alias would have said "checked" and meant nothing.

What makes layer 2 bite is a second, narrower list — **`UNDRAWN_IN_THE_DATASET`,
currently empty** — kept in the test file and distinct from the adapter's
full-vocabulary `UNDRAWABLE_FORMS`. It means "present in real data and
consciously accepted as undrawn." Empty today, so any undrawable form entering
either dataset is red until a human puts it there.

### Reproducing the screenshots

A dev server may already be running on port **5174**, bound to IPv6 loopback
only — `http://127.0.0.1:5174` fails, `http://localhost:5174` works. Tool pages
are at `/tools/:guid` (note the plural; `routes.ts` maps
`route('tools/:guid', 'routes/tool.tsx')`). The guids in § 2 are from the local
scrape and will not resolve against the committed sample.

Playwright is installed under `apps/catalog`; a screenshot script must live
inside that directory to resolve `@playwright/test`. Never diagnose a blank
page by guessing — load it headless and read the console.

---

## 10. Todo

Each phase ends somewhere runnable. Check items off in place as they land.

### Phase 0 — Scaffold

- [x] **Cut both branches first — see § 12.** In `toolpath-ui-packages`,
      branch from `origin/main`, **not** from the current branch: it is
      `jsg-emuge-drill-angle-key` and carries an unmerged tool-scraper commit
      that must not ride along. In this repository, branch from the current
      `paul/tool_catalog`, which is where the catalog work lives.
- [x] Create `toolpath-ui-packages/packages/tool-drawing/` with `package.json`
      (copy the shape of `packages/ui/package.json`: name, version `0.0.0`,
      `publishConfig.access: public`, repository `directory`, `type: module`,
      `exports` for the three subpaths, `files: [dist, LICENSE, README.md]`,
      `sideEffects: false`).
- [x] Add `tsconfig.json`, `vitest.config.ts`, `README.md`, `LICENSE`.
      **Not from `packages/ui` after all** — its tsconfig sets `strict: false`
      and `strictNullChecks: false`, which is hopeless for geometry whose whole
      point is returning `null`, and its vitest config wires jsdom and
      `@testing-library/jest-dom` that nothing in phases 0–1 exercises (an
      unused devDependency is what `pnpm knip` kills). Both came from
      `packages/viewer` instead — `strict`, `noUncheckedIndexedAccess`, node
      environment — which is also the house style § 5 already tells us to
      follow. jsdom arrives in phase 3 with the component tests, and that is
      also when `react`/`react-dom` stop being peer-only.
- [x] `build` script: `tsup src/index.ts src/geometry/index.ts src/clearance/index.ts --format esm --dts --clean --external react --external react-dom`.
- [x] Register the package in **five** places in `toolpath-ui-packages` — the
      fifth was found by doing it:
  - [x] `pnpm-workspace.yaml` → add `packages/tool-drawing`
  - [x] `scripts/check-release-intent.mjs` → add to `releaseSensitivePaths`
        with `paths: ['packages/tool-drawing/src/']`
  - [x] `.github/workflows/release.yml` → add `packages/tool-drawing/src/**`
        and `packages/tool-drawing/package.json` to the `paths:` trigger
  - [x] `knip.json` → add a `workspaces` entry. **Mandatory, not optional** —
        `pnpm knip` is a gate there, and all three subpath entry points must be
        listed or knip calls whole live modules dead. Follow the
        `packages/viewer` entry, which is the multi-subpath case:
        `"packages/tool-drawing": { "entry": ["src/index.ts", "src/geometry/index.ts", "src/clearance/index.ts", "tests/**/*.test.{ts,tsx}"], "project": ["src/**/*.{ts,tsx}", "tests/**/*.{ts,tsx}"] }`
  - [x] **`.gitignore`** → add `packages/tool-drawing/dist/`. That file lists
        every package's `dist/` individually rather than by glob, so without
        this the build output is committable.
- [x] Write the changeset in the same PR (`minor`). `release-intent.yml` fails
      the moment `packages/tool-drawing/src/` is registered above, so this is
      part of phase 0 rather than an afterthought before phase 7.
- [x] In **this** repo: the `link:` override in root `package.json` alongside
      the existing `@toolpath/tool-scraper` one, and `@toolpath/tool-drawing` in
      `apps/catalog/package.json` dependencies. Done 2026-09-01, once phase 1
      gave `/geometry` something worth consuming. **The dependency spec is
      `0.0.0`, a placeholder** — the override wins at resolution, and `0.0.0` is
      at least the package's true current version rather than a fictional
      published one. Phase 7 replaces both.
- [x] Confirm `pnpm install && pnpm build` succeeds — **in `toolpath-ui-packages`
      only**, for the reason above. `pnpm check` there was green with Docker
      running, so `generate:check` ran for real rather than being skipped.
- [x] **Run Prettier over `pnpm-lock.yaml` before reading the diff.** Adding one
      workspace package showed as 4,802 changed lines. Almost none of it was
      real: `toolpath-ui-packages` commits a Prettier-formatted lockfile (root
      `lint-staged` globs `*.yaml`, expanding flow mappings) and `pnpm install`
      rewrites it in pnpm's own compact style. `prettier --write pnpm-lock.yaml`
      — what the pre-commit hook does anyway — collapsed it to 28 insertions and
      6 deletions, and `pnpm install --frozen-lockfile` then reported the
      lockfile up to date, so CI's frozen install passes. Anyone adding the next
      package here will otherwise spend an hour on a diff that is not there.

### Phase 1 — Geometry

- [x] Port `assemblyOutline`, `tip`, `arc` and the outline types. They live in
      `src/model/outline.ts` with `src/geometry/index.ts` re-exporting, per
      § 5's tree. **`tip` and `arc` are deliberately not exported** — they are
      module-private in the template too, and an export unreferenced by an entry
      point fails knip. Tests reach them through `assemblyOutline`.
- [x] Copy `hasNeck` out of `packages/catalog-data/src/forms.ts` as a private
      helper — the package cannot depend on catalog-data, and `assemblyOutline`
      needs it to tell a neck from plain shank. **It now exists in both repos**;
      the template's copy has other callers, so it stays. Phase 6 should note
      the duplication rather than try to resolve it.
- [x] Replace the `default:` tip case with `null` and thread that through
      `assemblyOutline` — an undrawable form returns no outline.
- [x] Add the slot-mill generator (radius on both ends), ported from
      BetterToolLib's `slotMillProfile`.
- [x] Port `packages/catalog-data/src/outline.test.ts` and extend it: one case
      per form, plus an undrawable form returning `null`.
- [x] Verify `/geometry` imports cleanly in a bare Node script — no React, no
      DOM. Done through the package's own `exports` map against built
      `dist/`, not against source.

**Phase 1 landed 2026-09-01. Behaviour that changed against the template's
`outline.ts`** — all in the plan's direction, but each is a real change a later
phase can trip over:

- `assemblyOutline` returns `Outline | null`, and returns `null` rather than an
  empty outline when `DC` or `LCF` is missing.
- **The generator list is now closed.** Beyond the § 8 table, `face mill`,
  `thread mill`, `boring bar`, `reamer`, `counter bore` and `radius mill` all
  return `null` where they used to draw a cylinder. Phase 6's dataset test is
  what turns the ones that matter red; until it exists, an undrawable form is
  invisible rather than wrong.
- Bull nose corner radius clamps to `LCF/2` as well as `DC/2`; it was
  `min(RE, r)`.
- A `SIG` describing no cone (0, or a non-finite height) returns `null`.
- **A slot mill emits two `flutes` segments** — the straight side carrying
  `LCF` provenance, then the top corner arc carrying `RE`. **Phase 3 must know
  this before its renderer is written**: anything assuming one segment per part
  breaks on the form this package was partly built to fix.

### Phase 2 — Layout

- [x] **The `fit` prop is decided: it is not being built** (§ 4). `frameFor`
      takes one framing, the whole assembly.
- [x] Write `frameFor` and the `Frame` type. No React.
- [x] Orientation chosen from the measured box; `toX`/`toY` the only place the
      axis sense lives. Horizontal runs tip-left, vertical tip-bottom (the old
      component's sense).
- [x] `scale` = min of the two fitting ratios; viewBox from content, never from
      the panel's aspect.
- [x] `fontSize` from a target px size clamped to a readable range, divided by
      `scale`. `clamp(shortSide × 0.045, 9px, 14px) / scale`.
- [x] Unit tests asserting `scale`, `viewBox`, `orientation` and the corners
      `toX`/`toY` map to — numbers, not pixel snapshots. All four cases covered,
      plus a caller-supplied default box, a width-without-height box, and a
      zero-extent outline. 41 tests, and the three load-bearing behaviours were
      mutation-checked rather than assumed: inverting `Math.min` on the fitting
      ratios fails 11, flipping the long-axis choice fails 13, and restoring
      defect 2's exact `Math.max(1.5, height * 0.018)` idiom fails 2.
- [ ] ~~Re-shoot the three tools in § 2.~~ **Moved to phase 6.** Nothing can be
      screenshot until the renderer exists and the package is wired into the
      app; and a fair before/after needs the real renderer in the real panel,
      because § 2's numbers were measured against the old component end to end.

**Phase 2 landed 2026-09-01. Two things phases 3 and 4 have to inherit:**

- **`bands` is not in `Frame`, and `frameFor` takes no dimension model.**
  § 7 put `bands: DimensionBands` in the shape, but declaring that type before
  phase 4 _is_ inventing the dimension model — lanes and bands are the model.
  The frame still has to reserve the room dimensions will occupy, or phase 4
  moves `scale` and invalidates every phase-2 test, so the input taken instead
  is **`padding`: room around the content in pixels, default 16**. That is a
  quantity of chrome rather than a model of it; phase 4 computes its band widths
  and passes the total. Pixels because chrome should not grow with the tool, and
  because it keeps the arithmetic non-circular — padding is independent of
  `scale`. A test pins the property: a 100 mm tool and a 400 mm tool with
  `padding: 20` both get exactly 40 px of margin.
- **`preserveAspectRatio="xMidYMid meet"` is now a contract, not a default.**
  § 7's "the viewBox describes the content, not the panel" only holds because of
  it. Content-plus-margins and panel-expressed-in-millimetres turn out to be
  equivalent _provided_ the `<svg>` keeps the default: the algebra makes `meet`'s
  binding ratio come out to exactly `scale`, so the number `frameFor` reports is
  the number that renders. Under `preserveAspectRatio="none"` the drawing
  stretches and `scale` becomes a lie on one axis. **Phase 3 must not change that
  attribute.** A test asserts the fitting ratio equals `frame.scale` across four
  panel shapes.
- The viewBox is rounded to 4 dp so it reads as a measurement rather than
  `-1.5999999999999999`. `scale` is therefore exact only to about a part in
  10⁶ — roughly 100 nm of model space. Visually nothing, but phase 4 places
  figures against these numbers, so it is a stated bound with its own test
  rather than a silent approximation.

### Phase 3 — Renderer

- [x] `<ToolDrawing>`: silhouette in one stroke, per-section fills, dashed
      same-radius joins, centreline, caption, provenance note.
- [x] Carry `SHEETS` across intact — one palette per theme, hard colours rather
      than the application's ramp. The reasoning is in the current component's
      comments and should travel with it.
- [x] Theme: the package cannot call this app's `useTheme`. Take the theme as a
      prop, defaulting to `'dark'`, and let the app pass its own.
- [x] Component tests, ported from `assembly-drawing.test.tsx`.

**Phase 3 landed 2026-09-01.** `SHEETS` came across byte-for-byte, both
palettes, with Paul's three justifying comments intact; one sentence was added
rather than any removed, noting that the package has no Tailwind and no access
to the consumer's ramp, so every colour _has_ to be a literal here.

**An undrawable form tells its two causes apart, and both name the subject:**
missing dimensions reads _"TDMX0600 states no cutting diameter or flute length,
so there is nothing to draw"_; no generator reads _"TDMX0600 is a dovetail mill,
and this drawing has no shape for that form — so it is not drawn, rather than
drawn wrong."_ No `<svg>` is emitted at all, and the element carries
`data-undrawable="<form>"` so a consumer can find it.

**Three things could not be carried across faithfully. Each is a real change,
not a port:**

- **The caption and note lost their Tailwind classes.** In the app they were
  `text-zinc-400` / `text-zinc-200` / `text-2xs` on the _card_ background,
  outside the sheet. A package cannot depend on the consumer's Tailwind, so they
  are inline styles taking `sheet.dimension` — theme-aware and correct on either
  ground. A consumer wanting the app's exact type ramp uses the new `className`
  prop.
- **The caption lost its content too**, not only its styling. The original
  showed `assemblyLabel(assembly)`, the clearance verdict, and the
  `describeDeciding` sentence. The first is app-owned; the other two are
  phase 5. `<ToolDrawing>` takes a `caption` prop falling back to `tool.label`,
  and **the verdict line is a phase-5 gap rather than something dropped.**
- **The centreline overhang changed basis.** It was a hardcoded 4 mm past each
  end, which only worked because the old frame padded by a hardcoded 3 mm.
  `frameFor`'s margin is `padding/scale`, so the overhang is now
  `fontSize * 1.2` — type-relative, holding its proportion at any scale.
  Visually equivalent at checkable sizes, but not the same number.

**One block of the old tests was deleted rather than deferred:** _"the room the
panel has spare"_ (629-line file, lines 297–361) tested `spare`/`forPart`/`rest`
— the aspect-ratio arithmetic that **is** defect 1. `frameFor` has no such
concept and phase 2's tests replace it. Roughly 120 lines ported, ~200 deferred
to phases 4 and 5.

**Collision paint is deliberately absent.** § 4 assigns it to the clearance
overlay, so it arrives in phase 5 with the verdict it depends on.

**On the two-`body` finding:** all nine reads of `.part` in the renderer were
already correct, and not by luck — `sectionFill`/`isConnection` discriminate the
carried body from the stated one on `provenance === 'assumed'`, which is the
right axis, so the join fix made for the slot mill had generalised. The exposure
was in the _tests_, where `querySelector('[data-part="body"]')` would have
silently taken the first of two. The general rule is now written into
`silhouette.ts` under its own heading — **"One part may emit several segments"**
— naming both known cases, saying there will be others, and stating the
invariant: _part is a label, the segment is the unit, and `provenance` is what
separates two segments of the same part._

66 tests pass, `pnpm check` green with Docker up. Mutation-checked: forcing
`preserveAspectRatio="none"` fails 1, measuring joins at each section's widest
point (the slot-mill bug) fails 1, defaulting `theme` to `light` fails 2, and
painting the carried body by part identity instead of provenance fails 2.
`/geometry` was re-verified server-safe after the build began splitting it into
a shared chunk — the chunk carries no `react`/`jsx`/`document`/`window`.

### Phase 4 — Dimensions

- [x] Port `tool-dimensions.ts` (the model: lanes, widths, angles, `dimensionsFor`,
      `dimensionLayout`, `bandOffset`, `laneOffset`, `bandRoom`).
- [x] Port `dimension-lines.tsx` (the renderer), rewired onto `Frame` rather
      than the ad-hoc frame object it takes today.
- [x] Pixel-based type sizing throughout; delete every `height * 0.0xx`.
- [x] Port `tool-dimensions.test.ts`.

### Phase 5 — Clearance overlay (`/clearance`)

- [x] Declare the reach-curve shape structurally in the package —
      `{ horizontalOffset: number[]; verticalOffset: number[] }` — so
      `@toolpath/part-contracts` is not a dependency.
- [x] Port `wallCorners`, `wallPath`, `lastRise`, `clipped`, `zigzag`, `arrow`.
- [x] Port `tightestGaps` and `wallFaceAt` from `catalog-data/src/gaps.ts`.
- [x] The overlay component takes material profile, collisions and gaps as
      props and draws: wall path, hatch, breaks, clearance dimensions with their
      readouts, and collision paint.
- [x] Verify against the **committed sample** — it is the only dataset with
      holders (§ 9).

**Phases 4 and 5 landed 2026-09-01.** 133 tests, `pnpm check` green with
Docker up. Seven mutations checked, all caught — and two of them only bit after
the tests were strengthened: the chrome cap passed until it was pinned directly
on `frameFor`, and "never measures the flutes" passed _vacuously_, because the
axial offset guard already skipped them; it needed a fixture rebuilt as a wide
low ledge where the radial answer genuinely changes.

**The `padding` seam held, and widened twice.** Phase 2's reasoning was right —
band widths in pixels are scale-independent, so the order is measure the panel,
size the type, lay the bands out, total them, build the frame. No feedback loop,
and **phase 2's twenty tests pass unchanged.** The two widenings:

1. `padding?: number | Partial<Padding>` with `{minus, plus, along}` — the
   asymmetric case phase 2 anticipated. With figures on both flanks, each side
   needs what its own bands take; one scalar pads both by the wider and throws
   the difference away. A plain number still means what it did.
2. **`Frame.padding`, the chrome _as applied_** — not anticipated, and found by
   a test failure. Five figures on both flanks of a tool in a 400 px panel asked
   for 429 px of it. `px - chrome` went negative, the fitting ratio collapsed to
   0.036 px/mm, and the drawing came out as **a twelve-metre viewBox with
   metre-tall figures stacked off the sheet.** The frame now caps chrome at 60%
   of an axis — annotation gives way before the drawing does — and reports what
   it granted, the way it reports `scale`. Without that report the renderer
   would draw at the full request against a capped margin.

**The model needed exactly one fact about orientation: `textAlongAxis`.** Text
is the only thing in the drawing that does not rotate, so which of a figure's
two extents the type contributes decides how wide the bands are — backwards, and
it pads the wrong axis by about 5×. It lives in one pure function with its own
test. Nothing in the renderer branches on orientation; where it needs to know
which way a figure reads, it asks the frame where two points actually landed.

**Sides are `minus`/`plus`, not `left`/`right`.** The model was written when the
tool always stood upright and the flanks were reliably screen-left and
screen-right. Auto-orientation ended that.

Two other signature changes: `dimensionsFor` takes a `ViewerAssembly` rather
than `(tool, {assembly})`, so "has a holder" is one question asked once; and
`Unit` became `FormatLength = (mm: number) => string`, because the package has
no unit system and owning one means owning its rounding.

**The overlay takes the verdict entirely as data**, as § 4 requires.
`<ClearanceOverlay>` takes `profile`, `gaps`, `cuttingRadius`, `margins`.
Collision paint is a `collisions` prop on `<ToolDrawing>` — plain
`{part, height}` — and the overlay reaches the SVG as a **child**, so the root
module never imports the clearance subpath. **Collisions are matched by height
as well as by part, which fixes a bug the original had:** a holder drawing two
`body` segments had part-identity alone striking both.

**The caption gap from phase 3 is closed.** `verdict={{clears, note}}` renders
both the verdict line and the sentence; `describeGaps` is exported from
`/clearance`, so the root never imports it.

**Optionality was verified rather than reasoned about**, in all three of § 4's
senses: the root bundle is 29.56 KB with **zero** mentions of
`data-clearance`/`wallPath`/`tightestGaps` and `/clearance` is its own 14.11 KB;
`ReachCurve` and `Margins` are declared structurally, and the package still has
zero runtime dependencies; and the tool was **actually rendered without the
props** — no `[data-clearance]`, no `[data-struck]`, no `[data-verdict]`, every
section painted as metal. `/geometry` was re-checked server-safe after the
split.

### Phase 6 — Integrate here

- [x] Add the adapter: `apps/catalog/app/shared/tool-drawing-input.ts`,
      `CatalogTool` → `ViewerTool`, `Assembly` → `ViewerAssembly`. Done
      2026-09-01, ahead of the rest of phase 6 because it needs only the phase-1
      contract. Field-by-field, no cast; `geometry` and `provenance` pass through
      by reference so no name is translated. It also holds `DRAWABLE_FORMS` /
      `UNDRAWABLE_FORMS` / `canDraw`, because this is the file the plan already
      designates as the one that fails loudly when either side moves, and
      `drawing-card.tsx` needs `canDraw` to say "we cannot draw this" in words.
      A local `DrawableAssembly` type stands in for catalog-data's `Outlined` so
      it survives the deletion of the moved half of `outline.ts`.
- [x] Rewire `drawing-card.tsx` onto the package.
- [x] Delete `assembly-drawing.tsx`, `assembly-drawing.test.tsx`,
      `dimension-lines.tsx`, `tool-dimensions.ts`, `tool-dimensions.test.ts`,
      and the moved half of `catalog-data/src/outline.ts` + `gaps.ts`.
- [x] Keep the "every form has a generator" test **here, not in the package** —
      the package has no dataset. Over `allTools`, assert every `form` present
      either has a generator or is explicitly listed as undrawable. This is
      `tool_catalog`'s `tool-profile.test.ts` trick, relocated to the consumer
      side, and it is what turns a newly scraped family into a red suite rather
      than a wrong picture. Landed 2026-09-01 as
      `apps/catalog/app/shared/drawable-forms.test.ts`; see § 9 for the two
      layers it needed and why.
- [x] Update `eslint.config.js` layering if the package needs a rule.
- [x] Update `AGENTS.md` § Project Map and § Shared Code Between Applications.
- [x] Re-shoot the three tools in § 2 against the same panel size
      (1450 × 297 px), so the before/after is visible. **Moved here from
      phase 2**, which could not do it: a fair comparison needs the real
      renderer in the real panel, and § 2's numbers were measured against the
      old component end to end.
- [x] Update this document to past tense.
- [x] `pnpm check` green; `pnpm test:e2e:catalog` green.

**Phase 6 landed 2026-09-02.** `pnpm check` green; `pnpm test:e2e:catalog`
18 passed; the catalog's unit suite is 460 tests across 44 files, down from 496
because the 629-line drawing suite and the 208-line dimensions suite left with
their code and 7 new tests arrived. `outline.ts` went 336 → 50 lines,
`outline.test.ts` 241 → 51.

`apps/catalog/app/components/catalog-drawing.tsx` is the seam. It owns the four
things the package deliberately declined — theme, the unit and its rounding, the
caption, and **the clearance verdict, computed here by `clearance()` and handed
over as data**. `eslint.config.js` gained **`NO_DRAWING`**, the same shape as
`NO_SDK` and `NO_SCRAPER`: nothing in `packages/` may import the drawing
package's values, because that is exactly how `clearance()`'s twelve non-drawing
callers would end up behind React.

### Defect 1, measured

Panel 1450 × 294 px (3 px short of § 2's 297, left honest rather than fudged),
local scrape, all three tools auto-orienting horizontal:

| Tool                     | Extent (mm)  | viewBox before        | viewBox now        |
| ------------------------ | ------------ | --------------------- | ------------------ |
| `B041A01000CPG` ⌀1 drill | 4 × 58       | 312 across × 64 along | **12.16 × 67.05**  |
| `910615` slot mill       | 3.2 × 38.1   | 215 × 44              | **8.53 × 44.05**   |
| `BV3160617` ball         | 6.35 × 101.6 | 525 × 108             | **20.64 × 117.46** |

**The across dimension fell 26×, 25× and 25×**, while the along dimension grew
about 15% — and that growth is real chrome, the dimension figures' headroom past
each end. The drill's scale went from 4.64 px/mm to 21.6 px/mm, so its 4 mm body
draws 86 px wide instead of 18. Screenshots confirm the two correctness wins as
well: the slot mill draws its keyseat disc with a radius on **both** ends where
it was a two-pixel sliver, and every figure is legible at a fixed pixel type
size.

`BV3160617` is called a "necked ball" in § 2, but its `shoulder-length` (9.525)
equals its `LCF`, and the neck rule is `shoulder > LCF` — so no neck is drawn,
by the same rule the old code used. The data has no neck, so this is not a
regression.

### Three things phase 6 found that § 6 did not predict

1. **`tool-details.tsx` was a second consumer** of `AssemblyDrawing` — the tool
   page's details panel. § 6 named only `drawing-card.tsx`. Both are rewired
   onto `CatalogDrawing`.
2. **Two Reacts.** Every component test touching the drawing died with
   `Cannot read properties of null (reading 'useRef')`: the `link:` package
   resolves `react` from `toolpath-ui-packages/node_modules`, and a peer
   dependency does not dedupe across a checkout boundary. The fix is
   `@toolpath/tool-drawing` in `server.deps.inline`, `resolve.dedupe:
['react','react-dom']` in both configs, and `ssr.noExternal` in
   `vite.config.ts`, all commented in place. **This will hit anyone linking a
   React package into this repository** — it is a phase-0 hazard nobody
   predicted, and it cost the most time in this phase.
3. **A pre-existing e2e failure**, unrelated to this work: `catalog.spec.ts:33`
   did `page.goto('/')` and expected the family filter, stale since "the part is
   the application" made `/` the upload. Every other test in that file already
   used `/catalog`. Fixed in passing; separable from this change.

### The frame handoff — found in phase 6, closed 2026-09-02

**`<ToolDrawing>` measured its panel and handed its children nothing, but
`<ClearanceOverlay>` needed `frame`, `outline` and `sheet`.** The package's own
README example papered over it with `frame={frame}` and an ellipsis, and its
`overlay.test.tsx` only got away with it by calling `frameFor` with the width it
stubbed into its own ResizeObserver. A real consumer could not: the box is
measured _inside_ the component, on an `<svg>` the application never holds.

Phase 6 shipped a workaround — `apps/catalog/app/shared/drawing-frame.ts`, which
reached `ownerSVGElement` off its own `<g>` and re-derived the frame, held in
lockstep by three tests asserting a string-identical `viewBox`. **It is gone.**

The fix, in the package: `src/render/drawing-context.tsx` publishes
`{frame, outline, sheet}` to the subtree, `<ToolDrawing>` wraps its children in
the provider, and the overlay's three props became **optional overrides** — the
context is the ordinary path, an explicit frame is for a test framing a fixture.
Drawn outside a `<ToolDrawing>` with none supplied it **throws rather than
inventing a frame**, because an overlay silently sliding off a tool is the
failure this whole seam exists to prevent.

What that removed on the consumer side: `drawing-frame.ts` deleted whole, the
`ClearanceLayer` wrapper deleted with its second `ResizeObserver`, and the
overlay is now a plain child of `<ToolDrawing>`. The three lockstep tests went
too — they guarded a copy that no longer exists — replaced by two that check the
wiring itself.

The proof is that the package's **whole overlay suite now runs through the
handoff**: `withOverlay` passes no frame, because it cannot. Deleting the
provider fails 6 tests. `pnpm check` is green in both repositories; the package
is at 135 tests, the catalog at 459.

**A smaller consequence stands unchanged:** `padding` is a pixel constant a
caller supplies before anything is measured, so the material's room is
`MATERIAL_ROOM = 240` px rather than "whatever the panel has spare", which is
what the old drawing gave it. Safe, because `frameFor` clamps an over-large
request, but less good on a narrow panel.

### Phase 7 — Publish

**`toolpath-ui-packages/docs/BOOTSTRAPPING-NPM-PACKAGES.md` is authoritative
for this phase.** Read it before starting; what follows is a summary and the
doc wins where they differ. The one-off bootstrap exists because npm will not
let a trusted publisher be configured until the package exists, so a new
package needs exactly one maintainer-run manual publish. **Do not add an npm
token to the release workflow** to work around it.

- [ ] Add the package's changeset and **merge the source PR normally** first.
      `repository.url` in its `package.json` must be
      `https://github.com/toolpath/ui-packages.git` or the bootstrap refuses.
- [ ] Wait for the release-metadata PR. CI recognises the package is new,
      leaves that PR open, assigns the initial version, and **comments with the
      exact command to run**.
- [ ] Check that PR out locally and bootstrap:

  ```sh
  gh pr checkout <release-pr-number>
  pnpm install --frozen-lockfile
  npm login
  pnpm bootstrap:npm-package @toolpath/tool-drawing
  ```

  It publishes that version, then configures npm trusted publishing for
  `toolpath/ui-packages` and `.github/workflows/release.yml`. It refuses at
  version `0.0.0` or on a repository URL that does not match `origin`.

- [ ] Merge the release-metadata PR. CI recognises the version as already
      published; every later release uses trusted publishing automatically.
- [ ] **Replace the `link:` override with a pinned version** in this repo.

Phase 7 is not optional housekeeping. A `link:` override onto a sibling
checkout breaks a fresh clone of this template — the known hazard already
carried by `@toolpath/tool-scraper` — so the override is a development
convenience with a deadline on it.

---

## 11. Testing rules

- **Pure first.** Geometry and layout are arithmetic and get unit tests against
  literals. Assert on numbers — `scale`, `viewBox`, mapped corners — never on
  pixel snapshots.
- **The renderer gets component tests.** The 629 lines in
  `assembly-drawing.test.tsx` are mostly geometry and placement assertions;
  they move with the code they cover.
- **The dataset-derived test stays on the consumer side**, for the reason in
  phase 6.
- **E2E** stays `apps/catalog/tests/catalog.spec.ts`. Anything that begins with
  a click on the part still belongs in `tests/on-the-part.spec.ts` against
  `tests/cube-fixture.ts`.
- **Never capture a real part's report and check it in.** The vendored viewer
  cube stays the one exception.

---

## 12. Working across two repositories

This change lands in two repositories at once, and they have **different**
conventions. Getting this wrong is the easiest mistake available here.

### Use the other repository's own steering docs and skills

**While working in `toolpath-ui-packages`, that repository's instructions
govern — not this one's.** `AGENTS.md` here does not apply there, and the
habits from this repo will be wrong in several specific ways.

Read first, in that repo:

- **`AGENTS.md`** — imported by its `CLAUDE.md`, which exists only to point at
  it. Sections: What ships, Project Map, Commands, Rules with a sensor, Public
  package releases, Safety, Working Style, Validation, Formatting, Git
  Workflow, Review guidelines.
- **`docs/BOOTSTRAPPING-NPM-PACKAGES.md`** — the authoritative procedure for
  phase 7. Read it before touching a release; § 10 phase 7 below is a summary
  of it, and the doc wins where they differ.
- **`docs/TOOL-SCRAPER-PLAN.md`** — the closest precedent for adding a package
  there.

Its skills are a **different set** from this repository's, and are invoked the
same way:

|        | `toolpath-ui-packages`                    | `toolpath-template` (here)                                                                                      |
| ------ | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Skills | `commit`, `review-code`, `review-testing` | `check`, `commit`, `push`, `review-code`, `review-testing`, `scope`, `setup-secrets`, `setup-testing`, `status` |

There is **no `check` or `push` skill** in ui-packages — run `pnpm check`
directly, and push by hand under its Git Workflow rules.

Four things from its guide that change how this work is done:

- **Docker must be running for `pnpm check`.** `scripts/generate-sdks.mjs` runs
  a pinned `openapitools/openapi-generator-cli` image, so `generate:check`
  fails at the second step of the gate — before lint — when the daemon is
  stopped. That is an environment prerequisite, not a finding about the change.
- **`pnpm knip` is a sensor there**, not advice: "no unreferenced export, file,
  or dependency" fails the gate. A new package with three subpath entry points
  must have all three listed in `knip.json`, or knip calls whole live modules
  dead. Its guide is explicit that an entry point added to a manifest needs its
  `src/` counterpart added to `knip.json` too.
- **`pnpm test` runs Playwright**, and a missing browser is a skipped check
  rather than a passing one. It also runs `scripts/test-ui-package.mjs`, which
  `npm pack`s a package and asserts the tarball contents.
- **`packages/viewer`'s split is the house style** — pure logic in `model/`,
  rendering in `render/`, React in the `.tsx` files. It is a judgment rule with
  no sensor behind it, and this package should follow it; see § 5.

### Branches

|             | `toolpath-ui-packages`                                 | `toolpath-template` (this repo)               |
| ----------- | ------------------------------------------------------ | --------------------------------------------- |
| Naming      | `jsg-<topic>`, no slash                                | `<owner>/<topic>`, with a slash               |
| Examples    | `jsg-emuge-franken-vendor`, `jsg-publish-tool-scraper` | `paul/tool_catalog`, `jsg/review`             |
| Branch used | `jsg-tool-drawing`                                     | `paul/tool_catalog` — phase 6 continues on it |
| Branch from | **`origin/main`**                                      | current `paul/tool_catalog`                   |

**In `toolpath-ui-packages`, branch from `origin/main`, not from whatever is
checked out.** That still holds, but the reason given here has since expired.
When this was written the checkout sat on `jsg-emuge-drill-angle-key`, one
commit ahead of `origin/main`
(`e73ba86 fix(tool-scraper): separate an unmapped point angle from an absent key`)
— unrelated in-flight work that must not be dragged into a package PR. **By the
time phase 0 ran on 2026-09-01, `origin/main` was `4511fa3 chore(release):
version packages (#70)`**, which already carries `e73ba86` via merged PR #71.
Branching from `origin/main` was still correct; the commit it was protecting
against had simply landed. Re-check what `origin/main` is rather than trusting
this paragraph.

In this repository the catalog work already lives on `paul/tool_catalog`, which
is eight-plus commits ahead of `main` and is the right base. **Phase 6 continues
on `paul/tool_catalog` rather than taking a branch of its own** — Justin's call
on 2026-09-01. The package work in `toolpath-ui-packages` is the part that has
to be isolated, and it is isolated by being in the other repository.

The consequence to hold on to: `paul/tool_catalog` carries the `link:` override
onto the sibling checkout from phase 0 until phase 7 replaces it with a pinned
version, so the branch cannot be merged to `main` before the package is
released. That ordering is § 12's sequencing constraint, and continuing on this
branch is what puts the whole catalog line of work behind it.

### Commit messages

Also different, and the linters do not catch it.

- **`toolpath-ui-packages` uses Conventional Commits with a package scope:**
  `feat(tool-drawing): draw a keyseat cutter's second corner radius`,
  `fix(tool-drawing): …`, `chore(release): …`.
- **This repository uses sentence style with an area prefix:**
  `Catalog: the family filter is the chosen vendor's families`.

Neither repository adds AI attribution to commits or PR descriptions.

### Pull requests

`toolpath-ui-packages` has a PR template (`.github/pull_request_template.md`)
with a **required** "Public package release" section — exactly one box, one of:

- no public package source changed;
- `pnpm changeset` was run and the changeset committed;
- the change intentionally needs no release, with the `no-release-needed` label
  applied by a maintainer and a reason given.

The `release-intent.yml` workflow enforces this on every PR touching a path in
`releaseSensitivePaths`, so **a PR adding `packages/tool-drawing/src/` fails CI
without a changeset** once phase 0 registers it there. Expect that, and write
the changeset as part of the PR rather than as an afterthought.

There is a standing release PR from `changeset-release/main` —
`chore(release): version packages` — which is the Changesets mechanism. **The
specific PR named here, #70, merged on 2026-09-01**; expect a new one carrying
the same title. Phase 7's
`pnpm bootstrap:npm-package @toolpath/tool-drawing` is run **from that release
PR** once it assigns the package its first non-`0.0.0` version; the script
refuses to run while the package is still at `0.0.0`.

### The sequencing constraint between them

The template consumes the package through a `link:` override onto the sibling
checkout, so during phases 0–6 **the template branch only builds on a machine
that has `toolpath-ui-packages` checked out beside it.** A fresh clone of the
template cannot install.

This repository already tolerates that state on a feature branch —
`@toolpath/tool-scraper` is linked the same way today, committed in
`bb4b47b Catalog data: cutting tools come from @toolpath/tool-scraper` — so it
is an accepted development posture, not a novel risk. But it means the two PRs
are coupled:

1. the `toolpath-ui-packages` PR merges and releases first;
2. only then does phase 7 replace the override with a pinned version;
3. and only then is the template branch safe to merge to `main`.

Merging the template first would put a repository-breaking override on `main`.
